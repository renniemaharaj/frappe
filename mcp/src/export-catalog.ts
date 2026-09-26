import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { projectRoot } from "./config.js";
import { toolPhases } from "./tools.js";
import { extraPhases } from "./browser-extras.js";
import { frappePhases } from "./frappe-tools.js";
import { frappeApiPhases } from "./frappe-api-tools.js";

const mcpRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const target = path.join(projectRoot, "aug/tools.json");
const client = new Client({ name: "frappe-catalog-export", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(mcpRoot, "dist/server.js")],
  cwd: mcpRoot,
});

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = new Set(tools.map(tool => tool.name));
  const phases = { ...toolPhases, ...extraPhases, ...frappePhases, ...frappeApiPhases };
  const mapped = new Set(Object.keys(phases));
  if (names.size !== mapped.size || [...names].some(name => !mapped.has(name))) {
    throw new Error("Tool phase map differs from MCP tools/list");
  }
  const capabilities = JSON.parse(await readFile(path.join(projectRoot, "aug/capabilities.json"), "utf8")) as { features: Record<string, string> };
  const manifestNames = new Set<string>();
  for (const manifestPath of Object.values(capabilities.features)) {
    const feature = JSON.parse(await readFile(path.join(projectRoot, manifestPath), "utf8")) as { tools: string[] };
    for (const name of feature.tools) {
      if (manifestNames.has(name)) throw new Error(`Duplicate manifest tool: ${name}`);
      manifestNames.add(name);
    }
  }
  if (manifestNames.size !== names.size || [...names].some(name => !manifestNames.has(name))) {
    throw new Error("Feature manifests differ from MCP tools/list");
  }
  const catalog = {
    schema_version: 1,
    source: "MCP tools/list",
    server: "mcp/dist/server.js",
    tools: tools.map(tool => ({
      ...tool,
      feature: tool.name in frappeApiPhases ? "frappe_api" : tool.name.startsWith("frappe_") ? "frappe_ui" : "browser",
      phase: phases[tool.name as keyof typeof phases],
    })),
  };
  const output = `${JSON.stringify(catalog, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = await readFile(target, "utf8").catch(() => "");
    if (current !== output) throw new Error("Tool catalog is stale; run npm run catalog");
    process.stdout.write("MCP tool catalog and browser manifest match\n");
  } else {
    await writeFile(target, output);
    process.stdout.write(`${target}\n`);
  }
} finally {
  await client.close();
}
