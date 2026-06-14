---
name: audit-pipeline-run
description: Run or resume an existing staged document audit pipeline. Use when executing the S1-S5 pipeline loop, running the meta-audit, running the retroactive governance pass (S6-S8), checking pipeline status, resuming a blocked or needs-review row, or troubleshooting audit results. Triggers on "run audit", "resume audit", "check audit status", "audit pipeline status", "meta-audit", "audit the auditor", "run retroactive pass", "retroactive governance", or "why is row X blocked". Companion skill to audit-pipeline-setup (which creates a new pipeline).
---

# Run a Staged Document Audit Pipeline

Execute, monitor, or resume an existing pipeline, then complete the mandatory meta-audit and optional retroactive governance pass. The pipeline is orchestrator-driven and has up to three phases:

1. **S1-S5 loop** (automated, non-interactive) — the orchestrator processes each row through S1→S2→S3→S4→S5
2. **Meta-audit** (interactive, human + AI) - after all rows reach S5-complete, check cross-document consistency, write a durable report, and apply the agreed fixes in the source docs
3. **Retroactive governance pass** (S6-S8, automated) — re-audit all documents against final governance, rewrite those that fail

The pipeline is **not complete** until the meta-audit passes, the agreed fixes are applied, and the index shows `Meta-audit: done` (and `Retroactive pass: done` if enabled). The orchestrator is authoritative; do not invent manual spot-check modes.

This skill assumes the pipeline is already set up (use `audit-pipeline-setup` to create one).

## When to use this skill

- Starting or resuming the S1-S5 pipeline loop
- Running the meta-audit after the loop completes
- Checking the status of an in-progress pipeline run
- Investigating why a document is blocked or marked `needs-review`
- Reviewing audit results and deciding next steps
- Running the retroactive governance pass (S6-S8) after the meta-audit
- Checking retroactive pass status
- Resetting a blocked or needs-review document to re-run

## Step 1 — Identify the pipeline

Find the pipeline in the current project. Look for these markers:

| File | Indicates |
|------|-----------|
| `tools/audit_loop.py` | Orchestrator exists |
| `tools/audit_stage_result.schema.json` | Output schema exists |
| `tools/audit/loop-state.json` | Pipeline has been run before |
| `tools/audit/audit-log.jsonl` | Audit events exist |
| `workflow/index.md` (or equivalent) | Document index exists |

If none of these exist, suggest the user run `audit-pipeline-setup` first.

## Status semantics

Use the index as the machine-readable ledger and keep the visible status vocabulary stable:

- `pass` = the stage audit found no final-governance blockers
- `fail` = the stage audit found concrete problems
- `done` = the rewrite or propagation stage completed
- `confirmed` = the acceptance stage accepted the rewrite
- `skipped` = the row intentionally bypassed a stage because the prior stage completed it
- `needs-review` = the row is unfinished and needs human or AI attention

Keep `blocked` as runner/internal state only. In the human-facing index, prefer `needs-review` for any unresolved row and reserve `blocked` for the loop-state file and audit log.

## Preflight

Before you run or resume a pipeline, confirm:

- The project has a shared template and reference example
- Creator and auditor roles are still distinct
- Source material paths are explicit and bounded
- S2, S4, S6, and S8 are read-only at the tool level
- S5 and S7 are the only write-capable propagation/rewrite stages
- The retroactive loop, if enabled, has its own runner
- The visible retroactive grid uses `needs-review` for unresolved rows
- `blocked` is only runner state, not the main human-facing token
- The meta-audit is complete before any retroactive pass starts
- There is no manual spot-check mode in the process

## Step 1b — Select and lock the execution mode

Before running any stage, choose the engine. This happens once per run and is then locked.

1. **Check for an existing lock.** Read `tools/audit/loop-state.json`. If it has `"engine": "A" | "B" | "C"`, the mode is already locked — use it and skip to status. **Never switch engines mid-run** (it breaks audit-standard consistency — see PATTERN.md "Consistency lock").
2. **If no lock exists, investigate the set.** Assess: stakes (customer-facing? compliance? financial?), factual-accuracy sensitivity, document count, whether headless/unattended runs are needed, and how much a second model family would add.
3. **Present a value review.** Score each mode High/Medium/Low for *this set* with one-line reasoning. Example:
   - Mode A (native Claude): Medium — fast, but same-model audit shares blind spots.
   - Mode B (CLI cross-vendor): High — external API specs; a different model catches factual drift; can run headless.
   - Mode C (hybrid): Medium — native ergonomics + independent auditor, but the audit hop is experimental.
