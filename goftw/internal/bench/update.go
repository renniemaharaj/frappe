package bench

import (
	"fmt"
	"os"

	"goftw/internal/sudo"
)

// ManualUpdate runs all safe update steps in sequence.
func ManualUpdate(benchDir string) error {
	// STEP 1: Update Apps
	fmt.Println("[APPS] Upgrading installed apps")
	if err := GitPullOnApps(benchDir); err != nil {
		fmt.Printf("[ERROR] Failed to list apps for update: %v\n", err)
		return err
	}
	// STEP 2: Python deps
	fmt.Println("[PYTHON] Upgrading pip and Python packages inside bench env...")
	if err := UpdatePython(benchDir); err != nil {
		fmt.Printf("[ERROR] Failed to update python: %v\n", err)
		return err
	}
	// STEP 3: Node/Yarn deps
	fmt.Println("[NODE] Installing/building frontend dependencies...")
	if err := RunYarnInstallBuild(benchDir); err != nil {
		fmt.Printf("[ERROR] Failed to update node: %v\n", err)
		return err
	}
	// STEP 4: Migrate/patches
	fmt.Println("[MIGRATE] Running database migrations & patches...")
	if err := MigrateSites(benchDir); err != nil {
		fmt.Printf("[ERROR] Failed to migrate sites: %v\n", err)
		return err
	}
	// STEP 5: Build assets
	fmt.Println("[BUILD] Rebuilding static assets...")
	if err := BuildAssets(benchDir); err != nil {
		fmt.Printf("[ERROR] Failed to build assets: %v\n", err)
		return err
	}
	fmt.Println("[UPDATE] Update completed successfully")
	// fmt.Println("[SERVICES] Reloading supervisor and nginx...")
	return nil
}

// Updates every installed apps by pulling new commits
func GitPullOnApps(benchDir string) error {
	appNames, err := ListApps(benchDir)
	if err != nil {
		return err
	}
	for _, app := range appNames {
		appPath := benchDir + "/apps/" + app
		if _, err := os.Stat(appPath); os.IsNotExist(err) {
			fmt.Printf("[APPS] Missing app: %s\n", app)
			continue
		}
		fmt.Printf("[APPS] Pulling latest for: %s\n", app)
		if err := sudo.RunInBenchPrintIO("git", "-C", appPath, "pull"); err != nil {
			fmt.Printf("[ERROR] Failed to update app %s: %v\n", app, err)
			return err
		}
	}
	return nil
}

// Upgrades python virtual environment requirements
func UpdatePython(benchDir string) error {
	venvPip := fmt.Sprintf("%s/env/bin/pip", benchDir)
	if err := sudo.RunInBenchPrintIO(venvPip, "install", "--upgrade", "pip", "setuptools", "wheel"); err != nil {
		return fmt.Errorf("[PYTHON] Failed to upgrade pip/setuptools/wheel: %v", err)
	}
	// And, install/upgrade frappe-bench or other global bench packages inside env
	if err := sudo.RunInBenchPrintIO(venvPip, "install", "--upgrade", "frappe-bench", "gunicorn"); err != nil {
		return fmt.Errorf("[PYTHON] Failed to upgrade frappe-bench/gunicorn: %v", err)
	}
	return nil
}

// Update yarn dependencies and builds
func RunYarnInstallBuild(benchDir string) error {
	frappePath := benchDir + "/apps/frappe"
	if err := sudo.RunInBenchPrintIO("yarn", "--cwd", frappePath, "install"); err != nil {
		return err
	}
	return sudo.RunInBenchPrintIO("yarn", "--cwd", frappePath, "build")
}

// Run bench build
func BuildAssets(benchDir string) error {
	return RunInBenchPrintIO("build")
}
