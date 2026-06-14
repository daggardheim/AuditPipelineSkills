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
      `3. In ${P.index}, for the row whose Item is "${doc}", set the column whose header starts with "${stage}" (e.g. "${stage} Creator"/"${stage} Auditor") to "done".`,
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
