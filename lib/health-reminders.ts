import type { HealthAppointment, HealthMedication } from "./health-types.ts";
import { healthDate } from "./health-validation.ts";
export type HealthReminder = { key: string; at: number; kind: "medication" | "appointment"; recordId: string };
const DAY = 86400000, GRACE = 60000;
function localDay(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
export function healthMedicationInCourse(medicine: HealthMedication, now: number): boolean {
  if (!Number.isFinite(now) || medicine.status !== "active" || !healthDate(medicine.start_date) || healthDate(medicine.end_date) === undefined) return false;
  const day = localDay(new Date(now));
  return day >= medicine.start_date && (!medicine.end_date || day <= medicine.end_date);
}
export function healthReminderPlan(medications: HealthMedication[], appointments: HealthAppointment[], now: number): HealthReminder[] {
  if (!Number.isFinite(now)) return [];
  const result: HealthReminder[] = [];
  for (const medicine of medications) {
    if (medicine.status !== "active" || !healthDate(medicine.start_date) || healthDate(medicine.end_date) === undefined) continue;
    for (const time of new Set(medicine.reminder_times)) {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
      const [hour, minute] = time.split(":").map(Number);
      const at = new Date(now); at.setHours(hour, minute, 0, 0);
      if (at.getTime() < now - GRACE) at.setDate(at.getDate() + 1);
      const day = localDay(at);
      if (day < medicine.start_date || (medicine.end_date && day > medicine.end_date) || at.getTime() - now > DAY) continue;
      result.push({ key: `medication:${medicine.id}:${at.getTime()}`, at: at.getTime(), kind: "medication", recordId: medicine.id });
    }
  }
  for (const appointment of appointments) {
    if (appointment.status !== "scheduled" || !Number.isInteger(appointment.reminder_minutes) || appointment.reminder_minutes < 0 || appointment.reminder_minutes > 10080) continue;
    const scheduled = new Date(appointment.scheduled_at).getTime(), at = scheduled - appointment.reminder_minutes * 60000;
    if (!Number.isFinite(at) || scheduled < now || at < now - GRACE || at - now > DAY) continue;
    result.push({ key: `appointment:${appointment.id}:${at}`, at, kind: "appointment", recordId: appointment.id });
  }
  return result.sort((a,b) => a.at-b.at);
}
