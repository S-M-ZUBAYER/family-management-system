export function canViewEventMedia(eventStatus: string | null, canManageEvents: boolean): boolean {
  return eventStatus !== null && ["draft", "published", "registration_closed", "completed", "cancelled"].includes(eventStatus) && (eventStatus !== "draft" || canManageEvents);
}

// Server authorization uses stored identity, never a client ownership flag/name.
export function canDeleteEventMedia(uploaderId: unknown, actorId: unknown, canManage: unknown): boolean {
  return typeof uploaderId === "string" && !!uploaderId.trim() && typeof actorId === "string" && !!actorId.trim()
    && typeof canManage === "boolean" && (canManage || uploaderId === actorId);
}
// Missing legacy ownership flags do not grant member controls.
export function eventMediaDeleteAllowed(row: unknown, canManage: unknown): boolean {
  if (!row || typeof row !== "object" || Array.isArray(row) || typeof canManage !== "boolean") return false;
  const own = Object.hasOwn(row, "is_current_user") ? (row as { is_current_user?: unknown }).is_current_user : undefined;
  return (own === undefined || typeof own === "boolean") && (canManage || own === true);
}
