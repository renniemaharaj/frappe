package main

import (
	"fmt"
	"log"
	"os"

	"goftw/internal/bench"
	"goftw/internal/config"
	"goftw/internal/db"

	"goftw/internal/environ"
	"goftw/internal/redis"
	"goftw/internal/sites"

	internalDeploy "goftw/internal/deploy"
)

func main() {
	// ---------------------------
	// Paths / environment
	// ---------------------------
	dbCfg := db.Config{
		Host:     environ.GetEnv("MARIADB_HOST", "mariadb"),
		Port:     environ.GetEnv("MARIADB_PORT", "3306"),
		User:     environ.GetEnv("MARIADB_ROOT_USERNAME", "root"),
		Password: environ.GetEnv("MARIADB_ROOT_PASSWORD", "root"),
		Debug:    true,
		Wait:     true,
	}

	// ---------------------------
	// Load configs
	// ---------------------------

	// Load instance.json
	instanceCfx, err := config.LoadInstance(environ.GetInstanceFile())
	if err != nil {
		log.Fatalf("failed to load instance.json: %v", err)
		os.Exit(1)
	}

	// Load common_site_config.json
	commonCfg, err := config.LoadCommonSitesConfig(environ.GetCommonSitesConfigPath())
	if err != nil {
		log.Fatalf("failed to load common_site_config.json: %v", err)
		os.Exit(1)
	}
	benchDir := environ.GetBenchPath()
	deployment := instanceCfx.Deployment

	// ---------------------------
	// Wait for DB
	// ---------------------------
	if err := db.WaitForDB(dbCfg); err != nil {
		log.Fatalf("database check failed: %v", err)
	}

	// ---------------------------
	// Wait for Redis
	// ---------------------------
	for _, redisURL := range []string{commonCfg.RedisQueue, commonCfg.RedisCache, commonCfg.RedisSocketIO} {
		if err := redis.WaitForRedis(redis.Config{
			URL:   redisURL,
			Debug: os.Getenv("REDIS_DEBUG") == "1",
			Wait:  os.Getenv("WAIT_FOR_REDIS") != "0",
		}); err != nil {
			log.Fatalf("redis check failed: %v", err)
		}
	}

	// ---------------------------
	// Initialize Bench if not exists
	// ---------------------------
	if _, err := os.Stat(benchDir); os.IsNotExist(err) {
		log.Printf("bench directory %s does not exist, initializing...", benchDir)
		if err := bench.Initialize(environ.GetBenchName(), instanceCfx.FrappeBranch); err != nil {
			log.Fatalf("bench init failed: %v", err)
		}
	} else {
		log.Printf("bench directory %s exists, running test ...", benchDir)
		_, err := bench.RunInBenchSwallowIO("find", ".")
		if err != nil {
			log.Fatalf("bench test command failed: %v", err)
			os.Exit(1)
		}
		log.Printf("bench test command succeeded")
		// bench.CopyCommonSitesConfig(benchDir, environ.GetCommonSitesConfigPath())
	}

	// ---------------------------
	// Checkout sites for anomalies and missing sites
	// ---------------------------
	if err := sites.CheckoutSites(instanceCfx, benchDir, dbCfg.User, dbCfg.Password); err != nil {
		log.Fatalf("sites sync failed: %v", err)
	}

	// ---------------------------
	// Update bench and apps after deployment
	// ---------------------------
	if err := bench.UpdateApps(benchDir); err != nil {
		fmt.Printf("[ERROR] Failed to update bench apps: %v", err)
	}
	sites.MigrateAll(benchDir)

	// ---------------------------
	// Deployment
	// ---------------------------
	switch deployment {
	case "production":
		if err := internalDeploy.DeployProduction(); err != nil {
			log.Fatalf("production mode failed: %v", err)
		}
	default:
		if err := internalDeploy.DeployDevelopment(); err != nil {
			log.Fatalf("development mode failed: %v", err)
		}
	}
}
