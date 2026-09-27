# App maintenance adapter

Copy this file to the root of an app repository as `APP_MAINTENANCE.md`, then replace every bracketed instruction. Keep domain steps here; keep shared orchestration in this repository's `aug/app-development-system.md`.

## App identity

- **App:** [name]
- **Purpose/domain:** [what the app does]
- **Repository/source path:** [path or URL]
- **Supported Frappe / ERPNext / dependent app versions:** [versions/branches]
- **Installed test site(s):** [site names and how to identify them]
- **Test data boundary:** [disposable records/site and protected data]
- **Adapter owner/contact:** [team/user]

## Read before making changes

- [Domain architecture, source, and version references]
- [Relevant Frappe/ERPNext docs]
- [Existing test and fixture locations]
- [Known extension points and migration requirements]

## Domain rules and authoritative sources

For each externally governed or policy-sensitive rule, list jurisdiction/scope, source title and direct URL/document path, effective date/version, retrieval date, code location, and enforcing tests. Separate confirmed requirements from assumptions and open questions.

| Rule ID | Requirement or assumption | Source/version/effective date | Code | Tests | Open issue |
| --- | --- | --- | --- | --- | --- |
| [ID] | [rule] | [source] | [path:function] | [test] | [none/question] |

## Local checks

- **Install/setup:** [commands]
- **Unit tests:** [commands]
- **Frappe integration tests:** [commands/site requirements]
- **Lint/type/build:** [commands]
- **Test data/fixtures:** [locations and reset policy]
- **Expected baseline:** [known warnings or exceptions]

## End-to-end workflow

Describe the real UI/API workflow from setup to persisted result. Include required DocTypes/dependencies, record identifiers, fields to inspect, expected statuses, and sequential calls. Identify actions that submit, cancel, delete, post accounting entries, send messages, or otherwise have side effects.

### Test scenarios

| Scenario ID | Inputs and setup | Action/order | Expected persisted result | Failure/edge assertion |
| --- | --- | --- | --- | --- |
| [ID] | [inputs] | [steps] | [expected] | [expected failure] |

## Reconciliation rules

Specify independent calculations or source records for expected values, rounding/tolerance, cumulative state, and comparisons of multiple engines/implementations. Name the fields/tables to compare and how evidence is captured.

## Live-site runbook

1. Verify site and installed app/version.
2. Inspect target records and dependencies.
3. Prepare or reuse only approved test data.
4. Run scenarios in required order, persisting state where required.
5. Reopen saved/submitted documents and compare actual to expected.
6. Capture a result ledger and leave the site in the documented final state.

### Safe rerun and cleanup

- [How existing records are detected]
- [Whether test records can be reused]
- [Exact cancellation/deletion order, if applicable]
- [Confirmation condition before destructive cleanup]
- [Final state expected]

## Acceptance criteria

- [ ] Local tests pass and cover changed rules and negative cases.
- [ ] Integration behavior matches supported Frappe version.
- [ ] Site records persist expected values and statuses.
- [ ] Independent totals reconcile within stated precision.
- [ ] Live app version and representative behavior are verified.
- [ ] Assumptions, source versions, results, and limitations are recorded.

## Known gaps and maintenance triggers

Record uncovered assumptions and triggers to revisit them (for example, annual rate update, Frappe/HRMS upgrade, schema change, or a newly reported failure).
