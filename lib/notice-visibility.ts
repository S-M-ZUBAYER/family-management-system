type NoticeSchedule = { status: string; publish_at: string | null; expires_at: string | null };
export function noticeIsActive(notice: NoticeSchedule, now: number | null) {
  if (now === null || !Number.isFinite(now) || notice.status !== "published") return false;
  const start = notice.publish_at === null ? -Infinity : Date.parse(notice.publish_at);
  const end = notice.expires_at === null ? Infinity : Date.parse(notice.expires_at);
  return start <= now && end > now;
}
