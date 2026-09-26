import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { typicalTokensForTool, tokenCostScore, toolUsageLogPath } from "./tool-usage.js";

export const toolUsagePhases = {
  tool_usage_overview: "observe",
} as const;

interface Event {
  id: string;
  event: "started" | "succeeded" | "failed";
  tool: string;
  timestamp: string;
  typical_model_tokens?: number;
  token_cost_score?: number;
  estimated_input_tokens?: number;
  estimated_output_tokens?: number;
  estimated_model_tokens?: number;
  image_outputs?: number;
  error_name?: string;
  error_message?: string;
  duration_ms?: number;
}

interface Call {
  id: string;
  tool: string;
  started_at: string;
  typical_model_tokens: number;
  token_cost_score: number;
  estimated_input_tokens?: number;
  estimated_output_tokens?: number;
  estimated_model_tokens?: number;
  image_outputs?: number;
  status: "active" | "succeeded" | "failed";
  completed_at?: string;
  duration_ms?: number;
  error_name?: string;
  error_message?: string;
}

function parseEvents(text: string): Event[] {
  return text.split("\n").filter(Boolean).flatMap(line => {
    try {
      const value = JSON.parse(line) as Partial<Event>;
      if (typeof value.id !== "string" || typeof value.tool !== "string" ||
          typeof value.timestamp !== "string" ||
          !["started", "succeeded", "failed"].includes(value.event ?? "")) return [];
      return [value as Event];
    } catch {
      return [];
    }
  });
}

async function readEvents(): Promise<Event[]> {
  try {
    return parseEvents(await readFile(toolUsageLogPath(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function callsFromEvents(events: Event[]): Call[] {
  const calls = new Map<string, Call>();
  for (const event of events) {
    if (event.event === "started") {
      calls.set(event.id, {
        id: event.id,
        tool: event.tool,
        started_at: event.timestamp,
        typical_model_tokens: event.typical_model_tokens ?? typicalTokensForTool(event.tool),
        token_cost_score: event.token_cost_score ?? tokenCostScore(event.tool),
        estimated_input_tokens: event.estimated_input_tokens,
        status: "active",
      });
      continue;
    }
    const call = calls.get(event.id);
    if (!call) continue;
    call.status = event.event;
    call.completed_at = event.timestamp;
    call.duration_ms = event.duration_ms;
    call.estimated_output_tokens = event.estimated_output_tokens;
    call.estimated_model_tokens = event.estimated_model_tokens;
    call.image_outputs = event.image_outputs;
    call.error_name = event.error_name;
    call.error_message = event.error_message;
  }
  return [...calls.values()];
}

export function registerToolUsageOverview(server: McpServer): void {
  server.registerTool("tool_usage_overview", {
    title: "Tool usage overview",
    description: "Summarize recent MCP tool usage, success/failure outcomes, active calls, recent failures, most-used tools, and estimated model token impact. Per-tool estimates and observed payload token approximations are intended to help keep model context use lean.",
    inputSchema: {
      hours: z.number().positive().max(720).default(24).describe("Look back this many hours; maximum 720 (30 days)."),
      recent_failures: z.number().int().min(0).max(50).default(10).describe("Maximum recent failures to include."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ hours, recent_failures }) => {
    const now = Date.now();
    const cutoff = now - hours * 60 * 60 * 1000;
    const calls = callsFromEvents(await readEvents()).filter(call => Date.parse(call.started_at) >= cutoff);
    const summaries = new Map<string, {
      calls: number; succeeded: number; failed: number; active: number; estimated_model_tokens: number;
    }>();

    for (const call of calls) {
      const summary = summaries.get(call.tool) ?? { calls: 0, succeeded: 0, failed: 0, active: 0, estimated_model_tokens: 0 };
      summary.calls++;
      summary.estimated_model_tokens += call.estimated_model_tokens ?? call.estimated_input_tokens ?? 0;
      if (call.status === "succeeded") summary.succeeded++;
      else if (call.status === "failed") summary.failed++;
      else summary.active++;
      summaries.set(call.tool, summary);
    }

    const tools = [...summaries.entries()]
      .map(([name, summary]) => ({
        name,
        ...summary,
        typical_model_tokens_per_call: typicalTokensForTool(name),
        token_cost_score: tokenCostScore(name),
        total_token_cost_score: tokenCostScore(name) * summary.calls,
        observed_average_model_tokens: summary.calls
          ? Math.round(summary.estimated_model_tokens / summary.calls)
          : null,
      }))
      .sort((a, b) => b.total_token_cost_score - a.total_token_cost_score ||
        b.calls - a.calls || a.name.localeCompare(b.name));
    const recent = [...calls].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
    const failures = recent.filter(call => call.status === "failed").slice(0, recent_failures);

    const overview = {
      generated_at: new Date(now).toISOString(),
      period_hours: hours,
      totals: {
        calls: calls.length,
        succeeded: calls.filter(call => call.status === "succeeded").length,
        failed: calls.filter(call => call.status === "failed").length,
        active: calls.filter(call => call.status === "active").length,
        total_token_cost_score: calls.reduce((sum, call) => sum + call.token_cost_score, 0),
        estimated_model_tokens: calls.reduce((sum, call) =>
          sum + (call.estimated_model_tokens ?? call.estimated_input_tokens ?? 0), 0),
      },
      token_cost_model: {
        typical_estimate: "Expected tokens from typical tool arguments and returned content; estimates are based on the tool's normal output size.",
        relative_score: "Typical token estimate divided by 100 and rounded up; 1 is the cheapest band. Tool descriptions include this estimate to help choose before calling.",
        cumulative_score: "Per-tool total token cost score is the per-call relative score multiplied by call count. Tools are sorted by this total descending, then by call count descending.",
        observed_estimate: "Counts argument and returned text characters at roughly 4 characters per token. Each returned image adds a 1,000-token proxy because actual vision token use depends on model and image detail.",
        excluded: "Tool-definition/schema context overhead is not allocated to individual calls and provider billing tokens are not available here.",
        guidance: "Prefer the lowest-token tool that answers the question. Use focused fields, low limits, and targeted reads; use snapshots, large lists, network traces, and screenshots only when they add needed evidence.",
      },
      tools,
      recent_failures: failures,
      recent_calls: recent.slice(0, 10),
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(overview, null, 2) }],
      structuredContent: overview,
    };
  });
}
