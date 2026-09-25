import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BrowserSession } from "./browser-session.js";
import { redactValue } from "./redact.js";
import { json, loadedPage } from "./tools.js";

export const frappePhases = {
  frappe_route: "observe",
  frappe_form: "observe",
  frappe_field: "observe",
  frappe_grid: "observe",
  frappe_dialog: "observe",
  frappe_list: "observe",
} as const;

function safe(value: unknown, session: BrowserSession): Record<string, unknown> {
  return redactValue(value, session.config.password) as Record<string, unknown>;
}

export function registerFrappeTools(server: McpServer, session: BrowserSession): void {
  server.registerTool("frappe_route", {
    description: "Read Frappe's current client route, page title, and active form/list DocType.", inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => session.run(async () => {
    const page = await loadedPage(session);
    const state = await page.evaluate(() => {
      const app = window as typeof window & { frappe?: { get_route?: () => string[] }; cur_frm?: { doctype?: string }; cur_list?: { doctype?: string } };
      return { route: app.frappe?.get_route?.() ?? null, form_doctype: app.cur_frm?.doctype ?? null,
        list_doctype: app.cur_list?.doctype ?? null };
    });
    return json({ url: page.url(), title: await page.title(), ...state });
  }));

  server.registerTool("frappe_form", {
    description: "Read the active Frappe form's DocType, name, dirty state, scalar fields, and child table counts.",
    inputSchema: { max_fields: z.number().int().min(1).max(300).default(120) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ max_fields }) => session.run(async () => {
    const page = await loadedPage(session);
    const state = await page.evaluate(maxFields => {
      const app = window as typeof window & { cur_frm?: { doctype: string; doc: Record<string, unknown>; is_new?: () => boolean; is_dirty?: () => boolean; meta?: { fields?: Array<{ fieldname?: string; fieldtype?: string; label?: string }> } } };
      const form = app.cur_frm;
      if (!form?.doc) return { available: false };
      const fields: Record<string, unknown> = {};
      const child_tables: Record<string, number> = {};
      const metadata = form.meta?.fields ?? [];
      for (const field of metadata.slice(0, maxFields)) {
        if (!field.fieldname || field.fieldtype === "Password") continue;
        const value = form.doc[field.fieldname];
        if (field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect") {
          child_tables[field.fieldname] = Array.isArray(value) ? value.length : 0;
        } else if (value === null || ["string", "number", "boolean", "undefined"].includes(typeof value)) {
          fields[field.fieldname] = value ?? null;
        }
      }
      return { available: true, doctype: form.doctype, name: form.doc.name ?? null,
        is_new: Boolean(form.is_new?.() ?? form.doc.__islocal), dirty: Boolean(form.is_dirty?.() ?? form.doc.__unsaved),
        fields, child_tables, total_fields: metadata.length };
    }, max_fields);
    return json({ url: page.url(), ...safe(state, session) });
  }));

  server.registerTool("frappe_field", {
    description: "Read one field from the active Frappe form, including its type, label, value, and control state.",
    inputSchema: { fieldname: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ fieldname }) => session.run(async () => {
    const page = await loadedPage(session);
    const state = await page.evaluate(name => {
      const app = window as typeof window & { cur_frm?: { doc: Record<string, unknown>; fields_dict?: Record<string, { df?: { fieldname?: string; fieldtype?: string; label?: string; options?: string; reqd?: number; read_only?: number }; get_value?: () => unknown }> } };
      const form = app.cur_frm;
      const field = form?.fields_dict?.[name];
      if (!form || !field) return { available: false, fieldname: name };
      const df = field.df ?? {};
      const value = df.fieldtype === "Password" ? "[redacted]" : form.doc[name];
      return { available: true, fieldname: name, label: df.label ?? null, fieldtype: df.fieldtype ?? null,
        required: Boolean(df.reqd), read_only: Boolean(df.read_only), options: df.options ?? null,
        value: Array.isArray(value) ? { row_count: value.length } : value ?? null };
    }, fieldname);
    return json({ url: page.url(), ...safe(state, session) });
  }));

  server.registerTool("frappe_grid", {
    description: "Read rows and field names from a child table in the active Frappe form.",
    inputSchema: { fieldname: z.string().min(1), limit: z.number().int().min(1).max(100).default(20) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ fieldname, limit }) => session.run(async () => {
    const page = await loadedPage(session);
    const state = await page.evaluate(({ name, maxRows }) => {
      const app = window as typeof window & { cur_frm?: { doc: Record<string, unknown>; fields_dict?: Record<string, { df?: { fieldtype?: string }; grid?: { docfields?: Array<{ fieldname?: string; fieldtype?: string }> } }> } };
      const form = app.cur_frm;
      const field = form?.fields_dict?.[name];
      if (!form || !field || !["Table", "Table MultiSelect"].includes(field.df?.fieldtype ?? "")) return { available: false, fieldname: name };
      const rows = Array.isArray(form.doc[name]) ? form.doc[name] as Array<Record<string, unknown>> : [];
      const columns = (field.grid?.docfields ?? []).filter(df => df.fieldname && df.fieldtype !== "Password").map(df => df.fieldname!);
      return { available: true, fieldname: name, row_count: rows.length, columns,
        rows: rows.slice(0, maxRows).map(row => Object.fromEntries(["name", "idx", ...columns].map(key => [key, row[key] ?? null]))) };
    }, { name: fieldname, maxRows: limit });
    return json({ url: page.url(), ...safe(state, session) });
  }));

  server.registerTool("frappe_dialog", {
    description: "Inspect visible Frappe modal dialogs and their titles, text, and buttons.", inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => session.run(async () => {
    const page = await loadedPage(session);
    const dialogs = await page.locator(".modal.show, .modal:visible").evaluateAll(elements => elements.slice(0, 10).map(element => ({
      title: element.querySelector(".modal-title")?.textContent?.trim() ?? null,
      text: element.textContent?.trim().slice(0, 3000) ?? "",
      buttons: [...element.querySelectorAll("button")].map(button => button.textContent?.trim()).filter(Boolean),
    })));
    return json({ url: page.url(), dialogs: safe(dialogs, session) });
  }));

  server.registerTool("frappe_list", {
    description: "Read the active Frappe list DocType, visible row count, and visible row text.",
    inputSchema: { limit: z.number().int().min(1).max(50).default(20) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ limit }) => session.run(async () => {
    const page = await loadedPage(session);
    const state = await page.evaluate(maxRows => {
      const app = window as typeof window & { cur_list?: { doctype?: string; data?: unknown[] } };
      const rows = [...document.querySelectorAll(".list-row-container .list-row")];
      return { doctype: app.cur_list?.doctype ?? null, loaded_count: app.cur_list?.data?.length ?? null,
        visible_count: rows.length, rows: rows.slice(0, maxRows).map(row => row.textContent?.trim().replace(/\s+/g, " ").slice(0, 1000)) };
    }, limit);
    return json({ url: page.url(), ...safe(state, session) });
  }));
}
