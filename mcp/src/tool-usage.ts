import { appendFile, chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { projectRoot } from "./config.js";

interface ToolUsageEvent {
  id: string;
  event: "started" | "succeeded" | "failed";
  tool: string;
  timestamp: string;
  typical_model_tokens: number;
  token_cost_score: number;
  estimated_input_tokens?: number;
  estimated_output_tokens?: number;
  estimated_model_tokens?: number;
  image_outputs?: number;
  error_name?: string;
  error_message?: string;
  duration_ms?: number;
}

/** Typical model-context token estimates for a call's arguments and returned payload. */
export const typicalModelTokens: Readonly<Record<string, number>> = {
  browser_status: 120,
  browser_login: 250,
  browser_open: 180,
  browser_snapshot: 4500,
  browser_screenshot: 1200,
  browser_click: 160,
  browser_fill: 160,
  browser_select: 160,
  browser_press: 160,
  browser_wait: 200,
  browser_back: 180,
  browser_reload: 200,
  browser_get: 250,
  browser_exists: 100,
  browser_count: 100,
  browser_check: 160,
  browser_uncheck: 160,
  browser_upload: 250,
  browser_download: 250,
  browser_downloads: 150,
  browser_wait_url: 200,
  browser_wait_idle: 250,
  browser_console: 1800,
  browser_errors: 3500,
  browser_network: 5000,
  browser_request: 7000,
  frappe_route: 120,
  frappe_form: 1500,
  frappe_field: 400,
  frappe_grid: 3000,
  frappe_dialog: 700,
  frappe_list: 4500,
  frappe_get_list: 5000,
  frappe_get_doc: 7000,
  frappe_save_doc: 5000,
  frappe_submit_doc: 5000,
  frappe_cancel_doc: 5000,
  frappe_call: 5000,
  tool_usage_overview: 1500,
};

export function typicalTokensForTool(name: string): number {
  return typicalModelTokens[name] ?? 1000;
}

export function tokenCostScore(name: string): number {
  return Math.max(1, Math.ceil(typicalTokensForTool(name) / 100));
}

function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateInputTokens(args: unknown): number {
  try { return estimateTextTokens(JSON.stringify(args)); }
  catch { return 0; }
}

function estimateOutput(result: unknown): { tokens: number; imageOutputs: number } {
  const value = result as { content?: Array<{ type?: string; text?: string }>; structuredContent?: unknown } | null;
  const content = Array.isArray(value?.content) ? value.content : [];
  const text = content.filter(item => item.type === "text" && typeof item.text === "string")
    .map(item => item.text).join("\n");
  const images = content.filter(item => item.type === "image").length;
  const fallbackText = !text && value?.structuredContent !== undefined
    ? JSON.stringify(value.structuredContent)
    : text;
  // Vision token use depends on the model and image detail. Use a documented proxy, not image byte size.
  return { tokens: estimateTextTokens(fallbackText) + images * 1000, imageOutputs: images };
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
export function instrumentToolUsage(server: McpServer, secrets: string[] = []): void {
  const registerTool = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: any, handler: (...args: any[]) => any) => {
    const typicalTokens = typicalTokensForTool(name);
    const instrumentedConfig = {
      ...config,
      description: [config.description,
        `Estimated model token impact: about ${typicalTokens} tokens per typical call; relative score ${tokenCostScore(name)} (1 is cheapest). This is a rough argument and result size estimate. Large outputs and images can cost more. Tool-definition overhead is not included.`]
        .filter(Boolean).join("\n\n"),
    };
    const instrumented = async (...args: any[]) => {
      const id = `${process.pid}-${Date.now()}-${++nextId}`;
      const startedAt = Date.now();
      const typical_model_tokens = typicalTokensForTool(name);
      const token_cost_score = tokenCostScore(name);
      const estimated_input_tokens = estimateInputTokens(args);
      await record({ id, event: "started", tool: name, timestamp: new Date(startedAt).toISOString(),
        typical_model_tokens, token_cost_score, estimated_input_tokens });
      try {
        const result = await handler(...args);
        const output = estimateOutput(result);
        await record({ id, event: "succeeded", tool: name, timestamp: new Date().toISOString(),
          typical_model_tokens, token_cost_score, estimated_input_tokens,
          estimated_output_tokens: output.tokens,
          estimated_model_tokens: estimated_input_tokens + output.tokens,
          image_outputs: output.imageOutputs,
          duration_ms: Date.now() - startedAt });
        return result;
      } catch (error) {
        const errorName = error instanceof Error ? error.name : "Error";
        let errorMessage = error instanceof Error ? error.message : String(error);
        for (const secret of secrets) {
          if (secret) errorMessage = errorMessage.replaceAll(secret, "[redacted]");
        }
        errorMessage = errorMessage.replace(/[\r\n\t]+/g, " ").slice(0, 500);
        const estimated_output_tokens = estimateTextTokens(errorMessage);
        await record({ id, event: "failed", tool: name, timestamp: new Date().toISOString(),
          typical_model_tokens, token_cost_score, estimated_input_tokens,
          estimated_output_tokens,
          estimated_model_tokens: estimated_input_tokens + estimated_output_tokens,
          error_name: errorName, error_message: errorMessage,
          duration_ms: Date.now() - startedAt });
        throw error;
      }
    };
    return registerTool(name, instrumentedConfig, instrumented);
  }) as typeof server.registerTool;
}

export function toolUsageLogPath(): string {
  return path.resolve(process.env.FRAPPE_TOOL_USAGE_LOG ||
    path.join(projectRoot, "mcp/.state/tool-usage.jsonl"));
}
