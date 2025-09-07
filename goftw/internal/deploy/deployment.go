package deployment

import (
	"fmt"

	"goftw/internal/bench"
	"goftw/internal/environ"
	"goftw/internal/supervisor"
)

// DeployDevelopment starts the bench in development mode (bench start)
func DeployDevelopment() error {
	fmt.Println("[MODE] DEVELOPMENT")
	err := bench.RunInBenchPrintIO("start")
	return err
}

// DeployProduction sets up supervisor and nginx for production mode
func DeployProduction() error {
	fmt.Println("[MODE] PRODUCTION")
	supervisor.SetupSupervisor(environ.GetBenchPath())
	return nil
}
