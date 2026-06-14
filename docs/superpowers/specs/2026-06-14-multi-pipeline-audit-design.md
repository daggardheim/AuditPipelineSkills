# Design — Multi-pipeline AuditPipelineSkills

**Date:** 2026-06-14
**Status:** Approved (brainstorming complete; ready for implementation plan)
**Author:** Dag Gardheim + Claude

---

## Goal

Offer three execution engines for the staged document audit pipeline. Choose one
up-front via an AI-informed value review, **lock it for the run's lifetime**, and
produce **identical durable reports** regardless of which engine ran — so runs can
be compared line-for-line.

The motivation: different model families have different strengths and blind spots.
The user wants the ability to have one model implement and a different model audit,
and wants to choose deliberately which engine fits a given document set — not have
the tool silently pick one.

## Non-goals

- Changing the S1–S8 stage sequence (non-negotiable architecture — unchanged).
- Replacing the existing Python orchestrator (it stays as Mode B).
- Mid-run engine switching (explicitly forbidden — see Consistency Lock).
- A third *role*. We keep two roles (creator/auditor) and add a model layer.

---

## Background

This repository holds the **skills that set up and run audit pipelines in other
projects** — not a running orchestrator. "Building a mode" therefore means deciding
what the `audit-pipeline-setup` skill *generates* and what the `audit-pipeline-run`
skill *drives*.

The current pipeline is a hand-rolled multi-agent orchestrator (`audit_loop.py`,
~934 lines) that shells out to `claude -p` / `codex exec` per stage, parses a JSON
schema by hand, enforces per-stage tool restrictions via `_agent-permissions.yaml`,
retries Windows CLI launch errors, and tracks state in `loop-state.json` /
`audit-log.jsonl`. Claude Code now has native primitives for most of this (the
`Workflow` tool, subagents/`agentType`, schema-validated structured output,
`AskUserQuestion`, `resumeFromRunId`, `budget`). This design exposes those natively
while keeping the proven CLI path for genuine cross-vendor runs.

---

## Decision 1 — Model-assignment layer (keep 2 roles)

Stages S1–S8 and the creator/auditor roles are unchanged. We add an explicit
**model assignment** to the domain config and `_agent-permissions.yaml`.

```yaml
agents:
  creator:
    role_model: { engine: claude, tier: opus }      # implement: strongest tier
  auditor:
    role_model: { engine: claude, tier: sonnet }    # audit: capable, not Haiku
# optional per-stage override:
stage_model_overrides:
  S5: { engine: claude, tier: opus }                # governance propagation is hard
```

Rules baked into setup/verification:
- **Never assign the auditor to Haiku.** Auditing is hard reasoning. Haiku is
  permitted only for mechanical conformance checks, never for judgment-bearing audit.
- The implement (creator) role favors **model tier** (strongest available) over
  vendor diversity — two vendors both implementing adds nothing; you want the single
  strongest implementer.
- Cross-vendor diversity is spent where it pays off most: the **audit** role.
- `engine` values: `claude` (native or CLI depending on mode), `codex`, or other
  CLI-invocable vendor. `tier` applies to Claude (`opus|sonnet|haiku`).

Rationale: most verification value comes from role + context isolation + adversarial
framing (vendor-independent). Weight diversity is the cherry on top, highest-value on
the audit stage and on factual claims.

---

## Decision 2 — Mode selection: up-front, AI-informed, human-approved, then locked

A new **first step** in `audit-pipeline-run`, before any stage runs:

1. **Investigate** the document set + domain. Assess: stakes (customer-facing?
   compliance? financial?), factual-accuracy sensitivity, scale, whether headless /
   unattended runs are needed, and how much a second model family would add.
2. **Value review.** Score each mode **High / Medium / Low value for this specific
   set**, each with one-line reasoning. This is contextual, not generic pros/cons.