4. **Ask the user to choose** with `AskUserQuestion` (recommendation first).
5. **Lock it.** Write `"engine"` into `loop-state.json`. All stages this run — S1–S5 and retroactive S6–S8 — use it.

Then run the chosen engine:
- **Mode A** → `Workflow({scriptPath: "tools/audit-workflow.js", args})` where `args` is built from `index.md` + the domain config (rows, paths, models). Auditor stages run as read-only `Explore` agents; the recorder agent writes the reporting artifacts.
- **Mode B** → the Python orchestrator: `python tools/audit_loop.py run` (Steps 2–5 below).
- **Mode C** → the Mode A workflow with the audit stage dispatched to the configured cross-vendor auditor (experimental).

## Step 2 — Check status

Run the orchestrator's status command:

```
python tools/audit_loop.py status
```

This shows:
- How many documents are tracked
- How many are completed, in-progress, or needs-review
- Which document is next eligible for audit
- Token usage so far

If the user wants more detail, read `tools/audit/loop-state.json` directly and summarize per-document state.

## Step 3 — Run or resume

### Start/resume the loop (Mode B — Python orchestrator)

```
python tools/audit_loop.py run
```

This runs the unified S1-S5 loop. The orchestrator:
1. Reads the index to find the next eligible row
2. If a row has S1 = `todo` → launches the **creator agent** to create the document
3. If a row needs S2 or S4 → launches the **auditor agent** (tool-restricted audit/confirm)
4. If a row needs S3 → launches the **creator agent** with S2 findings + source material access (accurate rewrites)
5. If a row needs S5 → launches the **auditor agent** (governance propagation)
6. Records the result to `audit-log.jsonl` and `loop-state.json`
7. Updates the index grid
8. Proceeds to the next stage, next row, or stops if unresolved

Transient launch errors are retried quietly by the runner before a stage is treated as failed. A stage only becomes blocked when the failure is persistent or non-transient.

The loop is fully autonomous — S1 triggers immediately after S5 completes the previous row. No manual handoff between creator and auditor.

### Run a specific document

```
python tools/audit_loop.py run --doc path/to/document.md
```

### Run continuously

```
python tools/audit_loop.py run --loop
```

The loop checks for new eligible rows continuously. When S5 completes a row, the orchestrator immediately checks if the next row's S1 is `todo` and starts it without delay.

## Step 4 — Handle blocked documents

When a document is blocked, or the index shows `needs-review`, check the reason:

1. Read `loop-state.json` for the document entry — look at `blocked_reason`
2. Read the last audit event in `audit-log.jsonl` for that document — look at `note` and `follow_up`
3. Check `_open-questions.md` for the referenced question IDs

Common block reasons:
- **Missing test data** — a scenario needs fixture data that doesn't exist
- **Unresolved API behavior** — the expected response is unknown
- **Contradictory requirements** — the template says one thing, the source material says another

To unblock:
1. Resolve the underlying question (answer in `_open-questions.md`, add fixture data, etc.)
2. Reset the document state in `loop-state.json`: set `blocked: false`, remove from `completed_stages` the stage that blocked
3. Re-run: `python tools/audit_loop.py run --doc path/to/document.md`

If the visible index row should reflect that the work is still open, use `needs-review` rather than `blocked`.

## Step 5 — Review results and check meta-audit readiness

> **Reporting is mode-independent.** Whichever engine ran, the durable artifacts are identical: `audit-log.jsonl`, `loop-state.json`, the `index.md` grid + footers, and the meta-audit report. In Mode A/C the recorder agent wrote them; in Mode B the Python orchestrator did. The analysis below applies to all modes. Modes A/C also expose a live `/workflows` progress tree during the run (a bonus, not part of the contract).

After a run completes, review the outcomes and check whether the meta-audit can start:

### Quick summary

```
python tools/audit_loop.py status
```

### Detailed analysis

Read `tools/audit/audit-log.jsonl` and look for:

| Signal | What it means |
|--------|--------------|
| `rewrite_occurred: true` in S3 | The document was actually edited |
| `findings_resolved > 0` in S4 | S3 fixes were confirmed |
| `rewrite_occurred: true` in S5 | Governance files were updated with recurring patterns |
| `decision: stop` + `next_stage: complete` | Document is done |
| `decision: block` | Human intervention needed |
| High `repeated_findings` across documents | A pattern should be in the template but isn't |

