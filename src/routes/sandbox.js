// Sandbox-only endpoints: deterministic rating tool, audit log, and ground truth for evaluation.
import { Router } from 'express';
import { rateCycle } from '../rating/engine.js';
import { CYCLES } from '../lib/dates.js';
import { toMoney } from '../lib/money.js';
import { tmfError } from './tmf.js';

export function sandboxRouter(store, audit, { exposeGroundTruth = true } = {}) {
  const r = Router();

  r.get('/health', (req, res) => res.json({ status: 'ok' }));

  r.get('/sandbox/meta', (req, res) => res.json({
    ...store.meta,
    counts: {
      customers: store.customers.length,
      products: store.products.length,
      usage: store.usage.length,
      bills: store.bills.length,
      billLines: store.billLines.length,
    },
    groundTruthExposed: exposeGroundTruth,
  }));

  // Re-rate a customer's cycle from inventory + usage, and compare with what was billed.
  // This is the tool an agent calls instead of doing arithmetic itself.
  r.post('/sandbox/rating/recalculate', (req, res) => {
    const { customerId, cycle } = req.body ?? {};
    const customer = store.customerById.get(customerId);
    if (!customer) return tmfError(res, 404, 'Not found', `Customer ${customerId} not found`);
    if (!CYCLES.includes(cycle)) return tmfError(res, 400, 'Invalid cycle', `cycle must be one of ${CYCLES.join(', ')}`);
    const rated = rateCycle({
      customer,
      products: store.productsByCustomer.get(customerId) ?? [],
      usage: store.usageByCustomer.get(customerId) ?? [],
      cycle,
    });
    const billed = (store.billsByCustomer.get(customerId) ?? []).find((b) => b.cycle === cycle);
    res.json({
      customerId,
      cycle,
      lines: rated.lines.map((l) => ({ ...l, amount: toMoney(l.amountCents) })),
      taxExcludedAmount: toMoney(rated.taxExcludedCents),
      taxAmount: toMoney(rated.taxCents),
      taxIncludedAmount: toMoney(rated.taxIncludedCents),
      billed: billed ? {
        billId: billed.id,
        taxIncludedAmount: toMoney(billed.taxIncludedCents),
        discrepancy: toMoney(billed.taxIncludedCents - rated.taxIncludedCents),
      } : null,
    });
  });

  r.post('/sandbox/audit/events', (req, res) => {
    try {
      res.status(201).json(audit.append(req.body));
    } catch (err) {
      if (err.validation) return tmfError(res, 400, 'Invalid audit event', err.validation.join('; '));
      throw err;
    }
  });
  r.get('/sandbox/audit/events', (req, res) => res.json(audit.list(req.query)));
  r.get('/sandbox/audit/verify', (req, res) => res.json(audit.verify()));

  // Labeled anomalies: ground truth for test suites. Disable during demos so agents can't read the answers.
  r.get('/sandbox/ground-truth/anomalies', (req, res) => {
    if (!exposeGroundTruth) return tmfError(res, 403, 'Forbidden', 'Ground truth is disabled (EXPOSE_GROUND_TRUTH=false)');
    const { type, customerId, cycle } = req.query;
    res.json(store.anomalies.filter((a) => (!type || a.type === type)
      && (!customerId || a.customerId === customerId)
      && (!cycle || a.cycle === cycle)));
  });

  return r;
}
