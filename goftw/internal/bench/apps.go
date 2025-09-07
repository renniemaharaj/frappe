package bench

import (
	"fmt"
)

// GetApp fetches an app from branch
func GetApp(app, branch string) error {
	fmt.Printf("[APPS] Fetching app: %s from branch: %s\n", app, branch)
	_, err := RunInBenchSwallowIO("get-app", "--branch", branch, app)
	return err
}
