import assert from "node:assert/strict";
import test from "node:test";
import { welfareDocumentInput, welfareDocumentUuid, publicWelfareDocument, persistWelfareDocument } from "../lib/welfare-document-upload.ts";
import { welfareDocumentActionCopy, welfareDocumentErrorCopy, welfareDocumentResultCopy } from "../lib/welfare-document-action-copy.ts";
import { mutationResponseResult } from "../lib/action-feedback.ts";

const id = "20000000-0000-4000-8000-000000000002";
function form(extra = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ file: new File(["QA"], "qa.png", { type: "image/png" }), entityType: "request", entityId: id, ...extra })) f.set(k, v);
  return f;
}
const row = { id, entity_type: "request", entity_id: id, document_type: "receipt", title: "QA", file_name: "qa.png", mime_type: "image/png", file_size: 2, visibility: "admins", uploaded_by_user_id: "owner", uploaded_by_name: "QA", created_at: "2026-10-08T00:00:00Z", family_id: id, storage_key: "private-key", unexpected: "secret" };

test("validate file MIME and nonempty 12 MB limit", () => {
  assert.equal(welfareDocumentInput(form(), true).value.file.size, 2);
  for (const file of ["text", new File(["html"], "x.html", { type: "text/html" })]) assert.equal(welfareDocumentInput(form({ file }), true).code, "WELFARE_DOCUMENT_FILE_TYPE");
  for (const n of [0, 12 * 1024 * 1024 + 1]) assert.equal(welfareDocumentInput(form({ file: new File([new Uint8Array(n)], "x.png", { type: "image/png" }) }), true).code, "WELFARE_DOCUMENT_FILE_SIZE");
});
test("reject inherited keys and malformed IDs before any query", () => {
  for (const entityType of ["constructor", "__proto__", "toString", "pledge"]) assert.equal(welfareDocumentInput(form({ entityType }), true).code, "WELFARE_DOCUMENT_LINK_INVALID");
  for (const entityId of ["", `${id},or(id.not.is.null)`, "bad", ` ${id}`]) assert.equal(welfareDocumentInput(form({ entityId }), true).code, "WELFARE_DOCUMENT_LINK_INVALID");
  assert.equal(welfareDocumentUuid(id), true); assert.equal(welfareDocumentUuid(null), false);
});
test("validate enums, apply safe defaults, never let members publish family evidence", () => {
  assert.equal(welfareDocumentInput(form(), true).value.documentType, "other");
  assert.equal(welfareDocumentInput(form({ visibility: "family" }), false).value.visibility, "admins");
  assert.equal(welfareDocumentInput(form({ visibility: "family" }), true).value.visibility, "family");
  for (const extra of [{ documentType: "bad" }, { visibility: "public" }]) assert.equal(welfareDocumentInput(form(extra), true).code, "WELFARE_DOCUMENT_OPTIONS_INVALID");
});
test("projection omits internal keys and derives ownership", () => {
  const result = publicWelfareDocument(row, "owner", false);
  for (const key of ["family_id", "storage_key", "uploaded_by_user_id", "unexpected"]) assert.equal(Object.hasOwn(result, key), false);
  assert.equal(result.is_mine, true); assert.equal(result.can_view, true);
  assert.equal(publicWelfareDocument(row, "other", false).can_view, false);
});
test("successful upload writes scoped audit after metadata and retains object", async () => {
  const calls = []; let removed = false;
  const result = await persistWelfareDocument(async (path, init) => { calls.push([path, JSON.parse(init.body)]); return path === "welfare_documents" ? [row] : null; }, { put: async () => calls.push(["storage"]), remove: async () => { removed = true; } }, { family_id: id }, "owner", true);
  assert.equal(result.auditPending, false); assert.equal(removed, false);
  assert.deepEqual(calls.map(c => c[0]), ["storage", "welfare_documents", "audit_logs"]);
  assert.equal(calls[2][1].family_id, id); assert.equal(calls[2][1].entity_id, id); assert.equal(calls[2][1].actor_user_id, "owner");
});
test("confirmed metadata rejection compensates object and never audits", async () => {
  const calls = [];
  await assert.rejects(persistWelfareDocument(async path => { calls.push(path); throw new Error("metadata failed"); }, { put: async () => {}, remove: async () => calls.push("cleanup"), metadataRejected: () => true }, {}, "owner", true), /metadata failed/);
  assert.deepEqual(calls, ["welfare_documents", "cleanup"]);
});
test("ambiguous metadata response never deletes a possibly committed file", async () => {
  let removed = false;
  await assert.rejects(persistWelfareDocument(async () => { throw new Error("lost response"); }, { put: async () => {}, remove: async () => { removed = true; } }, {}, "owner", true), /outcome is uncertain/);
  assert.equal(removed, false);
});
test("audit failure preserves committed metadata/file and reports pending", async () => {
  let removed = false;
  const result = await persistWelfareDocument(async path => { if (path === "welfare_documents") return [row]; throw new Error("simulated audit outage"); }, { put: async () => {}, remove: async () => { removed = true; } }, { family_id: id }, "owner", true);
  assert.equal(result.auditPending, true); assert.equal(removed, false); assert.equal(result.document.id, id);
});
test("upload/delete confirmations and errors are bilingual and retention-aware", () => {
  for (const locale of ["bn", "en"]) {
    assert.equal(welfareDocumentActionCopy("/api/welfare/upload", "POST", locale).destructive, false);
    const del = welfareDocumentActionCopy(`/api/welfare-document/${id}`, "DELETE", locale);
    assert.equal(del.destructive, true); assert.match(del.description, locale === "en" ? /finalized/ : /চূড়ান্ত/);
    assert.ok(welfareDocumentErrorCopy("WELFARE_DOCUMENT_FILE_SIZE", locale));
    const pending = welfareDocumentResultCopy("/api/welfare/upload", { auditPending: true }, locale);
    assert.match(pending, locale === "en" ? /do not upload/ : /আবার আপলোড/);
    assert.equal(mutationResponseResult(202, pending, locale).kind, "info");
    const both = welfareDocumentResultCopy(`/api/welfare-document/${id}`, { cleanupPending: true, auditPending: true }, locale);
    assert.match(both, locale === "en" ? /cleanup/ : /পরিষ্কার/);
  }
  assert.equal(welfareDocumentActionCopy(`/api/welfare-document/${id}`, "GET", "en"), null);
  assert.equal(welfareDocumentErrorCopy("constructor", "en"), null);
  assert.equal(welfareDocumentResultCopy("/api/welfare/upload", {}, "en"), null);
});
