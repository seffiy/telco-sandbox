// In-memory store with per-customer indexes over a generated dataset.
import { generateDataset } from './generator.js';

export function createStore(dataset) {
  const group = (rows, key) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r[key])) m.set(r[key], []);
      m.get(r[key]).push(r);
    }
    return m;
  };
  const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

  return {
    meta: dataset.meta,
    customers: dataset.customers,
    products: dataset.products,
    usage: dataset.usage,
    bills: dataset.bills,
    billLines: dataset.billLines,
    anomalies: dataset.anomalies,
    customerById: byId(dataset.customers),
    productById: byId(dataset.products),
    billById: byId(dataset.bills),
    lineById: byId(dataset.billLines),
    usageById: byId(dataset.usage),
    productsByCustomer: group(dataset.products, 'customerId'),
    usageByCustomer: group(dataset.usage, 'customerId'),
    billsByCustomer: group(dataset.bills, 'customerId'),
    linesByBill: group(dataset.billLines, 'billId'),
  };
}

export function createStoreFromEnv(env = process.env) {
  return createStore(generateDataset({
    seed: Number(env.SANDBOX_SEED ?? 42),
    subscribers: Number(env.SANDBOX_SUBSCRIBERS ?? 1000),
  }));
}
