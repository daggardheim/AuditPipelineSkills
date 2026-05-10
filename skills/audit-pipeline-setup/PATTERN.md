# Staged Document Audit Pipeline

> A reusable AI-driven pattern for creating, auditing, fixing, confirming, and improving structured documents at scale.

---

## Quick orientation

This pattern uses two AI agents in sequence to produce high-quality structured documents:

1. **Creator agent** (S1, S3) — drafts documents from source material (S1) and rewrites them to fix findings (S3)
2. **Auditor agent** (S2, S4, S5) — reviews, confirms, and propagates learnings in three isolated stages

The pipeline is domain-agnostic. The reference implementation audits test-scenario documents for a Sales Order API, but the same architecture works for any structured document type: API specs, runbooks, knowledge base articles, onboarding guides, investigation checklists.

### When to use this pattern

- You have 10+ documents that should follow the same structure and quality rules
- Quality rules evolve as you discover new patterns (the pipeline learns from its own findings)
- You want machine-verifiable consistency, not just "looks good to me"
- Documents are created faster than humans can review them

### When NOT to use this pattern

- Fewer than 5 documents (just review them manually)
- Documents have no shared structure (no template to audit against)
- Quality is subjective and can't be expressed as concrete rules

---

## Architecture

```
S1 Create            S2 Audit         S3 Rewrite       S4 Confirm       S5 Propagate
(Creator agent)      (Auditor agent)  (Creator agent)  (Auditor agent)  (Auditor agent)
read+write           read-only        read+write       read-only        read+write
NO sandbox           sandbox          NO sandbox       sandbox          NO sandbox

 Source ──► Draft ──► Findings ──► Fixed doc ──► Verified ──► Updated governance
  material   │            │            │             │              │
             ▼            ▼            ▼             ▼              ▼
          index.md    audit-log    audit-log     audit-log      _template.md
          (state)     (findings)   (rewrites)    (confirm)      _open-questions.md
```

### Stage contract

| Stage | Agent role | Action | Sandbox | Reads | Writes | Key output |
|-------|-----------|--------|---------|-------|--------|------------|
| S1 | Creator | Create document from template + source material | none (write access) | template, source material, reference example, open questions | new document file, index grid | draft document |
| S2 | Auditor | Broad first-pass audit against template rules | read-only | document, template, question register | none | findings list, quality score, confidence |
| S3 | Creator | Apply fixes for all valid S2 findings, verifying accuracy against source material | none (write access) | document, S2 findings, template, source material, reference example | document file | rewrite_occurred flag, updated doc hash |
| S4 | Auditor | Narrow acceptance check on S3 changes only | read-only | document, S3 notes | none | confirmation or new findings |
| S5 | Auditor | Propagate recurring patterns to governance files | none (write access) | document, all governance files | template, question register | updated rules, new questions |

### Key design decisions

| Decision | Rationale |
|----------|-----------|
| Fresh context per stage | Prevents hallucinated continuity. Each stage re-reads the actual file state. |
| Sandbox isolation for audit stages | S2 and S4 are read-only so the auditor cannot accidentally fix what it should only report. |
| Governance propagation in S5 | Learnings from individual documents flow back into the template, improving all future documents. |
| Structured JSON output | Every stage returns machine-parseable results. No free-text verdicts that need human interpretation. |
| One document at a time | Prevents cross-contamination between documents and keeps token budgets predictable. |
| State in files, not in chat | `loop-state.json` and `audit-log.jsonl` are the source of truth, not conversation history. |

### S1 prompt architecture

The orchestrator builds an S1 prompt for each fresh creator-agent invocation. The prompt assembles these components:

| Component | Purpose | How included |
|-----------|---------|-------------|
| Task identity | Item number, title, output filename | Extracted from `index.md` row |
| Template | Required document structure and quality rules | Full content of `_template.md` embedded in prompt |
| Reference example | Concrete style and depth calibration | Full content of one designated reference document embedded in prompt |
| Source material | Domain knowledge the creator agent reads | File paths listed in prompt; agent reads via tool calls |
| Open questions | Avoid re-raising already-tracked questions | Full content of `_open-questions.md` embedded in prompt |
| Role customizations | Domain-specific creator responsibilities | From `agents.creator.role_additions` in domain config |
| Output contract | What files to write, what index columns to update | Standard: write document to drafts dir, set S1=done and Start timestamp in index |

