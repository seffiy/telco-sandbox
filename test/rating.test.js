import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateCycle } from '../src/rating/engine.js';
import { prorate, taxOf } from '../src/lib/money.js';

const customer = { id: 'CUST-T', region: 'HIGHPLAINS' }; // 6.0% tax
const product = (offeringId, startDate, endDate = null) => ({ id: `P-${offeringId}-${startDate}`, offeringId, startDate, endDate });
const dataDay = (date, volume, roaming = false) => ({ date, type: 'data', volume, roaming });
const total = (r) => r.taxIncludedCents;
const charge = (r, type) => r.lines.filter((l) => l.type === type);

test('full-cycle plan and add-on are billed at list price plus tax', () => {
  const r = rateCycle({
    customer,
    products: [product('PLAN_PLUS_15', '2025-01-01'), product('ADDON_STREAMING', '2025-01-01')],
    usage: [dataDay('2026-08-10', 1024)],
    cycle: '2026-08',
  });
  assert.equal(r.taxExcludedCents, 4000 + 800);
  assert.equal(r.taxCents, 288);
  assert.equal(total(r), 5088);
});

test('mid-cycle plan change prorates old and new plan by active days', () => {
  // Essentials ($25) to Unlimited Premium ($75) on 2026-09-11: 10 days old, 20 days new, 30-day cycle.
  const r = rateCycle({
    customer,
    products: [product('PLAN_ESSENTIALS_5', '2025-01-01', '2026-09-10'), product('PLAN_UNLIMITED_PREMIUM', '2026-09-11')],
    usage: [],
    cycle: '2026-09',
  });
  const rec = charge(r, 'recurring');
  assert.deepEqual(rec.map((l) => l.amountCents), [833, 5000]);
  assert.deepEqual(rec.map((l) => l.proration), [{ activeDays: 10, cycleDays: 30 }, { activeDays: 20, cycleDays: 30 }]);
});

test('promo applies only when it covers the whole cycle', () => {
  const products = [product('PLAN_ESSENTIALS_5', '2025-01-01'), product('PROMO_10_OFF_6M', '2026-03-01', '2026-08-31')];
  const aug = rateCycle({ customer, products, usage: [], cycle: '2026-08' });
  const sep = rateCycle({ customer, products, usage: [], cycle: '2026-09' });
  assert.equal(charge(aug, 'discount')[0].amountCents, -1000);
  assert.equal(charge(sep, 'discount').length, 0);
});

test('data overage is charged per started GB above allowance; roaming data does not count', () => {
  const usage = [dataDay('2026-07-01', 5 * 1024), dataDay('2026-07-02', 1025), dataDay('2026-07-03', 9000, true)];
  const r = rateCycle({ customer, products: [product('PLAN_ESSENTIALS_5', '2025-01-01')], usage, cycle: '2026-07' });
  const over = charge(r, 'usage').find((l) => l.description.startsWith('Data overage'));
  assert.equal(over.quantity, 2); // 1025 MB over = 2 started GB
  assert.equal(over.amountCents, 2000);
});

test('unlimited plans never incur overage', () => {
  const r = rateCycle({
    customer, products: [product('PLAN_UNLIMITED_BASIC', '2025-01-01')], usage: [dataDay('2026-07-01', 90_000)], cycle: '2026-07',
  });
  assert.equal(charge(r, 'usage').length, 0);
});

test('roaming day pass is charged once per distinct roaming day', () => {
  const usage = [dataDay('2026-07-04', 100, true), dataDay('2026-07-04', 50, true), dataDay('2026-07-05', 10, true)];
  const r = rateCycle({ customer, products: [product('PLAN_UNLIMITED_BASIC', '2025-01-01')], usage, cycle: '2026-07' });
  const pass = charge(r, 'usage').find((l) => l.offeringId === 'PASS_ROAM_DAY');
  assert.equal(pass.quantity, 2);
  assert.equal(pass.amountCents, 2400);
});

test('tax rate follows the effective date (Northgate rises to 9% in September)', () => {
  const ng = { id: 'CUST-N', region: 'NORTHGATE' };
  const products = [product('PLAN_PLUS_15', '2025-01-01')];
  assert.equal(rateCycle({ customer: ng, products, usage: [], cycle: '2026-08' }).taxCents, 260);
  assert.equal(rateCycle({ customer: ng, products, usage: [], cycle: '2026-09' }).taxCents, 360);
});

test('money helpers round half away from zero', () => {
  assert.equal(prorate(2500, 1, 3), 833);
  assert.equal(prorate(100, 1, 8), 13); // 12.5 -> 13
  assert.equal(taxOf(-1000, 7.5), -75);
  assert.equal(taxOf(50, 7.5), 4); // 3.75 -> 4
});
