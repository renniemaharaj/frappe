# Browser workflow

1. Call `browser_status`. If it reports `Guest`, call `browser_login`. Credentials come from `FRAPPE_UI_USERNAME` and `FRAPPE_UI_PASSWORD`, or from the project's `FRAPPE_ADMIN_PASSWORD` for the default Administrator account. The server never returns the password.
2. Call `browser_open` with a site path such as `/app`. Use `browser_snapshot` to find labels and roles, and `browser_screenshot` when layout matters.
3. Use `browser_click`, `browser_fill`, `browser_select`, `browser_check`, and `browser_press` on one control at a time. Call `browser_wait`, `browser_wait_url`, or `browser_wait_idle` after asynchronous actions, then inspect the result. `browser_get`, `browser_exists`, and `browser_count` answer small state questions without a full snapshot.
4. Read `frappe_route`, `frappe_form`, `frappe_field`, and `frappe_grid` for form state. If Save fails, call `browser_errors`, then `browser_network` and `browser_request` for the failing response. The diagnostic buffer holds the most recent 200 events and redacts common credentials.
5. `browser_upload` accepts files within this project. `browser_download` clicks a control and saves the result under private ignored `mcp/.state/downloads/`; `browser_downloads` lists captured artifacts.
6. Before changing a record, inspect its current form and linked records. After saving, reopen it and verify the stored values. Payroll entries require a second check of calculated slips and totals.

The server operates one configured site and one persistent browser tab. Session state and downloads are in ignored `mcp/.state/`. Use a dedicated automation user when one is available. Browser tool changes require rebuilding `mcp/`, regenerating `tools.json`, and restarting the MCP client connection.
