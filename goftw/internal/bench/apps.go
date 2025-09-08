package bench

import (
	"fmt"
	"goftw/internal/entity"
	"goftw/internal/utils"
	"os"
	"path/filepath"
)

// GetApp fetches an app from branch
func (b *Bench) GetApp(app, branch string) error {
	_, err := b.ExecRunInBenchSwallowIO("bench", "get-app", "--branch", branch, app)
	return err
}

// fetchMissingApps ensures that every app in instance.json exists in bench/apps
func (b *Bench) fetchMissingApps(site entity.Site) error {
	for _, app := range site.Apps {
		if app == "frappe" {
			continue
		}
		appPath := filepath.Join(b.Path, "apps", app)
		if _, err := os.Stat(appPath); os.IsNotExist(err) {
			fmt.Printf("[APP] Fetching missing app: %s\n", app)
			if err := b.GetApp(app, b.Branch); err != nil {
				fmt.Printf("[ERROR] Failed to fetch app %s: %v\n", app, err)
				return err
			}
		}
	}
	return nil
}

// installMissingApps installs apps that are expected but not currently present
func (b *Bench) installMissingApps(siteName string, expected, current []string) error {
	for _, app := range utils.Difference(expected, current) {
		if app != "frappe" {
			fmt.Printf("[APPS] Installing missing app: %s\n", app)
			if err := b.InstallApp(siteName, app); err != nil {
				fmt.Printf("[ERROR] Failed to install app %s on site %s: %v\n", app, siteName, err)
				return err
			}
		}
	}
	return nil
}

// uninstallExtraApps uninstalls apps that are present but not expected
func (b *Bench) uninstallExtraApps(siteName string, current, expected []string) error {
	for _, app := range utils.Difference(current, expected) {
		if app != "frappe" {
			fmt.Printf("[APPS] Uninstalling extra app: %s\n", app)
			if err := b.UninstallApp(siteName, app); err != nil {
				return err
			}
		}
	}
	return nil
}

// InstallApp installs an app on a site
func (b *Bench) InstallApp(site, app string) error {
	fmt.Printf("[APPS] Installing app: %s on site: %s\n", app, site)
	return b.ExecRunInBenchPrintIO("bench", "--site", site, "install-app", app)
}

// UninstallApp removes an app from a site
func (b *Bench) UninstallApp(site, app string) error {
	fmt.Printf("[APPS] Uninstalling app: %s from site: %s\n", app, site)
	return b.ExecRunInBenchPrintIO("bench", "--site", site, "uninstall-app", app, "--yes")
}
