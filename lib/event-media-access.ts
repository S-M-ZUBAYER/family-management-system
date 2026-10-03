export function canViewEventMedia(eventStatus: string | null, canManageEvents: boolean): boolean {
  return eventStatus !== null && (eventStatus !== "draft" || canManageEvents);
}
