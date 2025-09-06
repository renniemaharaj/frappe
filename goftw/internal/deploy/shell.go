package deployment

import (
	"goftw/internal/environ"
	"goftw/internal/whoami"
	"os"
)

func DeployThroughShell(deployMode string) {
	// We're simply going to set required environment and execute /scripts/service.sh
	os.Setenv("BENCH_DIR", environ.GetBenchPath())
	os.Setenv("DEPLOYMENT", deployMode)
	os.Setenv("MERGED_SUPERVISOR_CONF", "/supervisor-merged.conf")
	os.Setenv("HEAD_PATCH_CONF", "/patches/head.patch.conf")

	whoami.RunPrintIO("bash", "/scripts/service.sh")
}
