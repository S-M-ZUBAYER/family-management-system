import test from "node:test";
import assert from "node:assert/strict";
import { healthActionCopy, healthErrorCopy } from "../lib/health-action-copy.ts";
test("all private record kinds use bilingual action-specific irreversible-delete copy", () => {
  for (const kind of ["medication", "appointment", "measurement"]) for (const locale of ["bn", "en"]) {
    assert.ok(healthActionCopy({ action: `create_${kind}` }, "POST", locale));
    assert.ok(healthActionCopy({ kind }, "PATCH", locale));
    assert.equal(healthActionCopy({ kind }, "DELETE", locale).destructive, true);
  }
  assert.match(healthActionCopy({ action: "create_appointment" }, "POST", "en").description, /does not provide treatment/);
});
test("status copy distinguishes record keeping from actual treatment/bookings", () => {
  for (const status of ["scheduled", "completed", "cancelled"]) assert.ok(healthActionCopy({ action: "update_status", data: { entity: "appointment", status } }, "POST", "bn"));
  assert.match(healthActionCopy({ action: "update_status", data: { entity: "medication", status: "paused" } }, "POST", "en").description, /not treatment instructions/);
  assert.equal(healthActionCopy({ kind: "__proto__" }, "DELETE", "en"), null);
  assert.equal(healthErrorCopy("__proto__", "bn"), null);
});
test("every new validation code has actionable BN/EN error copy", () => {
  for (const code of ["HEALTH_INVALID_DATE", "HEALTH_INVALID_MEDICATION", "HEALTH_INVALID_APPOINTMENT", "HEALTH_INVALID_MEASUREMENT"]) for (const locale of ["bn", "en"]) assert.ok(healthErrorCopy(code, locale));
});
test("SOS confirmation/results explicitly disclose in-app only behavior in BN/EN", () => {
  for(const locale of ["bn","en"]) for(const action of ["create_sos","respond_sos","update_sos"]) {
    const copy=healthActionCopy({action,data:{status:"resolved"}},"POST",locale); assert.ok(copy); assert.ok(copy.successMessage);
  }
  assert.match(healthActionCopy({action:"create_sos"},"POST","en").description,/No automatic SMS/);
  assert.match(healthActionCopy({action:"respond_sos"},"POST","en").successMessage,/no emergency-services call/);
  assert.equal(healthActionCopy({action:"update_sos",data:{status:"active"}},"POST","en"),null);
  for(const code of ["HEALTH_SOS_INVALID","HEALTH_SOS_LOCATION","HEALTH_SOS_RESPONSE","HEALTH_SOS_CLOSED","HEALTH_SOS_NOT_FOUND","HEALTH_SOS_CONFLICT","HEALTH_SOS_FORBIDDEN"]) for(const locale of ["bn","en"]) assert.ok(healthErrorCopy(code,locale));
});
