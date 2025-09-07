package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"goftw/internal/bench"
	"goftw/internal/deploy"
	"goftw/internal/environ"
	internalSites "goftw/internal/sites"
)

// ListSitesHandler lists all sites
func ListSitesHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("[API] ListSitesHandler called")
	benchDir := environ.GetBenchPath()
	fmt.Printf("[API] Bench directory: %s\n", benchDir)

	sites, err := bench.ListSites(benchDir)
	if err != nil {
		writeError(w, 500, fmt.Sprintf("failed to list sites: %v", err))
		return
	}

	fmt.Printf("[API] Found sites: %v\n", sites)
	writeJSON(w, 200, sites)
}

// ListAppsHandler lists all apps in the bench
func ListAppsHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("[API] ListAppsHandler called")
	benchDir := environ.GetBenchPath()
	fmt.Printf("[API] Bench directory: %s\n", benchDir)

	apps, err := bench.ListApps(benchDir)
	if err != nil {
		writeError(w, 500, fmt.Sprintf("failed to list apps: %v", err))
		return
	}

	fmt.Printf("[API] Found apps: %v\n", apps)
	writeJSON(w, 200, apps)
}

// GetSitesHandler returns a single site and its apps
func GetSitesHandler(w http.ResponseWriter, r *http.Request) {
	benchDir := environ.GetBenchPath()
	siteName := chi.URLParam(r, "name")
	fmt.Printf("[API] GetSitesHandler called for site: %s\n", siteName)

	// Verify site exists
	fmt.Println("[API] Verifying site existence...")
	sites, _ := bench.ListSites(benchDir)
	found := false
	for _, s := range sites {
		if s == siteName {
			found = true
			break
		}
	}
	if !found {
		writeError(w, 404, "site not found")
		return
	}
	fmt.Printf("[API] Site %s exists\n", siteName)

	// Get installed apps for this site
	fmt.Printf("[API] Retrieving apps for site %s...\n", siteName)
	apps, err := internalSites.ListApps(siteName)
	if err != nil {
		writeError(w, 500, fmt.Sprintf("failed to get site apps: %v", err))
		return
	}
	fmt.Printf("[API] Apps for site %s: %v\n", siteName, apps)

	resp := map[string]interface{}{
		"site": siteName,
		"apps": apps,
		"url":  fmt.Sprintf("http://%s", siteName),
	}
	writeJSON(w, 200, resp)
}

// PutSitesHandler creates a new site and installs apps
func PutSitesHandler(w http.ResponseWriter, r *http.Request) {
	siteName := chi.URLParam(r, "name")
	fmt.Printf("[API] PutSitesHandler called for site: %s\n", siteName)

	// Parse body for apps list
	var body struct {
		Apps []string `json:"apps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid JSON body")
		return
	}
	fmt.Printf("[API] Requested apps to install: %v\n", body.Apps)

	// Create site
	fmt.Printf("[API] Creating site %s...\n", siteName)
	if err := internalSites.New(siteName, "root", "root"); err != nil {
		writeError(w, 500, fmt.Sprintf("failed to create site: %v", err))
		return
	}
	fmt.Printf("[API] Site %s created successfully\n", siteName)

	// Apply apps
	for _, app := range body.Apps {
		fmt.Printf("[API] Installing app %s on site %s...\n", app, siteName)
		if err := internalSites.InstallApp(siteName, app); err != nil {
			writeError(w, 500, fmt.Sprintf("failed to install app %s: %v", app, err))
			return
		}
		fmt.Printf("[API] App %s installed successfully\n", app)
	}

	// Restart deployment
	fmt.Println("[API] Restarting deployment services...")
	if err := deploy.RestartDeployment(); err != nil {
		fmt.Printf("[ERROR] Deployment restart failed: %v\n", err)
	}

	resp := map[string]interface{}{
		"site": siteName,
		"apps": body.Apps,
		"url":  fmt.Sprintf("http://%s", siteName),
	}
	writeJSON(w, 201, resp)
	fmt.Printf("[API] Site %s creation & apps applied successfully\n", siteName)
}
