# ADR 0002: Charges come from a deterministic rating engine, never from the LLM

- Status: Accepted
- Date: 2026-10-14

## Context

BillWise has to explain and correct bills. LLMs are unreliable at arithmetic, and a wrong number on a bill costs money and trust. Agents also need a way to check whether a bill is wrong, not only to describe it.

## Decision

- One rating engine (`src/rating/engine.js`) produces every bill line: prorated recurring charges, promotions, data overage, roaming day passes and tax.
- The generator uses the same engine to create the bills, and `POST /sandbox/rating/recalculate` exposes it to agents as a tool. It returns the re-rated lines and the discrepancy against what was billed.
- Money is integer cents end to end. Rounding is half away from zero and happens once per line. Decimals appear only at the TMF API boundary.

## Consequences

- An agent's job becomes retrieval and explanation: call the tools, cite the lines, pick the policy. The numbers it quotes are always computed.
- A billing defect is detectable mechanically: re-rate and compare. The duplicate-charge anomaly exists to exercise exactly this.
- The engine's rules are simplified (one tax per bill, overage measured against the plan active at cycle end). These rules are documented in code and pinned by unit tests.