**Design rationale — embed vs. point-to:**
- Template, reference example, and open questions are **embedded** in the prompt (small files, always needed in full).
- Source material is referenced by **file path** (can be large, agent reads only the relevant parts via tool calls with `--max-turns`).

**Reference example selection:** During setup, the AI helps the user identify 1-2 completed documents that represent good quality. One is embedded in every S1 prompt as a concrete target. If no completed document exists yet, the setup skill helps create the first one manually before automating the rest.

---

## Component inventory

Every file in the pipeline, its role, and whether it's reusable or domain-specific.

### Reuse as-is (domain-agnostic infrastructure)

| Component | Path (reference impl) | Role |
|-----------|----------------------|------|
| Orchestrator | `tools/audit_loop.py` | Candidate selection, stage progression, prompt assembly, Codex invocation, state tracking, token logging |
| Output schema | `tools/audit_stage_result.schema.json` | Structured result format: quality_score, findings, confidence, decision, rewrite_occurred, findings_resolved |
| Loop state | `tools/audit/loop-state.json` | Per-document state: completed stages, rewrite flags, quality trajectory, blocked status |
| Audit log | `tools/audit/audit-log.jsonl` | Append-only event log: one JSON line per stage invocation with findings, decisions, and token usage |
| Run artifacts | `tools/audit/runs/<run-id>/` | Per-invocation snapshot: prompt sent, context metadata, raw Codex response, parsed result |
| Runner contract | `workflow/codex/s2-s5/runner-contracts/Runner contract for Codex.txt` | Execution contract for the launcher: sequencing, sandbox modes, file scopes, completion gates |

### Adapt per domain (domain-specific content)

| Component | Path (reference impl) | What to change |
|-----------|----------------------|----------------|
| Document template | `workflow/shared/_template.md` | Replace structure rules, section definitions, and quality checklist with your domain's requirements |
| Audit prompt | `workflow/codex/s2-s5/audits/Start prompt for Codex testscenario-auditor.txt` | Replace audit persona, objectives, and output format with your domain's review criteria |
| Question register | `workflow/shared/_open-questions.md` | Replace question categories (D/E/B/A) with your domain's uncertainty types |
| Pipeline instructions | `workflow/shared/_codex-pipeline.md` | Update file references, allowlists, and S5 scope for your document set |
| Example prompt | `workflow/shared/_example-prompt.md` | Replace example good/bad findings with your domain's examples |
| Document index | `workflow/index.md` | Replace inventory with your document list; keep the S1-S5 column structure |
| Prompt builder | `_build_prompt()` in `audit_loop.py` | Update the opening line and objective text for your domain (5 lines of code) |
| Path constants | Top of `audit_loop.py` | Update `SCENARIOS_DIR`, `WORKFLOW_CLAUDE_DRAFTS_DIR` to point to your document folder |

---

## Output schema

Every stage invocation returns this exact JSON structure. The schema is at `tools/audit_stage_result.schema.json`.

| Field | Type | Purpose |
|-------|------|---------|
| `doc_path` | string | Relative path to the audited document |
| `stage` | enum: S1, S2, S3, S4, S5 | Which stage produced this result |
| `quality_score` | integer 1-5 or null | Overall document quality (5 = ready to use, 1 = fundamentally broken) |
| `findings` | integer >= 0 | Total findings in this stage |
| `new_findings` | integer >= 0 | Findings not present in prior stages |
| `repeated_findings` | integer >= 0 | Findings carried forward from prior stages |
| `findings_resolved` | integer >= 0 | Prior-stage findings no longer present (fixed or no longer applicable) |
| `severity_high` | integer >= 0 | Count of high-severity findings |
| `severity_medium` | integer >= 0 | Count of medium-severity findings |
| `severity_low` | integer >= 0 | Count of low-severity findings |
| `confidence` | float 0-1 | How confident the auditor is that the document is complete and correct |
| `decision` | enum: continue, stop, escalate, block | What should happen next |
| `next_stage` | enum: S2-S5, complete | Explicit next stage recommendation |
| `note` | string | Free-text summary of the stage outcome |
| `finding_signatures` | string[] | Stable short identifiers for each finding (used to track resolution across stages) |
| `follow_up` | string[] | Concrete next actions if the document is not yet complete |
| `rewrite_occurred` | boolean | Whether the stage actually edited a file |

