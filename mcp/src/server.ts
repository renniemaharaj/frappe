import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BrowserSession } from "./browser-session.js";
import { loadConfig } from "./config.js";
import { registerBrowserTools } from "./tools.js";
import { registerBrowserExtras } from "./browser-extras.js";
import { registerFrappeTools } from "./frappe-tools.js";
import { registerFrappeApiTools } from "./frappe-api-tools.js";
import { instrumentToolUsage } from "./tool-usage.js";

const session = new BrowserSession(await loadConfig());
const server = new McpServer(
  { name: "frappe-browser", version: "0.1.0" },
  { instructions: "Call browser_status, then browser_login if needed. Use browser_snapshot or browser_screenshot to inspect the live Frappe UI before interacting. All navigation stays on the configured site. Browser state is saved locally; do not enter secrets in generic fill tools." },
);

instrumentToolUsage(server);
registerBrowserTools(server, session);
registerBrowserExtras(server, session);
registerFrappeTools(server, session);
registerFrappeApiTools(server, session.config);
await server.connect(new StdioServerTransport());

process.on("SIGINT", () => { void session.close().finally(() => process.exit(0)); });
process.on("SIGTERM", () => { void session.close().finally(() => process.exit(0)); });
