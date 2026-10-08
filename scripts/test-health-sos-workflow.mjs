import test from "node:test";
import assert from "node:assert/strict";
import { healthSosLocation, publicHealthSosRecord, closeHealthSos, respondHealthSos } from "../lib/health-sos-workflow.ts";
function mock(status = "active", race = null) {
  const state = { alert: { id: "alert", family_id: "family", reporter_user_id: "reporter", status }, responses: [], audits: [], writes: 0 };
  const rest = async (path, init = {}) => {
    const [table, query] = path.split("?"), params = new URLSearchParams(query);
    const body = init.body ? JSON.parse(init.body) : null;
    if (table === "audit_logs") { assert.equal(body.family_id,"family"); state.audits.push(body); return; }
    if (table === "health_sos_responses") {
      assert.equal(init.method,"POST"); assert.equal(body.family_id,"family"); assert.equal(body.alert_id,"alert");
      const record = { ...body, id: "response", created_at: "2026-10-08T03:00:00Z" }; state.responses.push(record); state.writes++;
      if (race === "response") state.alert.status = "resolved";
      return [record];
    }
    assert.equal(table,"health_sos_alerts"); assert.equal(params.get("id"),"eq.alert");
    if (params.get("family_id") !== "eq.family") return [];
    if (!init.method) return [{ ...state.alert }];
    assert.equal(init.method,"PATCH");
    if (race === "close") state.alert.status = "cancelled";
    if (params.get("status") !== `eq.${state.alert.status}`) return [];
    Object.assign(state.alert, body); state.writes++; return [{ ...state.alert }];
  };
  return { rest, state };
}
const reject = (code, status) => error => error.code === code && error.status === status;
test("SOS location validates range/pair/precision/accuracy, including zero coordinates", () => {
  assert.deepEqual(healthSosLocation({ latitude: 0, longitude: 0, locationAccuracyM: 0 }), { latitude:0,longitude:0,location_accuracy_m:0 });
  assert.deepEqual(healthSosLocation({}), { latitude:null,longitude:null,location_accuracy_m:null });
  assert.equal(healthSosLocation({latitude:0.0000001,longitude:0}).latitude,0.0000001);
  for (const data of [{latitude:91,longitude:0},{latitude:0,longitude:-181},{latitude:0},{latitude:true,longitude:0},{latitude:0,longitude:0,locationAccuracyM:-1},{locationAccuracyM:10},{latitude:0.12345678,longitude:0},{latitude:0,longitude:0,locationAccuracyM:1.001}]) assert.throws(()=>healthSosLocation(data),reject("HEALTH_SOS_LOCATION",400));
});
test("SOS public projections preserve reporter control without exposing identity/storage fields", () => {
  const safe = publicHealthSosRecord({id:"alert",reporter_user_id:"reporter",acknowledged_by_user_id:"member",resolved_by_user_id:"manager",family_id:"family",storage_key:"hidden",message:"QA",latitude:0},"reporter");
  assert.equal(safe.is_reporter,true); assert.equal(safe.latitude,0);
  for (const key of ["reporter_user_id","acknowledged_by_user_id","resolved_by_user_id","family_id","storage_key"]) assert.equal(key in safe,false);
});
test("terminal alerts reject further close or response without writes", async () => {
  for (const status of ["resolved","cancelled"]) {
    const {rest,state} = mock(status);
    await assert.rejects(closeHealthSos(rest,"family","reporter",false,"alert","resolved",null),reject("HEALTH_SOS_CLOSED",409));
    await assert.rejects(respondHealthSos(rest,"family","member","QA member","alert","update",null),reject("HEALTH_SOS_CLOSED",409));
    assert.equal(state.writes,0); assert.equal(state.audits.length,0);
  }
});
test("only reporter/authorized manager closes active or acknowledged SOS with scoped audit", async () => {
  for (const current of ["active","acknowledged"]) for (const status of ["resolved","cancelled"]) for (const manager of [false,true]) {
    const {rest,state}=mock(current), user=manager?"manager":"reporter";
    const result=await closeHealthSos(rest,"family",user,manager,"alert",status,"QA only");
    assert.equal(result.status,status); assert.equal(result.is_reporter,!manager); assert.equal(state.alert.resolved_by_user_id,user);
    assert.equal(state.audits[0].action,`health_sos_${status}`); assert.equal(state.audits[0].metadata.scope,"family_sos");
  }
  const {rest,state}=mock();
  await assert.rejects(closeHealthSos(rest,"family","other",false,"alert","cancelled",null),reject("HEALTH_SOS_FORBIDDEN",403)); assert.equal(state.writes,0);
});
test("cross-family lookup rejects close/response without any mutation", async () => {
  const {rest,state}=mock();
  await assert.rejects(closeHealthSos(rest,"other-family","reporter",true,"alert","resolved",null),reject("HEALTH_SOS_NOT_FOUND",404));
  await assert.rejects(respondHealthSos(rest,"other-family","member","QA","alert","update",null),reject("HEALTH_SOS_NOT_FOUND",404)); assert.equal(state.writes,0);
});
test("compare-and-set close rejects changed status and leaves closed history untouched", async () => {
  const {rest,state}=mock("active","close");
  await assert.rejects(closeHealthSos(rest,"family","reporter",false,"alert","resolved",null),reject("HEALTH_SOS_CONFLICT",409));
  assert.equal(state.alert.status,"cancelled"); assert.equal(state.writes,0); assert.equal(state.audits.length,0);
});
test("each valid SOS response is sanitized/audited; first response acknowledges only active state", async () => {
  for (const type of ["acknowledged","on_the_way","called_emergency","update"]) {
    const {rest,state}=mock(); const r=await respondHealthSos(rest,"family","member","QA member","alert",type,"QA only");
    assert.equal(r.response_type,type); assert.equal(r.is_mine,true); assert.equal(r.responder_user_id,undefined); assert.equal(state.alert.status,"acknowledged"); assert.equal(state.audits[0].actor_user_id,"member");
  }
  const {rest,state}=mock("acknowledged"); state.alert.acknowledged_by_name="First responder";
  await respondHealthSos(rest,"family","member","QA member","alert","update",null);
  assert.equal(state.alert.acknowledged_by_name,"First responder"); assert.equal(state.writes,1);
});
test("stale response acknowledgment cannot reopen an alert closed during insertion", async () => {
  const {rest,state}=mock("active","response"); await respondHealthSos(rest,"family","member","QA member","alert","update",null);
  assert.equal(state.alert.status,"resolved"); assert.equal(state.alert.acknowledged_at,undefined);
  // Response insert and status update are still separate calls: this is not an atomic database test.
  assert.equal(state.responses.length,1);
});
test("unsupported response rejects before lookup or writes", async () => {
  const {rest,state}=mock(); await assert.rejects(respondHealthSos(rest,"family","member","QA","alert","resolved",null),reject("HEALTH_SOS_RESPONSE",400)); assert.equal(state.writes,0);
});
