import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANOMALY_TYPES, generateDataset } from '../src/data/generator.js';
import { rateCycle } from '../src/rating/engine.js';
import { createStore } from '../src/data/store.js';

const ds = generateDataset({ seed: 7, subscribers: 400 });
const store = createStore(ds);

test('same seed produces identical data; different seed does not', () => {
  const again = generateDataset({ seed: 7, subscribers: 400 });
  assert.equal(JSON.stringify(again), JSON.stringify(ds));
  const other = generateDataset({ seed: 8, subscribers: 400 });
  assert.notEqual(JSON.stringify(other.anomalies), JSON.stringify(ds.anomalies));
});

test('every customer has one bill per cycle and bill totals equal the sum of lines', () => {
  assert.equal(ds.bills.length, 400 * 3);
  for (const b of ds.bills) {
    const lines = store.linesByBill.get(b.id);
    const charges = lines.filter((l) => l.type !== 'tax').reduce((s, l) => s + l.amountCents, 0);
    const tax = lines.find((l) => l.type === 'tax').amountCents;
    assert.equal(charges, b.taxExcludedCents, b.id);
    assert.equal(tax, b.taxCents, b.id);
    assert.equal(b.taxExcludedCents + b.taxCents, b.taxIncludedCents, b.id);
  }
});

test('every anomaly type is planted and labeled', () => {
  const types = new Set(ds.anomalies.map((a) => a.type));
  for (const t of Object.keys(ANOMALY_TYPES)) assert.ok(types.has(t), `missing ${t}`);
});

test('each labeled anomaly raises the bill versus the previous cycle', () => {
  for (const a of ds.anomalies) {
    const cur = store.billById.get(a.billId);
    const prev = store.billById.get(a.previousBillId);
    assert.equal(cur.taxIncludedCents - prev.taxIncludedCents, a.deltaCents, a.id);
    assert.ok(a.deltaCents > 0, `${a.id} ${a.type} delta ${a.deltaCents}`);
  }
});

test('customers without anomalies have identical bills every cycle', () => {
  const labeled = new Set(ds.anomalies.map((a) => a.customerId));
  for (const c of ds.customers.filter((x) => !labeled.has(x.id))) {
    const totals = store.billsByCustomer.get(c.id).map((b) => b.taxIncludedCents);
    assert.equal(new Set(totals).size, 1, c.id);
  }
});

test('only duplicate charges are billing errors, and re-rating finds exactly the labeled credit', () => {
  for (const b of ds.bills) {
    const customer = store.customerById.get(b.customerId);
    const rated = rateCycle({
      customer,
      products: store.productsByCustomer.get(customer.id),
      usage: store.usageByCustomer.get(customer.id),
      cycle: b.cycle,
    });
    const discrepancy = b.taxIncludedCents - rated.taxIncludedCents;
    const label = ds.anomalies.find((a) => a.billId === b.id && a.isBillingError);
    assert.equal(discrepancy, label ? label.creditCents : 0, b.id);
  }
});

test('evidence line ids exist on the labeled bills', () => {
  for (const a of ds.anomalies) {
    for (const id of a.evidenceLineIds) assert.equal(store.lineById.get(id)?.billId, a.billId, `${a.id} ${id}`);
    for (const id of a.previousEvidenceLineIds) assert.equal(store.lineById.get(id)?.billId, a.previousBillId, `${a.id} ${id}`);
    if (a.type !== 'PROMO_EXPIRED') assert.ok(a.evidenceLineIds.length > 0, a.id);
  }
});

test('data is visibly synthetic', () => {
  assert.equal(ds.meta.synthetic, true);
  for (const c of ds.customers) {
    assert.match(c.email, /@example\.com$/);
    assert.match(c.msisdn, /^\+1555\d{7}$/);
  }
});
