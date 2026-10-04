import assert from "node:assert/strict";
import test from "node:test";

import { eventActionCopy } from "../lib/event-action-copy.ts";

test("draft and published event confirmations have different visibility copy", () => {
  for (const locale of ["bn", "en"]) {
    const draft = eventActionCopy("/api/events", "POST", { status: "draft" }, locale);
    const published = eventActionCopy("/api/events", "POST", { status: "published" }, locale);
    assert.notEqual(draft.title, published.title);
    assert.match(draft.description, locale === "bn" ? /প্রকাশিত হবে না/ : /not be visible/);
    assert.match(published.successMessage, locale === "bn" ? /প্রকাশিত/ : /published/);
  }
});

test("event status changes and deletion explain consequences", () => {
  for (const locale of ["bn", "en"]) {
    for (const action of ["draft", "close", "cancel"]) {
      const copy = eventActionCopy("/api/events/123", "PATCH", { action }, locale);
      assert.equal(copy.destructive, true);
    }
    const deletion = eventActionCopy("/api/events/123", "DELETE", {}, locale);
    assert.equal(deletion.destructive, true);
    assert.match(deletion.description, /RSVP/);
  }
});

test("RSVP, comment, media upload and deletion receive distinct copy", () => {
  for (const locale of ["bn", "en"]) {
    const going = eventActionCopy("/api/events/123/rsvp", "POST", { response: "going" }, locale);
    const notGoing = eventActionCopy("/api/events/123/rsvp", "POST", { response: "not_going" }, locale);
    assert.notEqual(going.description, notGoing.description);
    assert.notEqual(eventActionCopy("/api/events/123/comments", "POST", {}, locale).title, going.title);
    assert.equal(eventActionCopy("/api/events/123/media", "POST", {}, locale).destructive, false);
    assert.equal(eventActionCopy("/api/event-media/123", "DELETE", {}, locale).destructive, true);
  }
  assert.equal(eventActionCopy("/api/events", "GET", {}, "en"), null);
});