### Red flags in results

| Red flag | Likely cause |
|----------|-------------|
| Zero `rewrite_occurred` across all documents | Sandbox misconfiguration — S3/S5 can't write |
| Confidence climbing without `findings_resolved` | Staleness inflation — the model is "more sure" but nothing changed |
| Same `finding_signatures` appearing in 5+ documents | Recurring pattern not yet propagated to template |
| All documents completing in S2 with `decision: stop` | Audit prompt may be too lenient — not finding real issues |

### Meta-audit readiness

After reviewing loop results, check whether the meta-audit can start:

1. **Check signal file.** Look for `tools/audit/meta-audit-pending.json`. If it exists, the orchestrator has already determined that all rows are S5-complete and the meta-audit is pending. Read it for summary data (row counts, timestamp, index path).
2. **All rows S5-complete?** If no signal file exists, check the index directly — every row must have S5 = `done`. If any rows are blocked or incomplete, resolve them first.
3. **Meta-audit line present?** Look for a `Meta-audit:` line at the bottom of the index. If missing, the meta-audit hasn't started.
4. **Report pipeline status accurately:**

| Index state | Signal file? | Status to report |
|-------------|-------------|-----------------|
| Some rows still in S1-S5 | No | "Pipeline in progress — N of M rows complete" |
| All rows S5-complete, no meta-audit line | Yes (or missing) | **"S5-complete, awaiting meta-audit"** — do NOT report as "done" |
| All rows S5-complete, `Meta-audit: done` | Should not exist | "Pipeline complete" |

If the pipeline is S5-complete and awaiting meta-audit, prompt the user: "All rows have completed S1-S5. The meta-audit is the next step — shall we start it?"

**On every skill invocation** (including status checks and `/resume`), check for the signal file first. This is the primary mechanism for catching meta-audits that were triggered in a previous session.

## Step 6 — Meta-audit (mandatory, interactive)

> **This step is required.** The pipeline is not complete without it. Do not skip.

The meta-audit checks cross-document consistency - things the per-row S1-S5 loop cannot catch because it only sees one document at a time. Its job is not just to report findings; once the user chooses a resolution, apply the agreed fixes in the owning documents before moving on.

Run it with the separate orchestrator `tools/retroactive_audit_loop.py`; do not fold S6-S8 into the S1-S5 runner.

Treat S6-S8 as a second deterministic loop in the same family as S1-S5: it processes one row at a time, uses fresh context per stage, keeps file-backed state, and follows a fixed stage order. The difference is scope and timing, not orchestration style. S1-S5 produces and matures the governance; the retroactive loop re-applies that final governance to every completed document after the meta-audit.

### Prerequisites

- All rows must be S5-complete in the index
- The user must be present (this step is interactive — it requires human decisions)

### Procedure

**6a. Build the quality checklist.** Read the reference document (the best-quality document in the set, usually the first one completed). Extract the structural elements, terminology, and patterns that all documents should share. See the "Meta-audit" section in PATTERN.md for the generic checklist categories:
1. Terminology consistency
2. Shared pattern consistency
3. Resolved cross-cutting question propagation
4. Design decision consistency
5. Frontmatter hygiene

**6b. Run the analysis.** For small sets (under 20 documents): read all documents and check each against the checklist. For larger sets: dispatch parallel agents — one per document group — each checking their group against the checklist, then do a single cross-document consistency pass across groups.

**6c. Write the meta-audit report.** Save a durable findings report before asking the user to choose resolutions. Use a stable location in the pipeline workspace, such as `tools/audit/meta-audit-report.md` for the human-readable report and `tools/audit/meta-audit-report.json` if the orchestrator also emits structured output. The report should include:
- scope and date
- documents audited
- checklist used
- findings grouped by category
- severity, affected documents, and exact inconsistent text
- recommended resolution for each finding

**6d. Present findings to the user.** For each finding, state:
- Category and severity (critical / medium / low)
- Which documents are affected
- What the inconsistency is (quote the exact text that differs)
- Recommended resolution

**6e. Get human decisions.** Present each finding with `AskUserQuestion` as a structured choice:
- Accept the recommendation (first option)
- Choose the other side of the inconsistency
- Dismiss as intentional

