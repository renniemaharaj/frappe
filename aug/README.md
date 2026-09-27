# Agent augmentation

Use [app-development-system.md](app-development-system.md) for the shared app build, maintenance, testing, and live-site validation workflow. New or maintained apps provide an `APP_MAINTENANCE.md` using [app-adapter-template.md](app-adapter-template.md); the HrtmPay adapter is at `mount/frappe-v16-bench/apps/hrtmpay/APP_MAINTENANCE.md`.

`capabilities.json` lists implemented features and guides. `tools.json` is generated from the browser MCP server's live `tools/list` result with `npm run catalog` in `mcp/`. These files guide agents; the server code under `mcp/` performs actions.

Use [browser.md](browser.md) for browser controls and diagnostics, [frappe-ui.md](frappe-ui.md) for live Frappe state, and [observability.md](observability.md) for tool usage and relative call costs. [payroll.md](payroll.md) records the validation workflow and planned focused tools. Add Frappe and ERPNext reference material under `frappe/` later; keep source URLs, app versions, and retrieval dates with each document so future RAG results can be checked against the running site.