3. **Human selects** via `AskUserQuestion`, recommendation presented first.
4. **Lock.** Write `"engine": "A" | "B" | "C"` into `loop-state.json`. This engine is
   used for the **entire pipeline lifetime** — S1–S5 and the retroactive pass
   S6–S8. Resume reads the lock.

### Consistency Lock (hard rule)

Switching engine mid-process is forbidden. Reason: it breaks consistency of the
audit standard. If S2 is audited by one model and S4 by another, severity
calibration, finding signatures, and the `findings_resolved` metric become
incoherent — that metric only works if the same auditor applies the same yardstick
across stages. The retroactive S6 audit must use the same calibration as the original
S1–S5 audit, so the lock spans the whole lifetime. The only way to change engine is a
deliberate fresh run of the entire set.

The **meta-audit is the one engine-agnostic phase** — it is inherently human-driven
analysis, not an engine, and runs interactively regardless of which engine ran the
loop.

### Value-review rubric (guidance for the investigate step)

A mode scores **High** when:
- **Mode B / full cross-vendor:** high-stakes / compliance / external-facing docs;
  factual accuracy critical (API specs, customer-facing KB); same-model audits are
  distrusted; headless / overnight unattended runs wanted; OS-level sandbox wanted.
- **Mode A / native single-vendor:** fast interactive iteration; native resume /
  structured output / live progress wanted; setup simplicity; moderate stakes;
  smaller sets; cost-sensitive.
- **Mode C / hybrid:** want A's ergonomics *and* an independent auditor; medium-high
  stakes; willing to accept the experimental cross-vendor audit hop.

---

## Decision 3 — Three modes

| | A. Workflow-native | B. CLI cross-vendor | C. Hybrid |
|---|---|---|---|
| Engine | native `Workflow` script | `audit_loop.py` | `Workflow` + cross-vendor audit |
| Creator | Claude (in-process) | Claude (CLI) | Claude (in-process) |
| Auditor | Claude (in-process) | Codex (CLI) | different vendor (CLI hop) |
| Diversity source | role/context/tier | full cross-vendor | cross-vendor on audit only |
| Headless / scheduled | no (session-bound) | yes (`--loop`, cron) | no |
| Resume / structured output | native | hand-rolled | native (except audit hop) |
| OS-level sandbox audit | no (tool allowlist) | yes | yes (on audit) |
| Windows CLI brittleness | none | all stages | audit hop only |
| Status | proven | proven (54-doc run) | experimental audit hop |

Build order: **A → B → C.** Mode C's cross-vendor-audit-inside-a-Workflow is the
most novel/fragile piece and is labeled experimental so expectations are set.

---

## Decision 4 — Mode A is a generated Workflow script

`audit-pipeline-setup` generates a concrete reference script
`reference/runbooks/audit-workflow.js` and per-domain copies, driven by the same
domain config + `_agent-permissions.yaml`. The `audit-pipeline-run` skill executes it
via `Workflow({scriptPath})`.

- Read-only auditor stages (S2, S4, S6, S8): `agentType: 'Explore'` (read-only by
  construction — stronger than a YAML allowlist).
- Write-capable stages (S1, S3, S5, S7): a writing agent (default `claude`). Note S5
  is the auditor *role* but is write-capable (it propagates learnings into governance
  files), so it uses a writing agent, not `Explore`.
- Every stage call uses `{schema}` = the existing `audit_stage_result.schema.json`,
  so structured output is validated and auto-retried.
- **Reporting via a recorder agent.** Workflow scripts have no direct filesystem
  access — only spawned agents can write files. So the script holds each stage's
  structured result in memory and, after each stage, dispatches a small
  **write-scoped recorder agent** (tools restricted to `tools/audit/**` + `index.md`,
  never the audited document) that appends to `audit-log.jsonl`, updates
  `loop-state.json`, and updates the `index.md` grid. This keeps auditor stages
  read-only by construction *and* guarantees the Common Reporting Contract — the
  script always dispatches the recorder, so logging can't be skipped.
- `resumeFromRunId` provides real resume; the engine lock in `loop-state.json`
  ensures resume picks the same engine.

