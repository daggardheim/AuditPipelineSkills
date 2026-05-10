---
name: audit-pipeline-setup
description: Set up a new AI-driven document audit pipeline for any document type. Adaptive AI-assisted setup — explores the project, recommends configuration, and handles users from "I have 40 docs that need quality control" to "here's my domain config." Triggers on "set up audit pipeline", "create quality process", "audit pipeline for [domain]", or "apply the staged audit pattern to [domain]". Companion skill to audit-pipeline-run (which executes the pipeline).
---

# Set Up a Staged Document Audit Pipeline

Create a new 5-stage AI-driven document audit pipeline for a document type. The pipeline uses two agent roles: a **creator** (S1, S3) that produces and rewrites documents in fresh context windows, and an **auditor** (S2, S4, S5) that reviews, confirms, and propagates governance learnings — also in fresh context windows.

## When to use this skill

- You have 10+ structured documents that should follow the same quality rules
- You want systematic, machine-verifiable quality — not just "looks good to me"
- You want the pipeline to learn from its own findings and improve the template over time
- You're applying this pattern to a new domain (API specs, runbooks, KB articles, investigations, etc.)

## When NOT to use this skill

- Fewer than 5 documents (just review them manually)
- Documents have no shared structure (no template to audit against)
- Quality is purely subjective and can't be expressed as concrete rules

## Reference implementation

The pattern was extracted from the SalesOrderIntegrationTests project, which created and audited 54 test-scenario documents. That project is the working reference:

```
C:\Users\dag.gardheim\SpecialProjects\SalesOrderIntegrationTests\
```

## How setup works — adaptive, not rigid

This skill does NOT follow a rigid step-by-step checklist. Instead, it adapts to the user's readiness level:

- **Explore first** — read the project directory, examine existing documents, understand structure before asking anything
- **Recommend, don't interrogate** — "based on your project, I recommend X because Y" rather than "which option do you want?"
- **Fill gaps through conversation** — if there's no template, help create one. If items are too complex, help decompose them. If there's no reference example, help create the first one.
- **Meet the user where they are** — a user with a complete domain config gets validation and proceeds quickly. A user who says "I have 40 docs" gets guided from scratch.

## The single prerequisite — gate check

Before any setup work, verify this one hard requirement:

**A shared template must exist or be creatable.** The documents must follow a common structure with repeatable sections. If every document is fundamentally unique with no shared pattern, the pipeline has nothing to automate — stop here.

Check this by exploring the project. Look for:
- An existing template file
- Multiple documents that follow a visible common structure
- The user's description of what their documents look like

If the prerequisite is met (or can be met with help), proceed. Everything else is a setup task, not a prerequisite.

## Setup flow

### 1. Read the pattern

Read the architecture document to understand the 5-stage model:

```
<skill-dir>/PATTERN.md
```

Key concepts:
- **Two agent roles** — Creator (S1, S3) and Auditor (S2, S4, S5), configured independently
- **Process vs. policy separation** — stages, state tracking, and governance are reusable; template rules and audit objectives are domain-specific
- **Fresh context per stage** — every stage gets a fresh agent invocation
- **S2/S4 are read-only** (audit/confirm). **S1/S3/S5 have write access** (create/rewrite/propagate).
- **S3 uses creator agent** — rewrites need source material access to verify facts, not just fix prose.

### 2. Explore the project

Before asking the user any questions, explore:
- What's in the project directory?
- Are there existing documents? How many? What structure do they follow?
- Is there already a template or style guide?
- Are there completed examples that could serve as reference documents?
- What source material exists (code, specs, tickets, docs)?

Use what you find to inform your recommendations in the next steps.

### 3. Configure the two roles

Present the default role definitions, then ask if they match the project:

**Creator agent (S1, S3) — default responsibilities:**
- S1: Reads source material (code, docs, tickets) via file paths, writes one document per task following the template, updates the index grid
- S3: Rewrites the document to fix S2's findings, verifying accuracy against source material (same access as S1)

**Auditor agent (S2, S4, S5) — default responsibilities:**
- S2: Broad first-pass audit (read-only)
- S4: Narrow acceptance check on S3 changes (read-only)
- S5: Governance propagation to shared files (write access to template, open questions, example prompt)

Ask: **"Does this match your project, or would you add anything to either role?"**

Users can add responsibilities (e.g., "the creator should also check Confluence for prior art"). They cannot remove core stage mechanics or reorder stages — the 5-stage sequence is non-negotiable architecture.

### 4. Select agents

Recommend agents based on what you found during project exploration:

- **Claude Code** (`claude -p`) — recommended for most setups. One tool, strong file exploration.
- **Codex** (`codex exec`) — when OS-level sandbox enforcement is preferred for auditing.

The creator and auditor can use the same agent or different agents. Common combinations:
- Claude (creator) + Claude (auditor) — simplest
- Claude (creator) + Codex (auditor) — sandbox enforcement for audit stages

### 5. Design the S1 prompt

This is unique to the creator role. Work through these with the user:

