export function canMutateArchiveRecord(
  visibility: string,
  ownerUserId: string | null | undefined,
  viewerUserId: string,
  canManage: boolean,
) {
  if (visibility === "private" && ownerUserId !== viewerUserId) return false;
  return canManage || ownerUserId === viewerUserId;
}
