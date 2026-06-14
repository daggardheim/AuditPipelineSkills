# Multi-pipeline AuditPipelineSkills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AuditPipelineSkills offer three locked-at-start execution engines (A native Workflow, B CLI cross-vendor, C hybrid) with an up-front AI value review, a model-assignment layer, and a mode-independent reporting contract.

**Architecture:** Two skills generate/run pipelines in other projects. We add: a model-assignment layer in the domain config + permissions file; a new generated Mode A `Workflow` script that uses subagents (`Explore` for read-only audits, writing agents for create/rewrite) with schema-validated output and a write-scoped *recorder* agent for the reporting contract; an up-front mode-selection step in the run skill; and `AskUserQuestion` for meta-audit decisions. The S1–S8 stage sequence and Mode B (`audit_loop.py`) are unchanged.

**Tech Stack:** Markdown skills, YAML config, one JavaScript `Workflow` script. No unit-test framework in this repo — "verification" means presence/consistency checks (`grep`) and `node --check` for the script.

**Spec:** `docs/superpowers/specs/2026-06-14-multi-pipeline-audit-design.md`

**Commit policy:** Per the user's standing rule, commits happen only on the user's explicit go-ahead. Each task ends with a prepared commit command; run it when the user approves.

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `skills/audit-pipeline-setup/domain-config.template.yaml` | Domain config schema | Add model layer + execution-mode note |
| `skills/audit-pipeline-setup/examples/*.yaml` (4) | Pre-filled domain configs | Add model layer block |
| `skills/audit-pipeline-setup/reference/runbooks/_agent-permissions.yaml` | Per-stage tools/scope reference | Add `role_model` + `recorder` agent + `REC` stage |
| `skills/audit-pipeline-setup/PATTERN.md` | Architecture reference | Add modes, model layer, consistency lock, reporting contract, native mapping |
| `skills/audit-pipeline-setup/reference/runbooks/audit-workflow.js` | Mode A reference engine | **Create** |
| `skills/audit-pipeline-setup/SKILL.md` | Setup instructions | Add model layer, 3 modes, generate workflow script, verification |
| `skills/audit-pipeline-run/SKILL.md` | Run instructions | Add mode selection+lock, Mode A/B/C recipes, reporting contract, meta-audit AskUserQuestion, scope troubleshooting to Mode B |
| `README.md` | Repo overview | Document 3 modes + selection/lock |

Build order: shared foundations (Tasks 1–3) → Mode A engine (Task 4) → skill wiring (Tasks 5–6) → README (Task 7).

---

## Task 1: Model-assignment layer in the domain config

**Files:**
- Modify: `skills/audit-pipeline-setup/domain-config.template.yaml`
- Modify: `skills/audit-pipeline-setup/examples/api-specifications.yaml`, `runbooks.yaml`, `problem-case-investigations.yaml`, `knowledge-base-articles.yaml`

- [ ] **Step 1: Add the `role_model` field to the creator agent in the template**

In `domain-config.template.yaml`, find the creator block line:

```yaml
    cli: ""                            # "claude" (recommended) | "codex"
```

Insert directly above it:

```yaml
    role_model:                        # Which model runs this role (model-assignment layer).
      engine: "claude"                 # "claude" (native in Mode A/C, or CLI) | "codex" | other CLI vendor
      tier: "opus"                     # Claude tier: opus|sonnet|haiku. Implement role favors the STRONGEST tier.
```

- [ ] **Step 2: Add the `role_model` field to the auditor agent in the template**

Find the auditor block line:

```yaml
    cli: ""                            # "claude" | "codex"
    cli_command: ""                    # e.g., 'claude -p "{prompt}" --output-format json --max-turns 3'
                                       # e.g., 'codex exec "{prompt}"'
    max_turns: 3                       # Auditor needs fewer turns (no source material exploration).
```

Replace that block with:

```yaml
    role_model:                        # Which model audits (model-assignment layer).
      engine: "claude"                 # "claude" | "codex" | other CLI vendor. Cross-vendor pays off most HERE.
      tier: "sonnet"                   # opus|sonnet. NEVER haiku for judgment-bearing audit (mechanical checks only).
    cli: ""                            # "claude" | "codex"
    cli_command: ""                    # e.g., 'claude -p "{prompt}" --output-format json --max-turns 3'
                                       # e.g., 'codex exec "{prompt}"'
    max_turns: 3                       # Auditor needs fewer turns (no source material exploration).
```

