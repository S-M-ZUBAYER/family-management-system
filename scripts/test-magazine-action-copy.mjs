import assert from "node:assert/strict";
import test from "node:test";
import { magazineActionCopy } from "../lib/magazine-action-copy.ts";

test("draft, review and publish have different visibility confirmations", () => {
  for (const locale of ["bn", "en"]) {
    const endpoint = "/api/magazine/records";
    const draft = magazineActionCopy(endpoint, "POST", { action: "create_article", data: { saveDraft: "true" } }, locale);
    const review = magazineActionCopy(endpoint, "POST", { action: "create_article", data: {} }, locale);
    const publish = magazineActionCopy(endpoint, "POST", { action: "create_article", data: { publishNow: "true" } }, locale);
    assert.notEqual(draft.title, review.title);
    assert.notEqual(review.title, publish.title);
    assert.match(draft.description, locale === "bn" ? /প্রকাশিত হবে না/ : /not be published/);
    assert.match(magazineActionCopy(endpoint, "POST", { action: "set_status", data: { status: "published" } }, locale).successMessage, locale === "bn" ? /প্রকাশিত/ : /published/);
  }
});

test("comment, cover and destructive actions have distinct warnings", () => {
  for (const locale of ["bn", "en"]) {
    const endpoint = "/api/magazine/records";
    assert.notEqual(magazineActionCopy(endpoint, "POST", { action: "add_comment" }, locale).title, magazineActionCopy("/api/magazine/upload", "POST", {}, locale).title);
    assert.equal(magazineActionCopy(endpoint, "DELETE", { kind: "comment" }, locale).destructive, true);
    assert.equal(magazineActionCopy(endpoint, "DELETE", { kind: "article" }, locale).destructive, true);
    assert.equal(magazineActionCopy(endpoint, "POST", { action: "set_status", data: { status: "archived" } }, locale).destructive, true);
  }
  assert.equal(magazineActionCopy("/api/magazine", "GET", {}, "en"), null);
});