Chosen over inline construction because a stored script is reproducible,
inspectable, copy-paste-simple (BA-audience value), and can be improved over time —
the same property the Python orchestrator already has.

---

## Decision 5 — Common Reporting Contract (mode-independent, hard requirement)

Every mode (A, B, C) writes the **same durable artifacts in the same format**:

- `tools/audit/audit-log.jsonl` — one JSON line per stage (existing schema).
- `tools/audit/loop-state.json` — per-document state **plus the engine lock**.
- `index.md` — grid + meta-audit footer + retroactive footer.
- `tools/audit/meta-audit-report.md` (+ `.json`).
- per-run snapshot — Mode B keeps `runs/<id>/`; Modes A/C reuse the workflow
  transcript directory and reference it from the log.

This makes runs comparable line-for-line across engines — directly enabling the
"did the cross-vendor audit catch more?" comparison the whole feature exists for.

In Modes A/C the artifacts are written by a write-scoped **recorder agent** (the
Workflow script has no filesystem access of its own); in Mode B the Python
orchestrator writes them directly. Either way the format is identical.

Modes A/C additionally get the live `/workflows` progress tree. That is a bonus, not
part of the contract; the *durable* reports are identical across modes.

---

## Decision 6 — Meta-audit uses AskUserQuestion

The meta-audit stays the mandatory, interactive, human+AI phase. Its human-decision
step changes from free-form chat to **`AskUserQuestion`**: each finding is presented
as a structured choice — Accept recommendation / Pick the other side / Dismiss as
intentional. Large document sets still fan out via parallel agents for the analysis,
followed by a single cross-document consistency pass. Engine-agnostic.

---

## Files changed

| File | Change |
|---|---|
| `skills/audit-pipeline-setup/SKILL.md` | Generate mode-agnostic assets; add model-assignment layer; document 3 modes; generate the Mode A workflow script; verification rules for model assignment |
| `skills/audit-pipeline-run/SKILL.md` | Add up-front mode-selection step (investigate → value-review → select → lock); Mode A recipe; clarify Mode B; add Mode C; reporting contract; meta-audit via AskUserQuestion; move Windows-CLI troubleshooting under Mode B only |
| `skills/audit-pipeline-setup/PATTERN.md` | Native-capability mapping; model-assignment layer; mode comparison; consistency-lock principle; reporting contract |
| `skills/audit-pipeline-setup/domain-config.template.yaml` + `examples/*.yaml` | Add `role_model`, `stage_model_overrides`, and a mode/engine note |
| `skills/audit-pipeline-setup/reference/runbooks/audit-workflow.js` | **New** — reference Mode A Workflow script implementing S1–S5 + recorder-based reporting contract (S6–S8 reuse the same pattern and are a follow-on) |
| `skills/audit-pipeline-setup/reference/runbooks/_agent-permissions.yaml` | Add model assignments |
| `README.md` | Document the three modes + selection/lock model |

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Mode C cross-vendor hop is fragile (loses native structured output; agent must parse other-vendor text) | Label experimental; build last; confine the hop to the audit stage only; keep Mode B as the robust cross-vendor fallback |
| Reporting contract drifts between modes | Make it a hard requirement with a shared schema; verification checklist confirms all artifacts present per mode |
| Generated Workflow script falls out of sync with config | Setup regenerates it from config; verification step checks path constants + model assignments match |
| User expects cross-vendor from Mode A | Value-review + docs state explicitly that A is single-vendor (Claude-family only); cross-vendor needs B or C |
| Auditor assigned to a weak tier | Setup forbids Haiku for judgment-bearing audit; verification flags it |

---

## Open questions

None. All four design questions resolved during brainstorming:
1. Role model → 2 roles + model-assignment layer.
2. Mode timing → up-front, AI-informed, human-approved, locked for lifetime.
3. Mode count → all three (A, B, C), built in order, C audit-hop experimental.
4. Mode A form → concrete generated Workflow script.
