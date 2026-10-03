type AuditVisibilityRow = {
  actor_user_id: string;
  action: string;
  entity_type: string;
  metadata: Record<string, unknown> | null;
};

export function visibleAdministrationAuditLogs<T extends AuditVisibilityRow>(
  rows: readonly T[],
  viewerUserId: string,
): T[] {
  return rows.filter((row) => {
    if (row.actor_user_id === viewerUserId) return true;
    if (row.metadata?.private === true) return false;
    if (row.metadata?.visibility === "private") return false;
    // Older finance events may predate the private metadata marker.
    if (row.action.startsWith("personal_finance_") || row.entity_type.startsWith("personal_finance_")) return false;
    return true;
  });
}
