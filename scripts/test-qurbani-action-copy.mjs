import assert from "node:assert/strict";
import test from "node:test";

import { qurbaniErrorCopy, qurbaniRecordActionCopy, qurbaniStatusActionCopy } from "../lib/qurbani-action-copy.ts";

test("linked-animal failure is localized consistently for both feedback paths", () => {
  assert.match(qurbaniErrorCopy("QURBANI_ANIMAL_LINKED", "bn"), /পশুটি অংশগ্রহণকারী/);
  assert.match(qurbaniErrorCopy("QURBANI_ANIMAL_LINKED", "en"), /Remove or transfer those links first/);
  assert.equal(qurbaniErrorCopy("UNKNOWN", "en"), null);
});

test("Qurbani confirmation identifies the record and the actual action", () => {
  const create = qurbaniRecordActionCopy("animal", "POST", "bn");
  assert.match(create.description, /পশু রেকর্ড যোগ/);
  assert.equal(create.destructive, false);

  const update = qurbaniRecordActionCopy("transaction", "PATCH", "en");
  assert.match(update.description, /Save changes to this transaction record/);
  assert.match(update.successMessage, /Transaction record updated/);

  const remove = qurbaniRecordActionCopy("transaction", "DELETE", "bn");
  assert.match(remove.description, /লেনদেন রেকর্ড স্থায়ীভাবে মুছবেন/);
  assert.match(remove.successMessage, /লেনদেন রেকর্ড স্থায়ীভাবে মুছে ফেলা হয়েছে/);
  assert.equal(remove.destructive, true);
});

test("Unknown Qurbani kinds do not claim a specific action", () => {
  assert.equal(qurbaniRecordActionCopy("unknown", "POST", "bn"), null);
  assert.equal(qurbaniRecordActionCopy("__proto__", "POST", "bn"), null);
  assert.equal(qurbaniRecordActionCopy("animal", "GET", "bn"), null);
});

test("Qurbani status confirmation names the entity, target state, and finalization risk", () => {
  const task = qurbaniStatusActionCopy("task", "completed", "PATCH", "bn");
  assert.match(task.description, /স্বেচ্ছাসেবক কাজ রেকর্ডের স্ট্যাটাস “সম্পন্ন”/);
  assert.match(task.successMessage, /“সম্পন্ন” করা হয়েছে/);
  assert.equal(task.destructive, false);

  const closed = qurbaniStatusActionCopy("campaign", "closed", "PATCH", "en");
  assert.match(closed.description, /Ordinary edits will be locked/);
  assert.equal(closed.destructive, true);
});

test("unknown status values cannot be presented as valid actions", () => {
  assert.equal(qurbaniStatusActionCopy("task", "__proto__", "PATCH", "bn"), null);
  assert.equal(qurbaniStatusActionCopy("__proto__", "completed", "PATCH", "bn"), null);
  assert.equal(qurbaniStatusActionCopy("task", "completed", "POST", "bn"), null);
});
