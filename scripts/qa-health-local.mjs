// Explicit synthetic QA against the loopback server; its database may be production.
import assert from "node:assert/strict";
const args = process.argv.slice(2);
if (!args.includes("--allow-local-qa-writes")) throw new Error("Explicit --allow-local-qa-writes required.");
const origin = new URL(process.env.FMS_QA_ORIGIN ?? "http://localhost:5173");
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new Error("Only loopback origins allowed.");
const family = "20000000-0000-4000-8000-000000000002", other = "10000000-0000-4000-8000-000000000001";
const sections = { medication: "medications", appointment: "appointments", measurement: "measurements" };
let checks = 0;
async function call(path, method = "GET", body, expected = 200, active = family, signed = true) {
  const response = await fetch(new URL(path, origin), { method, headers: {
    ...(signed ? { Cookie: `__sites_local_auth=1; fms_active_family=${active}` } : {}),
    ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
  }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  const contentType = response.headers.get("Content-Type") ?? "";
  const payload = contentType.includes("json") ? await response.json() : await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(payload)}`); checks += 1;
  return payload;
}
const before = await call("/api/health");
assert.equal(before.migrationRequired, false);
const cleanup = args.indexOf("--cleanup-prefix");
if (cleanup !== -1) {
  const prefix = args[cleanup + 1];
  if (!/^QA Health \d{14}$/.test(prefix ?? "")) throw new Error("Exact synthetic QA Health prefix required.");
  const match = r => [r.title, r.medicine_name, r.instructions, r.notes].some(v => typeof v === "string" && (v === prefix || v.startsWith(`${prefix} `)));
  const deleted = {};
  for (const [kind, section] of Object.entries(sections)) {
    const rows = before[section].filter(match); deleted[kind] = rows.length;
    for (const r of rows) await call("/api/health/records", "DELETE", { kind, recordId: r.id });
  }
  const docs = before.documents.filter(match); deleted.documents = docs.length;
  for (const d of docs) await call(`/api/health-document/${d.id}`, "DELETE");
  for (const d of docs) await call(`/api/health-document/${d.id}`, "GET", undefined, 404);
  const after = await call("/api/health");
  for (const section of [...Object.values(sections), "documents"]) { assert.deepEqual(after[section], before[section].filter(r => !match(r))); checks += 1; }
  for (const key of ["profile", "emergencyDirectory", "sosAlerts", "sosResponses"]) { assert.deepEqual(after[key], before[key]); checks += 1; }
  console.log(JSON.stringify({ prefix, checks, deleted, unrelatedRecordsUnchanged: true })); process.exit(0);
}
const prefix = `QA Health ${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
console.log(JSON.stringify({ prefix, mode: "seed", warning: "No real care/bookings/SOS; records remain until exact-prefix cleanup." }));
const records = {};
const data = {
  medication: { medicineName: `${prefix} Medicine`, dosage: "QA only — not treatment", frequency: "QA only", reminderTimes: ["08:00", "20:00"], startDate: "2026-10-08", endDate: "2026-10-09", instructions: prefix },
  appointment: { title: `${prefix} Appointment`, scheduledAt: "2026-10-09T08:15:00+06:00", reminderMinutes: "15", notes: prefix, facility: "QA only — no booking" },
  measurement: { measurementType: "blood_pressure", valuePrimary: "120.25", valueSecondary: "80.50", unit: "mmHg", measuredAt: "2026-10-08T08:15:00+06:00", notes: prefix },
};
await call("/api/health", "GET", undefined, 401, family, false);
await call("/api/health/records", "POST", { action: "create_appointment", data: data.appointment }, 401, family, false);
for (const kind of Object.keys(sections)) {
  records[kind] = (await call("/api/health/records", "POST", { action: `create_${kind}`, data: data[kind] }, 201)).record;
  const edited = { ...data[kind], ...(kind === "medication" ? { medicineName: `${prefix} Medicine edited` } : kind === "appointment" ? { title: `${prefix} Appointment edited`, scheduledAt: "2026-10-09T09:15:00+06:00" } : { valuePrimary: "121.25" }) };
  records[kind] = (await call("/api/health/records", "PATCH", { kind, recordId: records[kind].id, data: edited })).record;
  for (const method of ["PATCH", "DELETE"]) await call("/api/health/records", method, { kind, recordId: records[kind].id, data: edited }, 404, other);
}
assert.equal(records.appointment.scheduled_at, "2026-10-09T03:15:00+00:00"); checks += 1;
for (const [kind, states] of [["medication", ["paused", "completed", "active"]], ["appointment", ["completed", "cancelled", "scheduled"]]]) {
  for (const status of states) { const p = await call("/api/health/records", "POST", { action: "update_status", data: { entity: kind, id: records[kind].id, status } }); assert.equal(p.record.status, status); checks += 1; }
  await call("/api/health/records", "POST", { action: "update_status", data: { entity: kind, id: records[kind].id, status: states[0] } }, 404, other);
}
const invalid = [
  ["appointment", { reminderMinutes: "bad" }], ["appointment", { reminderMinutes: "1.5" }], ["appointment", { scheduledAt: "2026-02-30T08:00:00Z" }], ["appointment", { scheduledAt: "2026-10-08T08:00" }],
  ["measurement", { measuredAt: "bad" }], ["measurement", { valuePrimary: true }], ["measurement", { valuePrimary: "0.001" }], ["measurement", { valueSecondary: "" }],
  ["medication", { reminderTimes: ["25:00"] }], ["medication", { startDate: "2026-02-30" }], ["medication", { endDate: "2026-10-07" }],
];
await Promise.all(invalid.map(([kind, extra]) => call("/api/health/records", "POST", { action: `create_${kind}`, data: { ...data[kind], ...extra } }, 400)));
for (const kind of Object.keys(sections)) await call("/api/health/records", "PATCH", { kind, recordId: records[kind].id, data: { ...data[kind], ...(kind === "medication" ? { reminderTimes: ["bad"] } : kind === "appointment" ? { reminderMinutes: "bad" } : { measuredAt: "bad" }) } }, 400);
for (const method of ["PATCH", "DELETE"]) await call("/api/health/records", method, { kind: "constructor", recordId: records.medication.id }, 400);
await call("/api/health/records", "POST", { action: "save_profile", data: { dateOfBirth: "2026-02-30" } }, 400);
// Tiny synthetic PNG: no personal medical/identity information.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6z9sAAAAASUVORK5CYII=", "base64");
function upload(date, type = "image/png", bytes = png) { const f = new FormData(); f.set("file", new Blob([bytes], { type }), `${prefix}.png`); f.set("title", `${prefix} Document`); f.set("documentDate", date); f.set("notes", prefix); return f; }
await call("/api/health/upload", "POST", upload("2026-02-30"), 400);
await call("/api/health/upload", "POST", upload("2026-10-08", "text/html"), 400);
await call("/api/health/upload", "POST", upload("2026-10-08", "image/png", Buffer.alloc(0)), 400);
const document = (await call("/api/health/upload", "POST", upload("2026-10-08"), 201)).document;
const file = await fetch(new URL(`/api/health-document/${document.id}`, origin), { headers: { Cookie: `__sites_local_auth=1; fms_active_family=${family}` } });
assert.equal(file.status, 200); assert.equal(file.headers.get("X-Content-Type-Options"), "nosniff"); assert.deepEqual(Buffer.from(await file.arrayBuffer()), png); checks += 3;
await call(`/api/health-document/${document.id}`, "GET", undefined, 404, other);
await call(`/api/health-document/${document.id}`, "DELETE", undefined, 404, other);
await call(`/api/health-document/${document.id}`, "GET", undefined, 401, family, false);
const after = await call("/api/health");
for (const section of [...Object.values(sections), "documents"]) for (const record of before[section]) { assert.deepEqual(after[section].find(r => r.id === record.id), record); checks += 1; }
for (const key of ["profile", "emergencyDirectory", "sosAlerts", "sosResponses"]) { assert.deepEqual(after[key], before[key]); checks += 1; }
console.log(JSON.stringify({ prefix, checks, ids: Object.fromEntries(Object.entries(records).map(([k, r]) => [k, r.id])), documentId: document.id, unrelatedRecordsUnchanged: true }));
