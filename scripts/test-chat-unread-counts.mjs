import assert from "node:assert/strict";
import test from "node:test";

import { countUnreadChatMessages } from "../lib/chat-unread-counts.ts";

test("unread counts include history beyond the old 1,000-message slice and retain tenant filters", async () => {
  const paths = [];
  const counts = await countUnreadChatMessages(
    [{ id: "visible-1" }, { id: "visible-2" }],
    new Map([["visible-1", { last_read_at: "2026-10-01T00:00:00Z" }]]),
    "family-1", "viewer-1",
    async (path) => { paths.push(path); return path.includes("visible-1") ? 1201 : 3; },
  );
  assert.equal(counts.get("visible-1"), 1201);
  assert.equal(counts.get("visible-2"), 3);
  assert.equal(paths.length, 2);
  for (const path of paths) {
    const query = new URL(path, "https://example.test/").searchParams;
    assert.equal(query.get("family_id"), "eq.family-1");
    assert.equal(query.get("auth_user_id"), "neq.viewer-1");
    assert.equal(query.get("limit"), "0");
  }
  assert.equal(new URL(paths[0], "https://example.test/").searchParams.get("created_at"), "gt.2026-10-01T00:00:00Z");
  assert.equal(new URL(paths[1], "https://example.test/").searchParams.has("created_at"), false);
});

test("only explicitly supplied accessible channels are counted", async () => {
  const called = [];
  await countUnreadChatMessages([{ id: "family-channel" }], new Map(), "family-1", "viewer-1", async (path) => { called.push(path); return 0; });
  assert.equal(called.length, 1);
  assert.equal(new URL(called[0], "https://example.test/").searchParams.get("channel_id"), "eq.family-channel");
});
