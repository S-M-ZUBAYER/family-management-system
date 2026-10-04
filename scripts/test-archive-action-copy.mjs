import assert from "node:assert/strict";
import test from "node:test";

import { archiveActionCopy, archiveFileDeleteActionCopy, archiveUploadActionCopy } from "../lib/archive-action-copy.ts";

test("Archive create/edit/delete dialogs name the record in both languages", () => {
  const create = archiveActionCopy({ action: "create_collection", data: {} }, "POST", "bn");
  assert.match(create.description, /নতুন আর্কাইভ সংগ্রহ রেকর্ড যোগ/);
  assert.match(create.successMessage, /আর্কাইভ সংগ্রহ রেকর্ড যোগ হয়েছে/);
  const edit = archiveActionCopy({ kind: "story" }, "PATCH", "en");
  assert.match(edit.description, /heritage story record/);
  assert.match(archiveActionCopy({ kind: "memory" }, "PATCH", "en").description, /memory record/);
  assert.match(archiveActionCopy({ kind: "vault" }, "PATCH", "bn").description, /ভল্ট ডকুমেন্ট রেকর্ড/);
  const remove = archiveActionCopy({ kind: "asset" }, "DELETE", "bn");
  assert.match(remove.description, /স্থায়ীভাবে মুছবেন/);
  assert.equal(remove.destructive, true);
});

test("Archive status dialogs identify target and locked capsule finality", () => {
  const published = archiveActionCopy({ action: "update_status", data: { entity: "story", status: "published" } }, "POST", "en");
  assert.match(published.description, /heritage story status to “published”/);
  const opened = archiveActionCopy({ action: "update_status", data: { entity: "capsule", status: "opened" } }, "POST", "bn");
  assert.match(opened.description, /ক্যাপসুল আর সম্পাদনা করা যাবে না/);
  assert.equal(opened.destructive, true);
});

test("Unknown archive actions retain generic handling", () => {
  assert.equal(archiveActionCopy({ action: "create_unknown" }, "POST", "en"), null);
  assert.equal(archiveActionCopy({ kind: "__proto__" }, "DELETE", "bn"), null);
  assert.equal(archiveActionCopy({ action: "update_status", data: { entity: "story", status: "bogus" } }, "POST", "bn"), null);
});

test("File upload and permanent file deletion state their actual effects", () => {
  assert.match(archiveUploadActionCopy("memory", "bn").description, /স্মৃতি ফাইলটি/);
  assert.match(archiveUploadActionCopy("vault", "en").description, /vault document file/);
  assert.equal(archiveUploadActionCopy("unknown", "en"), null);
  assert.match(archiveFileDeleteActionCopy("bn").description, /যুক্ত স্মৃতি বা ভল্ট রেকর্ড/);
  assert.match(archiveFileDeleteActionCopy("en").description, /linked memory or vault record/);
  assert.equal(archiveFileDeleteActionCopy("en").destructive, true);
});
