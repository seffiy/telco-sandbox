# ADR 0001: Model the BSS on TM Forum Open APIs

- Status: Accepted
- Date: 2026-10-14

## Context

BillWise, PartnerPilot and RetainIQ all need customers, products, usage and bills. A home-grown schema would be quicker to write, but every project would then teach its agents a shape no real operator uses.

## Decision

Expose a v4 subset of five TM Forum Open APIs, at their standard paths:

| API | Resource(s) |
| --- | --- |
| TMF620 Product Catalog | `productOffering` |
| TMF629 Customer | `customer` |
| TMF637 Product Inventory | `product` |
| TMF635 Usage | `usage` |
| TMF678 Customer Bill | `customerBill`, `appliedCustomerBillingRate` |

List endpoints follow TMF630 conventions: `offset`/`limit`, `?fields=` projection, `X-Total-Count` and `X-Result-Count` headers, and filters such as `relatedParty.id` and `usageDate.gte`.

## Consequences

- Agent tools written against the sandbox port to a TMF-compliant BSS with little change. This is the interview point: the integration contract is the industry one, not mine.
- It is a subset, not a conformance-tested implementation. Read-only, no `POST`/`PATCH` on BSS resources, no hub/notification endpoints.
- Known deviations, kept for simplicity:
  - Sales tax is returned as its own `appliedCustomerBillingRate` line (`type: tax`) as well as in `customerBill.taxItem`, so an agent can cite it like any other line.
  - `usage` lists require `relatedParty.id`; the full collection is too large to page usefully.
  - Partial pages return `200`, not `206`.
