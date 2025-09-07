package bench

import (
	"fmt"
	"goftw/internal/environ"
	"goftw/internal/sudo"
	"goftw/internal/whoami"
	"os"
	"path/filepath"
)

// Initialize initializes a new bench with the given name and frappe branch
func Initialize(benchName, frappeBranch string) error {
	homeDir := environ.GetFrappeHome()
	benchPath := filepath.Join(homeDir, benchName)

	// Ensure parent exists
	if _, err := os.Stat(homeDir); os.IsNotExist(err) {
		fmt.Printf("[INFO] Parent directory %s does not exist, creating...\n", homeDir)
		if err := os.MkdirAll(homeDir, 0755); err != nil {
			fmt.Printf("[WARN] Could not create directory without sudo: %v\n", err)
			if err := sudo.RunPrintIO("mkdir", "-p", homeDir); err != nil {
				return fmt.Errorf("failed to create parent directory even with sudo: %w", err)
			}

		}
	}

	if err := sudo.RunPrintIO("chown", fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid()), homeDir); err != nil {
		return fmt.Errorf("failed to chown parent directory: %w", err)
	}

	// Run bench init
	cmd := fmt.Sprintf("bench init --frappe-branch %s %s", frappeBranch, benchPath)
	if err := whoami.RunPrintIO("sh", "-c", cmd); err != nil {
		return fmt.Errorf("[ERROR] Bench initialization failed: %w", err)
	}

	CopyCommonSitesConfig(benchPath, environ.GetCommonSitesConfigPath())
	fmt.Printf("[INFO] Bench '%s' initialized successfully\n", benchName)
	return nil
}

func CopyCommonSitesConfig(benchDir, configPath string) error {
	dest := fmt.Sprintf("%s/sites", benchDir)
	if err := sudo.RunPrintIO("cp", configPath, dest); err != nil {
		return fmt.Errorf("copy %s -> %s: %w", configPath, dest, err)
	}
	return nil
}
