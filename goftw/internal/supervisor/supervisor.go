package supervisor

import (
	"fmt"
	"goftw/internal/bench"
	"goftw/internal/sudo"
	"os"
)

// SetupSupervisor sets up supervisor for the bench, merges configs, and starts supervisord.
func SetupSupervisor(benchDir string) error {
	supervisorConf := benchDir + "/config/supervisor.conf"
	wrapperConf := "/patches/head.patch.conf"

	// Ensure log dir
	if err := os.MkdirAll("/var/log", 0755); err != nil {
		fmt.Printf("[ERROR] Failed to create /var/log: %v\n", err)
		return fmt.Errorf("failed to create /var/log: %v", err)
	}

	// Remove old config to force regeneration
	_ = sudo.RemoveFile(supervisorConf)

	if err := bench.RunInBenchPrintIO("setup", "supervisor", "--skip-redis"); err != nil {
		fmt.Printf("[ERROR] Failed to setup supervisor: %v\n", err)
		return fmt.Errorf("failed to setup supervisor: %v", err)
	}

	// Merge configs
	wrapper, err := sudo.ReadFile(wrapperConf)
	if err != nil {
		fmt.Printf("[ERROR] Failed to read supervisor wrapper config: %v\n", err)
		return err
	}
	benchConf, err := sudo.ReadFile(supervisorConf)
	if err != nil {
		fmt.Printf("[ERROR] Failed to read supervisor config: %v\n", err)
		return err
	}

	tmpFile := "/tmp/supervisor-merged.tmp"
	if err := os.WriteFile(tmpFile, append(wrapper, append([]byte("\n"), benchConf...)...), 0644); err != nil {
		fmt.Printf("[ERROR] Failed to write temporary merged config: %v\n", err)
		return fmt.Errorf("failed to write temporary merged config: %v", err)
	}

	if err = SetupNginx(benchDir); err != nil {
		fmt.Printf("[ERROR] Failed to setup nginx: %v\n", err)
		return err
	}

	err = sudo.RunPrintIO("supervisord", "-n", "-c", tmpFile)
	if err != nil {
		fmt.Printf("[ERROR] Failed to start supervisord: %v\n", err)
		return err
	}

	fmt.Printf("[SUPERVISOR] Started supervisord\n")
	return nil
}

// SetupNginx sets up nginx using bench and symlinks the config.
func SetupNginx(benchDir string) error {
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
