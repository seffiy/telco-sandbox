// Fictional product catalog. Prices are monthly, in cents. Nothing here comes from a real operator.

export const PLANS = [
  { id: 'PLAN_ESSENTIALS_5', name: 'Essentials 5GB', priceCents: 2500, dataAllowanceMb: 5 * 1024, tier: 1 },
  { id: 'PLAN_SENIOR_3', name: 'Senior 55+ 3GB', priceCents: 2000, dataAllowanceMb: 3 * 1024, tier: 1 },
  { id: 'PLAN_DATA_ONLY_10', name: 'Tablet Data 10GB', priceCents: 2000, dataAllowanceMb: 10 * 1024, tier: 1 },
  { id: 'PLAN_PLUS_15', name: 'Plus 15GB', priceCents: 4000, dataAllowanceMb: 15 * 1024, tier: 2 },
  { id: 'PLAN_UNLIMITED_BASIC', name: 'Unlimited Basic', priceCents: 5500, dataAllowanceMb: null, tier: 3 },
  { id: 'PLAN_UNLIMITED_PREMIUM', name: 'Unlimited Premium', priceCents: 7500, dataAllowanceMb: null, tier: 4 },
  { id: 'PLAN_BUSINESS_PRO', name: 'Business Pro Unlimited', priceCents: 6500, dataAllowanceMb: null, tier: 4 },
];

export const ADDONS = [
  { id: 'ADDON_INTL_CALLING', name: 'International Calling', priceCents: 1000 },
  { id: 'ADDON_DEVICE_PROTECTION', name: 'Device Protection', priceCents: 1200 },
  { id: 'ADDON_HOTSPOT_10GB', name: 'Hotspot 10GB', priceCents: 1000 },
  { id: 'ADDON_STREAMING', name: 'Streaming Bundle', priceCents: 800 },
];

// Usage-based charges.
export const USAGE_PRICES = {
  // Per started GB above the plan allowance.
  DATA_OVERAGE_PER_GB_CENTS: 1000,
};

// Charged once per calendar day with roaming usage (opt-in pass, auto-applied on first use abroad).
export const ROAM_DAY_PASS = { id: 'PASS_ROAM_DAY', name: 'Roam Day Pass', priceCents: 1200 };

export const PROMOS = [
  { id: 'PROMO_10_OFF_6M', name: '$10 off for 6 months', discountCents: 1000, durationCycles: 6 },
];

// Sales tax by fictional region. NORTHGATE's rate rises from 9/2026: a planted, systemic bill change.
export const TAX_REGIONS = [
  { id: 'BAYSHORE', name: 'Bayshore', weight: 30, rates: [{ from: '2000-01-01', ratePercent: 7.5 }] },
  { id: 'HIGHPLAINS', name: 'High Plains', weight: 25, rates: [{ from: '2000-01-01', ratePercent: 6.0 }] },
  { id: 'LAKEVIEW', name: 'Lakeview', weight: 20, rates: [{ from: '2000-01-01', ratePercent: 8.25 }] },
  { id: 'REDROCK', name: 'Red Rock', weight: 17, rates: [{ from: '2000-01-01', ratePercent: 5.0 }] },
  {
    id: 'NORTHGATE',
    name: 'Northgate',
    weight: 8,
    rates: [
      { from: '2000-01-01', ratePercent: 6.5 },
      { from: '2026-09-01', ratePercent: 9.0 },
    ],
  },
];

export const TAX_CHANGE_REGION = 'NORTHGATE';
export const TAX_CHANGE_CYCLE = '2026-09';

export function taxRateFor(regionId, date) {
  const region = TAX_REGIONS.find((r) => r.id === regionId);
  if (!region) throw new Error(`Unknown tax region ${regionId}`);
  return [...region.rates].reverse().find((r) => r.from <= date).ratePercent;
}

export const OFFERINGS = [
  ...PLANS.map((p) => ({ ...p, kind: 'plan' })),
  ...ADDONS.map((a) => ({ ...a, kind: 'addon' })),
  { ...ROAM_DAY_PASS, kind: 'pass' },
  ...PROMOS.map((p) => ({ ...p, kind: 'promo' })),
];

export function offeringById(id) {
  const o = OFFERINGS.find((x) => x.id === id);
  if (!o) throw new Error(`Unknown offering ${id}`);
  return o;
}
