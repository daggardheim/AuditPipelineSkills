---
name: audit-pipeline-run
description: Run or resume an existing staged document audit pipeline. Use when executing the S1-S5 pipeline loop, running the meta-audit, checking pipeline status, resuming a blocked row, or troubleshooting audit results. Triggers on "run audit", "resume audit", "check audit status", "audit pipeline status", "meta-audit", "audit the auditor", or "why is row X blocked". Companion skill to audit-pipeline-setup (which creates a new pipeline).
---

# Run a Staged Document Audit Pipeline

Execute, monitor, or resume an existing S1-S5 pipeline, then complete the mandatory meta-audit. The pipeline has two phases:

1. **S1-S5 loop** (automated, non-interactive) — the orchestrator processes each row through S1→S2→S3→S4→S5
2. **Meta-audit** (interactive, human + AI) — after all rows reach S5-complete, check cross-document consistency

The pipeline is **not complete** until the meta-audit passes. The index must show `Meta-audit: done`.

This skill assumes the pipeline is already set up (use `audit-pipeline-setup` to create one).

## When to use this skill

- Starting or resuming the S1-S5 pipeline loop
- Running the meta-audit after the loop completes
- Checking the status of an in-progress pipeline run
- Investigating why a document is blocked
- Reviewing audit results and deciding next steps
- Resetting a blocked document to re-run

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

## Step 2 — Check status

Run the orchestrator's status command:

```
python tools/audit_loop.py status
```

This shows:
- How many documents are tracked
- How many are completed, in-progress, or blocked
- Which document is next eligible for audit
- Token usage so far

If the user wants more detail, read `tools/audit/loop-state.json` directly and summarize per-document state.

## Step 3 — Run or resume

### Start/resume the loop

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
8. Proceeds to the next stage, next row, or stops if blocked

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

When a document is blocked, check the reason:

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

## Step 5 — Review results and check meta-audit readiness

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

The meta-audit checks cross-document consistency — things the per-row S1-S5 loop cannot catch because it only sees one document at a time.

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

**6c. Present findings to the user.** For each finding, state:
- Category and severity (critical / medium / low)
- Which documents are affected
- What the inconsistency is (quote the exact text that differs)
- Recommended resolution

**6d. Get human decisions.** For each finding, the user decides:
- Accept the recommendation
- Choose a different resolution
- Dismiss as intentional

This is why the meta-audit cannot be automated — the AI identifies the problem, but the human decides which side of an inconsistency wins.

**6e. Apply fixes.** Apply the agreed resolutions across all affected documents.

**6f. Update the index and clean up.** Add or update the meta-audit line at the bottom of the index:

```markdown
---
Meta-audit: done (YYYY-MM-DD, N findings, N critical, all resolved)
```

Then delete the signal file `tools/audit/meta-audit-pending.json` if it exists — the pipeline is now complete and the trigger is no longer needed.

## Step 7 — Handle permission failures

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

### Windows prompt too long

If the agent fails with a Windows command-line length error (`WinError 206`), the prompt is too large for the CLI invocation.
- Preload fewer explicit files.
- Keep external source trees path-based instead of embedding their full contents.
- Omit raw binary inputs from the prompt and summarize them as path references.

### Transient launch errors

Some launches fail before the model starts, especially on Windows. The runner now retries known transient launch errors quietly up to 3 times, including:
- `CreateProcessWithLogonW failed: 1907`
- `WinError 206`
- long-path launch errors in Swedish Windows environments

If the error disappears on retry, treat it as noise. Only investigate further if the failure persists after retries or the stage blocks on a real permission or content issue.

### Agent command not found

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
