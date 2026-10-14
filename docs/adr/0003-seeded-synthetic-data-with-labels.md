# ADR 0003: Seeded synthetic data with planted, labeled anomalies

- Status: Accepted
- Date: 2026-10-14

## Context

The three projects must be testable: "the agent found the root cause" needs a right answer to compare with. Real operator data cannot be used, and I won't use any employer data, names or system details.

## Decision

- Generate everything from a seed (default 42, 1,000 subscribers, cycles 2026-07 to 2026-09). Same seed and size always gives byte-identical data. The data is generated in memory at startup, and `npm run generate` exports it to `data/generated/` (git-ignored, about 27 MB).
- Plant at most one bill-shock cause per customer and label it: mid-cycle plan change, expired promo, roaming day pass, data overage, duplicate recurring charge (the only true billing error), and a regional tax increase.
- Every other customer's bill is identical across cycles, so any change is attributable to its label.
- Each label records the bill, the previous bill, the delta, the evidence line ids, and for billing errors the exact credit due.

## Consequences

- Downstream test suites get ground truth for free, and the sandbox's own tests prove that the labels match the bills (`test/generator.test.js`). If a change breaks a label, CI fails before any accuracy number is published.
- One cause per customer makes scoring clean but easier than reality. Multi-cause bills are on the roadmap.
- Labels are served at `/sandbox/ground-truth/anomalies` for test harnesses; set `EXPOSE_GROUND_TRUTH=false` so agents can't read the answers during demos.