Batch related findings into one `AskUserQuestion` call where possible (up to 4 questions per call). This is why the meta-audit cannot be automated — the AI identifies the problem, but the human decides which side of an inconsistency wins. The structured answers become the resolution record applied in 6f.

**6f. Apply fixes.** Apply the agreed resolutions across all affected documents. If the findings are concrete and low-risk, do this immediately after the user chooses the resolution; do not branch to a different task first.

**6g. Handoff checklist.** Before concluding the meta-audit, confirm all of the following:
- Report written and saved in a durable location
- Findings mapped to the owning documents
- Agreed fixes applied in the source docs
- Index footer updated
- Signal file removed

**6h. Update the index and clean up.** Add or update the meta-audit line at the bottom of the index:

```markdown
---
Meta-audit: done (YYYY-MM-DD, N findings, N critical, all resolved)
```

Then delete the signal file `tools/audit/meta-audit-pending.json` if it exists - the pipeline is now complete and the trigger is no longer needed.

If you want an audit trail of the meta-audit itself, keep the report file alongside the index and audit log. The report is the human-readable review record; the index footer is the completion gate.

## Step 7 — Retroactive governance pass (S6-S8)

> **This step is optional.** It runs only if `retroactive_pass.enabled: true` in the domain config. If not enabled, the pipeline is complete after the meta-audit.

The retroactive governance pass re-audits all documents against the **final** governance — the template, open-questions, and standards as they exist after S5 propagation and meta-audit fixes. This closes the quality gradient between early and late pipeline documents.

### Prerequisites

- Meta-audit must be complete (`Meta-audit: done` in the index)
- `retroactive_pass.enabled: true` in the domain config (or `_pipeline.md` documents S6-S8)

### Triggering

After the meta-audit completes, check whether the retroactive pass is enabled. If yes, prompt the user:

Use this generic activation prompt:

```text
Meta-audit complete. The retroactive governance pass (S6-S8) is enabled. This will re-audit all N documents against the final governance. Documents that pass S6 are skipped; those that fail get a quality lift rewrite (S7) and confirmation (S8). Start the retroactive governance pass?
```

Operationally, run that pass with `tools/retroactive_audit_loop.py`.

### Procedure

**7a. Initialize the tracking section.** If the index doesn't already have a "Retroactive Governance Pass" section, add it below the meta-audit line with all rows set to `not-started`:

```markdown
## Retroactive Governance Pass

| # | Item | S6 Verdict | S6 Findings | S7 Rewrite | S8 Confirm |
|---|------|-----------|-------------|------------|------------|
| 1 | 01-doc-name | not-started | | not-started | not-started |
| 2 | 02-doc-name | not-started | | not-started | not-started |
```

**7b. Process each row in index order.** For each row:

1. **Run S6** — launch auditor agent with:
   - The document
   - Final `_template.md`
   - Final `_open-questions.md` (including all resolved answers)
   - S6 audit criteria from the domain config
   - Prompt: "Audit this document against the final governance. Check: structural completeness, resolved questions, cross-cutting standards, quality baseline. Return pass/fail verdict with findings."

2. **If S6 verdict is `pass`:**
   - Update index: S6 Verdict = `pass`, S6 Findings = `0`, S7 Rewrite = `skipped`, S8 Confirm = `skipped`
   - Append event to audit-log.jsonl
   - Move to next row

3. **If S6 verdict is `fail`:**
   - Update index: S6 Verdict = `fail`, S6 Findings = N
   - **Run S7** — launch creator agent with:
     - The document
     - S6 findings
     - Final template + open-questions
     - Source material paths (same as S3)
     - Prompt: "Rewrite this document to address the S6 findings below. Only fix what S6 flagged — do not redesign the document or change validated decisions."
   - Update index: S7 Rewrite = `done`
   - **Run S8** — launch auditor agent with:
     - The S7-rewritten document
     - S6 findings
     - Prompt: "Confirm that each S6 finding is addressed. Check for regressions. Return pass/fail."
   - Update index: S8 Confirm = `confirmed` on success
   - If S8 finds regressions: update the visible grid to `needs-review`, flag the row in runner state as blocked, and do NOT re-run S7 automatically. The visible grid stays human-friendly; the runner state keeps the execution details.

4. Append all events (S6, S7, S8) to audit-log.jsonl with stage field `S6`/`S7`/`S8`

**7c. Finalize.** When all rows are processed, add to the index footer:

```markdown
Retroactive pass: done (YYYY-MM-DD, N specs audited, M rewritten, K passed clean)
```

### Status reporting

When checking retroactive pass status, report:

| Index state | Status to report |
|-------------|-----------------|
| No retroactive pass section | "Retroactive pass not enabled" or "Not yet started" |
| Some rows still processing | "Retroactive pass in progress — N of M rows complete" |
| All rows done, no `Retroactive pass: done` line | "Retroactive pass processing complete, awaiting finalization" |
| `Retroactive pass: done` in footer | "Retroactive pass complete" |

## Step 8 — Handle permission failures

When a stage fails after the runner has exhausted its transient retries — for example, a tool was blocked, the sandbox prevented access, or the agent hit max-turns without producing output — this is a setup problem, not an agent problem.

### The failure flow

**Step 1 — Stop.** The orchestrator stops the entire pipeline loop. The failing document is marked `blocked` in `loop-state.json` with the error details. Previously completed documents are unaffected.

**Step 2 — Log.** The orchestrator writes a failure entry to `audit-log.jsonl`:

```json
{
  "timestamp": "2026-05-10T14:32:00Z",
  "document": "path/to/document.md",
  "stage": "S2",
  "agent": "codex",
  "status": "failed",
  "error": "Agent exited with non-zero status. Tool restrictions prevented write attempt.",
  "allowed_tools": ["Read", "Glob"],
  "allowed_write": [],
  "exit_code": 1
}
```

**Step 3 — Analyze.** Read the failure log entry and determine the likely cause:

| Log signal | Likely cause | Suggested fix |
|---|---|---|
| Non-zero exit + permission/sandbox error | Agent needed a tool it didn't have | Add the tool to `allowed_tools` for that stage in `_agent-permissions.yaml` |
| Agent completed but no JSON output | Prompt unclear about output format | Check prompt assembly in the orchestrator |
| Agent completed but `decision: block` | Document has a real problem | Not a permission issue — resolve the block reason manually |
| Agent timed out (max-turns reached) | Source material paths too broad | Narrow `allowed_read` paths or increase `max_turns` in `_agent-permissions.yaml` |

**Step 4 — Explain.** Tell the user in plain language what went wrong and what to fix. Example:

> "The pipeline stopped at S2 for document 07-restart-procedure.md. The Codex auditor tried to write a file but it only has read access. This usually means either: (a) the stage should have write access — edit `_agent-permissions.yaml` and add Write to S2's `allowed_tools`, or (b) the prompt is asking the auditor to do something it shouldn't — check the audit prompt for instructions that imply editing."

**Step 5 — Ask.** Ask the user: "Do you want to fix the permissions config and restart the pipeline?" The pipeline resumes from the failed stage — completed stages are preserved in `loop-state.json`.

## Troubleshooting

### Creator agent produces no output file

The S1 invocation completed but no document was written.
- Check that `--max-turns` is high enough (default 10). The creator may need multiple tool-call rounds to read source material and write the output.
- Check that the source material paths in the domain config are correct and accessible.
- Check that the output directory exists.

### Document doesn't follow the template

The creator agent wrote a document but it doesn't match `_template.md`.
- Verify that `_template.md` content is included in the S1 prompt. Check `_build_s1_prompt()` in the orchestrator.
- Verify that the reference example document follows the template (if the example is wrong, every S1 output will be wrong).

### S1 takes too long or times out

The creator agent is spending too many turns on source material.
- Reduce the scope of `source_material_paths` in the domain config. Point to specific files, not entire directories.
- Keep binary or very large external sources as path manifests instead of inlining them into the prompt.
- Add scoping hints in `role_additions` (e.g., "focus on the OrderEntry class, ignore test files").
- Reduce `--max-turns` if the agent is exploring too broadly.

### Windows prompt too long (Mode B only)

If the agent fails with a Windows command-line length error (`WinError 206`), the prompt is too large for the CLI invocation.
- Preload fewer explicit files.
- Keep external source trees path-based instead of embedding their full contents.
- Omit raw binary inputs from the prompt and summarize them as path references.

### Transient launch errors (Mode B only)

Some launches fail before the model starts, especially on Windows. The runner now retries known transient launch errors quietly up to 3 times, including:
- `CreateProcessWithLogonW failed: 1907`
- `WinError 206`
- long-path launch errors in Swedish Windows environments

If the error disappears on retry, treat it as noise. Only investigate further if the failure persists after retries or the stage blocks on a real permission or content issue.

