# Audit Pipeline Skills

Claude Code skills for setting up and running staged document audit pipelines (S1-S5).

## Skills

### audit-pipeline-setup

Adaptive AI-assisted setup for a new audit pipeline. Explores the project, recommends configuration, and generates all governance files. Supports two agent roles: **creator** (S1 create, S3 rewrite) and **auditor** (S2 audit, S4 confirm, S5 governance propagation).

### audit-pipeline-run

Run, monitor, or resume an existing S1-S5 pipeline loop. Handles both document creation and auditing in a unified loop where each stage gets a fresh agent context window.

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
| `index.md` | Document tracking grid with example rows |

Browse these files to understand what a fully set up pipeline looks like before running the setup skill on your own project.