### How fields interact

- `findings_resolved` tracks improvement: if S2 found 5 issues and S4 finds 2 of those signatures missing, `findings_resolved = 3`
- `rewrite_occurred` is the ground truth for whether S3/S5 changed anything. `confidence` alone is not reliable — it can inflate without changes.
- `decision = stop` + `next_stage = complete` means the document is done. `decision = block` means human intervention required.
- `finding_signatures` must be stable strings (e.g., `"missing-etag-precondition"`, `"conditional-then-block"`) so they can be compared across stages.

---

## State model

### Per-document state (`loop-state.json`)

```json
{
  "workflow/claude/s1/drafts/07-tax-zone.md": {
    "status": "active",
    "completed_stages": ["S2", "S3", "S4"],
    "runs": 3,
    "final_decision": null,
    "quality_score": 4,
    "rewrite_occurred_any": true,
    "blocked": false,
    "blocked_reason": null
  }
}
```

| Field | Meaning |
|-------|---------|
| `status` | `active` (in progress), `completed` (all stages done), `blocked` (human needed) |
| `completed_stages` | Which stages have run successfully |
| `runs` | Total invocations for this document |
| `rewrite_occurred_any` | True if any stage edited the document — gates S5 spot-check behavior |
| `blocked` / `blocked_reason` | Set when `decision = block`; requires human resolution before resuming |

### Index grid (`index.md`)

The index is a Markdown table that tracks every document's stage status:

```markdown
| # | Item | Title | S1 Creator | S2 Auditor | S3 Creator | S4 Auditor | S5 Auditor | Start | End | Total |
```

- Each S-column holds: `not-started`, `todo`, `in-progress`, `done`, or `blocked`
- The orchestrator reads the grid to find the next eligible document
- The orchestrator writes the grid to record stage transitions and completion times

---

## The process/policy separation

This is the core insight that makes the pipeline reusable.

### Process (reuse — never changes between domains)

- Stage sequencing: S1 → S2 → S3 → S4 → S5
- Fresh-context isolation per stage
- Sandbox mode per stage (S2/S4 read-only, S3/S5 write)
- One document at a time
- File-backed state and append-only audit log
- Structured JSON output with machine-parseable fields
- Completion gate: S5 must pass validation before the document is marked done
- Governance propagation: S5 feeds learnings back into the template

### Policy (adapt — changes for every domain)

- What makes a document "good" (template rules)
- What findings are high/medium/low severity
- What questions need human answers (question register categories)
- What the audit persona cares about (prompt objectives)
- What examples of good/bad findings look like
- What files the auditor reads and writes

---

## Domain adaptation guide

To apply this pipeline to a new document type, follow these steps in order.

### Step 1: Define your template

Create your version of `_template.md`. This is the most important file — it defines what "correct" looks like for your document type.

Your template must include:
- Required sections with their purpose
- Mandatory rules the auditor checks (equivalent to "one scenario = one branch = one expected result")
- A quality checklist (equivalent to the coverage checklist)
- A self-check procedure the auditor runs after completing its review

### Step 2: Define your question categories

Create your version of `_open-questions.md`. Replace the test-data categories (D, E, B, A) with categories that match your domain's uncertainty types.

### Step 3: Write your audit prompt

Create your version of `Start prompt for Codex testscenario-auditor.txt`. Replace:
- The audit persona ("test-scenario auditor" → your role)
- The optimization target ("testability" → your quality dimension)
- The rejection criteria ("fallback wording, conditional Then assertions" → your red flags)
- The example good/bad findings with your domain's examples

