type Money = number | string | null | undefined;
export function financeMoneyTotal(values: Iterable<Money>): number {
  let total = BigInt(0);
  for (const value of values) {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? 0));
    if (!match) throw new RangeError("Invalid finance amount");
    const cents = BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0"));
    total += match[1] ? -cents : cents;
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError("Finance total exceeds numeric export precision");
  return Number(total) / 100;
}
export function financeOutstanding(due: Money, paid: Money) {
  return Math.max(0, financeMoneyTotal([due, -Number(paid ?? 0)]));
}
