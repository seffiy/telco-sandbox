// Deterministic rating engine. Agents call this as a tool; the LLM never computes charges.
// Input is plain data (inventory + usage), output is bill lines in integer cents.
import { offeringById, taxRateFor, USAGE_PRICES, ROAM_DAY_PASS } from '../data/catalog.js';
import { prorate, taxOf } from '../lib/money.js';
import { activeDaysInCycle, cycleEnd, cycleStart, daysInCycle } from '../lib/dates.js';

/**
 * Rate one customer for one billing cycle.
 * @param {object} args
 * @param {{id: string, region: string}} args.customer
 * @param {Array} args.products  inventory items: { id, offeringId, startDate, endDate|null }
 * @param {Array} args.usage     usage records: { date, type: 'data'|'voice'|'sms', volume, roaming }
 * @param {string} args.cycle    'YYYY-MM'
 */
export function rateCycle({ customer, products, usage, cycle }) {
  const start = cycleStart(cycle);
  const end = cycleEnd(cycle);
  const cycleDays = daysInCycle(cycle);
  const lines = [];

  // 1. Recurring charges (plans and add-ons), prorated by active days in the cycle.
  for (const p of products) {
    const offering = offeringById(p.offeringId);
    if (offering.kind !== 'plan' && offering.kind !== 'addon') continue;
    const activeDays = activeDaysInCycle(cycle, p.startDate, p.endDate);
    if (activeDays === 0) continue;
    const prorated = activeDays < cycleDays;
    lines.push({
      type: 'recurring',
      offeringId: offering.id,
      productId: p.id,
      description: prorated
        ? `${offering.name} (prorated ${activeDays}/${cycleDays} days)`
        : offering.name,
      quantity: 1,
      unitPriceCents: offering.priceCents,
      amountCents: prorate(offering.priceCents, activeDays, cycleDays),
      periodStart: p.startDate > start ? p.startDate : start,
      periodEnd: p.endDate && p.endDate < end ? p.endDate : end,
      proration: prorated ? { activeDays, cycleDays } : null,
    });
  }

  // 2. Promotions: apply only when the promo covers the whole cycle.
  for (const p of products) {
    const offering = offeringById(p.offeringId);
    if (offering.kind !== 'promo') continue;
    const covers = p.startDate <= start && (!p.endDate || p.endDate >= end);
    if (!covers) continue;
    lines.push({
      type: 'discount',
      offeringId: offering.id,
      productId: p.id,
      description: offering.name,
      quantity: 1,
      unitPriceCents: -offering.discountCents,
      amountCents: -offering.discountCents,
      periodStart: start,
      periodEnd: end,
      proration: null,
    });
  }

  const inCycle = usage.filter((u) => u.date >= start && u.date <= end);

  // 3. Data overage, against the allowance of the plan active at cycle end.
  const planAtEnd = products
    .filter((p) => offeringById(p.offeringId).kind === 'plan')
    .find((p) => p.startDate <= end && (!p.endDate || p.endDate >= end));
  const allowanceMb = planAtEnd ? offeringById(planAtEnd.offeringId).dataAllowanceMb : null;
  const domesticMb = inCycle
    .filter((u) => u.type === 'data' && !u.roaming)
    .reduce((s, u) => s + u.volume, 0);
  if (allowanceMb !== null && domesticMb > allowanceMb) {
    const gb = Math.ceil((domesticMb - allowanceMb) / 1024);
    lines.push({
      type: 'usage',
      offeringId: planAtEnd.offeringId,
      productId: planAtEnd.id,
      description: `Data overage: ${gb} GB over ${allowanceMb / 1024} GB allowance`,
      quantity: gb,
      unitPriceCents: USAGE_PRICES.DATA_OVERAGE_PER_GB_CENTS,
      amountCents: gb * USAGE_PRICES.DATA_OVERAGE_PER_GB_CENTS,
      periodStart: start,
      periodEnd: end,
      proration: null,
      usageSummary: { domesticMb, allowanceMb },
    });
  }

  // 4. Roaming: one day pass per calendar day with any roaming usage.
  const roamingDays = [...new Set(inCycle.filter((u) => u.roaming).map((u) => u.date))].sort();
  if (roamingDays.length > 0) {
    lines.push({
      type: 'usage',
      offeringId: ROAM_DAY_PASS.id,
      productId: null,
      description: `${ROAM_DAY_PASS.name} x ${roamingDays.length} day(s)`,
      quantity: roamingDays.length,
      unitPriceCents: ROAM_DAY_PASS.priceCents,
      amountCents: roamingDays.length * ROAM_DAY_PASS.priceCents,
      periodStart: roamingDays[0],
      periodEnd: roamingDays[roamingDays.length - 1],
      proration: null,
      usageSummary: { roamingDays },
    });
  }

  return withTax(lines, customer.region, start);
}

/** Add the tax line and totals to a set of charge lines. Also used to re-total a bill. */
export function withTax(chargeLines, region, taxDate) {
  const taxExcludedCents = chargeLines.reduce((s, l) => s + l.amountCents, 0);
  const ratePercent = taxRateFor(region, taxDate);
  const taxCents = taxOf(taxExcludedCents, ratePercent);
  const lines = [
    ...chargeLines,
    {
      type: 'tax',
      offeringId: null,
      productId: null,
      description: `Sales tax ${ratePercent}% (${region})`,
      quantity: 1,
      unitPriceCents: taxCents,
      amountCents: taxCents,
      periodStart: null,
      periodEnd: null,
      proration: null,
      taxRatePercent: ratePercent,
    },
  ];
  return { lines, taxExcludedCents, taxCents, taxIncludedCents: taxExcludedCents + taxCents };
}
