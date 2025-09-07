package deploy

import (
	"fmt"
	"goftw/internal/environ"
	"os"
	"os/exec"
	"syscall"
)

var (
	developmentCMD *exec.Cmd
)

// StartBench starts the bench in development mode (`bench start`) without blocking.
func StartBench() error {
	if unmannedDeployment {
		return fmt.Errorf("cannot start development WSGI: unmanaged shell deployment active")
	}
	if developmentCMD != nil {
		fmt.Printf("[ERROR] Development process already running")
	}
	fmt.Printf("[MODE] DEVELOPMENT\n")
	benchDir := environ.GetBenchPath()

	cmd := exec.Command("bench", "start")
	cmd.Dir = benchDir
	cmd.Env = os.Environ()

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// Start without waiting (non-blocking)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start bench: %v", err)
	}

	developmentCMD = cmd
	fmt.Printf("[DEV] Bench started (PID: %d)\n", cmd.Process.Pid)

	return nil
}

// StopBench stops the bench process if running.
func StopBench() error {
	if developmentCMD == nil {
		fmt.Printf("[ERROR] Development process not running")
	}
	if developmentCMD != nil && developmentCMD.Process != nil {
		if err := productionCMD.Process.Signal(syscall.SIGTERM); err != nil {
			return fmt.Errorf("failed to stop develeopment WSGI: %v", err)
		}
		developmentCMD = nil
	}
	fmt.Println("[WSGI] Development WSGI stopped (bench terminated)")
	return nil
}
