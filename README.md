# Audit Pipeline Skills

Claude Code skills for setting up and running staged document audit pipelines (S1-S5).

## Skills

### audit-pipeline-setup

Adaptive AI-assisted setup for a new audit pipeline. Explores the project, recommends configuration, and generates all governance files. Supports two agent roles: **creator** (S1 — document creation) and **auditor** (S2-S5 — audit, rewrite, confirm, governance propagation).

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
