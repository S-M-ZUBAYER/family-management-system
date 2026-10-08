import test from "node:test";
import assert from "node:assert/strict";
import { healthReminderPlan, healthMedicationInCourse } from "../lib/health-reminders.ts";
const med = { id:"medicine",status:"active",start_date:"2026-10-08",end_date:"2026-10-08",reminder_times:["08:00","08:00","20:00"] };
function dhaka(fn) { const old=process.env.TZ; process.env.TZ="Asia/Dhaka"; try { fn(); } finally { if(old===undefined)delete process.env.TZ;else process.env.TZ=old; } }
test("medication course dates gate reminders, deduplicate times and preserve Dhaka wall time",()=>dhaka(()=>{
  const now=Date.parse("2026-10-08T01:00:00Z"), plan=healthReminderPlan([med],[],now);
  assert.equal(plan.length,2); assert.equal(plan[0].at,Date.parse("2026-10-08T02:00:00Z"));
  assert.equal(healthReminderPlan([{...med,start_date:"2026-10-10",end_date:null}],[],now).length,0);
  assert.equal(healthReminderPlan([med],[],Date.parse("2026-10-09T01:00:00Z")).length,0);
  assert.equal(healthReminderPlan([{...med,status:"paused"},{...med,status:"completed"}],[],now).length,0);
}));
test("short scheduling grace catches just-due reminder but does not replay old doses",()=>dhaka(()=>{
  const justDue=healthReminderPlan([med],[],Date.parse("2026-10-08T02:00:30Z")); assert.equal(justDue[0].at,Date.parse("2026-10-08T02:00:00Z"));
  const old=healthReminderPlan([med],[],Date.parse("2026-10-08T02:02:00Z")); assert.equal(old.length,1); assert.equal(old[0].at,Date.parse("2026-10-08T14:00:00Z"));
}));
test("appointment reminder uses offset, skips closed/past and invalid minutes",()=>{
  const a={id:"appointment",status:"scheduled",scheduled_at:"2026-10-09T09:15:00+06:00",reminder_minutes:15};
  assert.equal(healthReminderPlan([], [a], Date.parse("2026-10-09T02:30:00Z"))[0].at,Date.parse("2026-10-09T03:00:00Z"));
  for(const extra of [{status:"cancelled"},{status:"completed"},{reminder_minutes:0.5},{reminder_minutes:-1},{scheduled_at:"bad"}]) assert.equal(healthReminderPlan([],[{...a,...extra}],Date.parse("2026-10-09T02:30:00Z")).length,0);
  assert.equal(healthReminderPlan([],[a],Date.parse("2026-10-09T03:16:00Z")).length,0);
});
test("far future, invalid legacy medicine times and invalid clock do not schedule",()=>dhaka(()=>{
  const now=Date.parse("2026-10-08T01:00:00Z");
  assert.equal(healthReminderPlan([{...med,reminder_times:["25:00"],start_date:"bad"}],[],now).length,0);
  assert.equal(healthReminderPlan([],[{id:"far",status:"scheduled",scheduled_at:"2027-10-09T03:15:00Z",reminder_minutes:15}],now).length,0);
  assert.deepEqual(healthReminderPlan([med],[],NaN),[]);
}));
test("today care list uses inclusive local course dates without changing stored status",()=>dhaka(()=>{
  assert.equal(healthMedicationInCourse(med,Date.parse("2026-10-08T01:00:00Z")),true);
  assert.equal(healthMedicationInCourse(med,Date.parse("2026-10-07T01:00:00Z")),false);
  assert.equal(healthMedicationInCourse(med,Date.parse("2026-10-09T01:00:00Z")),false);
  assert.equal(healthMedicationInCourse({...med,end_date:null},Date.parse("2026-10-09T01:00:00Z")),true);
  assert.equal(med.status,"active");
}));
