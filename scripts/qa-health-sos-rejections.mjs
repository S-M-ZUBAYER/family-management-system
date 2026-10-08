// Loopback-only, rejection-only checks: no valid alert, response, closure or delivery is submitted.
import assert from "node:assert/strict";
const origin = new URL(process.env.FMS_QA_ORIGIN ?? "http://localhost:5173");
if (!["localhost","127.0.0.1","[::1]"].includes(origin.hostname)) throw new Error("Loopback only.");
const family="20000000-0000-4000-8000-000000000002", absent="90000000-0000-4000-8000-000000009999";
const cookie=`__sites_local_auth=1; fms_active_family=${family}`;
let checks=0;
async function call(path,body,expected=200,code=null,signed=true) {
  const response=await fetch(new URL(path,origin),{method:body?"POST":"GET",headers:{...(signed?{Cookie:cookie}:{}),...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const payload=await response.json(); assert.equal(response.status,expected,JSON.stringify(payload)); if(code)assert.equal(payload.code,code); checks++;
  return payload;
}
const before=await call("/api/health"); assert.equal(before.family.id,family); assert.equal(before.migrationRequired,false);
assert(!before.sosAlerts.some(a=>a.id===absent));
await call("/api/health",null,401,null,false);
await call("/api/health/records",{action:"create_sos",data:{message:""}},400,"HEALTH_SOS_INVALID");
await call("/api/health/records",{action:"create_sos",data:{alertType:"invalid",message:"QA validation only - not an emergency"}},400,"HEALTH_SOS_INVALID");
for(const location of [{latitude:91,longitude:0},{latitude:0},{latitude:true,longitude:0},{latitude:0,longitude:0,locationAccuracyM:-1},{latitude:0,longitude:0,locationAccuracyM:1.001},{latitude:0.12345678,longitude:0}]) {
  await call("/api/health/records",{action:"create_sos",data:{alertType:"other",message:"QA validation only - not an emergency",...location}},400,"HEALTH_SOS_LOCATION");
}
await call("/api/health/records",{action:"respond_sos",data:{alertId:"bad",responseType:"update"}},400,"HEALTH_SOS_RESPONSE");
await call("/api/health/records",{action:"respond_sos",data:{alertId:absent,responseType:"resolved"}},400,"HEALTH_SOS_RESPONSE");
await call("/api/health/records",{action:"respond_sos",data:{alertId:absent,responseType:"update"}},404,"HEALTH_SOS_NOT_FOUND");
await call("/api/health/records",{action:"update_sos",data:{alertId:absent,status:"active"}},400,"HEALTH_SOS_INVALID");
await call("/api/health/records",{action:"update_sos",data:{alertId:absent,status:"resolved"}},404,"HEALTH_SOS_NOT_FOUND");
const after=await call("/api/health");
for(const key of ["profile","medications","appointments","measurements","documents","emergencyDirectory","sosAlerts","sosResponses"]) {assert.deepEqual(after[key],before[key]);checks++;}
for(const a of after.sosAlerts) for(const key of ["reporter_user_id","resolved_by_user_id","acknowledged_by_user_id"]) {assert.equal(key in a,false);checks++;}
console.log(JSON.stringify({checks,applicationDataUnchanged:true,validSosSubmitted:false,notificationDeliveryAttempted:false}));
