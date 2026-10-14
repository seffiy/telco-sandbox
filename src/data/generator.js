// Synthetic BSS dataset with planted, labeled bill-shock anomalies.
// Same { seed, subscribers } always yields byte-identical output.
import { createRng } from '../lib/prng.js';
import { ADDONS, PLANS, PROMOS, TAX_CHANGE_CYCLE, TAX_CHANGE_REGION, TAX_REGIONS, offeringById } from './catalog.js';
import { rateCycle, withTax } from '../rating/engine.js';
import { CYCLES, addDays, cycleEnd, cycleStart, dayOf, daysInCycle, nextCycle, previousCycle } from '../lib/dates.js';

const GIVEN = ['Avery', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Quinn', 'Rowan', 'Skyler', 'Parker',
  'Reese', 'Emerson', 'Finley', 'Harper', 'Hayden', 'Jamie', 'Kendall', 'Logan', 'Marlow', 'Noel',
  'Oakley', 'Peyton', 'Remy', 'Sage', 'Tatum', 'Blair', 'Cameron', 'Dakota', 'Elliot', 'Frankie'];
const FAMILY = ['Ashford', 'Brightwater', 'Calloway', 'Dunmore', 'Ellison', 'Fairbanks', 'Greaves', 'Holloway',
  'Ingram', 'Jessup', 'Kingsley', 'Lockhart', 'Merriweather', 'Northcott', 'Oakridge', 'Pemberton',
  'Quarles', 'Redfield', 'Stanton', 'Thornbury', 'Underhill', 'Vance', 'Whitlock', 'Yardley'];
const ROAMING_COUNTRIES = ['MX', 'CA', 'GB', 'FR', 'JP', 'ES', 'IT'];

export const ANOMALY_TYPES = {
  MID_CYCLE_PLAN_CHANGE: { isBillingError: false, persistent: true },
  PROMO_EXPIRED: { isBillingError: false, persistent: true },
  ROAMING_DAY_PASS: { isBillingError: false, persistent: false },
  DATA_OVERAGE: { isBillingError: false, persistent: false },
  DUPLICATE_RECURRING_CHARGE: { isBillingError: true, persistent: false },
  TAX_CHANGE: { isBillingError: false, persistent: true },
};

const pad = (n, w) => String(n).padStart(w, '0');

