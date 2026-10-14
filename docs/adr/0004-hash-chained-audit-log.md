# ADR 0004: A shared, hash-chained audit log for agent decisions

- Status: Accepted
- Date: 2026-10-14

## Context

Every agent decision must be logged with its tool calls, the data used and the policy applied. All three projects need this, and the question an interviewer asks is "how would this pass compliance?"

## Decision

- The sandbox hosts the audit log: `POST /sandbox/audit/events`, `GET /sandbox/audit/events`, `GET /sandbox/audit/verify`.
- Each entry stores `actor`, `action`, `correlationId`, `toolCalls`, `dataRefs`, `policy`, `decision` and `rationale`, plus a SHA-256 hash of itself and of the previous entry. Storage is append-only JSON Lines.
- `verify` recomputes the chain and reports the first broken entry.

## Consequences

- Editing or deleting any past decision is detectable. That is tamper evidence, not tamper proofing: someone with file access can rewrite the whole chain. A production system would anchor the head hash externally or use WORM storage.
- One log across projects keeps the schema consistent, at the cost of coupling each project to the sandbox at runtime. Each project's orchestrator can wrap it behind its own interface.
- No PII is logged by design: entries reference ids (`dataRefs`), not customer details.
