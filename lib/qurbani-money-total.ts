type MoneyValue = number | string | null | undefined;

function centsOf(value: MoneyValue): bigint {
  const text = String(value ?? 0);
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError("Invalid Qurbani money amount");
  const cents = BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

// PostgreSQL numeric(14,2) values are summed as cents before converting to
// the numeric values expected by charts and XLSX cells.
export function qurbaniMoneyTotal(values: Iterable<MoneyValue>): number {
  let cents = BigInt(0);
  for (const value of values) cents += centsOf(value);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Qurbani money total exceeds XLSX numeric precision");
  }
  return Number(cents) / 100;
}

export function qurbaniMoneyOutstanding(due: MoneyValue, paid: MoneyValue): number {
  return Math.max(0, qurbaniMoneyTotal([due, -Number(paid ?? 0)]));
}