### Agent command not found (Mode B only)

> Modes A and C run agents in-process, so the Windows CLI failure modes above (transient launch errors, prompt-length limits, missing CLI) do not occur there. If you hit these in Mode A/C, you are actually invoking the Mode B Python path — check the engine lock in `loop-state.json`.

The orchestrator invokes the configured agent CLI. If the command fails:
- **Claude**: Ensure Claude Code CLI is installed and `claude` is on PATH
- **Codex**: Ensure Codex is installed: `npm install -g @openai/codex`

Check the `agents.creator.cli_command` and `agents.auditor.cli_command` values in your domain config.

### S3 rewrites are inaccurate despite source material access

The creator agent in S3 has source material paths but is still guessing at values.
- Check that the S3 prompt includes the S2 findings as specific fix instructions (not just "fix all issues").
- Check that `--max-turns` is high enough for S3 to read source material before rewriting. S3 uses the creator agent config (default 10 turns).
- Verify source material paths point to the right files — S3 needs the same paths as S1.

### Stage runs but no file changes in S3

Check that S3 is running with `--sandbox workspace-write` and that the stage's `allowed_tools` includes `Write` and `Edit`. If S3 cannot write, the permissions file is misconfigured.

Verify in `audit_loop.py` near the `_run_agent` call.

### S5 never updates governance files

Check two things:
1. S5 must run with `Write` and `Edit` in `allowed_tools`
2. S5's governance propagation duty must NOT be gated on `rewrite_occurred_any` — it runs regardless

### Token usage is high but output is low

Common causes:
- Documents are too large (the orchestrator truncates at 18,000 characters — check if truncation is losing important content)
- The audit prompt is asking for comprehensive analysis when it should ask for actionable findings only
- S4 is running a full re-audit instead of a narrow acceptance check

### Agent runs but is missing tools

The agent completed but couldn't read or write files it needed.
- Check `_agent-permissions.yaml` for the failing stage. Compare `allowed_tools` against what the stage needs.
- Creator stages (S1, S3, S5) need: `[Read, Write, Edit, Glob]` by default; add `Grep` and `Bash` when the creator needs shell discovery or repository querying.
- Auditor tool-restricted stages (S2, S4) need: `[Read, Glob]`
- If the agent is Claude, check that `--allowedTools` in the CLI command matches the YAML.
- If the agent is Codex, check that `--sandbox workspace-write` is set consistently and that the stage allowlist keeps S2 and S4 read-only at the tool level.

### Agent can't find source material

The creator agent in S1 or S3 reports it can't find files referenced in the prompt.
- Check `allowed_read` paths in `_agent-permissions.yaml` for S1/S3. The source material paths must match what exists on disk.
- Glob patterns (e.g., `src/**/*.cs`) are allowed. Verify the pattern matches actual files: `ls src/**/*.cs`
- If paths changed since setup, update `_agent-permissions.yaml` and restart.

### Permissions file missing or incomplete

The orchestrator can't find `_agent-permissions.yaml` or it's missing stages.
- Re-run `audit-pipeline-setup` to regenerate the file.
- Or create it manually following the reference implementation at `reference/runbooks/_agent-permissions.yaml`.
- Every pipeline must have entries for all 5 stages (S1-S5).

### Retroactive pass not starting

Check:
1. Meta-audit line shows `done` in the index
2. `retroactive_pass.enabled: true` in the domain config or `_pipeline.md` documents S6-S8 stages
3. `_agent-permissions.yaml` has S6, S7, S8 entries

### S6 passes everything (no findings)

This may be correct — if the meta-audit was thorough, S6 may find nothing new. But if you expect findings:
- Check that S6 is auditing against the **final** template (not an earlier version)
- Check that resolved open-questions are included in the S6 prompt
- Check that the S6 audit criteria include quality_baseline (relative comparison)

### S7 rewrite introduces regressions (S8 fails)

S7 should only address S6 findings. If S8 finds regressions:
1. Read the S8 findings to understand what regressed
2. The document is flagged for manual review — resolve the regression manually
3. S7 does NOT re-run. One attempt per document.

### Permissions file missing S6/S7/S8 entries

Re-run `audit-pipeline-setup` to regenerate, or add manually following the S2/S3/S4 patterns:
- S6: same as S2 (auditor, read-only)
- S7: same as S3 (creator, source material access)
- S8: same as S4 (auditor, read-only)