### Step 4: Write your example prompt

Create your version of `_example-prompt.md`. Show the auditor what a good audit looks like for your document type.

### Step 5: Update the orchestrator

In `audit_loop.py`, change:
1. `SCENARIOS_DIR` and `WORKFLOW_CLAUDE_DRAFTS_DIR` → your document folder
2. The opening line in `_build_prompt()` → your repo/project name
3. Path constants if your folder structure differs

### Step 6: Populate your index

Create your `index.md` with your document inventory. Keep the S1-S5 column structure.

### Step 7: Run

```
python tools/audit_loop.py run
```

---

## Concrete domain examples

These show what the policy layer looks like for different document types. Each example defines the template rules, question categories, audit objectives, and example findings that would replace the sales-order-specific content.

### Example 1: API specification review

**Template rules (replaces `_template.md` rules):**
- Every endpoint section must include: method, path, request body schema, response schema, error codes, rate limit, authentication
- Every error response must include an error code enum value and a human-readable message
- No undocumented query parameters. If a parameter exists in code but is not in the spec, add it or mark it `INTERNAL-ONLY` with a reason.
- No "TBD" or "TODO" in published specs. Replace with concrete values or mark the endpoint `DRAFT` with a target completion date.
- All example request/response bodies must be syntactically valid JSON that matches the declared schema
- Breaking changes must be flagged with a version annotation and migration guide

**Question categories (replaces D/E/B/A):**
- **S** = Schema uncertainty (field types, nullability, enum values)
- **C** = Compatibility (breaking change impact, deprecation timeline)
- **R** = Rate limiting (undocumented limits, burst behavior)
- **A** = Authentication (scope requirements, token lifetimes)

**Audit objectives (replaces "optimize for testability"):**
- Optimize for client SDK generation. Reject ambiguous types, undocumented nullability, and missing error codes.
- A developer reading this spec should be able to implement a correct client without reading the source code.

**Example findings:**
- Good finding: "POST /orders response schema shows `status` as `string` but the enum values are not listed. Add: `enum: [draft, open, shipped, invoiced, cancelled]`."
- Bad finding: "The endpoints section could be more detailed." (too vague to act on)

### Example 2: Runbook / playbook QA

**Template rules:**
- Every runbook must include: trigger condition, affected systems, diagnostic steps, remediation steps, rollback procedure, escalation path, monitoring queries
- Every remediation step must name the exact command, service, or UI path. "Restart the service" is not acceptable — write `systemctl restart order-processor.service`.
- Every diagnostic step must include the expected output for both "problem confirmed" and "problem not present"
- Time estimates must be included for each remediation step
- No assumed knowledge. If a step requires access to a specific system, include the access request URL or contact.
- Rollback procedures must be tested and include verification steps

**Question categories:**
- **A** = Access requirements (credentials, VPN, permissions)
- **T** = Tool dependencies (version requirements, installation)
- **E** = Environment specifics (which cluster, which region, which account)
- **V** = Verification gaps (how to confirm the fix worked)

**Audit objectives:**
- Optimize for 3am incident response. A sleep-deprived engineer following this runbook should not need to make judgment calls or search for information.
- Reject any step that requires tribal knowledge not written in the runbook itself.

**Example findings:**
- Good finding: "Step 4 says 'check the dashboard for anomalies' but doesn't specify which dashboard, which metric, or what threshold constitutes an anomaly. Replace with: 'Open Grafana board api-latency (grafana.internal/d/api-latency). Check p99 latency. If > 500ms for > 5 minutes, proceed to step 5.'"
- Bad finding: "Consider adding more monitoring." (no specific gap identified)

### Example 3: Knowledge base articles

**Template rules:**
- Every article must include: problem statement, applies-to (product, version, edition), solution steps, verification, related articles
- Product names must match the current official name (not legacy names, internal names, or abbreviations)
- Every screenshot must have alt text describing what the user should see
- Version numbers must be pinned. "Recent versions" or "latest" is not acceptable — write the exact version range.
- All cross-references must link to published articles. Draft or deleted references must be flagged.
- Solution steps must use lettered sub-steps, exact menu paths, and "press Enter" notes for non-obvious confirmations

