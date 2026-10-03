import { headers } from "next/headers";
import { canManageChatRole } from "./chat-access-policy";
import { activeFamilyMembershipQuery, selectedFamilyIdFromCookie } from "./family-selection";
import { supabaseRest } from "./supabase-rest";

export type FamilyRole = "owner" | "family_admin" | "manager" | "member";

export type ActiveFamilyMembership = {
  id: string;
  family_id: string;
  role: FamilyRole;
  status: "active";
  preferred_locale: "bn" | "en";
};

export async function getActiveFamilyMembership(authUserId: string) {
  const selectedFamilyId = selectedFamilyIdFromCookie((await headers()).get("cookie"));
  if (selectedFamilyId) {
    const selected = await supabaseRest<ActiveFamilyMembership[]>(
      `family_memberships?${activeFamilyMembershipQuery(authUserId, selectedFamilyId)}`,
    );
    // A stale selection must not silently redirect an in-flight write to a
    // different family. Setup can list other eligible families for recovery.
    return selected[0] ?? null;
  }
  return getAnyActiveFamilyMembership(authUserId);
}

export async function getAnyActiveFamilyMembership(authUserId: string) {
  const memberships = await supabaseRest<ActiveFamilyMembership[]>(
    `family_memberships?${activeFamilyMembershipQuery(authUserId)}`,
  );
  return memberships[0] ?? null;
}

export function canReviewMembers(role: FamilyRole) {
  return role === "owner" || role === "family_admin";
}

export function canViewAdministration(role: FamilyRole) {
  return role === "owner" || role === "family_admin";
}

export function canManageMembershipRoles(role: FamilyRole) {
  return role === "owner";
}

export function canManageProfiles(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

export function canManageNotices(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

export function canManageEvents(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

export function canManageQurbani(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

export function canManageChat(role: FamilyRole) {
  return canManageChatRole(role);
}

export function canManageHealth(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

export function canManageWelfare(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

export function canManageHousehold(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

export function canManageArchives(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

export function canManageGovernance(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

export function canManageMagazine(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}
