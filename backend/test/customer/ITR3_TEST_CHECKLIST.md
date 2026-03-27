ITR3 test checklist

Test structure
- `backend/test/unit`: unit coverage for isolated grading, extraction, deadline, GPA, and rule helpers.
- `backend/test/integration`: backend integration coverage for routes and service-level story guarantees.
- `backend/test/customer`: customer/system-style end-to-end flows that drive the public API through realistic story paths.

Story coverage
- Story 1, returning-user resume: `backend/test/integration/test_returning_user.py` and `backend/test/customer/test_itr3_customer_flows.py::test_customer_resume_flow_restores_targets_across_relogin_and_refresh`
- Story 2, hierarchical analytics: `backend/test/integration/test_hierarchical_analytics.py` and `backend/test/customer/test_itr3_customer_flows.py::test_customer_hierarchical_flow_keeps_parent_incomplete_and_supports_child_planning`
- Story 3, advanced grading rules: `backend/test/integration/test_advanced_rules.py` and `backend/test/customer/test_itr3_customer_flows.py::test_customer_advanced_rules_flow_respects_mandatory_pass_and_capped_bonus`
- Story 4, scenario safety and deadline assistant: `backend/test/integration/test_scenarios_endpoints.py`, `backend/test/integration/test_deadline_endpoints.py`, and `backend/test/customer/test_itr3_customer_flows.py::test_customer_scenario_and_deadline_flow_stays_read_only_and_exports_supported_path`
- Story 5, weekly planner and conflict detection: `backend/test/integration/test_planning_endpoints.py` and `backend/test/customer/test_itr3_customer_flows.py::test_customer_weekly_planner_flow_shows_multicourse_conflicts_and_mapping`
- Story 6, risk and alert center: `backend/test/integration/test_planning_endpoints.py` and `backend/test/customer/test_itr3_customer_flows.py::test_customer_risk_alert_flow_ranks_cross_course_alerts_honestly`

Release and demo checklist
- Run unit, integration, and customer tests from `backend/test`.
- Confirm the customer tests pass before demoing the six ITR3 stories.
- Use the customer tests as the supported demo path reference when validating final behavior.