**Question categories:**
- **P** = Product accuracy (name changes, feature availability by edition)
- **V** = Version applicability (which versions are affected, which are fixed)
- **U** = UI changes (screenshots that don't match current interface)
- **L** = Link validity (broken cross-references, moved articles)

**Audit objectives:**
- Optimize for customer self-service. A customer reading this article should resolve their issue without contacting support.
- Reject jargon, assumed knowledge, and steps that require admin access when the audience is end users.

**Example findings:**
- Good finding: "Step 3 says 'Navigate to Setup > Preferences' but in version 24.R2 this moved to 'Settings > System Preferences'. Add a version note or update the path."
- Bad finding: "The article is well-written." (no actionable finding)

### Example 4: Onboarding documentation

**Template rules:**
- Every onboarding guide must include: prerequisites, tool setup, access requests, first-task walkthrough, who-to-ask directory, glossary of team-specific terms
- Every tool must include: install command (exact, copy-pasteable), verification command, expected output, troubleshooting for the most common failure
- Access requests must include: system name, request URL or contact person, expected turnaround time, what to do while waiting
- No "ask your manager" without specifying what to ask for. Write: "Ask your manager to add you to the `team-backend` GitHub group (link: github.com/orgs/acme/teams)."
- Glossary entries must distinguish internal terms from industry terms

**Question categories:**
- **T** = Tooling (version conflicts, platform differences)
- **A** = Access (provisioning delays, approval chains)
- **P** = Process (which ceremonies, what cadence, where to find recordings)
- **C** = Contacts (who owns what, who to escalate to)

**Audit objectives:**
- Optimize for day-1 productivity. A new hire following this guide should be able to run the project locally, submit a PR, and know who to ask for help by end of day one.
- Reject any step that assumes the reader has worked here before.

**Example findings:**
- Good finding: "The 'Clone the repo' step assumes git is installed but the prerequisites section doesn't list git. Add: '1. Install git: `winget install Git.Git`; 2. Verify: `git --version` (expected: `git version 2.44+`).'"
- Bad finding: "Overall the onboarding guide is comprehensive." (no actionable finding)

### Example 5: Problem case investigations (Visma-specific)

**Template rules:**
- Every investigation must include: customer symptom, root cause analysis, affected records (with exact IDs), fix script (if applicable), customer-facing instructions, bug filing (if code defect)
- Fix scripts must follow the three-block pattern: BEFORE (SELECT to verify state), FIX (mutations in BEGIN TRAN/COMMIT TRAN), AFTER (SELECT to verify fix)
- Block 2 (FIX) must contain mutations only — no SELECTs, no result sets, no section headers
- Every fix script must be dry-run tested on a copy database before posting to the case
- Customer instructions must use lettered sub-steps, exact screen names in the original UI language, and "NB: skip this if..." for conditional steps
- Root cause analysis must distinguish: data corruption, code bug, user error, ISV-caused, environment issue

**Question categories:**
- **D** = Data state (which records are affected, what the correct state should be)
- **R** = Root cause (code path, trigger condition, whether it's one-time or recurring)
- **I** = Impact scope (how many customers, how many records, which versions)
- **F** = Fix validation (how to confirm the fix worked, what the customer should check)

**Audit objectives:**
- Optimize for safe remediation. A BA or developer following this investigation should be able to fix the data without causing secondary damage.
- Reject fix scripts that touch financial ledgers (GL, AR, AP), scripts without transaction guards, and scripts that assume production IDs without parameterization.

**Example findings:**
- Good finding: "The fix script DELETEs from INItemPlan but doesn't include an IF EXISTS guard. If the plan record was already cleaned up, the script would report '0 rows affected' with no warning. Add: `IF EXISTS (SELECT 1 FROM INItemPlan WHERE ...) BEGIN DELETE ... END ELSE PRINT 'No orphan found — already clean.'`"
- Bad finding: "The investigation is thorough." (no actionable finding)

---

## Anti-patterns and lessons learned

These mistakes were discovered in the reference implementation's first run (114 audit events, 36 documents, ~5M tokens). Avoid them in new domains.

| Anti-pattern | What happened | How to prevent |
|-------------|---------------|----------------|
| **Hardcoded sandbox** | Every stage ran with `--sandbox read-only`, making S3 (rewrite) and S5 (propagation) unable to write files. 114 events, zero rewrites. | The orchestrator must set sandbox mode per stage. S2/S4 = read-only, S3/S5 = write access. This is now built into `audit_loop.py`. |
| **Contradictory instructions** | The start prompt said "Do not rewrite the file" while the pipeline design said S3 should rewrite. Codex obeyed the prompt. | Every document that references stage behavior must be consistent. The start prompt, pipeline instructions, and runner contract must all say the same thing. |
| **Confidence inflation** | Confidence climbed from 0.85 to 0.99 across stages even though nothing changed. Each stage saw the same document and felt "more sure." | Treat confidence as a staleness signal, not a quality signal. The real quality indicator is `findings_resolved` (issues that actually went away). |
| **S5 gate blocking governance** | S5 was gated on `rewrite_occurred_any` from S2-S4. Since rewrites never happened (sandbox bug), S5 never updated shared governance files. | S5 has two independent duties: (1) scenario spot-check (gated on rewrite), (2) governance propagation (always runs). The gate was removed for duty 2. |
| **Recurring patterns never propagated** | Five patterns appeared in 10+ documents but were never added to the template: `???` placeholders, missing ETag steps, coverage overstatement, conditional assertions, done-but-blocked status. | S5 must always check for recurring patterns regardless of whether the current document was rewritten. These patterns are now in the template. |
| **No resolution tracking** | The schema had no way to measure whether findings were actually fixed between stages. | Added `findings_resolved` field. S3/S4 count how many prior-stage `finding_signatures` are no longer present. |
| **No permissions configured** | The orchestrator launched agents without `--allowedTools` or `--sandbox` flags. Every stage had full tool access — auditor stages could write files, creator stages could modify governance files. | Generate `_agent-permissions.yaml` during setup. The orchestrator reads it and applies `--allowedTools` (Claude) or `--sandbox` (Codex) per stage. |

---

## Extending the pipeline

### Adding a stage

The pipeline is not limited to S1-S5. To add a stage (e.g., S6 for cross-document consistency):

1. Add the stage to `VALID_STAGES` in `audit_loop.py`
2. Add the stage to the `stage` enum in `audit_stage_result.schema.json`
3. Add a prompt objective in `_build_prompt()`
4. Set the sandbox mode in the main loop
5. Update the index grid columns
6. Update the runner contract

### Choosing agents

The pipeline uses two agent configurations dispatched across stages based on role:

**Creator agent (S1, S3)** — creates documents (S1) and rewrites them to fix findings (S3). Needs file read+write, source material access, and enough turns to explore and write accurately.

| Option | CLI command | Notes |
|--------|-------------|-------|
| **Claude Code (recommended)** | `claude -p "prompt" --output-format json --max-turns 10` | Strong tool use, file exploration, creative judgment. Higher max-turns because creator reads source material. |
| **Codex** | `codex exec "prompt"` | Lighter weight. May need explicit file reads in the prompt since tool use is more limited. |

S3 uses the creator agent because rewriting requires the same source material access as creating. Without it, S3 guesses at menu paths, version numbers, and column names instead of verifying them.

**Auditor agent (S2, S4, S5)** — audits, confirms, and propagates governance. Needs structured JSON output and targeted file edits (S5 only).

| Option | CLI command | Sandbox enforcement | Notes |
|--------|-------------|-------------------|-------|
| **Claude Code (recommended)** | `claude -p "prompt" --output-format json --max-turns 3` | Via prompt instructions (file scoping) | Same tool as creator. One install. |
| **Codex** | `codex exec "prompt"` | Native OS-level `--sandbox read-only` | Separate install + API key. Built-in sandbox. |

Common combinations:
- **Claude + Claude** — simplest. One tool, one API key.
- **Claude + Codex** — when OS-level sandbox enforcement is wanted for audit stages.

To configure agents, set the `agents` section in the domain config. During setup, the skill generates `_agent-permissions.yaml` from this config, which the orchestrator reads at runtime to dispatch agents with the correct tool restrictions. S1/S3 → creator agent, S2/S4/S5 → auditor agent.

### Agent permissions

The pipeline enforces file-level permissions through a generated `_agent-permissions.yaml` file. This file is created during setup (alongside the template, pipeline instructions, and other governance files) and consumed by the orchestrator at runtime.

**What the permissions file contains:**

| Section | Purpose |
|---------|---------|
| `agents` | Defines creator and auditor roles: which CLI tool, what command, how many turns |
| `stages` | Per-stage entry: role, allowed tools, allowed read paths, allowed write paths |

**How the orchestrator enforces permissions:**

| Agent | Tool-level enforcement | Path-level enforcement |
|-------|----------------------|----------------------|
| Claude Code | `--allowedTools` CLI flag (e.g., `--allowedTools Read,Glob` for read-only stages) | Allowed paths injected into the prompt |
| Codex | `--sandbox read-only` for audit stages, no sandbox for write stages | Allowed paths injected into the prompt |

**Design rationale:**

- Everything is known at setup time. The file scopes, agent types, and tool requirements are all defined when the pipeline is created. No runtime guessing.
- If the setup is wrong, the agent physically cannot complete its task (the tools to exceed its scope don't exist). The orchestrator detects the failure, stops the pipeline, and explains what to fix.
- The permissions file is the single source of truth. The orchestrator reads it. The prompt includes it. If permissions are wrong, you fix one file.

**Failure handling:**

When a stage fails because the agent couldn't do what it needed (tool blocked, sandbox prevented access):

1. **Stop** — the orchestrator stops the entire pipeline loop. The failing document is marked `blocked` in `loop-state.json`. Completed documents are unaffected.
2. **Log** — a failure entry is written to `audit-log.jsonl` with the stage, agent, error, and what was allowed.
3. **Analyze** — the `audit-pipeline-run` skill reads the log and determines the likely cause.
4. **Explain** — the skill tells the user in plain language what went wrong and what to fix in `_agent-permissions.yaml`.
5. **Ask** — the skill asks: "Do you want to fix the permissions config and restart the pipeline?"

The pipeline resumes from the failed stage (completed stages are tracked in `loop-state.json`).

### Parallel document processing

The current implementation processes one document at a time. For parallel processing:

1. Add a lock mechanism to `loop-state.json` (e.g., `"locked_by": "worker-1"`)
2. Run multiple orchestrator instances, each claiming a different document
3. Governance propagation (S5) should remain serialized to avoid merge conflicts in shared files

---

## Reference implementation

This pattern was extracted from the SalesOrderIntegrationTests project:

- **Repository:** `C:\Users\dag.gardheim\SpecialProjects\SalesOrderIntegrationTests`
- **Domain:** Sales Order API integration test scenarios
- **Scale:** 54 documents, 36 audited in first run
- **Documents created by:** Claude Code (S1)
- **Documents audited by:** OpenAI Codex (S2-S5) — Claude Code recommended for new setups
- **Governance files:** `_template.md` (structure rules), `_open-questions.md` (45+ cross-cutting questions), `_example-prompt.md` (audit format)
- **First run results:** 114 audit events, ~5M tokens consumed. Zero rewrites due to sandbox bug (now fixed). Five recurring patterns identified and propagated to template.

To see the pattern in action, examine:
- `tools/audit_loop.py` — the orchestrator (934 lines)
- `tools/audit/audit-log.jsonl` — the event log (114 entries)
- `tools/audit/loop-state.json` — per-document state (36 entries)
- `workflow/shared/_template.md` — the template with accumulated rules
- `workflow/shared/_open-questions.md` — the question register (45+ entries across 4 categories)
