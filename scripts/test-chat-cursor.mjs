import assert from "node:assert/strict";
import test from "node:test";

import { applyChatCursorFilter, formatChatCursor, parseChatCursor } from "../lib/chat-cursor.ts";

const first = { created_at: "2026-10-02T10:20:30.123456+00:00", id: "10000000-0000-4000-8000-000000000001" };

test("timestamp-only initial cursor overlaps its boundary", () => {
  const cursor = parseChatCursor(first.created_at);
  assert.deepEqual(cursor, { createdAt: first.created_at, id: null });
  const query = new URLSearchParams();
  applyChatCursorFilter(query, cursor);
  assert.equal(query.get("created_at"), `gte.${first.created_at}`);
});

test("composite cursor preserves same-timestamp messages with later UUIDs", () => {
  const cursor = parseChatCursor(formatChatCursor(first));
  assert.deepEqual(cursor, { createdAt: first.created_at, id: first.id });
  const query = new URLSearchParams();
  applyChatCursorFilter(query, cursor);
  assert.equal(query.get("or"), `(created_at.gt.${first.created_at},and(created_at.eq.${first.created_at},id.gt.${first.id}))`);
});

test("invalid and injected cursor values are rejected", () => {
  for (const value of [null, "", "2026-10-02", "2026-10-02T10:20:30Z|evil", `${first.created_at}|${first.id})`, `${first.created_at}\n\nid: evil`]) {
    assert.equal(parseChatCursor(value), null);
  }
});
