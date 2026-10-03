import type { FamilyRole } from "./family-access";

export function canManageChatRole(role: FamilyRole) {
  return role === "owner" || role === "family_admin" || role === "manager";
}

export function canAccessChatChannel(
  visibility: "family" | "admins" | "invite_only",
  role: FamilyRole,
  isExplicitMember: boolean,
) {
  if (visibility === "family") return true;
  if (visibility === "admins") return canManageChatRole(role);
  return isExplicitMember;
}
