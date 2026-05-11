# Pipeline Instructions

This file defines the stage behavior for both the creator agent (S1, S3) and the auditor agent (S2, S4, S5).

## Stages

| Stage | Agent | Action |
|-------|-------|--------|
| S1 | Creator | Create a runbook from the template, source material, and reference example |
| S2 | Auditor | Audit the runbook against template rules (tool-restricted) |
| S3 | Creator | Rewrite the runbook to fix S2 findings, verifying facts against source material |
| S4 | Auditor | Confirm only the changes from S3 (tool-restricted) |
| S5 | Auditor | Propagate recurring patterns to shared governance files |

## Decision logic

1. Read the grid in `../index.md`.
2. Scan rows top to bottom.
3. Find the first row where:
   - S1 = `todo` -> launch creator agent for S1
   - S1 = `done` and S2 = `not-started` -> launch auditor agent for S2
   - S3 = `todo` -> launch creator agent for S3
   - S4 = `todo` -> launch auditor agent for S4
   - S5 = `todo` -> launch auditor agent for S5
4. Update the grid at each stage transition:
   - When starting a stage, set it to `in-progress`
   - When finishing a stage, set it to `done`
5. When S5 is complete:
   - Fill the `End` column with the current timestamp
   - Fill the `Total` column with `End - Start`, formatted as `Xh Ym` or `Xm`
   - Set the next row in index order with `S1 = not-started` to `todo`
6. If a stage blocks, mark the row blocked, stop, and do not unlock the next row.

## Loop configuration

- Interval: 3 minutes (180 seconds)
- One row at a time. Never work on more than one row per tick.
- If no row is ready, do nothing and wait for the next tick.

## Permissions

The orchestrator reads `_agent-permissions.yaml` to enforce tool and file restrictions per stage:

- All stages run in a `workspace-write` sandbox so the CLI can start reliably on Windows.
- S2, S4: `allowed_tools: [Read, Glob]` - cannot write files
- S1, S3: `allowed_tools: [Read, Write, Edit, Glob]` - full access for document creation/rewriting
- S5: `allowed_tools: [Read, Write, Edit, Glob]` - write access for governance propagation
- The orchestrator preloads explicit allowlisted text files into the stage prompt before launch and summarizes large or binary external sources as path manifests.

Enforcement mechanism depends on the agent:
- Claude Code: `--allowedTools` CLI flag
- Codex: `--sandbox workspace-write`

See `_agent-permissions.yaml` for the exact file paths allowed per stage.

## File scope

> The file scopes below are documented here for human readability. The machine-readable source of truth is `_agent-permissions.yaml`.

### S1

Allowed files (write):
- the new runbook file in `runbooks/drafts/`
- `../index.md` (update S1 column and Start timestamp)

Allowed files (read):
- `runbooks/shared/_template.md`
- `runbooks/shared/_open-questions.md`
- source material paths (from domain config, preferably explicit text files)
- reference example document

### S2, S4

Allowed files (read-only):
- the current runbook file
- `../index.md`
- `runbooks/shared/_template.md`
- `runbooks/shared/_open-questions.md`
- `runbooks/shared/_example-prompt.md`

### S3

Allowed files (write):
- the current runbook file
- `../index.md`

Allowed files (read):
- `runbooks/shared/_template.md`
- `runbooks/shared/_open-questions.md`
- source material paths (from domain config, preferably explicit text files)
- reference example document
- S2 findings (passed in the prompt)

### S5

Allowed files (write):
- `runbooks/shared/_template.md`
- `runbooks/shared/_open-questions.md`
- `../index.md`

S5 has two independent duties:
1. **Runbook spot-check** - gated on `rewrite_occurred_any` (only if S3 changed the file)
2. **Governance propagation** - always runs, regardless of prior rewrites. Check for quality rules that appeared in 3+ runbooks but aren't in the template.
