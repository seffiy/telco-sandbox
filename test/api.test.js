import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createStore } from '../src/data/store.js';
import { generateDataset } from '../src/data/generator.js';
import { createAuditLog } from '../src/audit/auditLog.js';

let server;
let base;
const store = createStore(generateDataset({ seed: 11, subscribers: 150 }));

before(async () => {
  const app = createApp({ store, audit: createAuditLog() });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, headers: res.headers, body: await res.json() };
};
const post = async (path, body) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('TMF620 lists product offerings with prices', async () => {
  const { status, body } = await get('/tmf-api/productCatalogManagement/v4/productOffering?category.id=plan');
  assert.equal(status, 200);
  assert.equal(body.length, 7);
  assert.equal(body[0]['@type'], 'ProductOffering');
  assert.equal(body[0].productOfferingPrice[0].price.dutyFreeAmount.unit, 'USD');
});

test('TMF629 paginates customers with TMF headers and supports ?fields', async () => {
  const { headers, body } = await get('/tmf-api/customerManagement/v4/customer?offset=10&limit=5&fields=name');
  assert.equal(headers.get('x-total-count'), '150');
  assert.equal(headers.get('x-result-count'), '5');
  assert.deepEqual(Object.keys(body[0]).sort(), ['href', 'id', 'name']);
  assert.equal(body[0].id, 'CUST-000011');
});

test('TMF637 returns a customer inventory', async () => {
  const { body } = await get('/tmf-api/productInventory/v4/product?relatedParty.id=CUST-000001');
  assert.ok(body.length >= 1);
  assert.ok(body.every((p) => p.relatedParty[0].id === 'CUST-000001'));
});

test('TMF635 requires a party filter and supports date ranges', async () => {
  assert.equal((await get('/tmf-api/usageManagement/v4/usage')).status, 400);
  const { body } = await get('/tmf-api/usageManagement/v4/usage?relatedParty.id=CUST-000001&usageDate.gte=2026-08-01&usageDate.lt=2026-08-02&usageType=data');
  assert.equal(body.length, 1);
  assert.equal(body[0].usageDate, '2026-08-01T12:00:00Z');
});

test('TMF678 bill and its lines agree', async () => {
  const { body: bills } = await get('/tmf-api/customerBillManagement/v4/customerBill?relatedParty.id=CUST-000002');
  assert.equal(bills.length, 3);
  const bill = bills[2];
  const { body: lines } = await get(`/tmf-api/customerBillManagement/v4/appliedCustomerBillingRate?bill.id=${bill.id}`);
  const sum = lines.reduce((s, l) => s + Math.round(l.taxExcludedAmount.value * 100), 0);
  assert.equal(sum, Math.round(bill.amountDue.value * 100));
});

test('unknown resources return a TMF error', async () => {
  const { status, body } = await get('/tmf-api/customerManagement/v4/customer/NOPE');
  assert.equal(status, 404);
  assert.equal(body['@type'], 'Error');
});

test('recalculate reports the discrepancy on a duplicate-charge bill', async () => {
  const dup = store.anomalies.find((a) => a.type === 'DUPLICATE_RECURRING_CHARGE');
  const { body } = await post('/sandbox/rating/recalculate', { customerId: dup.customerId, cycle: dup.cycle });
  assert.equal(Math.round(body.billed.discrepancy.value * 100), dup.creditCents);
  assert.equal((await post('/sandbox/rating/recalculate', { customerId: dup.customerId, cycle: '1999-01' })).status, 400);
});

test('audit events are validated, chained and verifiable', async () => {
  assert.equal((await post('/sandbox/audit/events', { action: 'x' })).status, 400);
  const a = await post('/sandbox/audit/events', { actor: 'test', action: 'explain_bill', correlationId: 'c1', toolCalls: [{ tool: 'get_bill' }] });
  const b = await post('/sandbox/audit/events', { actor: 'test', action: 'propose_credit', correlationId: 'c1', policy: { id: 'ADJ-SMALL' } });
  assert.equal(a.status, 201);
  assert.equal(b.body.prevHash, a.body.hash);
  assert.equal((await get('/sandbox/audit/events?correlationId=c1')).body.length, 2);
  assert.deepEqual((await get('/sandbox/audit/verify')).body, { ok: true, entries: 2 });
});

test('ground truth can be switched off', async () => {
  const app = createApp({ store, audit: createAuditLog(), exposeGroundTruth: false });
  const s = await new Promise((resolve) => { const x = app.listen(0, () => resolve(x)); });
  const res = await fetch(`http://127.0.0.1:${s.address().port}/sandbox/ground-truth/anomalies`);
  s.close();
  assert.equal(res.status, 403);
});
