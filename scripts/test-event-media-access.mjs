import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/event-media-access.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const canViewEventMedia = new Function(`${compiled}; return canViewEventMedia;`)();

assert.equal(canViewEventMedia(null, false), false);
assert.equal(canViewEventMedia(null, true), false);
assert.equal(canViewEventMedia("draft", false), false);
assert.equal(canViewEventMedia("draft", true), true);
for (const status of ["published", "registration_closed", "completed", "cancelled"]) {
  assert.equal(canViewEventMedia(status, false), true);
  assert.equal(canViewEventMedia(status, true), true);
}
console.log("Event media access policy passed.");
