import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { toolUsageLogPath } from "./tool-usage.js";

interface Event {
  id: string;
  event: "started" | "succeeded" | "failed";
  tool: string;
  timestamp: string;
  duration_ms?: number;
}

interface Summary {
  calls: number;
  succeeded: number;
  failed: number;
  active: Set<string>;
  lastUsed: string;
}

function display(events: Event[], logPath: string): void {
  const summaries = new Map<string, Summary>();
  for (const event of events) {
    let summary = summaries.get(event.tool);
    if (!summary) {
      summary = { calls: 0, succeeded: 0, failed: 0, active: new Set(), lastUsed: event.timestamp };
      summaries.set(event.tool, summary);
    }
    if (event.event === "started") {
      summary.calls++;
      summary.active.add(event.id);
      summary.lastUsed = event.timestamp;
    } else {
      summary.active.delete(event.id);
      if (event.event === "succeeded") summary.succeeded++;
      else summary.failed++;
    }
  }

  const rows = [...summaries.entries()].sort((a, b) => b[1].calls - a[1].calls || a[0].localeCompare(b[0]));
  const max = Math.max(1, ...rows.map(([, summary]) => summary.calls));
  const barWidth = 24;
  const cell = (value: string, width: number) => value.length > width ? value.slice(0, width) : value.padEnd(width);

  process.stdout.write("\x1b[2J\x1b[H");
  console.log(`Frappe MCP tool usage | updated ${new Date().toLocaleTimeString()} | ${logPath}`);
  console.log("Ctrl+C to stop. Counts include calls since the register was created.\n");
  if (rows.length === 0) {
    console.log("No tool calls recorded yet. Start the MCP server and invoke a tool.");
    return;
  }
  console.log(`${cell("TOOL", 26)} ${cell("CALLS", 7)} ${cell("ACTIVE", 7)} ${cell("OK", 6)} ${cell("FAIL", 6)} ${cell("LAST USED", 12)} USAGE`);
  console.log("─".repeat(92));
  for (const [name, summary] of rows) {
    const bars = Math.max(1, Math.round(summary.calls / max * barWidth));
    const lastUsed = new Date(summary.lastUsed).toLocaleTimeString();
    console.log(`${cell(name, 26)} ${cell(String(summary.calls), 7)} ${cell(String(summary.active.size), 7)} ${cell(String(summary.succeeded), 6)} ${cell(String(summary.failed), 6)} ${cell(lastUsed, 12)} ${"█".repeat(bars)}`);
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
