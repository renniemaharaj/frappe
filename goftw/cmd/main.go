package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"goftw/internal/bench"
	"goftw/internal/config"
	"goftw/internal/db"
	"goftw/internal/deploy"
	"goftw/internal/handlers"

	"goftw/internal/environ"
	"goftw/internal/redis"
	"goftw/internal/sites"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
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
	// if err := bench.ManualUpdate(benchDir); err != nil {
	// 	fmt.Printf("[ERROR] Failed to update bench: %v", err)
	// }
	// sites.MigrateAll(benchDir)

	// ---------------------------
	// Deployment
	// ---------------------------
	switch deployment {
	case "production":
		if err := deploy.DeployProductionUp(); err != nil {
			fmt.Printf("[ERROR] Production mode failed: %v", err)
		}
	default:
		if err := deploy.StartBench(); err != nil {
			fmt.Printf("[ERROR] Development mode failed: %v", err)
		}
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)

	r.Route("/api/goftw", func(r chi.Router) {
		r.Get("/sites", handlers.ListSitesHandler)
		r.Get("/apps", handlers.ListAppsHandler)
		r.Get("/site/{name}", handlers.GetSitesHandler)
		r.Put("/site/{name}", handlers.PutSitesHandler)
	})

	fmt.Printf("[SERVER] Server running on :3000")
	err = http.ListenAndServe(":3000", r)
	if err != nil {
		fmt.Printf("[ERROR] Could not start server %v", err)
	}
}
