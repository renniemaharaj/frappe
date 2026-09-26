# Frappe API Tools Guide

These tools call the Frappe REST API **directly** — no browser required. They are
available alongside the browser tools and are the preferred way to perform data
operations such as reading documents, bulk updates, submitting/cancelling, and
calling whitelisted server-side methods.

## Authentication

Tools authenticate automatically using the same `FRAPPE_UI_USERNAME` /
`FRAPPE_UI_PASSWORD` (or `FRAPPE_ADMIN_PASSWORD`) env vars that the browser
session uses. Each tool call opens a short-lived API session and closes it when
done.

## Tools

### `frappe_get_list`
Return a list of document names (or any fields) for a DocType.

```json
{
  "doctype": "Salary Structure",
  "fields": ["name", "is_active", "payroll_frequency"],
  "filters": [["is_active", "=", "Yes"]],
  "order_by": "creation desc",
  "limit": 50
}
```

### `frappe_get_doc`
Fetch a complete document including all child tables.

```json
{ "doctype": "Salary Structure", "name": "Payroll Test Monthly 2026" }
```

### `frappe_save_doc`
Insert a new document or update an existing one.  
- **Insert**: omit `name` (or provide a new name).
- **Update**: include `name` of the existing document.

```json
{
  "doc": {
    "doctype": "Salary Component",
    "name": "Income Tax",
    "condition": "{\"type\":\"paye\",\"engine\":\"cumulative_ytd\"}"
  }
}
```

### `frappe_submit_doc`
Submit a draft document (transitions `docstatus` 0 → 1).

```json
{ "doctype": "Salary Structure Assignment", "name": "HR-SSA-26-09-00001" }
```

### `frappe_cancel_doc`
Cancel a submitted document (transitions `docstatus` 1 → 2).  
Note: documents linked to GL Entries or other child records may need those
children removed first.

```json
{ "doctype": "Salary Slip", "name": "Sal Slip/HR-EMP-00001/00001" }
```

### `frappe_call`
Call any Frappe whitelisted server-side method with keyword arguments.

```json
{
  "method": "frappe.client.get_count",
  "args": { "doctype": "Employee" }
}
```

Common methods:
- `frappe.client.get_count` — count documents
- `frappe.client.get_value` — fetch a single field value
- `frappe.client.set_value` — update a single field
- `frappe.desk.reportview.get` — run a report view query
- `hrms.payroll.doctype.payroll_entry.payroll_entry.*` — payroll-specific actions
