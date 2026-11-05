# A/B/C Cloud Execution Lease Hardening — 2026-11-05

## Scope
Incremental hardening on `captain/unified-closed-loop-20261105`. No branch merge, production deploy, database reset, or user-data migration.

## A/B/C responsibility contract
- A: grounded diagnosis and independent review. Every Gap must remain tied to the exact artifact version, source, locator, and quote. Unknown/blocked evidence cannot be promoted by B.
- B: concrete, source-bound action cards and remaining-only replanning. A proposal is not execution; user/member work requires a real artifact and independent review.
- C: owns the project/version ledger, durable queue, event routing, authorization, leases, checkpoints, recovery, and final state transitions. C does not replace A's semantic review or B's action design.

## Change made
The ChatGPT execution bridge previously granted a fixed 300-second claim lease but exposed no lease-renewal operation. A legitimate long-running task could therefore lose its claim before submitting its execution receipt. The old claim token correctly prevented stale completion, but there was no safe way for the same live worker to keep ownership.

Added:
- `cloud_hub.heartbeat_task(task_id, {claim_token})`: renews the lease for 300 seconds only when the task is still claimed, the token matches, and the existing lease has not expired.
- `POST /api/v1/hub/tasks/{task_id}/heartbeat`: authenticated ChatGPT Action endpoint.
- OpenAPI operation `renewAgentTaskLease`.
- Regression tests for valid renewal, wrong-token rejection, and expired-lease rejection.

The heartbeat never marks a task complete. Completion still requires a separate execution receipt and the existing evidence/human-review gate.

## Validation
- Baseline before change: 415 Python unittest cases passed.
- Focused Cloud Hub suite after change: 9 tests passed.
- Full regression after change: see terminal result recorded for this revision.
- Live deployment / Railway worker / browser extension end-to-end: NOT_RUN in this local change; do not label as production verified.

## Remaining engineering priorities
1. Connect the ChatGPT bridge task to a project/task/checkpoint reference in the same canonical project ledger when a task is project-bound; keep unbound inbox tasks explicit instead of silently creating duplicate project work.
2. Add a durable wake/scheduler worker for queued events and timer wakeups in the production deployment; distinguish enqueue success from actual worker execution.
3. Add lease heartbeat/expiry observability, retry/dead-letter state, and cancellation fencing for every execution adapter, not just the Cloud Hub bridge.
4. Add contract tests spanning A diagnosis → C evidence gate → B proposal → C apply → human execution → independent review → remaining-only replan.
5. Verify deployed configuration for BGE-M3, Qdrant, BM25/RRF, reranker, OCR, object storage, Redis, and real model traces. Configuration presence is not a live quality result.

## Safety boundary
No production data was changed. No user-facing message, email, publication, payment, deletion, or deployment was performed. No secret values were read or written.
