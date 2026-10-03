export const ACTIVE_FAMILY_COOKIE = "fms_active_family";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validFamilyId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function selectedFamilyIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const entry = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ACTIVE_FAMILY_COOKIE}=`));
  if (!entry) return null;
  const value = entry.slice(ACTIVE_FAMILY_COOKIE.length + 1);
  return validFamilyId(value) ? value : null;
}

export function activeFamilyCookieHeader(familyId: string): string {
  if (!validFamilyId(familyId)) throw new Error("A valid family ID is required.");
  return `${ACTIVE_FAMILY_COOKIE}=${familyId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function familyCreationSlug(creationKey: unknown): string | null {
  return validFamilyId(creationKey) ? `family-${creationKey.replaceAll("-", "").toLowerCase()}` : null;
}

export function activeFamilyMembershipQuery(authUserId: string, familyId?: string): URLSearchParams {
  return new URLSearchParams({
    select: "id,family_id,role,status,preferred_locale,families!inner()",
    auth_user_id: `eq.${authUserId}`,
    ...(familyId ? { family_id: `eq.${familyId}` } : { order: "created_at.asc" }),
    status: "eq.active",
    "families.status": "eq.active",
    limit: "1",
  });
}
