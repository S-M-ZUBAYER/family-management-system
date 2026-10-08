// Draft-only QA; the loopback application may point at production Supabase.
import assert from "node:assert/strict";
const args = process.argv.slice(2);
if (!args.includes("--allow-local-qa-writes")) throw new Error("Explicit --allow-local-qa-writes required.");
const origin = new URL(process.env.FMS_QA_ORIGIN ?? "http://localhost:5173");
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new Error("Loopback origin required.");
const family = "20000000-0000-4000-8000-000000000002", other = "10000000-0000-4000-8000-000000000001";
let checks = 0;
async function call(path, method = "GET", body, expected = 200, active = family, signed = true) {
  const response = await fetch(new URL(path, origin), { method, headers: { ...(signed ? { Cookie: `__sites_local_auth=1; fms_active_family=${active}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const payload = (response.headers.get("content-type") ?? "").includes("json") ? await response.json() : await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(payload)}`); checks++;
  if (path === "/api/welfare/records" && [200, 201].includes(expected)) {
    assert.equal(payload.auditPending, false, "Confirmed ordinary write must have a successful audit");
    assert.equal(payload.outcomeUnknown, undefined, "Confirmed write must not claim an uncertain outcome"); checks += 2;
  }
  return payload;
}
const sections = ["funds", "contributions", "expenses", "requests", "pledges", "documents"];
const before = await call("/api/welfare"); assert.equal(before.family.id, family); assert.equal(before.migrationRequired, false); checks += 2;
const cleanup = args.indexOf("--cleanup-prefix");
if (cleanup !== -1) {
  const prefix = args[cleanup + 1]; if (!/^QA Welfare Inputs \d{14}$/.test(prefix ?? "")) throw new Error("Exact synthetic prefix required.");
  const match = r => [r.title, r.notes].some(v => typeof v === "string" && (v === prefix || v.startsWith(`${prefix} `)));
  const deleted = {};
  const deletedIds = [];
  for (const [kind, section] of [["expense", "expenses"], ["request", "requests"], ["pledge", "pledges"]]) {
    const rows = before[section].filter(match); assert.ok(rows.length <= 1); deleted[kind] = rows.length;
    for (const row of rows) { assert.ok((kind === "expense" ? ["pending"] : kind === "request" ? ["submitted"] : ["active", "paused"]).includes(row.status)); await call("/api/welfare/records", "DELETE", { kind, recordId: row.id }); deletedIds.push([kind, row.id]); }
  }
  const after = await call("/api/welfare");
  for (const section of sections) { assert.deepEqual(after[section], before[section].filter(r => !match(r))); checks++; }
  const logs = (await call("/api/admin")).auditLogs;
  for (const [kind,id] of deletedIds) { assert.ok(logs.some(r=>r.entity_id===id&&r.action===`welfare_${kind}_deleted`)); checks++; }
  console.log(JSON.stringify({ prefix, checks, deleted, unrelatedRecordsUnchanged: true })); process.exit(0);
}
const fund = before.funds.find(r => r.status === "active"); if (!fund) throw new Error("An existing active QA fund is needed; no automatic new fund creation.");
const prefix = `QA Welfare Inputs ${new Date().toISOString().replace(/\D/g, "").slice(0,14)}`;
console.log(JSON.stringify({ prefix, warning: "Draft-only; no contributions, approvals, outflow or real payment. Exact-prefix cleanup required later." }));
const data = {
  fund: { name: `${prefix} Not created`, targetAmount: "0", openingBalance: "0" },
  contribution: { fundId: fund.id, amount: "1.25", contributionDate: "2026-10-08", contributorName: `${prefix} Not created` },
  expense: { fundId: fund.id, title: `${prefix} Expense`, amount: "1.25", expenseDate: "2026-10-08", notes: prefix },
  request: { fundId: fund.id, title: `${prefix} Request`, description: "Synthetic validation QA only — no aid requested.", requestedAmount: "1.25" },
  pledge: { fundId: fund.id, amount: "1.25", frequency: "monthly", startDate: "2026-10-08", nextDueDate: "2026-11-08", notes: prefix },
};
await call("/api/welfare/records", "POST", { action: "create_request", data: data.request }, 401, family, false);
for (const kind of Object.keys(data)) {
  const key = kind === "fund" ? "openingBalance" : kind === "request" ? "requestedAmount" : "amount";
  for (const value of [true, [], {}, "1e2", "0x10", "1.001", -1, "1000000000000"]) {
    const p = await call("/api/welfare/records", "POST", { action: `create_${kind}`, data: { ...data[kind], [key]: value } }, 400);
    assert.equal(p.code, "WELFARE_INVALID_MONEY"); checks++;
  }
}
for (const [kind,key] of [["contribution","contributionDate"],["expense","expenseDate"],["pledge","startDate"],["pledge","nextDueDate"]]) for (const value of ["2026-02-30","bad", "2026-10-08 garbage"]) {
  const p = await call("/api/welfare/records", "POST", { action: `create_${kind}`, data: { ...data[kind], [key]: value } }, 400); assert.equal(p.code,"WELFARE_INVALID_DATE"); checks++;
}
for (const [kind,key] of [["fund","category"],["fund","visibility"],["contribution","paymentMethod"],["expense","paymentMethod"],["request","urgency"],["request","requestType"],["pledge","frequency"]]) await call("/api/welfare/records", "POST", { action: `create_${kind}`, data: { ...data[kind], [key]: "invalid" } }, 400);
for (const body of [null, [], true]) for (const method of ["POST","PATCH","DELETE"]) await call("/api/welfare/records", method, body, 400);
for (const bad of [null,[],true]) await call("/api/welfare/records", "POST", { action: "create_request", data: bad }, 400);
for (const entity of ["constructor","__proto__","bogus",null]) await call("/api/welfare/records", "POST", { action:"update_status", data:{entity,id:fund.id,status:"paused"} }, 400);
const records = {};
for (const kind of ["expense","request","pledge"]) {
  const created = (await call("/api/welfare/records","POST",{action:`create_${kind}`,data:data[kind]},201)).record;
  const edit = { ...data[kind], ...(kind === "request" ? { title: `${prefix} Request edited`, requestedAmount:"2.50" } : kind === "expense" ? { title: `${prefix} Expense edited`, amount:"2.50", expenseDate:"2024-02-29" } : { amount:"2.50", nextDueDate:"2026-12-08" }) };
  records[kind] = (await call("/api/welfare/records","PATCH",{kind,recordId:created.id,data:edit})).record;
  assert.equal(Number(records[kind][kind === "request" ? "requested_amount" : "amount"]),2.5); checks++;
  for (const method of ["PATCH","DELETE"]) await call("/api/welfare/records",method,{kind,recordId:created.id,data:edit},404,other);
  await call("/api/welfare/records","PATCH",{kind,recordId:created.id,data:{...edit,[kind === "request" ? "requestedAmount" : "amount"]:true}},400);
  for (const badKind of ["constructor","__proto__"]) for (const method of ["PATCH","DELETE"]) await call("/api/welfare/records",method,{kind:badKind,recordId:created.id},400);
}
for (const status of ["paused","active"]) { const p=await call("/api/welfare/records","POST",{action:"update_status",data:{entity:"pledge",id:records.pledge.id,status}}); assert.equal(p.record.status,status); checks++; }
for (const approvedAmount of [true,"1.001","",null,"3.00"]) await call("/api/welfare/records","POST",{action:"update_status",data:{entity:"request",id:records.request.id,status:"approved",approvedAmount}},400);
await call("/api/welfare/records","POST",{action:"update_status",data:{entity:"request",id:records.request.id,status:"approved",approvedAmount:"1.25",paymentMethod:"invalid"}},400);
const after = await call("/api/welfare");
const ids = new Set(Object.values(records).map(r=>r.id));
for (const section of sections) { assert.deepEqual(after[section].filter(r=>!ids.has(r.id)),before[section]); checks++; }
assert.equal(after.requests.find(r=>r.id===records.request.id).status,"submitted"); assert.equal(after.expenses.find(r=>r.id===records.expense.id).status,"pending"); checks+=2;
const logs = (await call("/api/admin")).auditLogs;
for (const [kind,r] of Object.entries(records)) for (const action of [`create_${kind}`,`welfare_${kind}_updated`]) { assert.ok(logs.some(a=>a.entity_id===r.id&&a.action===action)); checks++; }
console.log(JSON.stringify({ prefix, checks, ids: Object.fromEntries(Object.entries(records).map(([k,r])=>[k,r.id])), unrelatedRecordsUnchanged:true }));
