package bench

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"goftw/internal/environ"
	internalExec "goftw/internal/fns"
	"goftw/internal/whoiam"
)

// The structure of a branch type
type Bench struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	Branch string `json:"branch"`
}

// Copy common_sites_config into bench
func (b *Bench) CopyCommonSitesConfig(configPath string) error {
	dest := fmt.Sprintf("%s/sites", b.Path)
	if err := internalExec.ExecRunPrintIO("cp", configPath, dest); err != nil {
		return fmt.Errorf("copy %s -> %s: %w", configPath, dest, err)
	}
	return nil
}

// Initialize initializes a new bench with the given name and frappe branch
func (b *Bench) Initialize(frappeBranch string) error {
	homeDir := environ.GetFrappeHome()
	benchPath := filepath.Join(homeDir, b.Path)

	// Ensure parent exists
	if _, err := os.Stat(homeDir); os.IsNotExist(err) {
		fmt.Printf("[INFO] Parent directory %s does not exist, creating...\n", homeDir)
		if err := os.MkdirAll(homeDir, 0755); err != nil {
			fmt.Printf("[WARN] Could not create directory without sudo: %v\n", err)
			if err := internalExec.ExecRunPrintIO("sudo", "mkdir", "-p", homeDir); err != nil {
				return fmt.Errorf("failed to create parent directory even with sudo: %w", err)
			}

		}
	}

	if err := internalExec.ExecRunPrintIO("chown", fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid()), homeDir); err != nil {
		return fmt.Errorf("failed to chown parent directory: %w", err)
	}

	// Run bench init
	cmd := fmt.Sprintf("bench init --frappe-branch %s %s", frappeBranch, benchPath)
	if err := whoiam.ExecRunPrintIO("sh", "-c", cmd); err != nil {
		return fmt.Errorf("[ERROR] Bench initialization failed: %w", err)
	}

	b.CopyCommonSitesConfig(environ.GetCommonSitesConfigPath())
	fmt.Printf("[INFO] Bench '%s' initialized successfully\n", b.Path)
	return nil
}

// ExecRunInBenchSwallowIO executes a bench command inside the bench directory and returns its output.
func (b *Bench) ExecRunInBenchSwallowIO(args ...string) ([]byte, error) {
	// Directly run bench with Dir set to benchDir
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = b.Path
	cmd.Env = os.Environ() // inherit environment variables

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("bench failed: %s, stderr: %s", err, stderr.String())
	}

	return out.Bytes(), nil
}

// ExecRunInBenchPrintIO executes a bench command inside the bench directory and prints its output.
func (b *Bench) ExecRunInBenchPrintIO(args ...string) error {
	// Directly run bench with Dir set to benchDir
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = b.Path
	cmd.Env = os.Environ() // inherit environment variables

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("bench failed: %v", err)
	}

	return nil
}

// ExecStartInBenchPrintIO executes a bench command inside the bench directory, with stdio printing,
// but will not wait nor block
func (b *Bench) ExecStartInBenchPrintIO(args ...string) (*exec.Cmd, error) {
	// Directly run bench with Dir set to benchDir
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = b.Path
	cmd.Env = os.Environ() // inherit environment variables

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Start()
	if err != nil {
		return nil, fmt.Errorf("bench failed: %v", err)
	}

	return cmd, nil
}
