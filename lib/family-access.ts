import { supabaseRest } from "./supabase-rest";

export type FamilyRole = "owner" | "family_admin" | "manager" | "member";

export type ActiveFamilyMembership = {
  family_id: string;
  role: FamilyRole;
  status: "active";
};

export async function getActiveFamilyMembership(authUserId: string) {
  const query = new URLSearchParams({
    select: "family_id,role,status",
    auth_user_id: `eq.${authUserId}`,
    status: "eq.active",
    order: "created_at.asc",
    limit: "1",
  });
  const memberships = await supabaseRest<ActiveFamilyMembership[]>(
    `family_memberships?${query}`,
  );
  return memberships[0] ?? null;
}

export function canReviewMembers(role: FamilyRole) {
  return role === "owner" || role === "family_admin";
}

export function canManageProfiles(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

