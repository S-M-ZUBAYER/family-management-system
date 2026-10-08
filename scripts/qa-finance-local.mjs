// Opt-in synthetic QA only. This local server can use a production-backed database.
import assert from "node:assert/strict";
const args = process.argv.slice(2);
if (!args.includes("--allow-local-qa-writes")) throw new Error("Explicit --allow-local-qa-writes is required.");
const origin = new URL(process.env.FMS_QA_ORIGIN ?? "http://localhost:5173");
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new Error("QA is restricted to loopback origins.");
const family = "20000000-0000-4000-8000-000000000002";
const other = "10000000-0000-4000-8000-000000000001";
const sections = { account: "accounts", transaction: "transactions", budget: "budgets", debt: "debts", bill: "bills", goal: "goals" };
let checks = 0;
async function call(path, method = "GET", body, expected = 200, active = family, signedIn = true) {
  const response = await fetch(new URL(path, origin), { method, headers: {
    ...(signedIn ? { Cookie: `__sites_local_auth=1; fms_active_family=${active}` } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(payload)}`);
  checks += 1;
  return payload;
}
const before = await call("/api/finance");
assert.equal(before.migrationRequired, false);
const cleanup = args.indexOf("--cleanup-prefix");
if (cleanup !== -1) {
  const prefix = args[cleanup + 1];
  if (!/^QA Finance \d{14}$/.test(prefix ?? "")) throw new Error("Cleanup needs an exact QA Finance timestamp prefix.");
  const selected = {};
  for (const [kind, section] of Object.entries(sections)) selected[kind] = before[section].filter(r =>
    [r.name, r.title, r.category, r.counterparty, r.notes].some(v => typeof v === "string" && (v === prefix || v.startsWith(`${prefix} `))));
  // Delete only this run's owned synthetic IDs, transactions before accounts.
  for (const kind of ["transaction", "budget", "debt", "bill", "goal", "account"]) {
    for (const r of selected[kind]) await call("/api/finance/records", "DELETE", { kind, recordId: r.id });
  }
  const after = await call("/api/finance");
  for (const [kind, section] of Object.entries(sections)) {
    const removed = new Set(selected[kind].map(r => r.id));
    assert.deepEqual(after[section], before[section].filter(r => !removed.has(r.id)), `${section}: unrelated records changed`);
    checks += 1;
  }
  console.log(JSON.stringify({ mode: "cleanup", prefix, checks, deleted: Object.fromEntries(Object.entries(selected).map(([k, v]) => [k, v.length])), unrelatedRecordsUnchanged: true }));
  process.exit(0);
}
const prefix = `QA Finance ${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
const date = new Date().toISOString().slice(0, 10), month = date.slice(0, 7);
const records = {};
async function create(kind, data) {
  const p = await call("/api/finance/records", "POST", { kind, data }, 201);
  records[kind] = p.record; return p.record;
}
async function edit(kind, data) {
  const p = await call("/api/finance/records", "PATCH", { kind, recordId: records[kind].id, data });
  records[kind] = p.record; return p.record;
}
async function status(entity, changes, expected = 200) {
  return call("/api/finance/status", "PATCH", { entity, id: records[entity].id, ...changes }, expected);
}
console.log(JSON.stringify({ mode: "seed", prefix, origin: origin.origin, family, warning: "Synthetic records remain until exact-prefix cleanup." }));
await call("/api/finance", "GET", undefined, 401, family, false);
await call("/api/finance/records", "POST", { kind: "account", data: {} }, 401, family, false);
await call("/api/finance/status", "PATCH", { entity: "constructor", id: "invalid" }, 400);
await create("account", { name: `${prefix} Wallet`, openingBalance: "100", accountType: "mobile" });
await edit("account", { name: `${prefix} Wallet edited`, openingBalance: "123.45", accountType: "mobile" });
const tx = { accountId: records.account.id, category: prefix, amount: "10.10", direction: "income", transactionDate: date, paymentMethod: "mobile", notes: prefix };
await create("transaction", tx);
await edit("transaction", { ...tx, reference: `${prefix} edited` });
for (const amount of ["0.10", "0.20"]) await call("/api/finance/records", "POST", { kind: "transaction", data: { ...tx, amount, direction: "expense" } }, 201);
const budget = { budgetMonth: month, category: prefix, limitAmount: "1", alertPercent: "80", notes: prefix };
await create("budget", budget);
await edit("budget", { ...budget, limitAmount: "0.30" });
const duplicate = await call("/api/finance/records", "POST", { kind: "budget", data: budget }, 409);
assert.equal(duplicate.code, "FINANCE_DUPLICATE_BUDGET"); checks += 1;
const debt = { counterparty: `${prefix} Lender`, principalAmount: "100.30", settledAmount: "0", debtType: "lent", dueDate: date, notes: prefix };
await create("debt", debt);
await edit("debt", { ...debt, counterparty: `${prefix} Lender edited` });
for (const [amount, state] of [["0.10", "partial"], ["100.30", "settled"], ["0", "open"], ["0.10", "partial"]]) {
  assert.equal((await status("debt", { amount })).record.status, state); checks += 1;
}
await status("debt", { amount: "100.31" }, 400);
await call("/api/finance/records", "POST", { kind: "debt", data: { ...debt, counterparty: `${prefix} Borrower`, principalAmount: "20.20", debtType: "borrowed" } }, 201);
const bill = { title: `${prefix} Bill`, category: prefix, amount: "30.40", dueDate: date, recurrence: "monthly", notes: prefix };
await create("bill", bill); await edit("bill", { ...bill, title: `${prefix} Bill edited` });
for (const state of ["paid", "skipped", "pending"]) { assert.equal((await status("bill", { status: state })).record.status, state); checks += 1; }
const goal = { title: `${prefix} Goal`, targetAmount: "50.30", currentAmount: "0.10", targetDate: date, notes: prefix };
await create("goal", goal); await edit("goal", { ...goal, title: `${prefix} Goal edited` });
for (const [amount, state] of [["50.30", "completed"], ["60.30", "completed"], ["10.10", "active"]]) {
  assert.equal((await status("goal", { amount })).record.status, state); checks += 1;
}
await status("goal", { amount: "-1" }, 400);
await status("bill", { status: "invalid" }, 400);
await status("account", { status: "archived" });
await call("/api/finance/records", "POST", { kind: "transaction", data: tx }, 400);
await status("account", { status: "active" });
await call("/api/finance/records", "DELETE", { kind: "account", recordId: records.account.id }, 409);
await call("/api/finance/records", "POST", { kind: "transaction", data: { ...tx, amount: "0.001" } }, 400);
await call("/api/finance/records", "POST", { kind: "transaction", data: { ...tx, transactionDate: "2026-02-30" } }, 400);
for (const kind of Object.keys(sections)) for (const method of ["PATCH", "DELETE"]) {
  await call("/api/finance/records", method, { kind, recordId: records[kind].id, data: {} }, 404, other);
}
for (const entity of ["account", "debt", "bill", "goal"]) await call("/api/finance/status", "PATCH", { entity, id: records[entity].id, status: "active", amount: "0" }, 404, other);
const after = await call("/api/finance");
for (const section of Object.values(sections)) for (const r of before[section]) {
  assert.deepEqual(after[section].find(item => item.id === r.id), r, "An unrelated existing record changed"); checks += 1;
}
console.log(JSON.stringify({ prefix, checks, ids: Object.fromEntries(Object.entries(records).map(([k, r]) => [k, r.id])), unrelatedRecordsUnchanged: true }));
