import { chmod, mkdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Download, type Page, type Request } from "playwright";
import type { BrowserConfig } from "./config.js";
import { redactBody, redactText, redactUrl, redactValue } from "./redact.js";

type Diagnostic = { id: number; time: number; kind: string; [key: string]: unknown };
const maxEvents = 200;

export class BrowserSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private activePage?: Page;
  private pending: Promise<unknown> = Promise.resolve();
  private events: Diagnostic[] = [];
  private requests = new WeakMap<Request, number>();
  private nextId = 1;
  private downloads: Array<{ id: string; filename: string; bytes: number; artifact_path: string }> = [];

  constructor(readonly config: BrowserConfig) {}

  async run<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending.then(action, action);
    this.pending = next.catch(() => undefined);
    return next;
  }

  async page(): Promise<Page> {
    if (!this.context) {
      const storageState = await exists(this.config.statePath) ? this.config.statePath : undefined;
      this.browser = await chromium.launch({
        headless: this.config.headless,
        executablePath: this.config.executablePath,
      });
      this.context = await this.browser.newContext({ storageState });
      this.context.on("page", page => this.observePage(page));
    }
    this.activePage ??= await this.context.newPage();
    return this.activePage;
  }

  private addEvent(kind: string, data: Record<string, unknown>): number {
    const id = this.nextId++;
    this.events.push({ id, time: Date.now(), kind, ...data });
    if (this.events.length > maxEvents) this.events.shift();
    return id;
  }

  private observePage(page: Page): void {
    page.on("console", message => {
      this.addEvent("console", { level: message.type(), text: redactText(message.text(), this.config.password) });
    });
    page.on("pageerror", error => {
      this.addEvent("pageerror", { text: redactText(error.message, this.config.password) });
    });
    page.on("dialog", async dialog => {
      this.addEvent("dialog", { type: dialog.type(), message: redactText(dialog.message(), this.config.password) });
      await dialog.dismiss().catch(() => undefined);
    });
    page.on("request", request => {
      const contentType = request.headers()["content-type"] || "";
      const body = /(?:application\/json|application\/x-www-form-urlencoded)/i.test(contentType)
        ? request.postData()?.slice(0, 32000) ?? null : null;
      const id = this.addEvent("request", {
        method: request.method(), url: redactUrl(request.url(), this.config.password),
        resource: request.resourceType(),
        requestBody: redactBody(body, this.config.password),
      });
      this.requests.set(request, id);
    });
    page.on("response", response => {
      const request = response.request();
      const requestId = this.requests.get(request);
      const id = this.addEvent("response", {
        requestId, method: request.method(), url: redactUrl(response.url(), this.config.password),
        status: response.status(), resource: request.resourceType(),
      });
      const type = response.headers()["content-type"] || "";
      if (/(?:json|text|javascript|xml)/i.test(type) && ["xhr", "fetch"].includes(request.resourceType())) {
        void response.text().then(body => {
          const event = this.events.find(item => item.id === id);
          if (event) event.body = redactBody(body.slice(0, 32000), this.config.password);
        }).catch(() => undefined);
      }
    });
    page.on("requestfailed", request => {
      this.addEvent("requestfailed", {
        requestId: this.requests.get(request), method: request.method(),
        url: redactUrl(request.url(), this.config.password),
        failure: redactText(request.failure()?.errorText || "unknown", this.config.password),
      });
    });
  }

  diagnostics(options: { since?: number; kind?: string; method?: string; status?: number; contains?: string; limit?: number } = {}): Diagnostic[] {
    return this.events.filter(event =>
      (!options.since || event.id > options.since) &&
      (!options.kind || event.kind === options.kind) &&
      (!options.method || event.method === options.method) &&
      (!options.status || event.status === options.status) &&
      (!options.contains || JSON.stringify(event).toLowerCase().includes(options.contains.toLowerCase()))
    ).slice(-(options.limit || 50)).map(event => redactValue(event, this.config.password) as Diagnostic);
  }

  diagnostic(id: number): Diagnostic | undefined {
    const event = this.events.find(item => item.id === id);
    return event ? redactValue(event, this.config.password) as Diagnostic : undefined;
  }

  marker(): number { return this.nextId - 1; }

  summary(since: number): Record<string, unknown> {
    const events = this.diagnostics({ since, limit: maxEvents });
    return {
      new_requests: events.filter(event => event.kind === "request").length,
      new_errors: events.filter(event => event.kind === "pageerror" || event.kind === "requestfailed" ||
        (event.kind === "console" && event.level === "error") ||
        (event.kind === "response" && Number(event.status) >= 400)).map(event => ({ id: event.id, kind: event.kind, status: event.status, text: event.text, url: event.url })).slice(-5),
      dialogs: events.filter(event => event.kind === "dialog").map(event => ({ id: event.id, message: event.message })),
    };
  }

  async saveDownload(download: Download): Promise<{ id: string; filename: string; bytes: number; artifact_path: string }> {
    const id = randomUUID();
    const filename = path.basename(download.suggestedFilename());
    const folder = path.join(path.dirname(this.config.statePath), "downloads");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const artifactPath = path.join(folder, `${id}-${filename}`);
    await download.saveAs(artifactPath);
    await chmod(artifactPath, 0o600);
    const metadata = { id, filename, bytes: (await stat(artifactPath)).size, artifact_path: artifactPath };
    this.downloads.push(metadata);
    if (this.downloads.length > 100) this.downloads.shift();
    return metadata;
  }

  listDownloads(): Array<{ id: string; filename: string; bytes: number; artifact_path: string }> {
    return [...this.downloads];
  }

  async loggedInUser(): Promise<string | undefined> {
    await this.page();
    const response = await this.context!.request.get(
      `${this.config.baseUrl}/api/method/frappe.auth.get_logged_user`,
      { timeout: 10_000 },
    );
    if (!response.ok()) return undefined;
    const payload = await response.json() as { message?: string };
    return payload.message;
  }

  async saveState(): Promise<void> {
    if (!this.context) return;
    await mkdir(path.dirname(this.config.statePath), { recursive: true, mode: 0o700 });
    await this.context.storageState({ path: this.config.statePath });
    await chmod(this.config.statePath, 0o600);
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.context = undefined;
    this.activePage = undefined;
  }
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(() => true, () => false);
}
