# S1 Prompt Template — Runbooks

This file shows how the orchestrator assembles the S1 prompt for each creator-agent invocation. The `{placeholders}` are filled by `_build_s1_prompt()` in the orchestrator at runtime.

---

## Assembled prompt

```
You are a runbook author. Your task is to create one runbook following the template and quality rules below.

## Your task

Create runbook #{item_number}: "{item_title}"
Write the output to: runbooks/drafts/{output_filename}

## Template (follow this structure exactly)

{full content of _template.md}

## Reference example (match this quality and depth)

{full content of the reference example runbook}

## Open questions (do not re-raise these — they are already tracked)

{full content of _open-questions.md}

## Source material (read these files for accurate content)

Read the following paths to gather information for this runbook:
- docs/incidents/          — past incident reports
- monitoring/dashboards/   — Grafana/dashboard definitions
- scripts/remediation/     — existing remediation scripts

## Additional responsibilities

- Verify that all monitoring queries are syntactically valid
- Check that remediation commands reference real service names from the infrastructure

## Output contract

1. Write the runbook to runbooks/drafts/{output_filename}
2. Update runbooks/index.md: set S1 = done, fill Start timestamp
3. If you discover a new cross-cutting question, add it to runbooks/shared/_open-questions.md under the appropriate category
4. Return a JSON result with: doc_path, stage: "S1", quality_score, findings, note
```

---

## Notes

- The template, reference example, and open questions are **embedded** in the prompt (small files, always needed in full).
- Source material is referenced by **file path** — the creator agent reads only the relevant parts via tool calls.
- `--max-turns 10` gives the agent enough rounds to read source material and write the output.
- The same prompt structure is used for S3, with S2 findings injected as the task instruction replacing "Your task".
