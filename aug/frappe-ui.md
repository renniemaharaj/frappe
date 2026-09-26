# Frappe UI inspection

After `browser_login`, call `frappe_route` to confirm the active Desk route. On a form, call `frappe_form` to read DocType, document name, dirty state, scalar values, and child table counts. Use `frappe_field` for one field's metadata and value, and `frappe_grid` for child rows. `frappe_dialog` reads visible Frappe modals. `frappe_list` reads visible list rows.

These tools inspect the live page's `cur_frm`, `cur_list`, and DOM; they do not save records. A field with type `Password` is omitted or redacted. Use `browser_snapshot` to locate controls before editing. After Save, check `frappe_form.dirty`, the document name, and `browser_errors`; reload and inspect again to confirm persisted values.
