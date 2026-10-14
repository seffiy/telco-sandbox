// Mappers from internal records to TM Forum Open API (v4) resource shapes, plus shared list handling.
import { offeringById, taxRateFor } from '../data/catalog.js';
import { toMoney } from '../lib/money.js';
import { SANDBOX_TODAY, toDateTime } from '../lib/dates.js';

export const BASE = {
  catalog: '/tmf-api/productCatalogManagement/v4',
  customer: '/tmf-api/customerManagement/v4',
  inventory: '/tmf-api/productInventory/v4',
  usage: '/tmf-api/usageManagement/v4',
  bill: '/tmf-api/customerBillManagement/v4',
};

const customerRef = (id) => ({ id, href: `${BASE.customer}/customer/${id}`, role: 'Customer', '@referredType': 'Customer' });

// TMF620 ProductOffering
export function toProductOffering(o) {
  const price = {
    plan: { priceType: 'recurring', recurringChargePeriodType: 'month', amount: o.priceCents },
    addon: { priceType: 'recurring', recurringChargePeriodType: 'month', amount: o.priceCents },
    pass: { priceType: 'usage', unitOfMeasure: 'day', amount: o.priceCents },
    promo: { priceType: 'discount', recurringChargePeriodType: 'month', amount: -o.discountCents },
  }[o.kind];
  const res = {
    id: o.id,
    href: `${BASE.catalog}/productOffering/${o.id}`,
    name: o.name,
    lifecycleStatus: 'Launched',
    isBundle: false,
    category: [{ id: o.kind, name: o.kind }],
    productOfferingPrice: [{
      name: `${o.name} price`,
      priceType: price.priceType,
      recurringChargePeriodType: price.recurringChargePeriodType,
      unitOfMeasure: price.unitOfMeasure ? { amount: 1, units: price.unitOfMeasure } : undefined,
      price: { dutyFreeAmount: toMoney(price.amount) },
    }],
    '@type': 'ProductOffering',
  };
  if (o.kind === 'plan') {
    res.productOfferingPrice.push({
      name: 'Data overage', priceType: 'usage', unitOfMeasure: { amount: 1, units: 'GB' },
      price: { dutyFreeAmount: toMoney(1000) },
    });
    res.prodSpecCharValueUse = [{
      name: 'dataAllowance',
      productSpecCharacteristicValue: [o.dataAllowanceMb === null
        ? { value: 'unlimited' }
        : { value: o.dataAllowanceMb / 1024, unitOfMeasure: 'GB' }],
    }];
  }
  if (o.kind === 'promo') {
    res.productOfferingTerm = [{ name: 'Promotion duration', duration: { amount: o.durationCycles, units: 'month' } }];
  }
  return res;
}

// TMF629 Customer
export function toCustomer(c) {
  return {
    id: c.id,
    href: `${BASE.customer}/customer/${c.id}`,
    name: `${c.givenName} ${c.familyName}`,
    status: 'Approved',
    engagedParty: { id: `IND-${c.id.slice(5)}`, name: `${c.givenName} ${c.familyName}`, '@referredType': 'Individual' },
    account: [{ id: c.accountId, name: `Billing account ${c.accountId}`, '@referredType': 'BillingAccount' }],
    contactMedium: [
      { mediumType: 'email', preferred: true, characteristic: { emailAddress: c.email } },
      { mediumType: 'mobile', preferred: false, characteristic: { phoneNumber: c.msisdn } },
    ],
    characteristic: [
      { name: 'segment', value: c.segment },
      { name: 'taxRegion', value: c.region },
    ],
    validFor: { startDateTime: toDateTime(c.since) },
    '@type': 'Customer',
  };
}

// TMF637 Product (inventory item)
export function toProduct(p, customer) {
  const o = offeringById(p.offeringId);
  const terminated = p.endDate && p.endDate < SANDBOX_TODAY;
  return {
    id: p.id,
    href: `${BASE.inventory}/product/${p.id}`,
    name: o.name,
    status: terminated ? 'terminated' : 'active',
    isBundle: false,
    startDate: toDateTime(p.startDate),
    terminationDate: p.endDate ? toDateTime(p.endDate) : undefined,
    productOffering: { id: o.id, href: `${BASE.catalog}/productOffering/${o.id}`, name: o.name },
    productPrice: o.kind === 'promo'
      ? [{ name: o.name, priceType: 'discount', recurringChargePeriod: 'month', price: { dutyFreeAmount: toMoney(-o.discountCents) } }]
      : [{ name: o.name, priceType: 'recurring', recurringChargePeriod: 'month', price: { dutyFreeAmount: toMoney(o.priceCents) } }],
    billingAccount: { id: customer.accountId, '@referredType': 'BillingAccount' },
    relatedParty: [customerRef(customer.id)],
    '@type': 'Product',
  };
}

