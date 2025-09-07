package bench

import (
	"fmt"
	"goftw/internal/sudo"
	"os"
	"path/filepath"
)

// ListApps returns all directories in benchDir/apps that are valid git repositories.
func ListApps(benchDir string) ([]string, error) {
	var apps []string
	appDirs, err := filepath.Glob(filepath.Join(benchDir, "apps", "*"))
	if err != nil {
		fmt.Printf("[ERROR] Failed to glob app directories: %v\n", err)
		return nil, err
	}

	for _, d := range appDirs {
		info, err := os.Stat(d)
		if err != nil || !info.IsDir() {
			continue
		}

		// Check if directory is a git repository
		if err := sudo.RunPrintIO("git", "-C", d, "status"); err != nil {
			fmt.Printf("[WARN] Skipping %s: git status failed\n", d)
			continue
		}
		apps = append(apps, filepath.Base(d))
	}
	return apps, nil
}
