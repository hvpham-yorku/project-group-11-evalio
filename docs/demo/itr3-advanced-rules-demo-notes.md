# ITR3-3 Demo Notes — Advanced Grading Rules (Supported Only)

## Goal
Demo only the supported advanced-rule behavior:
- Mandatory pass (required threshold)
- Controlled bonus behavior (additive or capped)

Avoid claiming support for unsupported/ambiguous rule semantics.

---

## Supported Rule 1 — Mandatory Pass Demo (Recommended Primary Demo)

### Setup
Create a course with:
- Assignments (50%)
- Final Exam (50%) with:
  - rule_type: "mandatory_pass"
  - rule_config: { "pass_threshold": 50 }

### Steps
1) Create course structure with Final marked mandatory pass (≥50%).
2) Enter grades:
   - Assignments: 100%
   - Final Exam: 40%
3) Show outcomes:
   - Mandatory pass status becomes failed
   - Planning views do not pretend targets are achievable if mandatory pass is failed
   - GPA/letter grade displays do not show misleading “good” results when course is failed

### Talking Points (Truthful)
- “Mandatory pass is a rule constraint on eligibility; failing it makes the course considered failed for planning outputs.”
- “We still compute weighted totals deterministically, but we also provide rule-aware status so the UI doesn’t mislead.”

---

## Supported Rule 2 — Controlled Bonus Demo (Optional / Only if configured)

### Setup (only if bonus policy is configured)
Create a course with:
- Core assessments sum to 100% non-bonus
- A bonus assessment marked is_bonus: true
- Course bonus policy set to either:
  - bonus_policy: "additive" (final = core + bonus), OR
  - bonus_policy: "capped" with bonus_cap_percentage (final is capped)

### Steps
1) Create course with one bonus assessment (extra credit).
2) Enter a positive bonus grade.
3) Show:
   - Core vs Bonus totals
   - Final grade changes only under additive/capped policy
   - If capped, final grade never exceeds the configured cap

### Talking Points (Truthful)
- “Bonus is tracked separately from core grade.”
- “The final grade treatment is explicitly controlled by bonus policy (none/additive/capped).”
- “We do not claim support for arbitrary bonus semantics—only the controlled model we implemented.”

---

## Explicit Non-Claims (What we do NOT say in demo)
- We do NOT claim support for every institutional grading policy.
- We do NOT claim arbitrary rule scripting.
- We do NOT claim AI can infer unclear rule semantics reliably.
- We do NOT claim unsupported rules are handled (they are rejected or treated as unsupported).

---

## Quick Checklist Before Demo
- [ ] Mandatory pass flow works and is visible
- [ ] Failing mandatory pass is reflected in feasibility/GPA outputs (not misleading)
- [ ] Bonus demo only shown if bonus policy is configured in the course
- [ ] Tests passing for mandatory pass + bonus (if demoed)