# Payroll validation sequence

Browser login, Frappe form/list/child-table inspection, and network diagnostics are available. Add focused browser workflows for company and departments, employees, holiday lists and assignments, salary components, salary structures, salary structure assignments, overtime configuration, payroll entries, salary slips, and reconciliation checks. Implement each workflow in a focused module under `mcp/src/`, register its tools, update its feature manifest, and regenerate the catalog.

For every workflow: inspect current records, diagnose missing links, create or update only the intended records, reopen to verify, then run an end-to-end test on a disposable employee and pay period. Record the expected and actual NIS, HSG, PAYE, gross, deductions, employer contributions, and net pay. Check both the UI and the resulting submitted documents before treating a payroll run as validated.
