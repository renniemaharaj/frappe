import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tokenCostScore, toolUsageLogPath } from "./tool-usage.js";

interface Event {
  id: string;
  event: "started" | "succeeded" | "failed";
  tool: string;
  timestamp: string;
  token_cost_score?: number;
  estimated_model_tokens?: number;
  duration_ms?: number;
}

interface Summary {
  calls: number;
  totalTokenCostScore: number;
  succeeded: number;
  failed: number;
  active: Set<string>;
  estimatedTokens: number;
  measuredCalls: number;
  lastUsed: string;
}

function display(events: Event[], logPath: string): void {
  const calls = new Map<string, { tool: string; id: string; status: "active" | "succeeded" | "failed"; costScore: number; estimatedTokens?: number }>();
  for (const event of events) {
    if (event.event === "started") {
      calls.set(event.id, { tool: event.tool, id: event.id, status: "active",
        costScore: event.token_cost_score ?? tokenCostScore(event.tool) });
    } else {
      const call = calls.get(event.id);
      if (call) {
        call.status = event.event;
        call.estimatedTokens = event.estimated_model_tokens;
      }
    }
  }

  const summaries = new Map<string, Summary>();
  for (const call of calls.values()) {
    let summary = summaries.get(call.tool);
    if (!summary) {
      summary = { calls: 0, totalTokenCostScore: 0, succeeded: 0, failed: 0, active: new Set(), estimatedTokens: 0, measuredCalls: 0, lastUsed: "" };
      summaries.set(call.tool, summary);
    }
    summary.calls++;
    summary.totalTokenCostScore += call.costScore;
    if (call.status === "active") summary.active.add(call.id);
    else if (call.status === "succeeded") summary.succeeded++;
    else summary.failed++;
    if (call.estimatedTokens !== undefined) {
      summary.estimatedTokens += call.estimatedTokens;
      summary.measuredCalls++;
    }
  }
  for (const event of events) {
    if (event.event === "started") {
      const summary = summaries.get(event.tool);
      if (summary && (!summary.lastUsed || event.timestamp > summary.lastUsed)) summary.lastUsed = event.timestamp;
    }
  }

  const rows = [...summaries.entries()].sort((a, b) =>
    b[1].totalTokenCostScore - a[1].totalTokenCostScore || b[1].calls - a[1].calls || a[0].localeCompare(b[0]));
  const max = Math.max(1, ...rows.map(([, summary]) => summary.totalTokenCostScore));
  const barWidth = 24;
  const cell = (value: string, width: number) => value.length > width ? value.slice(0, width) : value.padEnd(width);

  process.stdout.write("\x1b[2J\x1b[H");
  console.log(`Frappe MCP tool usage | updated ${new Date().toLocaleTimeString()} | ${logPath}`);
  console.log("Ctrl+C to stop. Counts include calls since the register was created.\n");
  if (rows.length === 0) {
    console.log("No tool calls recorded yet. Start the MCP server and invoke a tool.");
    return;
  }
  console.log(`${cell("TOOL", 26)} ${cell("COST SCORE", 11)} ${cell("CALLS", 6)} ${cell("ACTIVE", 6)} ${cell("OK", 5)} ${cell("FAIL", 5)} ${cell("AVG TOKENS", 10)} ${cell("LAST USED", 11)} USAGE`);
  console.log("─".repeat(100));
  for (const [name, summary] of rows) {
    const bars = Math.max(1, Math.round(summary.totalTokenCostScore / max * barWidth));
    const lastUsed = new Date(summary.lastUsed).toLocaleTimeString();
    const average = summary.measuredCalls ? String(Math.round(summary.estimatedTokens / summary.measuredCalls)) : "—";
    console.log(`${cell(name, 26)} ${cell(String(summary.totalTokenCostScore), 11)} ${cell(String(summary.calls), 6)} ${cell(String(summary.active.size), 6)} ${cell(String(summary.succeeded), 5)} ${cell(String(summary.failed), 5)} ${cell(average, 10)} ${cell(lastUsed, 11)} ${"█".repeat(bars)}`);
  }
}

const logPath = process.argv[2] ? process.argv[2] : toolUsageLogPath();
console.log(`Watching ${logPath}`);
let lastText = "";
while (true) {
  try {
    const text = await readFile(logPath, "utf8");
    if (text !== lastText) {
      lastText = text;
      const events = text.split("\n").filter(Boolean).flatMap(line => {
        try { return [JSON.parse(line) as Event]; } catch { return []; }
      });
      display(events, logPath);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await delay(500);
}
