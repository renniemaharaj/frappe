package deploy

import (
	"fmt"
	"goftw/internal/bench"
	"goftw/internal/environ"
	"goftw/internal/sudo"
	"os"
	"os/exec"
	"syscall"
)

var (
	productionCMD *exec.Cmd
)

// DeployProductionUp sets up supervisor + nginx and starts production WSGI.
func DeployProductionUp() error {
	if productionCMD != nil {
		return fmt.Errorf("cannot start production WSGI: already running")
	}
	if unmannedDeployment {
		return fmt.Errorf("cannot start production WSGI: unmanaged shell deployment active")
	}

	fmt.Printf("[MODE] PRODUCTION\n")
	if err := StartProductionWSGI(environ.GetBenchPath()); err != nil {
		return err
	}

	return nil
}

// DeployProductionDown stops production services (supervisord + nginx).
func DeployProductionDown() error {
	if productionCMD == nil || productionCMD.Process == nil {
		return fmt.Errorf("production WSGI not running")
	}
	if unmannedDeployment {
		return fmt.Errorf("cannot stop production WSGI: unmanaged shell deployment active")
	}

	// Send SIGTERM to gracefully stop supervisord
	if err := productionCMD.Process.Signal(syscall.SIGTERM); err != nil {
		return fmt.Errorf("failed to stop production WSGI: %v", err)
	}

	fmt.Println("[WSGI] Production WSGI stopped")
	productionCMD = nil
	return nil
}

// StartProductionWSGI sets up supervisor for the bench, merges configs, and starts supervisord.
func StartProductionWSGI(benchDir string) error {
	// Configure nginx
	if err := configurePatchNginx(benchDir); err != nil {
		fmt.Printf("[ERROR] Failed to setup nginx: %v\n", err)
		return err
	}

	// Configure supervisor
	tmpFile, err := configurePatchSupervisor(benchDir)
	if err != nil {
		fmt.Printf("[ERROR] Failed configure and patch supervisor: %v\n", err)
		return err
	}

	// Build the command
	cmd := exec.Command("sudo", "supervisord", "-c", tmpFile)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	productionCMD = cmd
	// Start without waiting
	if err := cmd.Start(); err != nil {
		fmt.Printf("[ERROR] Failed to start supervisord: %v\n", err)
		return err
	}

	// Supervisord is running in the background now
	fmt.Printf("[WSGI] Production WSGI started (PID: %d).\n", cmd.Process.Pid)
	return nil
}

// func StopProductionWSGI() error {
// 	if err := sudo.RunPrintIO("sudo", "supervisorctl", "stop", "all"); err != nil {
// 		return fmt.Errorf("failed to stop production WSGI: %v", err)
// 	}
// 	fmt.Println("[WSGI] Production WSGI stopped")
// 	return nil
// }

// configurePatchSupervisor runs supervisor setup, patches it and returns conf or error
func configurePatchSupervisor(benchDir string) (string, error) {
	supervisorConf := benchDir + "/config/supervisor.conf"
	wrapperConf := "/patches/head.patch.conf"

	// Ensure log dir
	if err := os.MkdirAll("/var/log", 0755); err != nil {
		fmt.Printf("[ERROR] Failed to create /var/log: %v\n", err)
		return "", fmt.Errorf("failed to create /var/log: %v", err)
	}

	// Remove old config to force regeneration
	_ = sudo.RemoveFile(supervisorConf)

	if err := bench.RunInBenchPrintIO("setup", "supervisor", "--skip-redis"); err != nil {
		fmt.Printf("[ERROR] Failed to setup supervisor: %v\n", err)
		return "", fmt.Errorf("failed to setup supervisor: %v", err)
	}

	// Merge configs
	wrapper, err := sudo.ReadFile(wrapperConf)
	if err != nil {
		fmt.Printf("[ERROR] Failed to read supervisor wrapper config: %v\n", err)
		return "", err
	}
	benchConf, err := sudo.ReadFile(supervisorConf)
	if err != nil {
		fmt.Printf("[ERROR] Failed to read supervisor config: %v\n", err)
		return "", err
	}

	tmpFile := "/tmp/supervisor-merged.tmp"
	if err := os.WriteFile(tmpFile, append(wrapper, append([]byte("\n"), benchConf...)...), 0644); err != nil {
		fmt.Printf("[ERROR] Failed to write temporary merged config: %v\n", err)
		return "", fmt.Errorf("failed to write temporary merged config: %v", err)
	}
	return tmpFile, nil
}

// configurePatchNginx sets up nginx using bench and symlinks the config.
func configurePatchNginx(benchDir string) error {
	nginxConf := benchDir + "/config/nginx.conf"
	nginxConfDest := "/etc/nginx/conf.d/frappe-bench.conf"
	logPatch := "/patches/log.patch.conf"
	globalConf := "/etc/nginx/nginx.conf"

	// Remove old configs/links to force regeneration
	_ = sudo.RemoveFile(nginxConf)
	_ = sudo.RemoveFile(nginxConfDest)

	// Generate nginx config
	if err := bench.RunInBenchPrintIO("setup", "nginx"); err != nil {
		fmt.Printf("[ERROR] Failed to setup nginx: %v\n", err)
		return fmt.Errorf("failed to setup nginx: %v", err)
	}

	// Inject patch into global nginx.conf if not already present
	checkCmd := []string{"grep", "-q", "log_format main", globalConf}
	if err := sudo.RunPrintIO(checkCmd...); err != nil {
		fmt.Printf("[PATCH] Injecting main log_format into %s\n", globalConf)
		if err := sudo.RunPrintIO("sed", "-i", "/http {/r "+logPatch, globalConf); err != nil {
			fmt.Printf("[ERROR] Failed to inject main.patch.conf: %v\n", err)
			// not fatal — continue
		}
	}

	// Symlink bench-generated config
	err := sudo.RunPrintIO("ln", "-sf", nginxConf, nginxConfDest)
	if err != nil {
		fmt.Printf("[ERROR] Failed to symlink nginx config: %v\n", err)
		return err
	}

	fmt.Printf("[NGINX] Nginx configured and symlinked\n")
	return nil
}
