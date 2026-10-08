import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { noticeRecord, noticeTimestamp, noticeStatusPatch, NoticeValidationError, noticeErrorCopy, noticeUuid } from "../lib/notice-validation.ts";
import { noticeIsActive } from "../lib/notice-visibility.ts";
const now = "2026-10-08T10:00:00.000Z";
const form = { titleBn: "QA notice", bodyBn: "Synthetic details only." };
const rejected = (fn, code) => assert.throws(fn, e => e instanceof NoticeValidationError && e.code === code);
test("create defaults to draft, trims valid text, does not silently truncate or coerce options", () => {
  const row = noticeRecord(form, false, now); assert.equal(row.status,"draft"); assert.equal(row.publish_at,null);
  assert.equal(noticeRecord({...form,titleBn:"  QA notice  "}).title_bn,"QA notice");
  for (const field of ["category","priority","status","isPinned"]) for (const bad of [null, [], {}, 1, "bad"]) rejected(()=>noticeRecord({...form,[field]:bad}),"NOTICE_INVALID_OPTION");
  rejected(()=>noticeRecord({...form,titleBn:"a".repeat(181)}),"NOTICE_INVALID_TEXT");
  rejected(()=>noticeRecord({...form,bodyEn:true}),"NOTICE_INVALID_TEXT");
  for (const bad of [null,[],true,"text"]) rejected(()=>noticeRecord(bad),"NOTICE_INVALID_BODY");
});
test("timestamps require actual calendar/time and offset; Dhaka conversion and leap day roundtrip", () => {
  assert.equal(noticeTimestamp("2024-02-29T16:30:00+06:00"),"2024-02-29T10:30:00.000Z");
  for (const bad of [true,[],{},"2026-02-30T10:00Z","2026-10-08T25:00Z","2026-10-08T10:00","2026-10-08","garbage"]) rejected(()=>noticeTimestamp(bad),"NOTICE_INVALID_DATE");
  assert.equal(noticeTimestamp(null),null); assert.equal(noticeTimestamp(""),null);
});
test("effective publish time governs expiry even when publish time omitted", () => {
  assert.equal(noticeRecord({...form,status:"published"},false,now).publish_at,now);
  for (const expiresAt of [now,"2020-01-01T00:00Z"]) rejected(()=>noticeRecord({...form,status:"published",expiresAt},false,now),"NOTICE_INVALID_SCHEDULE");
  rejected(()=>noticeRecord({...form,publishAt:now,expiresAt:now},false,now),"NOTICE_INVALID_SCHEDULE");
});
test("archive maps to archived; pin preserves status; expired publish denied", () => {
  assert.deepEqual(noticeStatusPatch("archive",null,now),{status:"archived"});
  assert.deepEqual(noticeStatusPatch("pin",null,now),{is_pinned:true});
  assert.deepEqual(noticeStatusPatch("unpin",null,now),{is_pinned:false});
  rejected(()=>noticeStatusPatch("publish",now,now),"NOTICE_EXPIRED");
  for (const bad of [null,[],"constructor","__proto__","archived"]) rejected(()=>noticeStatusPatch(bad,null,now),"NOTICE_INVALID_ACTION");
});
test("archived edit stays archived; creating archived notice rejected", () => {
  assert.equal(noticeRecord({...form,status:"archived"},true,now).status,"archived");
  rejected(()=>noticeRecord({...form,status:"archived"},false,now),"NOTICE_INVALID_OPTION");
});
test("active visibility is consistent at start/expiry, handles epoch zero and malformed dates", () => {
  const row={status:"published",publish_at:now,expires_at:null}, t=Date.parse(now);
  assert.equal(noticeIsActive(row,t),true); assert.equal(noticeIsActive(row,t-1),false);
  assert.equal(noticeIsActive({...row,expires_at:now},t),false);
  assert.equal(noticeIsActive({...row,publish_at:null,expires_at:"1970-01-01T00:00:00Z"},t),false);
  for(const status of ["draft","archived"]) assert.equal(noticeIsActive({...row,status},t),false);
  assert.equal(noticeIsActive({...row,expires_at:"bad"},t),false); assert.equal(noticeIsActive(row,null),false);
});
test("UUID/error-copy guards and route/client integration", () => {
  assert.equal(noticeUuid("a4b7a72d-9477-4986-b919-75d83fc521db"),true); assert.equal(noticeUuid("not-a-uuid"),false);
  for(const locale of ["bn","en"]) assert.ok(noticeErrorCopy("NOTICE_EXPIRED",locale));
  assert.equal(noticeErrorCopy("constructor","en"),null);
  const item=readFileSync(new URL("../app/api/notices/[id]/route.ts",import.meta.url),"utf8");
  assert.equal((item.match(/scopedQuery\(id, membership.family_id, existing\)/g)||[]).length,2);
  assert.ok(item.includes('Prefer: "return=representation"')); assert.ok(item.includes('"NOTICE_RECORD_CHANGED"'));
  const center=readFileSync(new URL("../app/notice-center.tsx",import.meta.url),"utf8");
  assert.ok(center.includes("status: notice.status,")); assert.ok(center.includes("notice.body_en, categoryLabels"));
  const modal=readFileSync(new URL("../components/action-modal-provider.tsx",import.meta.url),"utf8");
  assert.ok(modal.includes("noticeErrorCopy(payload.code, locale)"));
});