- [ ] **Step 3: Add `stage_model_overrides` and `execution_mode` after the agents section**

Find the end of the agents section (the line `max_turns: 3` you just edited is the last line before `# ── Audit persona ──`). Insert this block between the agents section and the audit-persona section:

```yaml
# ── Stage model overrides (optional) ──────────────────────────
# Override the role_model for specific stages. Omit to use the role default.
# S5 (governance propagation) is hard reasoning — often worth opus.

stage_model_overrides:
  # S5: { engine: "claude", tier: "opus" }

# ── Execution mode ────────────────────────────────────────────
# The pipeline engine is chosen at RUN time via an AI value review and
# LOCKED for the whole run (see PATTERN.md "Execution modes").
# A = native Workflow (single-vendor Claude) | B = CLI cross-vendor | C = hybrid
# This field records a default suggestion only; the run skill still confirms.

default_execution_mode: "A"          # "A" | "B" | "C"
```

- [ ] **Step 4: Add the same model block to each example config**

For each of the four files in `skills/audit-pipeline-setup/examples/`, locate the `agents:` → `creator:` and `auditor:` blocks and add a `role_model:` entry to each (engine/tier matching that domain's recommendation), then add `default_execution_mode` near the top. Use these per-domain defaults:

- `api-specifications.yaml`: creator `{claude, opus}`, auditor `{codex, ""}` (cross-vendor — factual accuracy critical), `default_execution_mode: "B"`
- `runbooks.yaml`: creator `{claude, opus}`, auditor `{claude, sonnet}`, `default_execution_mode: "A"`
- `problem-case-investigations.yaml`: creator `{claude, opus}`, auditor `{claude, sonnet}`, `default_execution_mode: "C"`
- `knowledge-base-articles.yaml`: creator `{claude, sonnet}`, auditor `{claude, sonnet}`, `default_execution_mode: "A"`

If an example file has empty `agents:` placeholders, add the `role_model:` block with the values above so the example is concrete.

- [ ] **Step 5: Verify the fields are present**

Run: `grep -rn "role_model\|stage_model_overrides\|default_execution_mode" skills/audit-pipeline-setup/domain-config.template.yaml skills/audit-pipeline-setup/examples/`
Expected: `role_model` appears at least twice in the template (creator + auditor) and in each example; `stage_model_overrides` and `default_execution_mode` appear in the template and each example.

- [ ] **Step 6: Commit (on user go-ahead)**

```bash
git add skills/audit-pipeline-setup/domain-config.template.yaml skills/audit-pipeline-setup/examples/
git commit -m "feat(config): add model-assignment layer and execution-mode field"
```

---

## Task 2: Model assignments + recorder agent in the permissions reference

**Files:**
- Modify: `skills/audit-pipeline-setup/reference/runbooks/_agent-permissions.yaml`

- [ ] **Step 1: Add `role_model` to the agents block and define the recorder agent**

Find:

```yaml
agents:
  creator:
    cli: claude
    cli_command: 'claude -p "{prompt}" --output-format json --max-turns 10'
  auditor:
    cli: codex
    cli_command: 'codex exec "{prompt}"'
```

Replace with:

```yaml
agents:
  creator:
    cli: claude
    cli_command: 'claude -p "{prompt}" --output-format json --max-turns 10'
    role_model: { engine: claude, tier: opus }
  auditor:
    cli: codex
    cli_command: 'codex exec "{prompt}"'
    role_model: { engine: codex, tier: "" }
  # Recorder: Mode A/C only. Persists structured stage results to the reporting
  # artifacts. Write-scoped to tools/audit/** and the index — NEVER the document.
  recorder:
    cli: claude
    cli_command: 'claude -p "{prompt}" --output-format json --max-turns 3'
    role_model: { engine: claude, tier: haiku }
```

- [ ] **Step 2: Add the `REC` stage after the S8 block**

At the end of the file (after the S8 `allowed_write: []` line), append:

```yaml

  # ── Reporting recorder (Mode A/C only) ───────────────────────
  REC:
    role: recorder
    sandbox: workspace-write
    allowed_tools: [Read, Write, Edit, Glob]
    allowed_read:
      - "runbooks/index.md"
      - "tools/audit/loop-state.json"
      - "tools/audit/audit-log.jsonl"
    allowed_write:
      - "tools/audit/audit-log.jsonl"
      - "tools/audit/loop-state.json"
      - "runbooks/index.md"
```

- [ ] **Step 3: Verify**

Run: `grep -n "role_model\|recorder\|REC:" skills/audit-pipeline-setup/reference/runbooks/_agent-permissions.yaml`
Expected: `role_model` on creator, auditor, recorder; `recorder:` agent defined; `REC:` stage present.

- [ ] **Step 4: Commit (on user go-ahead)**

```bash
git add skills/audit-pipeline-setup/reference/runbooks/_agent-permissions.yaml
git commit -m "feat(perms): add role_model assignments and recorder agent for Mode A/C"
```

---

## Task 3: PATTERN.md — execution modes, model layer, consistency lock, reporting contract, native mapping

**Files:**
- Modify: `skills/audit-pipeline-setup/PATTERN.md`

- [ ] **Step 1: Add the "Native capability mapping" + "Execution modes" sections**

In `PATTERN.md`, find the section header:

```markdown
## The process/policy separation
```

Insert the following two sections immediately ABOVE that line:

````markdown
## Native capability mapping

Claude Code now provides native primitives for much of what the Python
orchestrator does by hand. The pipeline can run on either.

| Hand-rolled (`audit_loop.py`) | Native (Mode A/C) |
|---|---|
| Stage-progression loop | `Workflow` tool `pipeline()` |
| Shell `claude -p` / `codex exec` per stage | `agent()` call |
| "Fresh context per stage" | every `agent()` is fresh context by default |
| `audit_stage_result.schema.json` + manual parse | `agent(prompt, {schema})` validated, auto-retried |
| `_agent-permissions.yaml` read-only audit stages | `agentType: 'Explore'` (read-only by construction) |
| Transient-launch retry (WinError 206/1907) | in-process agents — those CLI failures don't exist |
| "Windows prompt too long" budgeting | no CLI cmdline limit in-process |
| `loop-state.json` resume | `Workflow({scriptPath, resumeFromRunId})` |
| "one doc at a time; parallel needs locks" | `parallel()`/`pipeline()` concurrent, safe-capped |
| Manual token logging | `budget` (spent/remaining) |
| Meta-audit free-text decisions | `AskUserQuestion` structured choices |

Caveat: the `Workflow`/`Agent` model override is Claude-family only
(`opus|sonnet|haiku|fable`). True cross-vendor (Codex/GPT) needs the CLI path
(Mode B) or an agent shelling out (Mode C audit hop).

## Execution modes

The pipeline runs on one of three engines. The engine is chosen at run time via
an AI value review and **locked for the whole run** (see "Consistency lock").

| | A. Workflow-native | B. CLI cross-vendor | C. Hybrid |
|---|---|---|---|
| Engine | native `Workflow` script | `audit_loop.py` | `Workflow` + cross-vendor audit |
| Creator | Claude (in-process) | Claude (CLI) | Claude (in-process) |
| Auditor | Claude (in-process) | Codex (CLI) | different vendor (CLI hop) |
| Diversity source | role/context/tier | full cross-vendor | cross-vendor on audit only |
| Headless / scheduled | no | yes | no |
| Resume / structured output | native | hand-rolled | native (except audit hop) |
| OS-level sandbox audit | no | yes | yes (on audit) |
| Windows CLI brittleness | none | all stages | audit hop only |
| Status | proven | proven (54-doc run) | experimental audit hop |

### Model-assignment layer

Stages and roles are unchanged. Each role (and optionally each stage) gets an
explicit model assignment in the domain config and `_agent-permissions.yaml`:

```yaml
agents:
  creator: { role_model: { engine: claude, tier: opus } }   # implement: strongest tier
  auditor: { role_model: { engine: claude, tier: sonnet } }  # audit: capable, not haiku
stage_model_overrides:
  S5: { engine: claude, tier: opus }                         # propagation is hard
```

Rules:
- **Never assign the auditor to haiku** for judgment-bearing audit (mechanical
  conformance checks only).
- The implement role favors model **tier** over vendor diversity.
- Spend cross-vendor diversity on the **audit** role, where different blind spots
  pay off most.

### Consistency lock

The chosen engine is recorded in `loop-state.json` and used for the **entire
pipeline lifetime** — S1–S5 and the retroactive S6–S8. Switching engine
mid-process is forbidden: it breaks audit-standard consistency (severity
calibration, finding signatures, and `findings_resolved` only work if the same
auditor applies the same yardstick across stages, and S6 must match the original
audit calibration). The only way to change engine is a deliberate fresh full run.
The meta-audit is the one engine-agnostic phase — it is human-driven analysis, not
an engine.

### Choosing a mode (value review)

Before a run, investigate the document set and score each mode High/Medium/Low
value for *this set*:

- **Mode B / full cross-vendor — High** when: high-stakes / compliance /
  external-facing docs; factual accuracy critical; same-model audits distrusted;
  headless/unattended runs; OS-level sandbox wanted.
- **Mode A / native — High** when: fast interactive iteration; native
  resume/structured output/live progress wanted; setup simplicity; moderate
  stakes; smaller sets; cost-sensitive.
- **Mode C / hybrid — High** when: want A's ergonomics *and* an independent
  auditor; medium-high stakes; willing to accept the experimental audit hop.

### Common reporting contract (mode-independent)

Every mode writes the same durable artifacts in the same format:

- `tools/audit/audit-log.jsonl` — one JSON line per stage
- `tools/audit/loop-state.json` — per-document state + the engine lock
- `index.md` — grid + meta-audit footer + retroactive footer
- `tools/audit/meta-audit-report.md` (+ `.json`)
- per-run snapshot — Mode B keeps `runs/<id>/`; Modes A/C reuse the workflow
  transcript dir and reference it from the log

In Mode B the Python orchestrator writes these directly. In Modes A/C a
write-scoped **recorder agent** writes them (the Workflow script has no
filesystem access of its own). Format is identical, so runs are comparable
line-for-line across engines.
````

- [ ] **Step 2: Verify**

Run: `grep -n "Execution modes\|Consistency lock\|Common reporting contract\|Native capability mapping\|recorder agent" skills/audit-pipeline-setup/PATTERN.md`
Expected: all five headings/terms present.

- [ ] **Step 3: Commit (on user go-ahead)**

```bash
git add skills/audit-pipeline-setup/PATTERN.md
git commit -m "docs(pattern): add execution modes, model layer, consistency lock, reporting contract"
```

---

## Task 4: Create the Mode A reference Workflow script

**Files:**
- Create: `skills/audit-pipeline-setup/reference/runbooks/audit-workflow.js`

- [ ] **Step 1: Write the reference workflow script**

Create `skills/audit-pipeline-setup/reference/runbooks/audit-workflow.js` with exactly this content:

```javascript
export const meta = {
  name: 'audit-pipeline-mode-a',
  description: 'Mode A — native Claude staged document audit (S1-S5) with recorder-based reporting contract',
  phases: [
    { title: 'Create' },
    { title: 'Audit' },
    { title: 'Rewrite' },
    { title: 'Confirm' },
    { title: 'Propagate' },
    { title: 'Record' },
  ],
}

// ── Inputs (pass via Workflow `args`) ────────────────────────────
// args = {
//   rows: [{ num, item, title, doc, sourcePaths: [..] }],
//   paths: { index, template, openQuestions, examplePrompt,
//            auditLog, loopState, documentsDir },
//   models: { creatorTier: 'opus', auditorTier: 'sonnet', s5Tier: 'opus' }
// }
const cfg = args || {}
const rows = cfg.rows || []
const P = cfg.paths || {}
const M = Object.assign({ creatorTier: 'opus', auditorTier: 'sonnet', s5Tier: 'opus' }, cfg.models || {})

if (!rows.length) {
  log('No rows passed in args.rows — nothing to do.')
  return { processed: 0 }
}

// Subset of audit_stage_result.schema.json that every stage returns.
const STAGE_SCHEMA = {
  type: 'object',
  required: ['doc_path', 'stage', 'findings', 'decision', 'rewrite_occurred'],
  properties: {
    doc_path: { type: 'string' },
    stage: { type: 'string', enum: ['S1', 'S2', 'S3', 'S4', 'S5'] },
    quality_score: { type: ['integer', 'null'] },
    findings: { type: 'integer', minimum: 0 },
    new_findings: { type: 'integer', minimum: 0 },
    repeated_findings: { type: 'integer', minimum: 0 },
    findings_resolved: { type: 'integer', minimum: 0 },
    confidence: { type: 'number' },
    decision: { type: 'string', enum: ['continue', 'stop', 'escalate', 'block'] },
    next_stage: { type: 'string' },
    note: { type: 'string' },
    finding_signatures: { type: 'array', items: { type: 'string' } },
    follow_up: { type: 'array', items: { type: 'string' } },
    rewrite_occurred: { type: 'boolean' },
  },
}

const gov = `Governance files:\n- template: ${P.template}\n- open-questions: ${P.openQuestions}\n- example-prompt: ${P.examplePrompt}`

// Recorder: the script has no filesystem access, so a write-scoped agent
// persists each stage result. It must NEVER edit the audited document.
async function record(stage, doc, result) {
  await agent(
    [
      `You are the pipeline RECORDER. Persist this stage result. Do NOT modify the audited document or any governance file.`,
      `1. Append ONE compact JSON line to ${P.auditLog} (create the file if missing).`,
      `2. Update ${P.loopState}: for key "${doc}", add "${stage}" to completed_stages, set quality_score, set rewrite_occurred_any if any stage rewrote, keep the "engine":"A" lock if present.`,
      `3. In ${P.index}, set the ${stage} column for the row whose Item is "${doc}" to "done".`,
      `Result JSON:\n${JSON.stringify(result)}`,
    ].join('\n'),
    { label: `record:${stage}:${doc}`, phase: 'Record', agentType: 'general-purpose', model: 'haiku' },
  )
}

async function runRow(row) {
  const doc = row.doc
  const src = (row.sourcePaths || []).join(', ') || '(none configured)'

  // S1 — create (writing agent, strongest tier)
  const s1 = await agent(
    `Create document "${doc}" (item ${row.num}: ${row.title}). Follow the template exactly; verify facts against source material; write the file to ${P.documentsDir}.\nSource material: ${src}\n${gov}\nReturn the stage result.`,
    { label: `S1:${doc}`, phase: 'Create', schema: STAGE_SCHEMA, model: M.creatorTier },
  )
  await record('S1', doc, s1)

  // S2 — audit (read-only Explore)
  const s2 = await agent(
    `Audit ${P.documentsDir}/${doc} against ${P.template} and ${P.openQuestions}. Report concrete, actionable findings with stable finding_signatures. Do not fix anything. Return the stage result.`,
    { label: `S2:${doc}`, phase: 'Audit', schema: STAGE_SCHEMA, agentType: 'Explore', model: M.auditorTier },
  )
  await record('S2', doc, s2)

  // S3 — rewrite to fix S2 findings (writing agent)
  const s3 = await agent(
    `Rewrite ${P.documentsDir}/${doc} to fix ONLY these S2 findings (verify facts against source material — do not redesign): ${JSON.stringify(s2.finding_signatures || [])}\nSource material: ${src}\n${gov}\nReturn the stage result with rewrite_occurred and findings_resolved.`,
    { label: `S3:${doc}`, phase: 'Rewrite', schema: STAGE_SCHEMA, model: M.creatorTier },
  )
  await record('S3', doc, s3)

  // S4 — narrow acceptance check on S3 changes (read-only Explore)
  const s4 = await agent(
    `Confirm that each S2 finding ${JSON.stringify(s2.finding_signatures || [])} is resolved in ${P.documentsDir}/${doc}. Check for regressions only. Do not fix anything. Return the stage result.`,
    { label: `S4:${doc}`, phase: 'Confirm', schema: STAGE_SCHEMA, agentType: 'Explore', model: M.auditorTier },
  )
  await record('S4', doc, s4)

  // S5 — governance propagation (writing agent; always runs)
  const s5 = await agent(
    `Propagate recurring patterns from ${P.documentsDir}/${doc} into governance. Always check for quality rules that recur across documents and add them to ${P.template}; record new open questions in ${P.openQuestions}. This duty runs regardless of whether S3 rewrote anything. Return the stage result.`,
    { label: `S5:${doc}`, phase: 'Propagate', schema: STAGE_SCHEMA, model: M.s5Tier },
  )
  await record('S5', doc, s5)

  return { doc, s1, s2, s3, s4, s5 }
}

// One document fully through S1-S5 before the next keeps the audit standard
// stable and token budgets predictable (matches the Python orchestrator).
const results = []
for (const row of rows) {
  log(`Row ${row.num}: ${row.doc}`)
  results.push(await runRow(row))
}

const allComplete = results.every((r) => r.s5 && r.s5.decision !== 'block')
log(`Processed ${results.length} rows. ${allComplete ? 'All S5-complete — meta-audit is the next step.' : 'Some rows need review.'}`)
return { processed: results.length, allComplete, results }
```

- [ ] **Step 2: Verify the script is syntactically valid**

Run: `node --check skills/audit-pipeline-setup/reference/runbooks/audit-workflow.js`
Expected: no output, exit code 0 (syntax OK). `node --check` validates syntax only; the `agent`/`pipeline`/`log` globals are provided by the Workflow runtime at execution time, so undefined-reference is expected and not checked here.

If `node` is not installed, skip this step and instead visually confirm the file has balanced braces and the `export const meta` header.

- [ ] **Step 3: Commit (on user go-ahead)**

```bash
git add skills/audit-pipeline-setup/reference/runbooks/audit-workflow.js
git commit -m "feat(mode-a): add reference Workflow script with recorder-based reporting"
```

---

## Task 5: Update audit-pipeline-setup SKILL.md

**Files:**
- Modify: `skills/audit-pipeline-setup/SKILL.md`

- [ ] **Step 1: Add an "Execution modes" subsection to the intro**

Find the line near the top:

```markdown
The pipeline is orchestrator-driven end to end; there is no separate spot-check mode. The pipeline is not complete until the mandatory meta-audit runs, writes a durable report, and applies the agreed fixes before completion.
```

Insert immediately after it:

```markdown

This setup is **engine-agnostic**: it generates shared governance assets plus a model-assignment layer that work with all three execution modes (A native `Workflow`, B CLI cross-vendor, C hybrid). The engine is chosen later, at run time, by `audit-pipeline-run` — and locked for the whole run. See PATTERN.md "Execution modes". Setup generates the Mode A reference workflow script alongside the Python-orchestrator assets so the user can pick either engine without redoing setup.
```

- [ ] **Step 2: Add the model-assignment step to "Configure the two roles"**

Find:

```markdown
Ask: **"Does this match your project, or would you add anything to either role?"**
```

Insert immediately after it:

```markdown

**Then assign a model to each role (model-assignment layer).** Set `role_model` for creator and auditor in the domain config:
- Creator (implement): favor the strongest tier — default `{ engine: claude, tier: opus }`. Tier matters more than vendor here.
- Auditor (audit): default `{ engine: claude, tier: sonnet }`. Spend cross-vendor diversity here if anywhere (`{ engine: codex }`). **Never assign the auditor to haiku** for judgment-bearing audit.
- Optional `stage_model_overrides` for specific stages (e.g. S5 propagation → opus).

This is independent of the execution mode: the same assignments inform Mode A (Claude tiers in-process), Mode B (CLI per role), and Mode C (in-process create + cross-vendor audit).
```

- [ ] **Step 3: Add the workflow-script generation to "Generate pipeline files"**

Find the file-generation table row:

```markdown
| `agents` + paths + `s5_writable_files` | `_agent-permissions.yaml` |
```

Insert a new row immediately after it:

```markdown
| `agents.*.role_model` + paths (Mode A) | `audit-workflow.js` (the Mode A engine) |
```

- [ ] **Step 4: Add a generation subsection for the workflow script**

Find the heading:

```markdown
### 8. Set up the orchestrator
```

Insert this subsection immediately ABOVE that heading:

```markdown
### 7c. Generate the Mode A workflow script

Copy `reference/runbooks/audit-workflow.js` into the project's `tools/` folder and adapt it from the config:

1. It reads everything from `args` (rows, paths, models) — no path constants to edit in the script body.
2. The run skill passes `args` built from `index.md` + the domain config at launch.
3. Confirm the `STAGE_SCHEMA` matches `audit_stage_result.schema.json`.
4. Confirm auditor stages use `agentType: 'Explore'` (read-only) and create/rewrite/propagate stages use a writing agent.
5. Confirm the `record()` helper writes only to `tools/audit/**` and the index — never the document.

This script is the Mode A engine. Mode B uses `audit_loop.py` (next step). Mode C reuses this script but swaps the S2/S4/S6/S8 audit `agent()` call for a cross-vendor hop (see PATTERN.md, experimental).
```

- [ ] **Step 5: Add model-layer + workflow checks to "Verify"**

Find in the Verify section:

```markdown
- The `agents` section CLI commands match the agent choices from Step 4
```

Insert immediately after it:

```markdown
- Each role has a `role_model` (engine + tier); the auditor is NOT haiku
- `default_execution_mode` is set in the domain config
- `audit-workflow.js` exists, passes `node --check`, and its auditor stages use `agentType: 'Explore'`
- The recorder scope in `_agent-permissions.yaml` (`REC` stage) writes only `tools/audit/**` and the index
```

- [ ] **Step 6: Verify**

Run: `grep -n "Execution modes\|model-assignment layer\|audit-workflow.js\|role_model\|Mode A" skills/audit-pipeline-setup/SKILL.md`
Expected: each term present at least once.

- [ ] **Step 7: Commit (on user go-ahead)**

```bash
git add skills/audit-pipeline-setup/SKILL.md
git commit -m "feat(setup): generate model layer, three modes, and Mode A workflow script"
```

---

## Task 6: Update audit-pipeline-run SKILL.md

**Files:**
- Modify: `skills/audit-pipeline-run/SKILL.md`

- [ ] **Step 1: Add the up-front mode-selection step**

Find:

```markdown
## Step 2 — Check status
```

Insert this entire section immediately ABOVE that line:

```markdown
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
```

- [ ] **Step 2: Mark the Python commands as Mode B**

Find:

```markdown
### Start/resume the loop

```
python tools/audit_loop.py run
```
```

Replace the heading line `### Start/resume the loop` with:

```markdown
### Start/resume the loop (Mode B — Python orchestrator)
```

- [ ] **Step 3: Add a reporting-contract note to Step 5**

Find:

```markdown
## Step 5 — Review results and check meta-audit readiness
```

Insert immediately after that heading line:

```markdown

> **Reporting is mode-independent.** Whichever engine ran, the durable artifacts are identical: `audit-log.jsonl`, `loop-state.json`, the `index.md` grid + footers, and the meta-audit report. In Mode A/C the recorder agent wrote them; in Mode B the Python orchestrator did. The analysis below applies to all modes. Modes A/C also expose a live `/workflows` progress tree during the run (a bonus, not part of the contract).
```

- [ ] **Step 4: Switch the meta-audit human-decision step to AskUserQuestion**

Find in Step 6e:

```markdown
**6e. Get human decisions.** For each finding, the user decides:
- Accept the recommendation
- Choose a different resolution
- Dismiss as intentional

This is why the meta-audit cannot be automated — the AI identifies the problem, but the human decides which side of an inconsistency wins.
```

Replace with:

```markdown
**6e. Get human decisions.** Present each finding with `AskUserQuestion` as a structured choice:
- Accept the recommendation (first option)
- Choose the other side of the inconsistency
- Dismiss as intentional

Batch related findings into one `AskUserQuestion` call where possible (up to 4 questions per call). This is why the meta-audit cannot be automated — the AI identifies the problem, but the human decides which side of an inconsistency wins. The structured answers become the resolution record applied in 6f.
```

- [ ] **Step 5: Scope the Windows/CLI troubleshooting to Mode B**

Find the heading:

```markdown
### Transient launch errors
```

Replace it with:

```markdown
### Transient launch errors (Mode B only)
```

Then find:

```markdown
### Windows prompt too long
```

Replace it with:

```markdown
### Windows prompt too long (Mode B only)
```

Then find:

```markdown
### Agent command not found
```

Replace it with:

```markdown
### Agent command not found (Mode B only)

> Modes A and C run agents in-process, so the Windows CLI failure modes above (transient launch errors, prompt-length limits, missing CLI) do not occur there. If you hit these in Mode A/C, you are actually invoking the Mode B Python path — check the engine lock in `loop-state.json`.
```

- [ ] **Step 6: Verify**

Run: `grep -n "Select and lock the execution mode\|Mode B — Python\|Reporting is mode-independent\|AskUserQuestion\|Mode B only" skills/audit-pipeline-run/SKILL.md`
Expected: the new section, the Mode B heading, the reporting note, AskUserQuestion in meta-audit, and the three "Mode B only" scoping markers all present.

- [ ] **Step 7: Commit (on user go-ahead)**

```bash
git add skills/audit-pipeline-run/SKILL.md
git commit -m "feat(run): add mode selection+lock, mode-scoped troubleshooting, AskUserQuestion meta-audit"
```

---

## Task 7: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an "Execution modes" section**

Find:

```markdown
## Installation
```

Insert this section immediately ABOVE that line:

```markdown
## Execution modes

The pipeline runs on one of three engines, chosen at run time via an AI value review and **locked for the whole run**:

| Mode | Engine | Model diversity | Headless | Best for |
|------|--------|-----------------|----------|----------|
| **A** | native `Workflow` (in-process Claude) | role/context/tier | no | fast interactive runs, most domains |
| **B** | `audit_loop.py` (CLI) | full cross-vendor (Claude + Codex) | yes | high-stakes / unattended / a second model family throughout |
| **C** | `Workflow` + cross-vendor audit | cross-vendor on the audit stage only | no | A's ergonomics + an independent auditor (experimental audit hop) |

A model-assignment layer (`role_model` per role, optional `stage_model_overrides`) sets which model runs each role — spend cross-vendor diversity on the audit role; never audit with haiku. All three modes write the **same durable reports** (`audit-log.jsonl`, `loop-state.json`, the index grid + footers, the meta-audit report), so runs are comparable line-for-line. See `skills/audit-pipeline-setup/PATTERN.md` for the full architecture.
```

- [ ] **Step 2: Add the workflow script to the reference-implementation table**

Find the table row:

```markdown
| `_agent-permissions.yaml` | Per-stage tool restrictions and file scope for Claude and Codex agents |
```

Insert immediately after it:

```markdown
| `audit-workflow.js` | The Mode A reference engine — native `Workflow` script (S1–S5 + recorder) |
```

- [ ] **Step 3: Verify**

Run: `grep -n "Execution modes\|audit-workflow.js\|model-assignment\|locked for the whole run" README.md`
Expected: all terms present.

- [ ] **Step 4: Commit (on user go-ahead)**

```bash
git add README.md
git commit -m "docs(readme): document three execution modes and Mode A engine"
```

---

## Final verification (after all tasks)

- [ ] **Step 1: Confirm every spec decision maps to a task**

| Spec decision | Task |
|---|---|
| 1. Model-assignment layer | 1, 2 |
| 2. Mode selection + consistency lock | 3, 6 |
| 3. Three modes | 3, 5, 6, 7 |
| 4. Mode A generated workflow script | 4, 5 |
| 5. Common reporting contract (recorder) | 2, 3, 4, 6 |
| 6. Meta-audit AskUserQuestion | 6 |

- [ ] **Step 2: Repo-wide consistency check**

Run: `grep -rn "role_model\|Execution modes\|Consistency lock\|audit-workflow.js\|recorder" skills/ README.md`
Expected: the model layer, modes, lock, workflow script, and recorder are referenced consistently across the setup skill, run skill, PATTERN.md, permissions reference, and README.

- [ ] **Step 3: Validate the workflow script once more**

Run: `node --check skills/audit-pipeline-setup/reference/runbooks/audit-workflow.js`
Expected: exit 0.
```

