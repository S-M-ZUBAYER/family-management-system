// Synthetic draft request + tiny receipt only. The loopback server may use production.
import assert from "node:assert/strict";
const args = process.argv.slice(2);
if (!args.includes("--allow-local-qa-writes")) throw new Error("Explicit --allow-local-qa-writes required.");
const origin = new URL(process.env.FMS_QA_ORIGIN ?? "http://localhost:5173");
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new Error("Loopback only.");
const family = "20000000-0000-4000-8000-000000000002", other = "10000000-0000-4000-8000-000000000001";
let checks = 0;
async function call(path, method = "GET", body, expected = 200, active = family, signed = true) {
  const r = await fetch(new URL(path, origin), { method, headers: { ...(signed ? { Cookie: `__sites_local_auth=1; fms_active_family=${active}` } : {}), ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  const p = (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : await r.text();
  assert.ok((Array.isArray(expected) ? expected : [expected]).includes(r.status), `${method} ${path}: status ${r.status}; ${JSON.stringify(p)}`); checks++; return p;
}
const sections = ["funds", "contributions", "expenses", "requests", "pledges", "documents"];
const before = await call("/api/welfare");
assert.equal(before.family.id, family); assert.equal(before.migrationRequired, false); checks += 2;
const cleanupIndex = args.indexOf("--cleanup-prefix");
if (cleanupIndex !== -1) {
  const prefix = args[cleanupIndex + 1];
  if (!/^QA Welfare Docs \d{14}$/.test(prefix ?? "")) throw new Error("Exact synthetic prefix required.");
  const match = r => typeof r.title === "string" && r.title.startsWith(`${prefix} `);
  const docs = before.documents.filter(match), requests = before.requests.filter(match);
  assert.ok(docs.length <= 1 && requests.length <= 1, "Ambiguous cleanup targets");
  for (const d of docs) { assert.equal(d.entity_type, "request"); assert.ok(requests.some(r => r.id === d.entity_id && r.status === "submitted")); await call(`/api/welfare-document/${d.id}`, "DELETE"); await call(`/api/welfare-document/${d.id}`, "GET", undefined, 404); }
  for (const r of requests) { assert.equal(r.status, "submitted"); await call("/api/welfare/records", "DELETE", { kind: "request", recordId: r.id }); }
  const after = await call("/api/welfare");
  for (const section of sections) { assert.deepEqual(after[section], before[section].filter(r => !match(r))); checks++; }
  const logs = (await call("/api/admin")).auditLogs;
  for (const d of docs) for (const action of ["welfare_document_uploaded", "welfare_document_deleted"]) { assert.ok(logs.some(r => r.entity_id === d.id && r.action === action)); checks++; }
  console.log(JSON.stringify({ prefix, checks, deletedDocuments: docs.length, deletedDraftRequests: requests.length, unrelatedRecordsUnchanged: true })); process.exit(0);
}
const prefix = `QA Welfare Docs ${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
console.log(JSON.stringify({ prefix, warning: "No approval/outflow/payment; remains until exact-prefix cleanup." }));
await call("/api/welfare/upload", "POST", new FormData(), 401, family, false);
const request = (await call("/api/welfare/records", "POST", { action: "create_request", data: { title: `${prefix} Request`, description: "Synthetic file-access QA only — no assistance or payout requested.", requestedAmount: "1.25", visibility: "admins" } }, 201)).record;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6z9sAAAAASUVORK5CYII=", "base64");
function upload(extra = {}, bytes = png, mime = "image/png") { const f = new FormData(); f.set("file", new Blob([bytes], { type: mime }), `${prefix}.png`); for (const [k,v] of Object.entries({ entityType: "request", entityId: request.id, title: `${prefix} Receipt`, documentType: "receipt", visibility: "admins", ...extra })) f.set(k, v); return f; }
for (const extra of [{ entityType: "constructor" }, { entityType: "__proto__" }, { entityType: "pledge" }, { entityId: "bad" }, { documentType: "invalid" }, { visibility: "public" }]) await call("/api/welfare/upload", "POST", upload(extra), 400);
await call("/api/welfare/upload", "POST", upload({}, png, "text/html"), 400);
await call("/api/welfare/upload", "POST", upload({}, Buffer.alloc(0)), 400);
// The dev HTTP transport may reject an oversized body before the route's 400.
await call("/api/welfare/upload", "POST", upload({}, Buffer.alloc(12 * 1024 * 1024 + 1)), [400, 413]);
await call("/api/welfare/upload", "POST", upload({ entityId: "00000000-0000-4000-8000-000000000000" }), 404);
await call("/api/welfare/upload", "POST", upload(), 404, other);
const document = (await call("/api/welfare/upload", "POST", upload(), 201)).document;
for (const key of ["storage_key", "family_id", "uploaded_by_user_id"]) { assert.equal(Object.hasOwn(document, key), false); checks++; }
assert.equal(document.is_mine, true); assert.equal(document.can_view, true); checks += 2;
const file = await fetch(new URL(`/api/welfare-document/${document.id}`, origin), { headers: { Cookie: `__sites_local_auth=1; fms_active_family=${family}` } });
assert.equal(file.status, 200); assert.equal(file.headers.get("X-Content-Type-Options"), "nosniff"); assert.match(file.headers.get("Cache-Control"), /^private/); assert.match(file.headers.get("Content-Disposition"), /^inline/); assert.deepEqual(Buffer.from(await file.arrayBuffer()), png); checks += 5;
for (const method of ["GET", "DELETE"]) { await call(`/api/welfare-document/${document.id}`, method, undefined, 404, other); await call(`/api/welfare-document/${document.id}`, method, undefined, 401, family, false); await call("/api/welfare-document/invalid", method, undefined, 400); }
const parentDelete = await call("/api/welfare/records", "DELETE", { kind: "request", recordId: request.id }, 409); assert.equal(parentDelete.code, "WELFARE_DOCUMENTS_ATTACHED"); checks++;
const after = await call("/api/welfare");
assert.deepEqual(after.documents.find(r => r.id === document.id), document); checks++;
for (const section of sections) { assert.deepEqual(after[section].filter(r => r.id !== request.id && r.id !== document.id), before[section]); checks++; }
const logs = (await call("/api/admin")).auditLogs;
assert.ok(logs.some(r => r.entity_id === document.id && r.action === "welfare_document_uploaded")); checks++;
console.log(JSON.stringify({ prefix, checks, requestId: request.id, documentId: document.id, unrelatedRecordsUnchanged: true }));
