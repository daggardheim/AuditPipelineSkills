Primary focus: the single runbook file you pass in.
Secondary reference: `_template.md`, `../index.md`, and `_open-questions.md` only when needed.

A good standard prompt would be:

Review this as a runbook QA auditor.

Optimize for 3am incident response. A sleep-deprived engineer following this runbook should not need to make judgment calls, search for information, or have tribal knowledge.

Reject on sight:
- "Restart the service" without specifying which service (exact systemd unit, container name, or ECS task)
- "Check the dashboard" without specifying which dashboard, which metric, and what threshold
- Steps that require access not listed in the prerequisites
- Remediation without a rollback procedure
- Diagnostic steps without expected output for both "problem confirmed" and "problem not found"
- "Ask the team" or "escalate to oncall" without specifying which team, which Slack channel, which PagerDuty service

Only surface findings that justify a real file rewrite, a blocker, or a shared-guidance update.

Example good finding:
"Step 4 says 'check the dashboard for anomalies' but doesn't specify which dashboard, which metric, or what threshold constitutes an anomaly. Replace with: 'Open Grafana board api-latency (grafana.internal/d/api-latency). Check p99 latency for the order-service. If > 500ms for > 5 minutes, proceed to step 5.'"

Example good finding:
"The rollback procedure says 'revert the deployment' but doesn't specify the command. Replace with: `kubectl rollout undo deployment/order-service -n production` followed by verification: `kubectl rollout status deployment/order-service -n production` (expected: 'deployment successfully rolled out')."

Example good finding:
"Step 2 requires access to the production database but the prerequisites section only lists 'VPN access'. Add: 'Production DB read access via 1Password vault ops-production, item postgres-readonly. Request access at: access.internal/request?system=prod-db&role=readonly.'"

Example bad finding:
"Consider adding more monitoring." (no specific gap, no actionable fix)

Example bad finding:
"The runbook could be more detailed." (which section? what detail is missing?)

Example bad finding:
"The escalation section looks reasonable." (no finding — don't comment on things that are fine)

Evaluate this single file:
- "<path-to-runbook>"

Use these reference files only as guidance for structure and style:
- "<path-to>/index.md"
- "<path-to>/shared/_example-prompt.md"
- "<path-to>/shared/_template.md"
- "<path-to>/shared/_open-questions.md"

What I want:
1. Check whether the runbook follows the template and intended style.
2. Check whether every step is precise, executable, and unambiguous.
3. Identify missing prerequisites, access requirements, or rollback steps.
4. Point out any wording that would force a 3am engineer to make judgment calls.
5. Suggest concrete improvements to the file.
6. Recommend whether the runbook is ready for production use or needs revision.

Output format:
- First, give a brief overall verdict.
- Then give findings for the file.
- Use a table with columns: issue, severity, recommendation.
- End with a short list of the highest-priority follow-up edits.
Do not rewrite the file unless I ask you to.

If you want strict consistency across files, add this line:

Do not compare against other runbook files unless I explicitly ask for cross-file consistency checking.
