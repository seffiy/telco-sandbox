// All money is integer cents. Floats only appear at the TMF API boundary.
export const CURRENCY = 'USD';

// Round half away from zero, the usual billing convention.
export function roundCents(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

export function prorate(monthlyCents, activeDays, cycleDays) {
  return roundCents((monthlyCents * activeDays) / cycleDays);
}

export function taxOf(cents, ratePercent) {
  return roundCents((cents * ratePercent) / 100);
}

export function toMoney(cents) {
  return { unit: CURRENCY, value: Number((cents / 100).toFixed(2)) };
}
