package bench

import (
	"fmt"
)

// Migrate runs bench Migrate
func Migrate(site string) error {
	fmt.Printf("[SITES] Migrating site: %s\n", site)
	return RunInBenchPrintIO("--site", site, "migrate")
}

// MigrateSites runs migrate for all provided sites
func MigrateSites(benchDir string) error {
	sites, err := ListSites(benchDir)
	if err != nil {
		fmt.Printf("[ERROR] Failed to list current sites for migration: %v\n", err)
		return err
	}

	for _, site := range sites {
		if err := Migrate(site); err != nil {
			fmt.Printf("[ERROR] Failed to migrate site %s: %v\n", site, err)
			return err
		}
	}
	return nil
}
