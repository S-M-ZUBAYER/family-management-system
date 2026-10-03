import assert from "node:assert/strict";
import test from "node:test";

import { qurbaniRecordActionCopy } from "../lib/qurbani-action-copy.ts";

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
