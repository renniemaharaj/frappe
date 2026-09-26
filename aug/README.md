# Agent augmentation

`capabilities.json` lists implemented features and guides. `tools.json` is generated from the browser MCP server's live `tools/list` result with `npm run catalog` in `mcp/`. These files guide agents; the server code under `mcp/` performs actions.

Use [browser.md](browser.md) for browser controls and diagnostics, [frappe-ui.md](frappe-ui.md) for live Frappe state, and [observability.md](observability.md) for tool usage and relative call costs. [payroll.md](payroll.md) records the validation workflow and planned focused tools. Add Frappe and ERPNext reference material under `frappe/` later; keep source URLs, app versions, and retrieval dates with each document so future RAG results can be checked against the running site.
