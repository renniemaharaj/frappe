import { access } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

export interface BrowserConfig {
  baseUrl: string;
  username: string;
  password?: string;
  headless: boolean;
  executablePath?: string;
  statePath: string;
}

export async function loadConfig(): Promise<BrowserConfig> {
  try {
    loadEnvFile(path.join(projectRoot, ".env"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const url = new URL(process.env.FRAPPE_UI_BASE_URL || "http://home.localhost");
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("FRAPPE_UI_BASE_URL must use HTTP or HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("FRAPPE_UI_BASE_URL must be a plain site URL");
  }
  url.pathname = url.pathname.replace(/\/$/, "");

  const configuredBrowser = process.env.FRAPPE_UI_BROWSER;
  const defaultBrowser = "/usr/bin/chromium";
  const executablePath = configuredBrowser || (await exists(defaultBrowser) ? defaultBrowser : undefined);

  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    username: process.env.FRAPPE_UI_USERNAME || "Administrator",
    password: process.env.FRAPPE_UI_PASSWORD || process.env.FRAPPE_ADMIN_PASSWORD || undefined,
    headless: process.env.FRAPPE_UI_HEADLESS !== "false",
    executablePath,
    statePath: path.resolve(process.env.FRAPPE_UI_STATE_PATH || path.join(projectRoot, "mcp/.state/home.localhost.json")),
  };
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(() => true, () => false);
}