// TMF635 Usage
export function toUsage(u) {
  return {
    id: u.id,
    href: `${BASE.usage}/usage/${u.id}`,
    usageDate: `${u.date}T12:00:00Z`,
    usageType: u.roaming ? `${u.type}Roaming` : u.type,
    status: 'billed',
    usageCharacteristic: [
      { name: 'volume', value: u.volume, valueType: 'number' },
      { name: 'unit', value: u.unit, valueType: 'string' },
      { name: 'roaming', value: u.roaming, valueType: 'boolean' },
      { name: 'country', value: u.country, valueType: 'string' },
    ],
    relatedParty: [customerRef(u.customerId)],
    '@type': 'Usage',
  };
}

// TMF678 CustomerBill
export function toCustomerBill(b, customer) {
  return {
    id: b.id,
    href: `${BASE.bill}/customerBill/${b.id}`,
    billNo: b.billNo,
    billDate: toDateTime(b.billDate),
    paymentDueDate: toDateTime(b.paymentDueDate),
    state: b.state,
    category: 'normal',
    runType: 'onCycle',
    billingPeriod: { startDateTime: toDateTime(b.billingPeriod.start), endDateTime: `${b.billingPeriod.end}T23:59:59Z` },
    amountDue: toMoney(b.taxIncludedCents),
    remainingAmount: toMoney(b.state === 'settled' ? 0 : b.taxIncludedCents),
    taxExcludedAmount: toMoney(b.taxExcludedCents),
    taxIncludedAmount: toMoney(b.taxIncludedCents),
    taxItem: [{ taxCategory: 'salesTax', taxRate: taxRateFor(customer.region, b.billingPeriod.start) / 100, taxAmount: toMoney(b.taxCents) }],
    billingAccount: { id: b.accountId, '@referredType': 'BillingAccount' },
    relatedParty: [customerRef(b.customerId)],
    appliedCustomerBillingRate: { href: `${BASE.bill}/appliedCustomerBillingRate?bill.id=${b.id}` },
    '@type': 'CustomerBill',
  };
}

// TMF678 AppliedCustomerBillingRate (one bill line)
export function toBillingRate(l, bill) {
  const characteristic = [
    { name: 'quantity', value: l.quantity },
    { name: 'unitPrice', value: l.unitPriceCents / 100 },
  ];
  if (l.proration) characteristic.push({ name: 'proration', value: `${l.proration.activeDays}/${l.proration.cycleDays}` });
  if (l.taxRatePercent !== undefined) characteristic.push({ name: 'taxRatePercent', value: l.taxRatePercent });
  if (l.usageSummary?.roamingDays) characteristic.push({ name: 'roamingDays', value: l.usageSummary.roamingDays });
  if (l.usageSummary?.domesticMb !== undefined) {
    characteristic.push({ name: 'domesticDataMb', value: l.usageSummary.domesticMb });
    characteristic.push({ name: 'allowanceMb', value: l.usageSummary.allowanceMb });
  }
  return {
    id: l.id,
    href: `${BASE.bill}/appliedCustomerBillingRate/${l.id}`,
    name: l.description,
    type: l.type,
    date: toDateTime(bill.billDate),
    isBilled: true,
    bill: { id: bill.id, href: `${BASE.bill}/customerBill/${bill.id}` },
    product: l.productId ? { id: l.productId, href: `${BASE.inventory}/product/${l.productId}` } : undefined,
    productOffering: l.offeringId ? { id: l.offeringId } : undefined,
    periodCoverage: l.periodStart
      ? { startDateTime: toDateTime(l.periodStart), endDateTime: `${l.periodEnd}T23:59:59Z` }
      : undefined,
    taxExcludedAmount: toMoney(l.amountCents),
    characteristic,
    '@type': 'AppliedCustomerBillingRate',
  };
}

// TMF630-style list response: offset/limit paging, ?fields= projection, X-Total-Count / X-Result-Count headers.
export function sendList(req, res, items) {
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 100) || 100));
  const page = items.slice(offset, offset + limit);
  res.set('X-Total-Count', String(items.length));
  res.set('X-Result-Count', String(page.length));
  res.json(page.map((r) => project(r, req.query.fields)));
}

export function sendOne(req, res, item) {
  res.json(project(item, req.query.fields));
}

function project(r, fields) {
  if (!fields) return r;
  const keep = new Set(['id', 'href', ...String(fields).split(',').map((f) => f.trim())]);
  return Object.fromEntries(Object.entries(r).filter(([k]) => keep.has(k)));
}

export function tmfError(res, status, reason, message) {
  return res.status(status).json({ code: String(status), reason, message, status: String(status), '@type': 'Error' });
}

// Applies ?<name>.gte / .gt / .lte / .lt / =value comparisons on a scalar field.
export function compareFilter(query, name, value) {
  if (query[name] !== undefined && value !== query[name]) return false;
  if (query[`${name}.gte`] !== undefined && !(value >= query[`${name}.gte`])) return false;
  if (query[`${name}.gt`] !== undefined && !(value > query[`${name}.gt`])) return false;
  if (query[`${name}.lte`] !== undefined && !(value <= query[`${name}.lte`])) return false;
  if (query[`${name}.lt`] !== undefined && !(value < query[`${name}.lt`])) return false;
  return true;
}
