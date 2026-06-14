# Audit Pipeline Skills

Claude Code skills for setting up and running staged document audit pipelines: the S1-S5 loop, a mandatory meta-audit, and an optional S6-S8 retroactive governance pass.

Every pipeline includes a mandatory meta-audit after S1-S5. The meta-audit checks cross-document consistency, writes a durable report, applies the agreed fixes in the source documents, and only then marks the pipeline complete.

## Skills

### audit-pipeline-setup

Adaptive AI-assisted setup for a new audit pipeline. Explores the project, recommends configuration, and generates all governance files. Supports two agent roles: **creator** (S1 create, S3 rewrite) and **auditor** (S2 audit, S4 confirm, S5 governance propagation).

### audit-pipeline-run

Run, monitor, or resume an existing pipeline: the S1-S5 loop, the mandatory meta-audit, and the optional S6-S8 retroactive governance pass. Handles both document creation and auditing in a unified loop where each stage gets a fresh agent context window.

## Execution modes

The pipeline runs on one of three engines, chosen at run time via an AI value review and **locked for the whole run**:

| Mode | Engine | Model diversity | Headless | Best for |
|------|--------|-----------------|----------|----------|
| **A** | native `Workflow` (in-process Claude) | role/context/tier | no | fast interactive runs, most domains |
| **B** | `audit_loop.py` (CLI) | full cross-vendor (Claude + Codex) | yes | high-stakes / unattended / a second model family throughout |
| **C** | `Workflow` + cross-vendor audit | cross-vendor on the audit stage only | no | A's ergonomics + an independent auditor (experimental audit hop) |

A model-assignment layer (`role_model` per role, optional `stage_model_overrides`) sets which model runs each role — spend cross-vendor diversity on the audit role; never audit with haiku. All three modes write the **same durable reports** (`audit-log.jsonl`, `loop-state.json`, the index grid + footers, the meta-audit report), so runs are comparable line-for-line. See `skills/audit-pipeline-setup/PATTERN.md` for the full architecture.

## Installation

Copy the `skills/` folder into your `.claude/skills/` directory:

```
cp -r skills/* ~/.claude/skills/
```

## Domain examples

Pre-filled domain configs are included for:

- API specifications
- Runbooks / playbooks
- Problem case investigations
- Knowledge base articles

See `skills/audit-pipeline-setup/examples/` and `skills/audit-pipeline-setup/PATTERN.md` for the full architecture reference.

## Reference implementation

A complete set of generated output files for the **runbooks** domain is included at `skills/audit-pipeline-setup/reference/runbooks/`. This shows exactly what the setup skill produces:

| File | Purpose |
|------|---------|
| `_template.md` | Required sections, quality rules, coverage checklist |
| `_open-questions.md` | Question categories with example entries |
| `_example-prompt.md` | Audit prompt with good/bad finding examples |
| `_pipeline.md` | Stage instructions for both agent roles |
| `_s1-prompt-template.md` | How the orchestrator assembles the S1/S3 creator prompt |
| `runner-contract.txt` | Execution contract for the orchestrator |
| `_agent-permissions.yaml` | Per-stage tool restrictions and file scope for Claude and Codex agents |
| `audit-workflow.js` | The Mode A reference engine — native `Workflow` script (S1–S5 + recorder) |
| `index.md` | Document tracking grid with example rows |

Browse these files to understand what a fully set up pipeline looks like before running the setup skill on your own project.