export function generateDataset({ seed = 42, subscribers = 1000, anomalyRate = 0.18 } = {}) {
  const rng = createRng(seed);
  const customers = [];
  const products = [];
  const usage = [];
  const bills = [];
  const billLines = [];
  const anomalies = [];
  let productSeq = 0;
  let usageSeq = 0;

  let custProducts = [];
  const newProduct = (customerId, offeringId, startDate, endDate = null) => {
    const p = { id: `PRD-${pad(++productSeq, 7)}`, customerId, offeringId, startDate, endDate };
    products.push(p);
    custProducts.push(p);
    return p;
  };

  for (let i = 1; i <= subscribers; i++) {
    const id = `CUST-${pad(i, 6)}`;
    const region = rng.weighted(TAX_REGIONS.map((r) => ({ value: r.id, weight: r.weight })));
    const segment = rng.chance(0.1) ? 'business' : 'consumer';
    const givenName = rng.pick(GIVEN);
    const familyName = rng.pick(FAMILY);
    const since = addDays('2023-01-01', rng.int(0, 1240)); // up to 2026-05-25
    custProducts = [];
    const customer = {
      id,
      accountId: `ACC-${pad(i, 6)}`,
      givenName,
      familyName,
      email: `${givenName}.${familyName}.${i}@example.com`.toLowerCase(),
      msisdn: `+1555${pad(rng.int(0, 9999999), 7)}`,
      region,
      segment,
      since,
      status: 'active',
    };
    customers.push(customer);

    // Baseline subscription, stable across all three cycles.
    const planId = segment === 'business'
      ? rng.weighted([{ value: 'PLAN_BUSINESS_PRO', weight: 70 }, { value: 'PLAN_UNLIMITED_PREMIUM', weight: 30 }])
      : rng.weighted([
        { value: 'PLAN_ESSENTIALS_5', weight: 20 }, { value: 'PLAN_SENIOR_3', weight: 8 },
        { value: 'PLAN_DATA_ONLY_10', weight: 7 }, { value: 'PLAN_PLUS_15', weight: 25 },
        { value: 'PLAN_UNLIMITED_BASIC', weight: 25 }, { value: 'PLAN_UNLIMITED_PREMIUM', weight: 15 },
      ]);
    const cust = { customer, plan: newProduct(id, planId, since), addons: [], promo: null };
    const addonChances = { ADDON_DEVICE_PROTECTION: 0.35, ADDON_STREAMING: 0.2, ADDON_HOTSPOT_10GB: 0.15, ADDON_INTL_CALLING: 0.15 };
    for (const a of ADDONS) {
      if (rng.chance(addonChances[a.id])) {
        cust.addons.push(newProduct(id, a.id, addDays(since, rng.int(0, 30))));
      }
    }
    // Some customers carry a promo that stays active through all cycles.
    if (rng.chance(0.15)) {
      const start = rng.pick(['2026-05-01', '2026-06-01']);
      cust.promo = newProduct(id, PROMOS[0].id, start, promoEnd(start));
    }

    // Plant at most one anomaly per customer. NORTHGATE customers only get the tax change.
    let planted = null;
    if (region !== TAX_CHANGE_REGION && rng.chance(anomalyRate)) {
      planted = plantAnomaly(rng, cust, newProduct);
    } else if (region === TAX_CHANGE_REGION) {
      planted = { type: 'TAX_CHANGE', cycle: TAX_CHANGE_CYCLE };
    }

    // Usage for every cycle.
    const custUsage = [];
    for (const cycle of CYCLES) {
      const records = generateUsage(rng, cust, cycle, planted?.cycle === cycle ? planted : null);
      for (const r of records) custUsage.push({ id: `USG-${pad(++usageSeq, 8)}`, customerId: id, ...r });
    }
    usage.push(...custUsage);

    // Bills, rated by the same engine the agents will call.
    const custBills = {};
    for (const cycle of CYCLES) {
      let rated = rateCycle({ customer, products: custProducts, usage: custUsage, cycle });
      const correctTotalCents = rated.taxIncludedCents;
      let duplicatedLineIndex = null;
      if (planted?.type === 'DUPLICATE_RECURRING_CHARGE' && planted.cycle === cycle) {
        // A downstream billing defect: one add-on charge is posted twice.
        const charges = rated.lines.filter((l) => l.type !== 'tax');
        const idx = charges.findIndex((l) => l.productId === planted.productId);
        charges.splice(idx + 1, 0, { ...charges[idx] });
        duplicatedLineIndex = idx + 1;
        rated = withTax(charges, customer.region, cycleStart(cycle));
      }
      const billId = `BILL-${id.slice(5)}-${cycle.replace('-', '')}`;
      const bill = {
        id: billId,
        billNo: `${cycle.replace('-', '')}${id.slice(5)}`,
        customerId: id,
        accountId: customer.accountId,
        cycle,
        billingPeriod: { start: cycleStart(cycle), end: cycleEnd(cycle) },
        billDate: `${nextCycle(cycle)}-01`,
        paymentDueDate: addDays(`${nextCycle(cycle)}-01`, 21),
        state: cycle === CYCLES[CYCLES.length - 1] ? 'sent' : 'settled',
        taxExcludedCents: rated.taxExcludedCents,
        taxCents: rated.taxCents,
        taxIncludedCents: rated.taxIncludedCents,
      };
      const lines = rated.lines.map((l, n) => ({ id: `${billId}-L${pad(n + 1, 2)}`, billId, customerId: id, ...l }));
      bills.push(bill);
      billLines.push(...lines);
      custBills[cycle] = { bill, lines, correctTotalCents, duplicatedLineId: duplicatedLineIndex !== null ? lines[duplicatedLineIndex].id : null };
    }

    if (planted) anomalies.push(labelAnomaly(anomalies.length + 1, planted, custBills, customer));
  }

  return {
    meta: { seed, subscribers, anomalyRate, cycles: CYCLES, currency: 'USD', synthetic: true },
    customers, products, usage, bills, billLines, anomalies,
  };
}

