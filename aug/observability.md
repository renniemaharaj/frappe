# Tool usage observability

Call `tool_usage_overview` to inspect recent MCP server activity. By default it summarizes the last 24 hours; pass `hours` for a different window (up to 30 days). It reports call totals and outcomes, active calls, per-tool counts, estimated model-token use, the latest calls, and recent failures with error summaries. Tool descriptions also include a typical token estimate and a relative score before each call is chosen.

The relative score is `ceil(typical estimated tokens / 100)`; 1 is the cheapest band. Typical estimates reflect likely argument and result sizes. Each tool's cumulative score is its per-call score multiplied by its call count. The overview and watcher sort by cumulative score descending, then call count descending, so frequent cheap calls rank below fewer calls with a larger total cost score. Observed estimates count input and returned text at roughly four characters per token, plus a 1,000-token proxy for each image. Vision token use varies by model and image detail, and tool schema overhead is not allocated to individual calls, so these are planning estimates rather than provider billing counts. Prefer a focused read, fewer fields, or a low row limit when it answers the question; use full snapshots, large lists, network traces, and screenshots when the extra detail is needed.

The register stores metadata and bounded failure messages, but not tool arguments or results. The configured password is redacted from failure messages.

For a live terminal view, run `npm run watch:tools` from `mcp/` after building the server. It shows calls, outcomes, average estimated tokens, and usage bars. The register is written to `mcp/.state/tool-usage.jsonl` by default.
