# Frappe browser MCP

This local stdio server drives `home.localhost` with Playwright. It offers login, navigation, page controls, Frappe form inspection, bounded diagnostics, and private file transfer. Tool definitions live in `src/tools.ts`, `src/browser-extras.ts`, and `src/frappe-tools.ts`; the catalog in `../augmented/tools.json` is generated from MCP `tools/list`.

```bash
cd mcp
npm ci
npm run build
npm run catalog:check
npm run smoke
```

The project scoped `.codex/config.toml` starts `dist/server.js` when a new Codex session opens. Restart the MCP connection after changes. `FRAPPE_UI_BASE_URL` defaults to `http://home.localhost`; `FRAPPE_UI_USERNAME` defaults to `Administrator`. Set `FRAPPE_UI_PASSWORD` to override the root `.env` value of `FRAPPE_ADMIN_PASSWORD`. `FRAPPE_UI_HEADLESS=false` shows the browser, and `FRAPPE_UI_BROWSER` overrides `/usr/bin/chromium`.

Browser state is saved under ignored `mcp/.state/` with mode `0600`. Rebuild and run `npm run catalog` after changing tools, then update `augmented/browser.json` and its guide. The control MCP server planned in `plan.md` will remain a separate process.
