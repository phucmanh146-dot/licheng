# C captain demo

Run from `learning-agent`: `python -X utf8 captain_demo.py`.

Uses the existing integration test fixtures (test_general_loop and test_captain_review_gates), not a new production engine. The model boundary and every role action are SIMULATED. Actual uploaded bytes, citations, B rules, state gates and SQLite are exercised. A new run directory and database are created each time; normal application data is not used.

Open the printed run directory's index.html. Expand steps to inspect 14 events/checks, rejected writes, pending_review, receipt replay, protected completed tasks and state reread. trace.json contains source SHA256s; V1/V2/diff and demo.sqlite3 are included. No real model, human V2, independent human review, user effect or deployment is claimed. Fixture submit/review roles are not human identity evidence.

Full audit: docs/captain-audit-2026-10-27.md. One-page pack: docs/captain-one-page-evidence-2026-10-27.md.

Runtime mode=live enables existing actual-byte gates; top-level trace/page is SIMULATED and live_verified=false. Run without Python optimization (-O), since assertions are acceptance checks. Dependencies are the existing learning-agent environment; this demo adds no dependency.

Update 2026-10-27: controlled fixtures now register a separate reviewer role; the new production gate rejects executor IDs at receipt and confirmation. Both roles remain scripted, so this is still not a real independent human review. See docs/captain-progress-and-member-acceptance-2026-10-27.md.
