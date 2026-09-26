import { appendFile, chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { projectRoot } from "./config.js";

interface ToolUsageEvent {
  id: string;
  event: "started" | "succeeded" | "failed";
  tool: string;
  timestamp: string;
  duration_ms?: number;
}

let nextId = 0;
let writes = Promise.resolve();

function record(event: ToolUsageEvent): Promise<void> {
  const logPath = toolUsageLogPath();
  const line = `${JSON.stringify(event)}\n`;
  writes = writes.then(async () => {
    await mkdir(path.dirname(logPath), { recursive: true, mode: 0o700 });
    await appendFile(logPath, line, { encoding: "utf8", mode: 0o600 });
    await chmod(logPath, 0o600);
  }).catch(error => {
    // Observability must never prevent a tool from running.
    console.error(`[tool-usage] Could not write ${logPath}:`, error);
  });
  return writes;
}

/** Wrap the MCP registration point so every registered tool call is recorded. */
export function instrumentToolUsage(server: McpServer): void {
  const registerTool = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: any, handler: (...args: any[]) => any) => {
    const instrumented = async (...args: any[]) => {
      const id = `${process.pid}-${Date.now()}-${++nextId}`;
      const startedAt = Date.now();
      await record({ id, event: "started", tool: name, timestamp: new Date(startedAt).toISOString() });
      try {
        const result = await handler(...args);
        await record({ id, event: "succeeded", tool: name, timestamp: new Date().toISOString(),
          duration_ms: Date.now() - startedAt });
        return result;
      } catch (error) {
        await record({ id, event: "failed", tool: name, timestamp: new Date().toISOString(),
          duration_ms: Date.now() - startedAt });
        throw error;
      }
    };
    return registerTool(name, config, instrumented);
  }) as typeof server.registerTool;
}

export function toolUsageLogPath(): string {
  return path.resolve(process.env.FRAPPE_TOOL_USAGE_LOG ||
    path.join(projectRoot, "mcp/.state/tool-usage.jsonl"));
}
