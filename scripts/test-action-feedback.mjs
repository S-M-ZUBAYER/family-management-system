import assert from "node:assert/strict";
import test from "node:test";

import { feedbackResult, mutationResponseResult } from "../lib/action-feedback.ts";

test("common English and Bengali completions show success", () => {
  for (const message of ["Record deleted.", "Status changed to paid.", "Privacy request submitted.", "রেকর্ড সংরক্ষণ হয়েছে।"]) {
    assert.equal(feedbackResult(message, "en").kind, "success", message);
  }
});

test("failed mutations and invalid household values show errors", () => {
  for (const message of ["Could not save the record.", "Record not updated.", "Enter a valid actual cost.", "সঠিক সময়সূচি দিন।", "Contact & Support history exceeds 20000 rows.", "Contact support data is temporarily unavailable."]) {
    assert.equal(feedbackResult(message, "bn").kind, "error", message);
  }
});

test("cancellation remains informational even when its copy contains saved", () => {
  assert.equal(feedbackResult("No changes were saved.", "en").kind, "info");
  assert.equal(feedbackResult("Action cancelled.", "en").kind, "info");
  assert.equal(feedbackResult("The article was saved, but the cover upload was cancelled.", "en").kind, "info");
  assert.equal(feedbackResult("লেখাটি সংরক্ষিত হয়েছে, কিন্তু কভার আপলোড বাতিল করা হয়েছে।", "bn").kind, "info");
});

test("accepted cleanup is informational rather than a false completed success", () => {
  const message = "Document access removed. Private storage cleanup is pending.";
  assert.deepEqual(mutationResponseResult(202, message, "en"), {
    kind: "info",
    title: "Some work is still pending",
    message,
  });
  assert.equal(mutationResponseResult(200, "Document deleted.", "en").kind, "success");
  assert.equal(mutationResponseResult(403, "Access denied.", "bn").kind, "error");
});