function promoEnd(start) {
  let c = start.slice(0, 7);
  for (let k = 1; k < PROMOS[0].durationCycles; k++) c = nextCycle(c);
  return cycleEnd(c);
}

function plantAnomaly(rng, cust, newProduct) {
  const plan = offeringById(cust.plan.offeringId);
  const upgrades = PLANS.filter((p) => p.tier > plan.tier && p.id !== 'PLAN_BUSINESS_PRO');
  const eligible = [
    { value: 'ROAMING_DAY_PASS', weight: 25 },
    { value: 'DUPLICATE_RECURRING_CHARGE', weight: 15 },
    plan.dataAllowanceMb !== null && { value: 'DATA_OVERAGE', weight: 25 },
    upgrades.length && plan.id !== 'PLAN_DATA_ONLY_10' && { value: 'MID_CYCLE_PLAN_CHANGE', weight: 20 },
    !cust.promo && { value: 'PROMO_EXPIRED', weight: 15 },
  ].filter(Boolean);
  const type = rng.weighted(eligible);
  const cycle = ANOMALY_TYPES[type].persistent ? CYCLES[2] : rng.pick([CYCLES[1], CYCLES[2]]);
  const planted = { type, cycle };

  if (type === 'MID_CYCLE_PLAN_CHANGE') {
    const changeDay = rng.int(5, 25);
    const changeDate = dayOf(cycle, changeDay);
    const target = rng.pick(upgrades);
    cust.plan.endDate = addDays(changeDate, -1);
    const newPlan = newProduct(cust.customer.id, target.id, changeDate);
    Object.assign(planted, { fromPlan: plan.id, toPlan: target.id, changeDate, oldProductId: cust.plan.id, newProductId: newPlan.id });
  } else if (type === 'PROMO_EXPIRED') {
    // Six cycles from March end on 2026-08-31, so September is the first full-price bill.
    cust.promo = newProduct(cust.customer.id, PROMOS[0].id, '2026-03-01', promoEnd('2026-03-01'));
    planted.promoProductId = cust.promo.id;
  } else if (type === 'DUPLICATE_RECURRING_CHARGE') {
    if (cust.addons.length === 0) {
      cust.addons.push(newProduct(cust.customer.id, rng.pick(ADDONS).id, cust.plan.startDate));
    }
    planted.productId = rng.pick(cust.addons).id;
  } else if (type === 'ROAMING_DAY_PASS') {
    const days = rng.int(2, 7);
    const first = rng.int(1, daysInCycle(cycle) - days + 1);
    planted.roamingDays = Array.from({ length: days }, (_, k) => dayOf(cycle, first + k));
    planted.country = rng.pick(ROAMING_COUNTRIES);
  } else if (type === 'DATA_OVERAGE') {
    planted.overMb = rng.int(200, 5500);
  }
  return planted;
}

