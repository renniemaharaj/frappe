import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { BrowserSession } from "./browser-session.js";
import { projectRoot } from "./config.js";
import { json, loadedPage, targetOn, targetSchema } from "./tools.js";
import { redactValue } from "./redact.js";

const timeout = z.number().int().min(100).max(30000).default(10000);
const since = z.number().int().min(0).optional();

export const extraPhases = {
  browser_back: "navigate",
  browser_reload: "navigate",
  browser_get: "observe",
  browser_exists: "observe",
  browser_count: "observe",
  browser_check: "interact",
  browser_uncheck: "interact",
  browser_upload: "interact",
  browser_download: "interact",
  browser_downloads: "observe",
  browser_wait_url: "observe",
  browser_wait_idle: "observe",
  browser_console: "diagnose",
  browser_errors: "diagnose",
  browser_network: "diagnose",
  browser_request: "diagnose",
} as const;

export function registerBrowserExtras(server: McpServer, session: BrowserSession): void {
  const result = (value: Record<string, unknown>) => json(redactValue(value, session.config.password) as Record<string, unknown>);
  server.registerTool("browser_back", {
    description: "Go back in the current Frappe tab.", inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => session.run(async () => {
    const page = await loadedPage(session);
    await page.goBack({ waitUntil: "domcontentloaded" });
    return result({ url: page.url() });
  }));

  server.registerTool("browser_reload", {
    description: "Reload the current Frappe tab.", inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => session.run(async () => {
    const page = await loadedPage(session);
    await page.reload({ waitUntil: "domcontentloaded" });
    return result({ url: page.url() });
  }));

  server.registerTool("browser_get", {
    description: "Read text, input value, checked/disabled/visible state, or an attribute from one element.",
    inputSchema: { target: targetSchema, property: z.enum(["text", "value", "checked", "disabled", "visible", "attribute"]), attribute: z.string().optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ target, property, attribute }) => session.run(async () => {
    const page = await loadedPage(session);
    const locator = targetOn(page, target);
    if (property === "attribute" && !attribute) throw new Error("attribute is required for property=attribute");
    const value = property === "text" ? await locator.innerText() :
      property === "value" ? await locator.inputValue() :
      property === "checked" ? await locator.isChecked() :
      property === "disabled" ? await locator.isDisabled() :
      property === "visible" ? await locator.isVisible() : await locator.getAttribute(attribute!);
    return result({ property, value, url: page.url() });
  }));

  server.registerTool("browser_exists", {
    description: "Check whether any matching element exists in the current DOM.", inputSchema: { target: targetSchema },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ target }) => session.run(async () => {
    const page = await loadedPage(session);
    return result({ exists: await targetOn(page, target).count() > 0, url: page.url() });
  }));

  server.registerTool("browser_count", {
    description: "Count elements matching a locator.", inputSchema: { target: targetSchema },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ target }) => session.run(async () => {
    const page = await loadedPage(session);
    return result({ count: await targetOn(page, target).count(), url: page.url() });
  }));

  for (const checked of [true, false]) {
    server.registerTool(checked ? "browser_check" : "browser_uncheck", {
      description: `${checked ? "Check" : "Uncheck"} one checkbox or radio control.`, inputSchema: { target: targetSchema },
      annotations: { readOnlyHint: false, openWorldHint: false },
    }, async ({ target }) => session.run(async () => {
      const page = await loadedPage(session);
      const marker = session.marker();
      if (checked) await targetOn(page, target).check({ timeout: 10000 });
      else await targetOn(page, target).uncheck({ timeout: 10000 });
      return result({ checked, url: page.url(), ...session.summary(marker) });
    }));
  }

  server.registerTool("browser_upload", {
    description: "Attach a project file to a file input in the current Frappe page. The file must be inside the project root.",
    inputSchema: { target: targetSchema, path: z.string().min(1) },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ target, path: file }) => session.run(async () => {
    const page = await loadedPage(session);
    const actual = await realpath(path.resolve(projectRoot, file));
    if (!actual.startsWith(`${projectRoot}${path.sep}`)) throw new Error("Upload file must be inside the project root");
    const info = await stat(actual);
    if (!info.isFile()) throw new Error("Upload path must be a file");
    const marker = session.marker();
    await targetOn(page, target).setInputFiles(actual, { timeout: 10000 });
    return result({ uploaded: true, filename: path.basename(actual), bytes: info.size, url: page.url(), ...session.summary(marker) });
  }));

  server.registerTool("browser_download", {
    description: "Click a download control, wait for its file, and save the artifact in the private MCP state directory.",
    inputSchema: { target: targetSchema, timeout_ms: timeout },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ target, timeout_ms }) => session.run(async () => {
    const page = await loadedPage(session);
    const marker = session.marker();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: timeout_ms }),
      targetOn(page, target).click({ timeout: timeout_ms }),
    ]);
    const artifact = await session.saveDownload(download);
    return result({ ...artifact, url: page.url(), ...session.summary(marker) });
  }));

  server.registerTool("browser_downloads", {
    description: "List files captured by browser_download in this server session.", inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => session.run(async () => result({ downloads: session.listDownloads() })));

  server.registerTool("browser_wait_url", {
    description: "Wait until the current tab URL contains a given path or text.",
    inputSchema: { contains: z.string().min(1), timeout_ms: timeout },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ contains, timeout_ms }) => session.run(async () => {
    const page = await loadedPage(session);
    await page.waitForURL(url => url.toString().includes(contains), { timeout: timeout_ms });
    return result({ matched: true, url: page.url() });
  }));

  server.registerTool("browser_wait_idle", {
    description: "Wait for network quiet after a Frappe action; long polling may cause a timeout.",
    inputSchema: { timeout_ms: timeout }, annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ timeout_ms }) => session.run(async () => {
    const page = await loadedPage(session);
    await page.waitForLoadState("networkidle", { timeout: timeout_ms });
    return result({ idle: true, url: page.url() });
  }));

  server.registerTool("browser_console", {
    description: "Read recent browser console messages from the bounded diagnostic buffer.",
    inputSchema: { level: z.enum(["error", "warning", "all"]).default("all"), since, limit: z.number().int().min(1).max(100).default(30) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ level, since, limit }) => session.run(async () => {
    await loadedPage(session);
    const events = session.diagnostics({ kind: "console", since, limit }).filter(event => level === "all" || event.level === level);
    return result({ events, latest_id: session.marker() });
  }));

  server.registerTool("browser_errors", {
    description: "Read page exceptions, failed requests, HTTP errors, and console errors.",
    inputSchema: { since, limit: z.number().int().min(1).max(100).default(30) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ since, limit }) => session.run(async () => {
    await loadedPage(session);
    const events = session.diagnostics({ since, limit: 200 }).filter(event =>
      event.kind === "pageerror" || event.kind === "requestfailed" ||
      (event.kind === "console" && event.level === "error") ||
      (event.kind === "response" && Number(event.status) >= 400)).slice(-limit);
    return result({ events, latest_id: session.marker() });
  }));

  server.registerTool("browser_network", {
    description: "List recent requests and responses with methods, status, URLs, and IDs. Bodies are in browser_request.",
    inputSchema: { since, method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(), status: z.number().int().min(100).max(599).optional(), contains: z.string().optional(), limit: z.number().int().min(1).max(100).default(30) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ since, method, status, contains, limit }) => session.run(async () => {
    await loadedPage(session);
    const events = session.diagnostics({ since, method, status, contains, limit: 200 })
      .filter(event => ["request", "response", "requestfailed"].includes(event.kind))
      .slice(-limit).map(({ requestBody, body, ...metadata }) => metadata);
    return result({ events, latest_id: session.marker() });
  }));

  server.registerTool("browser_request", {
    description: "Inspect one captured request or response by diagnostic ID, including a redacted body when available.",
    inputSchema: { id: z.number().int().min(1) }, annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ id }) => session.run(async () => {
    await loadedPage(session);
    const event = session.diagnostic(id);
    if (!event || !["request", "response", "requestfailed"].includes(event.kind)) throw new Error("Request ID is no longer in the diagnostic buffer");
    return result({ event });
  }));
}
