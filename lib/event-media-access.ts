export function canViewEventMedia(eventStatus: string | null, canManageEvents: boolean): boolean {
  return eventStatus !== null && ["draft", "published", "registration_closed", "completed", "cancelled"].includes(eventStatus) && (eventStatus !== "draft" || canManageEvents);
}
