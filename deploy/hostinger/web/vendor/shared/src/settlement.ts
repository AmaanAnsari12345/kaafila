/**
 * Kitty: shared trip expenses and minimum-transfer settlement.
 * All amounts are integer minor units (paise / cents) to avoid floating point drift.
 */

export type ExpenseCategory = "fuel" | "toll" | "food" | "stay" | "parking" | "repair" | "activity" | "other";
export type SplitMode = "equal" | "custom";

export interface ExpenseInput {
  id: string;
  paidByUserId: string;
  amountMinor: number;
  shares: { userId: string; amountMinor: number }[];
}

/** Split `amountMinor` equally; the remainder paise go to the first participants so the sum is exact. */
export function splitEqually(amountMinor: number, userIds: string[]): { userId: string; amountMinor: number }[] {
  if (userIds.length === 0) return [];
  const unique = [...new Set(userIds)];
  const base = Math.floor(amountMinor / unique.length);
  let remainder = amountMinor - base * unique.length;
  return unique.map((userId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { userId, amountMinor: base + extra };
  });
}

/** Split by weights (e.g. by number of people per car). */
export function splitByWeight(amountMinor: number, weights: { userId: string; weight: number }[]): { userId: string; amountMinor: number }[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w.weight), 0);
  if (total <= 0) return splitEqually(amountMinor, weights.map((w) => w.userId));
  const raw = weights.map((w) => ({ userId: w.userId, exact: (amountMinor * Math.max(0, w.weight)) / total }));
  const floored = raw.map((r) => ({ userId: r.userId, amountMinor: Math.floor(r.exact), frac: r.exact - Math.floor(r.exact) }));
  let remainder = amountMinor - floored.reduce((s, f) => s + f.amountMinor, 0);
  for (const f of [...floored].sort((a, b) => b.frac - a.frac)) {
    if (remainder <= 0) break;
    f.amountMinor += 1;
    remainder -= 1;
  }
  return floored.map(({ userId, amountMinor: a }) => ({ userId, amountMinor: a }));
}

export function validateShares(expense: ExpenseInput): string | null {
  if (!Number.isInteger(expense.amountMinor) || expense.amountMinor <= 0) return "Amount must be a positive whole number of minor units.";
  if (expense.shares.length === 0) return "At least one person must share the expense.";
  if (expense.shares.some((s) => !Number.isInteger(s.amountMinor) || s.amountMinor < 0)) return "Shares must be non-negative whole numbers.";
  const sum = expense.shares.reduce((s, x) => s + x.amountMinor, 0);
  if (sum !== expense.amountMinor) return `Shares add up to ${sum} but the expense is ${expense.amountMinor}.`;
  return null;
}

/** Net balance per user: positive = is owed money, negative = owes money. */
export function computeBalances(expenses: ExpenseInput[]): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (u: string, v: number) => balances.set(u, (balances.get(u) ?? 0) + v);
  for (const e of expenses) {
    add(e.paidByUserId, e.amountMinor);
    for (const s of e.shares) add(s.userId, -s.amountMinor);
  }
  return balances;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

/**
 * Greedy settlement: repeatedly match the largest debtor with the largest creditor.
 * Produces at most n-1 transfers and settles every balance exactly.
 */
export function settle(balances: Map<string, number>): Transfer[] {
  const creditors = [...balances].filter(([, v]) => v > 0).map(([u, v]) => ({ u, v }));
  const debtors = [...balances].filter(([, v]) => v < 0).map(([u, v]) => ({ u, v: -v }));
  const transfers: Transfer[] = [];

  while (creditors.length && debtors.length) {
    creditors.sort((a, b) => b.v - a.v || a.u.localeCompare(b.u));
    debtors.sort((a, b) => b.v - a.v || a.u.localeCompare(b.u));
    const c = creditors[0]!;
    const d = debtors[0]!;
    const amount = Math.min(c.v, d.v);
    transfers.push({ fromUserId: d.u, toUserId: c.u, amountMinor: amount });
    c.v -= amount;
    d.v -= amount;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }

  return transfers;
}

/**
 * UPI deep link (NPCI "upi://pay" intent). Opens any installed UPI app on Android/iOS.
 * pa = payee VPA, pn = payee name, am = amount in rupees with 2 decimals, cu = currency, tn = note.
 */
export function upiPayLink(params: { vpa: string; payeeName: string; amountMinor: number; note: string }): string {
  const q = new URLSearchParams({
    pa: params.vpa,
    pn: params.payeeName,
    am: (params.amountMinor / 100).toFixed(2),
    cu: "INR",
    tn: params.note.slice(0, 80)
  });
  return `upi://pay?${q.toString()}`;
}

export function isValidVpa(vpa: string): boolean {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/.test(vpa);
}

export function formatMinor(amountMinor: number, currency = "INR", locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: amountMinor % 100 === 0 ? 0 : 2 }).format(
    amountMinor / 100
  );
}