function generateUsage(rng, cust, cycle, planted) {
  const plan = offeringById(cust.plan.offeringId);
  const days = daysInCycle(cycle);
  let targetMb;
  if (plan.dataAllowanceMb === null) targetMb = rng.int(4 * 1024, 40 * 1024);
  else if (planted?.type === 'DATA_OVERAGE') targetMb = plan.dataAllowanceMb + planted.overMb;
  else targetMb = Math.floor(plan.dataAllowanceMb * (0.3 + rng.next() * 0.55));

  const weights = Array.from({ length: days }, () => 0.5 + rng.next());
  const total = weights.reduce((s, w) => s + w, 0);
  const daily = weights.map((w) => Math.floor((targetMb * w) / total));
  daily[days - 1] += targetMb - daily.reduce((s, x) => s + x, 0);

  const records = [];
  for (let d = 1; d <= days; d++) {
    const date = dayOf(cycle, d);
    records.push({ date, type: 'data', volume: daily[d - 1], unit: 'MB', roaming: false, country: 'US' });
    if (d % 2 === 0) records.push({ date, type: 'voice', volume: rng.int(1, 60), unit: 'MIN', roaming: false, country: 'US' });
    if (d % 3 === 0) records.push({ date, type: 'sms', volume: rng.int(1, 15), unit: 'MSG', roaming: false, country: 'US' });
    if (planted?.type === 'ROAMING_DAY_PASS' && planted.roamingDays.includes(date)) {
      records.push({ date, type: 'data', volume: rng.int(50, 800), unit: 'MB', roaming: true, country: planted.country });
    }
  }
  return records;
}

function labelAnomaly(n, planted, custBills, customer) {
  const cur = custBills[planted.cycle];
  const prev = custBills[previousCycle(planted.cycle)];
  const linesOf = (pred) => cur.lines.filter(pred).map((l) => l.id);
  const label = {
    id: `ANOM-${pad(n, 4)}`,
    type: planted.type,
    customerId: customer.id,
    cycle: planted.cycle,
    billId: cur.bill.id,
    previousBillId: prev.bill.id,
    isBillingError: ANOMALY_TYPES[planted.type].isBillingError,
    deltaCents: cur.bill.taxIncludedCents - prev.bill.taxIncludedCents,
    expectedResolution: ANOMALY_TYPES[planted.type].isBillingError ? 'credit' : 'explain',
    creditCents: 0,
    evidenceLineIds: [],
    previousEvidenceLineIds: [],
    details: {},
  };
  switch (planted.type) {
    case 'MID_CYCLE_PLAN_CHANGE':
      label.evidenceLineIds = linesOf((l) => l.proration && (l.productId === planted.oldProductId || l.productId === planted.newProductId));
      label.details = { fromPlan: planted.fromPlan, toPlan: planted.toPlan, changeDate: planted.changeDate };
      break;
    case 'PROMO_EXPIRED':
      label.previousEvidenceLineIds = prev.lines.filter((l) => l.productId === planted.promoProductId).map((l) => l.id);
      label.details = { promoProductId: planted.promoProductId, promoEndDate: '2026-08-31' };
      break;
    case 'ROAMING_DAY_PASS':
      label.evidenceLineIds = linesOf((l) => l.offeringId === 'PASS_ROAM_DAY');
      label.details = { roamingDays: planted.roamingDays, country: planted.country };
      break;
    case 'DATA_OVERAGE':
      label.evidenceLineIds = linesOf((l) => l.type === 'usage' && l.usageSummary?.allowanceMb);
      label.details = { overMb: planted.overMb };
      break;
    case 'DUPLICATE_RECURRING_CHARGE': {
      const original = cur.lines.find((l) => l.productId === planted.productId);
      label.evidenceLineIds = [original.id, cur.duplicatedLineId];
      // The credit restores the bill to what correct rating produces: the line plus its tax.
      label.creditCents = cur.bill.taxIncludedCents - cur.correctTotalCents;
      label.details = { productId: planted.productId };
      break;
    }
    case 'TAX_CHANGE':
      label.evidenceLineIds = linesOf((l) => l.type === 'tax');
      label.previousEvidenceLineIds = prev.lines.filter((l) => l.type === 'tax').map((l) => l.id);
      label.details = { region: customer.region };
      break;
  }
  return label;
}
