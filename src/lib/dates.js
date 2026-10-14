// Billing cycles are calendar months, identified as 'YYYY-MM'. All dates are UTC 'YYYY-MM-DD'.
export const CYCLES = ['2026-07', '2026-08', '2026-09'];

export function daysInCycle(cycle) {
  const [y, m] = cycle.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function cycleStart(cycle) {
  return `${cycle}-01`;
}

export function cycleEnd(cycle) {
  return `${cycle}-${String(daysInCycle(cycle)).padStart(2, '0')}`;
}

export function dayOf(cycle, day) {
  return `${cycle}-${String(day).padStart(2, '0')}`;
}

export function nextCycle(cycle) {
  const [y, m] = cycle.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function previousCycle(cycle) {
  const [y, m] = cycle.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Inclusive count of days in [from, to] that fall inside the cycle. Null bounds are open.
export function activeDaysInCycle(cycle, from, to) {
  const start = cycleStart(cycle);
  const end = cycleEnd(cycle);
  const lo = from && from > start ? from : start;
  const hi = to && to < end ? to : end;
  if (lo > hi) return 0;
  return Math.round((Date.parse(hi) - Date.parse(lo)) / 86400000) + 1;
}

export function toDateTime(date) {
  return `${date}T00:00:00Z`;
}

// The sandbox clock: the day the last cycle's bills were issued. Keeps product status deterministic.
export const SANDBOX_TODAY = '2026-10-01';
