# App development and maintenance system

This document defines how an agent should build, maintain, and validate Frappe apps in this repository. It is the framework-side orchestration contract: first read the target app's `APP_MAINTENANCE.md`, then combine its domain-specific instructions with this workflow and the live Frappe tools.

The goal is a continuous, evidence-backed loop from a user request to implementation, automated tests, deployed code, and verified behavior in a Frappe site. This is a working system description for agents; it does not claim that a CI runner or autonomous deployment service has already been implemented.

## Source of instructions

For each task, use instructions in this order:

1. Repository-wide guidance such as `AGENTS.md`.
2. This framework workflow.
3. The target app's `APP_MAINTENANCE.md` adapter.
4. Existing code, tests, fixtures, and current site state.
5. User clarifications and acceptance criteria.

The app adapter describes what the app does, its domain rules, meaningful local tests, approved test records/sites, and Frappe validation procedure. A starter contract is in [app-adapter-template.md](app-adapter-template.md). Do not assume every app is payroll or reuse HrtmPay procedures for another app.

If the adapter is missing, inspect the app and create or propose one from the template as part of onboarding. Ask for domain facts that cannot be determined from code or authoritative sources, while continuing independent work.

## Operating loop

### 1. Understand the request and app

- Identify the target app, user-visible behavior, acceptance criteria, dependencies, installed version, target site, and whether the work is a new app, bug fix, or maintenance.
- Read the app adapter and relevant code/tests before changing files or site records.
- Inspect the current Git state and site records. Preserve unrelated user changes.
- Trace the request through the full path: UI/API input, validation, business logic, persistence, hooks/jobs, permissions, and rendered output.
- For compliance-sensitive domains, distinguish a legal or policy requirement from an implementation assumption. Record the source, jurisdiction, effective date, app version, and retrieval date for each rule that affects expected output.

### 2. Turn assumptions into checks

Create an assumption and edge-case ledger for the task. Every material assumption should have:

| Field | What to record |
| --- | --- |
| ID | Stable short identifier |
| Assumption | Expected rule or behavior |
| Evidence | Source, code location, fixture, or user decision |
| Case | Normal, boundary, missing-data, correction, or failure input |
| Unit test | Test name or a new test to add |
| Site test | Records/action and expected observable result, if applicable |
| Actual | Observed result and evidence link/reference |
| Status | Pass, fail, blocked, or not applicable |

Turn failures into reproducible tests before or alongside the fix. Include a negative case where invalid/incomplete inputs should fail clearly. Existing code or tests repeating an assumption do not prove compliance.

### 3. Implement and verify locally

- Make the smallest coherent code change and add or update automated tests for the behavior and edge cases.
- Run the app's declared test commands and relevant linters/type checks. Report only commands actually run and their exit status.
- Inspect the diff, test names, and expected values. Check tests assert the intended rule rather than mechanically mirroring implementation.
- For externally governed rules, compare test vectors with the authoritative effective source. Keep a versioned reference in app/repo docs; never silently update statutory constants from memory.

### 4. Validate against a Frappe site

Use available Frappe API and browser tools according to [frappe-api.md](frappe-api.md) and [browser.md](browser.md). Prefer API tools for precise reads/writes and submission; use browser tools to confirm real UI labels, rendered child tables, and user-visible workflows.

Before site writes:

- Confirm the site is the intended development/test site and the app is installed there.
- Inventory relevant records and links; use only adapter-designated test records or isolated disposable records.
- Avoid editing real employee/customer/financial records. Never delete or cancel records outside test scope. For destructive cleanup, enumerate exact target documents and dependencies first; if scope is ambiguous, stop before cleanup and ask.
- Keep a record of every document created, changed, submitted, canceled, or removed.

For each scenario, inspect the saved document after calculation and submission. Verify linked records, status, totals, and rendered values. A successful API call alone does not prove correct behavior.

### 5. Deploy and verify live behavior

Deploy only to the site/environment covered by the request and app adapter. Use the repo's current deployment method. Verify the live version, migration/reload status as applicable, and a representative end-to-end case. Compare deployed code identity/version to reviewed source when possible. Report any deployment step that could not be verified; copying files or restarting a process is not proof of live behavior.

### 6. Close with an evidence report

Summarize what changed and where; assumptions reviewed; tests added/updated and actually run; Frappe records/scenarios used and submission state; expected-versus-actual results and deployment evidence; remaining failures, limitations, source gaps, and follow-up work. Link the ledger/report artifact when one exists. Do not claim compliance if any governing source or required scenario remains unresolved.

## Frappe app development workflow

When creating an app or feature, work with the user from requirements through reviewable implementation:

1. Identify roles, workflows, DocTypes/data, validations, permissions, reports, integrations, and acceptance examples.
2. Check whether standard Frappe/ERPNext/HRMS functionality covers the need. Prefer supported extension points; avoid framework patches without a clear reason.
3. Propose a small implementation plan and data model. Resolve meaningful product choices with the user while progressing on independent work.
4. Scaffold using the installed Frappe version's conventions; add hooks, DocTypes, fixtures, patches, tests, and adapter documentation as needed.
5. Implement unit tests, Frappe integration tests, and site-level scenarios for acceptance criteria and failure paths.
6. Install/migrate on an isolated development site, exercise UI/API workflows using Frappe tools, and verify persisted data and permissions.
7. Review the diff and report environment prerequisites, deploy status, and remaining work.

Do not silently publish, upgrade production, or run destructive migrations. For development sites, actions expressly requested by the user are authorized within the stated test scope.

## Continuous test layers

Maintain four linked layers, each catching a different class of error:

1. **Rule tests:** deterministic unit tests for calculations, validation, boundaries, rounding, and errors.
2. **Frappe integration tests:** hooks, document lifecycle, permissions, persistence, background work, and framework compatibility.
3. **Site end-to-end tests:** real forms/API operations on isolated records, saved/submitted documents, and output comparisons.
4. **Regression ledger:** assumptions, expected behavior, results, source/version, app/site build identity, and known exceptions.

Every engine fix should update the lower layers and, when the defect depends on Frappe lifecycle, data history, or rendered output, the site scenario too. Replay the adapter scenario set after framework, HRMS, or app upgrades.

## Long-running and cumulative scenarios

For behavior depending on ordered history (tax YTD, balances, workflow state, inventory, approvals):

- Define an adapter-owned deterministic period/event sequence and stable test identity.
- Prepare configuration over the intended horizon before execution when that matches production behavior.
- Execute in strict chronological order. Persist/submit each event before calculating the next when downstream logic reads prior submitted documents.
- At every step compare source inputs, calculations, persisted rows, and cumulative totals. Compare parallel implementations using identical inputs where relevant.
- Include first-period/no-history, normal continuation, variable inputs, boundaries, corrections, missing/duplicate history, and final reconciliation.
- Make reruns safe: detect existing test records, determine whether they can be reused, and avoid duplicate submissions. Do not delete history as a shortcut.
- Keep future-dated periods in the test plan, but do not represent simulated future work as actual. Use isolated test data and label simulation explicitly.

## HrtmPay adapter

HrtmPay's domain workflow and current test map are in [`mount/frappe-v16-bench/apps/hrtmpay/APP_MAINTENANCE.md`](../mount/frappe-v16-bench/apps/hrtmpay/APP_MAINTENANCE.md). It defines the annual payroll sequence, one PAYE engine per slip, statutory source checks, and reconciliation evidence.

The framework owns orchestration. Each app owns its domain adapter, deterministic test data, rule references, and acceptance checks, allowing this workflow to support payroll, CRM, manufacturing, and other apps.
