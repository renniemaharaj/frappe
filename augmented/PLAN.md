# MCP automation plan

## Shape

Keep goftw as the executor for bench and site work. Start with the browser MCP server; add a separate control server later:

```
mcp/
  package.json                 # TypeScript tools and build commands
  src/server.ts                # Playwright MCP entrypoint
  src/browser-session.ts       # Persistent browser session
  src/tools.ts                 # Core browser tools
  src/browser-extras.ts        # Browser inspection, files, diagnostics
  src/frappe-tools.ts          # Frappe form/list/child-table inspection
  control/                     # Future separate Compose/goftw server
augmented/                     # Catalog, workflows, and future Frappe reference data
```

Run `control` on the Docker host with access to this repository and the local Docker CLI; it calls goftw over HTTP. Run the browser server as its own MCP process with Playwright and site credentials. Both use local stdio transport. Neither server needs the Docker socket inside a container.

## Control surface

1. **Compose:** `project_start`, `project_stop`, `project_status`, `project_logs`, `project_deploy` (build/recreate and wait for health). Scope every command to this repository's `compose.yml` and project name.
2. **goftw API:** Add versioned endpoints for health/status, bench/app versions, site status, create/drop, app fetch/install/uninstall, migrate, update, and deployment restart. Wrap existing `goftw/internal/bench` methods; add typed request/response models, validation, timeouts, and job IDs for long operations. Expose matching MCP tools plus `job_status` and bounded `job_logs`. Do not offer arbitrary shell or bench command execution.
3. **Desired state:** Make root `instance.json` the single source for deployment mode, site list, app refs, and reconciliation settings. Host-side MCP tools atomically edit validated fields, then invoke deploy/reconcile. Mount the file into `frappe` so changes survive rebuilds; report desired versus actual state and warn before a requested action will be reversed at startup. Define explicit destructive actions for site drop and app uninstall.
4. **Site API and secrets:** Use per-site Frappe API credentials for DocType metadata/reference lookup, document status, and integration diagnostics; keep site-specific work in typed adapters. Add `site_config_location` and a narrowly scoped credential lookup for the site's DB password, with secret values omitted from normal status, logs, and knowledge resources.

## Browser surface

Use Playwright against an allowlist of project site URLs. Provide `site_open`, `site_login`, `initial_setup`, `ensure_automation_user`, `doctype_inspect`, and focused payroll workflows: `salary_component_upsert`, `salary_structure_upsert`, `salary_structure_assignment_upsert`, and corresponding inspect/list tools. Each workflow reads the current form, applies validated inputs, saves, and returns the resulting document name and URL. Keep browser sessions per site; store credentials outside the repo. Use the Frappe API for reference checks where available, and Playwright for UI setup and verification.

## Augmented data

Publish MCP resources for the project layout, `instance.json` schema, current instance/site/app status, DocType field and link metadata, and concise integration recipes in `augmented/`. Generate live resources from goftw/Frappe; keep curated notes versioned with the repo. Include source, site, app version, and retrieval time so an agent can distinguish current facts from guidance. Never index passwords, tokens, or full site configs as resources.

## Delivery order and checks

1. Harden goftw before exposing more writes: require a configured admin password, move hard-coded DB credentials in Compose and site creation to secrets/environment, bind the API to localhost, limit CORS, validate site/app names, and redact secrets from errors. The current API only exposes three site routes, so the remaining methods need handlers.
2. Add goftw status and typed operation endpoints with job tracking; test success, failure, restart persistence, and desired-state reconciliation against a disposable site.
3. Add the control MCP server and resources; verify an agent can start Compose, see health, create a site, install an app, migrate, and inspect resulting state.
4. Extend the working browser MCP server with focused payroll workflows; verify initial setup, automation user, and salary records in a disposable ERPNext site, including reruns and UI changes. Browser login, inspection, and diagnostics already work on `home.localhost`.

Document MCP client launch commands and required environment variables in the README after both servers work. Keep destructive tools explicit and require a target site plus a preview of affected resources before execution.
