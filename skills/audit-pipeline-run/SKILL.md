---
name: audit-pipeline-run
description: Run or resume an existing staged document audit pipeline. Use when executing the S1-S5 pipeline loop, checking pipeline status, resuming a blocked row, or troubleshooting audit results. Triggers on "run audit", "resume audit", "check audit status", "audit pipeline status", or "why is row X blocked". Companion skill to audit-pipeline-setup (which creates a new pipeline).
---

# Run a Staged Document Audit Pipeline

Execute, monitor, or resume an existing S1-S5 pipeline. The orchestrator dispatches two agent roles: the **creator agent** for S1 (create) and S3 (rewrite), and the **auditor agent** for S2 (audit), S4 (confirm), and S5 (governance). Each stage gets a fresh agent context window.

This skill assumes the pipeline is already set up (use `audit-pipeline-setup` to create one).

## When to use this skill

- Starting or resuming the S1-S5 pipeline loop
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
3. If a row needs S2 or S4 → launches the **auditor agent** (read-only audit/confirm)
4. If a row needs S3 → launches the **creator agent** with S2 findings + source material access (accurate rewrites)
5. If a row needs S5 → launches the **auditor agent** (governance propagation)
6. Records the result to `audit-log.jsonl` and `loop-state.json`
7. Updates the index grid
8. Proceeds to the next stage, next row, or stops if blocked

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

## Step 5 — Review results

After a run completes, review the outcomes:

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

## Step 6 — Handle permission failures

When a stage fails because the agent couldn't complete its task — a tool was blocked, the sandbox prevented access, or the agent hit max-turns without producing output — this is a setup problem, not an agent problem.

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
  "error": "Agent exited with non-zero status. Sandbox prevented write attempt.",
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
- Add scoping hints in `role_additions` (e.g., "focus on the OrderEntry class, ignore test files").
- Reduce `--max-turns` if the agent is exploring too broadly.

### Agent command not found

The orchestrator invokes the configured agent CLI. If the command fails:
- **Claude**: Ensure Claude Code CLI is installed and `claude` is on PATH
- **Codex**: Ensure Codex is installed: `npm install -g @openai/codex`

Check the `creator_agent.cli_command` and `auditor_cli_command` values in your domain config.

### S3 rewrites are inaccurate despite source material access

The creator agent in S3 has source material paths but is still guessing at values.
- Check that the S3 prompt includes the S2 findings as specific fix instructions (not just "fix all issues").
- Check that `--max-turns` is high enough for S3 to read source material before rewriting. S3 uses the creator agent config (default 10 turns).
- Verify source material paths point to the right files — S3 needs the same paths as S1.

### Stage runs but no file changes in S3

Check that S3 is running WITHOUT `--sandbox read-only`. The orchestrator should set:
- S2, S4: `sandbox = "read-only"`
- S3, S5: `sandbox = ""` (no sandbox flag)

Verify in `audit_loop.py` near the `_run_agent` call.

### S5 never updates governance files

Check two things:
1. S5 must run with write access (no sandbox)
2. S5's governance propagation duty must NOT be gated on `rewrite_occurred_any` — it runs regardless

### Token usage is high but output is low

Common causes:
- Documents are too large (the orchestrator truncates at 18,000 characters — check if truncation is losing important content)
- The audit prompt is asking for comprehensive analysis when it should ask for actionable findings only
- S4 is running a full re-audit instead of a narrow acceptance check

### Agent runs but is missing tools

The agent completed but couldn't read or write files it needed.
- Check `_agent-permissions.yaml` for the failing stage. Compare `allowed_tools` against what the stage needs.
- Creator stages (S1, S3, S5) need: `[Read, Write, Edit, Glob]`
- Auditor read-only stages (S2, S4) need: `[Read, Glob]`
- If the agent is Claude, check that `--allowedTools` in the CLI command matches the YAML.
- If the agent is Codex, check that `--sandbox read-only` is only set for S2 and S4.

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
