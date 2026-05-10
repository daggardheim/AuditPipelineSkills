# Open questions — cross-cutting

> Aggregated questions from all runbooks. Organized by theme so one answer resolves the question everywhere it appears. When answered, move the entry to the Resolved section at the bottom with the answer and date.

---

## Process rules

- Keep runbook section 8 (Open questions) short. List only question IDs and a one-line summary.
- Before adding a new question, check whether an existing ID already covers the same uncertainty.
- When a runbook is blocked, link the runbook section to the question ID instead of repeating the full question text.
- Use concrete wording. State the exact missing access path, tool version, or environment detail that blocks the step.
- When a question is resolved, keep the original question ID and add the answer to the Resolved section.

---

## A — Access requirements

Credentials, VPN, permissions, or approval chains needed to execute the runbook.

| # | Question | Raised by | Status |
|---|----------|-----------|--------|
| A1 | What is the access request URL for production database read-only access? Is there a self-service portal or does it require manager approval? | 01 §3, 03 §3 | open |
| A2 | Which 1Password vault contains the production database credentials? Is it shared across oncall engineers or individually provisioned? | 01 §3, 02 §3 | open |
| A3 | Do all oncall engineers have kubectl access to the production namespace, or does this require a separate access request? | 02 §5 | open |

---

## T — Tool dependencies

CLI tools, version requirements, platform-specific installation, or internal tools that may not be on every engineer's machine.

| # | Question | Raised by | Status |
|---|----------|-----------|--------|
| T1 | Is `psql` installed on all oncall machines, or do engineers need to install it? What minimum version is required? | 01 §4 | open |
| T2 | The remediation script uses `jq` for JSON parsing. Is this pre-installed on the jump host or does it need to be installed? | 03 §5 | open |

---

## E — Environment specifics

Which cluster, region, account, or namespace — anything that differs between staging and production.

| # | Question | Raised by | Status |
|---|----------|-----------|--------|
| E1 | The Kubernetes namespace is `production` — is this the same across all regions, or do some regions use `prod` or `prd`? | 02 §5, 02 §6 | open |
| E2 | Which AWS region hosts the primary RDS instance? Is there a read replica in a second region that should also be checked? | 01 §4, 03 §4 | open |

---

## V — Verification gaps

How to confirm the fix worked, what metrics to watch, how long to wait before declaring success.

| # | Question | Raised by | Status |
|---|----------|-----------|--------|
| V1 | After restarting the order-service, how long should we wait before checking p99 latency? The current runbook says "a few minutes" — need an exact duration. | 02 §8 | open |
| V2 | What is the normal baseline for the dead-letter queue depth? The runbook says "should be near zero" — need the exact threshold that distinguishes normal from abnormal. | 03 §8 | open |

---

## Resolved

| # | Answer | Resolved by | Date |
|---|--------|-------------|------|
