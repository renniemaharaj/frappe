import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { redactBody, redactText, redactUrl } from "../dist/redact.js";

assert.equal(redactBody('{"password":"secret","nested":{"api_key":"key"},"ok":1}').nested.api_key, "[redacted]");
assert.equal(redactUrl("http://home.localhost/api?token=secret&ok=1").includes("secret"), false);
assert.equal(redactText("Authorization: Bearer secret").includes("secret"), false);

const temporary = await mkdtemp(path.join(os.tmpdir(), "frappe-browser-smoke-"));
const client = new Client({ name: "frappe-browser-smoke", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve("dist/server.js")],
  cwd: process.cwd(),
  env: { ...process.env, FRAPPE_UI_STATE_PATH: path.join(temporary, "state.json") },
});

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, `${name} failed: ${JSON.stringify(result.content)}`);
  return result;
}

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert(tools.some(tool => tool.name === "browser_login"));
  assert(tools.some(tool => tool.name === "frappe_grid"));

  const login = await call("browser_login");
  assert.equal(login.structuredContent.authenticated, true);
  const loginNetwork = await call("browser_network", { contains: "/api/method/login", limit: 20 });
  const loginPost = loginNetwork.structuredContent.events.find(event => event.kind === "request" && event.method === "POST");
  assert(loginPost);
  const capturedLogin = await call("browser_request", { id: loginPost.id });
  assert.equal(capturedLogin.structuredContent.event.requestBody.pwd, "[redacted]");
  const status = await call("browser_status");
  assert.equal(status.structuredContent.user, login.structuredContent.user);

  const opened = await call("browser_open", { path: "/app/salary-slip" });
  assert.match(opened.structuredContent.url, /salary-slip/);
  const snapshot = await call("browser_snapshot", { max_chars: 5000 });
  assert.match(snapshot.structuredContent.snapshot, /Salary Slip/);
  const route = await call("frappe_route");
  assert(route.structuredContent.route.includes("Salary Slip"));
  const list = await call("frappe_list");
  assert.equal(list.structuredContent.doctype, "Salary Slip");
  const count = await call("browser_count", { target: { by: "css", value: ".list-row-container .list-row" } });
  assert.equal(typeof count.structuredContent.count, "number");
  const network = await call("browser_network", { contains: "salary-slip", limit: 10 });
  assert(Array.isArray(network.structuredContent.events));
  const errors = await call("browser_errors");
  assert(Array.isArray(errors.structuredContent.events));
  const formPage = await call("browser_open", { path: "/app/employee/new" });
  assert.match(formPage.structuredContent.url, /employee/i);
  await call("browser_wait_url", { contains: "employee", timeout_ms: 10000 });
  await call("browser_wait", { target: { by: "css", value: ".form-page" }, timeout_ms: 15000 });
  const visible = await call("browser_get", { target: { by: "css", value: ".form-page" }, property: "visible" });
  assert.equal(visible.structuredContent.value, true);
  const form = await call("frappe_form");
  assert.equal(form.structuredContent.doctype, "Employee");
  assert.equal(form.structuredContent.is_new, true);
  const field = await call("frappe_field", { fieldname: "employee_name" });
  assert.equal(field.structuredContent.available, true);
  const grid = await call("frappe_grid", { fieldname: "education" });
  assert.equal(grid.structuredContent.available, true);
  const screenshot = await call("browser_screenshot", { full_page: false });
  const image = screenshot.content.find(item => item.type === "image");
  assert(image);
  assert.equal(Buffer.from(image.data, "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  process.stdout.write(`Browser MCP smoke: ${status.structuredContent.user}; list, form, grid, network, and PNG available\n`);
} finally {
  await client.close();
  await rm(temporary, { recursive: true, force: true });
}
