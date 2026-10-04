import assert from "node:assert/strict";
import test from "node:test";

import { noticeActionCopy } from "../lib/notice-action-copy.ts";

test("draft creation explicitly says it is not published", () => {
  for (const locale of ["bn", "en"]) {
    const copy = noticeActionCopy("/api/notices", "POST", { status: "draft" }, locale);
    assert.equal(copy.destructive, false);
    assert.match(copy.description, locale === "bn" ? /প্রকাশিত হবে না/ : /not be visible/);
    assert.match(copy.successMessage, locale === "bn" ? /খসড়া/ : /draft/);
  }
});

test("publish and edit have distinct confirmation and success copy", () => {
  for (const locale of ["bn", "en"]) {
    const publish = noticeActionCopy("/api/notices", "POST", { status: "published" }, locale);
    const edit = noticeActionCopy("/api/notices/123", "PATCH", { action: "edit" }, locale);
    assert.notEqual(publish.title, edit.title);
    assert.notEqual(publish.successMessage, edit.successMessage);
    assert.equal(edit.destructive, false);
  }
});

test("withdrawal, archive and deletion warn about visibility or permanence", () => {
  for (const locale of ["bn", "en"]) {
    for (const action of ["draft", "archive"]) {
      const copy = noticeActionCopy("/api/notices/123", "PATCH", { action }, locale);
      assert.equal(copy.destructive, true);
      assert.match(copy.description, locale === "bn" ? /সক্রিয় তালিকা/ : /active member notice list/);
    }
    const deletion = noticeActionCopy("/api/notices/123", "DELETE", {}, locale);
    assert.equal(deletion.destructive, true);
    assert.match(deletion.description, locale === "bn" ? /স্থায়ীভাবে/ : /permanently/);
  }
});

test("pin and unpin do not claim to publish a draft", () => {
  for (const action of ["pin", "unpin"]) {
    const copy = noticeActionCopy("/api/notices/123", "PATCH", { action }, "en");
    assert.equal(copy.destructive, false);
    assert.match(copy.description, /publication status will not change/);
  }
  assert.equal(noticeActionCopy("/api/notices", "GET", {}, "en"), null);
});
