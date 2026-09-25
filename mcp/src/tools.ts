import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Locator, Page } from "playwright";
import type { BrowserSession } from "./browser-session.js";
import { redactValue } from "./redact.js";

export const toolPhases = {
  browser_status: "status",
  browser_login: "login",
  browser_open: "navigate",
  browser_snapshot: "observe",
  browser_screenshot: "observe",
  browser_click: "interact",
  browser_fill: "interact",
  browser_select: "interact",
  browser_press: "interact",
  browser_wait: "observe",
} as const;

export const targetSchema = z.object({
  by: z.enum(["css", "role", "label", "text", "placeholder"]),
  value: z.string().min(1),
  role: z.string().optional(),
});

type Target = z.infer<typeof targetSchema>;

export function targetOn(page: Page, target: Target): Locator {
  switch (target.by) {
    case "css": return page.locator(target.value);
    case "label": return page.getByLabel(target.value, { exact: true });
    case "text": return page.getByText(target.value, { exact: true });
    case "placeholder": return page.getByPlaceholder(target.value, { exact: true });
    case "role":
      if (!target.role) throw new Error("target.role is required when target.by is role");
      return page.getByRole(target.role as Parameters<Page["getByRole"]>[0], {
        name: target.value, exact: true,
      });
  }
}

export function json(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

export async function loadedPage(session: BrowserSession): Promise<Page> {
  const page = await session.page();
  if (page.url() === "about:blank") {
    await page.goto(`${session.config.baseUrl}/app`, { waitUntil: "domcontentloaded" });
  }
  return page;
}

export function siteUrl(baseUrl: string, path: string): string {
  const url = new URL(path, `${baseUrl}/`);
  if (url.origin !== new URL(baseUrl).origin) {
    throw new Error("Browser navigation must stay on the configured Frappe site");
  }
  return url.toString();
}

function redact(text: string, secret?: string): string {
  return secret ? text.replaceAll(secret, "[redacted]") : text;
}

export function registerBrowserTools(server: McpServer, session: BrowserSession): void {
  const result = (value: Record<string, unknown>) => json(redactValue(value, session.config.password) as Record<string, unknown>);
  server.registerTool("browser_status", {
    title: "Browser status",
    description: "Check the configured Frappe site, current page, and logged-in user.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => session.run(async () => {
    const page = await loadedPage(session);
    const user = await session.loggedInUser();
    return result({ site: session.config.baseUrl, url: page.url(), user: user || null,
      authenticated: Boolean(user && user !== "Guest") });
  }));

  server.registerTool("browser_login", {
    title: "Log in to Frappe",
    description: "Log into the configured Frappe site using credentials from the local environment; persist the browser session.",
    inputSchema: {},
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async () => session.run(async () => {
    const page = await session.page();
    await page.goto(`${session.config.baseUrl}/app`, { waitUntil: "domcontentloaded" });
    let user = await session.loggedInUser();
    if (user && user !== "Guest") {
      await session.saveState();
      return result({ authenticated: true, user, url: page.url(), restored: true });
    }
    if (!session.config.password) {
      throw new Error("Set FRAPPE_UI_PASSWORD or FRAPPE_ADMIN_PASSWORD before browser_login");
    }
    await page.goto(`${session.config.baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("#login_email").fill(session.config.username);
    await page.locator("#login_password").fill(session.config.password);
    await page.locator("form.form-login button.btn-login").click();
    await page.waitForURL(url => url.pathname !== "/login", { timeout: 20_000 }).catch(() => undefined);
    user = await session.loggedInUser();
    if (!user || user === "Guest") {
      const error = await page.locator(".login-error-banner, .alert-danger").allTextContents();
      throw new Error(redact(error.map(value => value.trim()).filter(Boolean).join("; ") ||
        "Login did not create an authenticated session", session.config.password));
    }
    await session.saveState();
    return result({ authenticated: true, user, url: page.url(), restored: false });
  }));

  server.registerTool("browser_open", {
    title: "Open Frappe page",
    description: "Navigate the current browser tab to a path on the configured Frappe site.",
    inputSchema: { path: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ path }) => session.run(async () => {
    const page = await session.page();
    await page.goto(siteUrl(session.config.baseUrl, path), { waitUntil: "domcontentloaded" });
    return result({ url: page.url(), title: await page.title() });
  }));

  server.registerTool("browser_snapshot", {
    title: "Inspect Frappe page",
    description: "Return a compact accessibility snapshot of the current Frappe page for locating controls.",
    inputSchema: { max_chars: z.number().int().min(1000).max(30000).default(18000) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ max_chars }) => session.run(async () => {
    const page = await loadedPage(session);
    const snapshot = redact(await page.locator("body").ariaSnapshot(), session.config.password);
    return result({ url: page.url(), snapshot: snapshot.slice(0, max_chars),
      truncated: snapshot.length > max_chars });
  }));

  server.registerTool("browser_screenshot", {
    title: "Screenshot Frappe page",
    description: "Capture the current browser tab as a PNG image.",
    inputSchema: { full_page: z.boolean().default(false) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ full_page }) => session.run(async () => {
    const page = await loadedPage(session);
    const png = await page.screenshot({ type: "png", fullPage: full_page });
    return { content: [
      { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" },
      { type: "text" as const, text: JSON.stringify({ url: page.url(), bytes: png.length }) },
    ] };
  }));

  server.registerTool("browser_click", {
    title: "Click Frappe control",
    description: "Click one visible control selected by role, label, text, placeholder, or CSS.",
    inputSchema: { target: targetSchema },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ target }) => session.run(async () => {
    const page = await loadedPage(session);
    const before = page.url();
    const marker = session.marker();
    await targetOn(page, target).click({ timeout: 10_000 });
    return result({ clicked: true, url: page.url(), changed_url: page.url() !== before, ...session.summary(marker) });
  }));

  server.registerTool("browser_fill", {
    title: "Fill Frappe field",
    description: "Fill one text field; the returned result does not echo its value.",
    inputSchema: { target: targetSchema, value: z.string() },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ target, value }) => session.run(async () => {
    const page = await loadedPage(session);
    const marker = session.marker();
    await targetOn(page, target).fill(value, { timeout: 10_000 });
    return result({ filled: true, url: page.url(), ...session.summary(marker) });
  }));

  server.registerTool("browser_select", {
    title: "Select Frappe option",
    description: "Choose an option in a native select field by its visible label or value.",
    inputSchema: { target: targetSchema, option: z.string(), by_option: z.enum(["label", "value"]).default("label") },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ target, option, by_option }) => session.run(async () => {
    const page = await loadedPage(session);
    const marker = session.marker();
    const selected = await targetOn(page, target).selectOption(
      by_option === "label" ? { label: option } : { value: option }, { timeout: 10_000 });
    return result({ selected, url: page.url(), ...session.summary(marker) });
  }));

  server.registerTool("browser_press", {
    title: "Press key in Frappe",
    description: "Press a key or key chord in one focused control, such as Enter or ControlOrMeta+A.",
    inputSchema: { target: targetSchema, key: z.string().min(1) },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ target, key }) => session.run(async () => {
    const page = await loadedPage(session);
    const marker = session.marker();
    await targetOn(page, target).press(key, { timeout: 10_000 });
    return result({ pressed: true, url: page.url(), ...session.summary(marker) });
  }));

  server.registerTool("browser_wait", {
    title: "Wait for Frappe UI",
    description: "Wait until a selected control is visible after a page or form action.",
    inputSchema: { target: targetSchema, state: z.enum(["visible", "hidden", "attached", "detached", "enabled", "disabled"]).default("visible"), timeout_ms: z.number().int().min(100).max(30000).default(10000) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ target, state, timeout_ms }) => session.run(async () => {
    const page = await loadedPage(session);
    const locator = targetOn(page, target);
    if (state === "enabled" || state === "disabled") {
      await locator.waitFor({ state: "visible", timeout: timeout_ms });
      const deadline = Date.now() + timeout_ms;
      while (await locator.isEnabled() !== (state === "enabled")) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${state}`);
        await page.waitForTimeout(100);
      }
    } else {
      await locator.waitFor({ state, timeout: timeout_ms });
    }
    return result({ state, matched: true, url: page.url() });
  }));
}
