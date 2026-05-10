# Runbook: <Title>

> Status: todo | in-progress | done
> Last touched: YYYY-MM-DD
> Alert: <alert name that triggers this runbook>

---

## How to use this template

Copy this file to `<NN>-<kebab-title>.md` and fill in every section. Keep the final runbook precise, concrete, and executable at 3am. The audience is a sleep-deprived engineer who should not need to make judgment calls, search for information, or have tribal knowledge.

A good runbook has:

- one trigger condition per runbook
- exact commands with the host they run on
- expected output for both "problem confirmed" and "problem not present" on every diagnostic step
- time estimates on every remediation step
- a tested rollback procedure
- copy-pasteable monitoring queries
- no assumed knowledge — if a step needs access, say where to get it
- no "restart the service" without the exact systemd unit, container name, or ECS task
- no "check the dashboard" without the exact URL, metric name, and threshold
- no "ask the team" without the team name, Slack channel, and PagerDuty service
- any unresolved question tracked in `_open-questions.md`

If a section does not apply, write `N/A` with a one-line reason.

---

## 1. Trigger condition

What alert, symptom, or customer report triggers this runbook.

- **Alert name:** (exact alert name as it appears in PagerDuty/OpsGenie)
- **Metric:** (what is being measured)
- **Threshold:** (what value triggers the alert)
- **Example notification:** (paste an example alert message)

---

## 2. Affected systems

Which services, databases, queues, or external dependencies are involved.

- Service(s):
- Database(s):
- Queue(s):
- External dependencies:
- Downstream impact:

---

## 3. Prerequisites

Access requirements, tools, VPN, credentials needed before starting.

Rules for this section:

- List every access requirement. If a step later requires something not listed here, move it here.
- Include the access request URL or contact for each requirement.
- Include expected turnaround time for access requests.

| Requirement | How to get it | Turnaround |
|-------------|--------------|------------|
| VPN access | connect.internal/vpn | immediate |
| Production DB read access | access.internal/request?system=prod-db&role=readonly | ~2 hours |

---

## 4. Diagnostic steps

Ordered steps to confirm the problem. Every step must include expected output for both outcomes.

### Step 1: <description>

**Run on:** <exact host or context>

```
<exact command>
```

**If problem confirmed:** <what the output looks like>
**If problem not present:** <what the output looks like>
**Next:** proceed to Step 2 / stop (false alarm)

### Step 2: <description>

(repeat pattern)

---

## 5. Remediation steps

Ordered steps to fix the problem. Every step must include the exact command, which host to run it on, a time estimate, and verification.

### Step 1: <description>

**Run on:** <exact host or context>
**Time estimate:** <X minutes>

```
<exact command>
```

**Verify:** <how to confirm this step worked>

### Step 2: <description>

(repeat pattern)

---

## 6. Rollback procedure

How to undo the remediation if it makes things worse. This procedure must be tested.

### Rollback Step 1: <description>

**Run on:** <exact host or context>

```
<exact command>
```

**Verify rollback:** <how to confirm the rollback worked>

---

## 7. Escalation path

When to escalate, to whom, which channel, what information to include.

| Condition | Escalate to | Channel | PagerDuty service | Include |
|-----------|------------|---------|-------------------|---------|
| Remediation fails after 2 attempts | Platform team | #platform-oncall | platform-critical | Alert link, diagnostic output, steps tried |
| Customer impact confirmed | Incident commander | #incidents | incident-management | Blast radius, ETA, customer IDs |

---

## 8. Monitoring queries

Exact queries or dashboard links to confirm the issue is resolved. All queries must be copy-pasteable.

### Primary metric

**Dashboard:** <exact URL>
**Query:**

```
<exact query>
```

**Expected after fix:** <what the metric should show>
**Wait time:** <how long to monitor before declaring success>

---

## Coverage checklist

Before marking this runbook as done, verify:

- [ ] Trigger condition is specific and includes alert name/metric/threshold
- [ ] All access requirements listed in prerequisites
- [ ] Every diagnostic step has expected output for both outcomes
- [ ] Every remediation step has an exact command and time estimate
- [ ] Rollback procedure is documented and tested
- [ ] Escalation path includes team, channel, and required context
- [ ] Post-resolution monitoring queries are copy-pasteable

---

## Open questions

List question IDs from `_open-questions.md` that affect this runbook.

| ID | Summary | Impact |
|----|---------|--------|