1. **Source material paths** — which files/directories does the creator need to read? (code, docs, API specs, tickets)
2. **Reference example** — identify one completed document to embed as a quality target. If none exists, help the user create the first one manually.
3. **Role additions** — any domain-specific creator responsibilities from step 3.
4. **Max-turns** — how many tool-call rounds the creator agent needs. Default 10 for source code exploration; lower for simpler domains.

### 6. Fill in the domain config

Check the examples folder for a pre-filled config matching the domain:

```
<skill-dir>/examples/
  api-specifications.yaml
  runbooks.yaml
  problem-case-investigations.yaml
  knowledge-base-articles.yaml
```

If none match, start from the blank template:

```
<skill-dir>/domain-config.template.yaml
```

Work through the remaining sections conversationally:
1. **Identity** — domain name, document noun
2. **Paths** — where documents live, where governance files go
3. **Audit persona** — what role the auditor plays, what it optimizes for
4. **Red flags** — 3-7 concrete anti-patterns the auditor rejects on sight
5. **Template sections** — required structure of every document
6. **Quality rules** — mandatory rules the auditor checks (imperative, mechanically verifiable)
7. **Question categories** — types of open questions (single-letter IDs)
8. **Example findings** — concrete good and bad findings that teach the auditor
9. **S5 governance targets** — which shared files S5 can update and when
10. **Coverage checklist** — quality self-check items

### 7. Generate pipeline files

From the completed config, generate the actual files:

| Config section | Creates |
|---------------|---------|
| `required_sections` + `quality_rules` + `coverage_checklist` | `_template.md` |
| `question_categories` | `_open-questions.md` |
| `audit_role` + `red_flags` + example findings | `_example-prompt.md` |
| Pipeline instructions (standard) | `_pipeline.md` |
| S1 prompt template (from creator config) | `_s1-prompt-template.md` |
| Runner contract (standard) | `runner-contract.txt` |
| `agents` + paths + `s5_writable_files` | `_agent-permissions.yaml` |

#### Generating `_agent-permissions.yaml`

Build the permissions file from the domain config:

1. Copy the `agents` section (creator and auditor CLI config) directly.
2. For each stage, set `allowed_tools`:
   - Read-only stages (S2, S4): `[Read, Glob]`
   - Write stages (S1, S3, S5): `[Read, Write, Edit, Glob]`
3. For each stage, build `allowed_read` from:
   - The governance file paths (`template_file`, `question_register_file`, `example_prompt_file`, `index_file`) — based on which files that stage needs
   - `agents.creator.source_material_paths` — for S1 and S3 only
   - `agents.creator.reference_example` — for S1 and S3 only
4. For each stage, build `allowed_write` from:
   - S1: `documents_dir/{document}`, `index_file`
   - S2, S4: `[]` (empty — read-only)
   - S3: current document path, `index_file`
   - S5: `s5_writable_files` entries, `index_file`
5. Use `{document}` as placeholder in paths — the orchestrator replaces it at runtime.

See the reference implementation at `reference/runbooks/_agent-permissions.yaml` for a complete example.

### 8. Set up the orchestrator

Copy `tools/audit_loop.py` and `tools/audit_stage_result.schema.json` from the reference implementation. Update:

1. Path constants — point to the new document folder
2. `_build_prompt()` — update project name in the opening line
3. Add `_build_s1_prompt()` — assembles the S1 prompt from: task identity (from index), template content, reference example content, source material paths, open questions content, role additions
4. Add `"S1"` to `VALID_STAGES`
5. Rename `_run_codex()` to `_run_agent()` — dispatch to the configured CLI command for the current role (creator for S1/S3, auditor for S2/S4/S5)
6. Update stage detection: check for S1 = `todo` before checking S2-S5 eligibility
7. Update S3 prompt assembly: `_build_s3_prompt()` — assembles a creator-style prompt with S2 findings injected as the task instruction, plus template, reference example, and source material paths

### 9. Verify

Before running, verify:
- Template rules are imperative and mechanically checkable (not vague guidance)
- Example findings are concrete (specific location, specific fix)
- Red flags are actionable (the auditor can detect them in one pass)
- S1 prompt includes template, reference example, and source material paths
- The orchestrator path constants match the actual folder structure
- All governance files are consistent with each other
- `_agent-permissions.yaml` exists and has entries for all 5 stages
- Each stage's `allowed_read` and `allowed_write` match the file scope in `_pipeline.md`
- Read-only stages (S2, S4) have `allowed_write: []` and `allowed_tools` does not include Write or Edit
- S5 `allowed_write` matches the `s5_writable_files` entries in the domain config
- Creator stages (S1, S3) include `source_material_paths` in their `allowed_read`
- The `agents` section CLI commands match the agent choices from Step 4

## Anti-patterns to avoid

These were discovered in the reference implementation's first run. Read the full list in `PATTERN.md` section "Anti-patterns and lessons learned":

- **Hardcoded sandbox** — all stages ran read-only, so S3/S5 couldn't write. Now fixed.
- **Contradictory instructions** — start prompt vs pipeline instructions disagreed. Every file must say the same thing.
- **Confidence inflation** — use `findings_resolved` as the real quality signal, not `confidence`.
- **S5 gate blocking governance** — governance propagation must always run, regardless of prior rewrites.
- **Recurring patterns never propagated** — S5 must always check for recurring patterns.
