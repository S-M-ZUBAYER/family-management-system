import type { DirectoryVisibility } from "./privacy-types";

export const PROFILE_PHOTO_COLLECTION = "__member_profile_photos__";
export const PROFILE_PHOTO_MARKER = "__profile_photo__";

export type DirectoryConsent = {
  user_id: string;
  directory_visibility: DirectoryVisibility;
  show_email_to_family: boolean;
  show_phone_to_family: boolean;
};

type DirectoryMember = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  phone: string | null;
};

export function canViewDirectoryProfile(
  profileUserId: string | null,
  visibility: DirectoryVisibility | undefined,
  viewerUserId: string,
  viewerIsAdmin: boolean,
) {
  return viewerIsAdmin || profileUserId === viewerUserId || (visibility !== "hidden" && visibility !== "admins_only");
}

export function visibleDirectoryMembers<T extends DirectoryMember>(
  members: T[],
  consents: DirectoryConsent[],
  viewerUserId: string,
  viewerIsAdmin: boolean,
): T[] {
  const privacyByUser = new Map(consents.map((consent) => [consent.user_id, consent]));

  return members.flatMap((member) => {
    const privacy = member.auth_user_id ? privacyByUser.get(member.auth_user_id) : undefined;
    if (!canViewDirectoryProfile(member.auth_user_id, privacy?.directory_visibility, viewerUserId, viewerIsAdmin)) return [];
    if (viewerIsAdmin || member.auth_user_id === viewerUserId) return [member];

    // Unlinked profiles and members without a saved consent have no contact-sharing permission.
    return [{
      ...member,
      email: privacy?.directory_visibility === "family" && privacy.show_email_to_family ? member.email : null,
      phone: privacy?.directory_visibility === "family" && privacy.show_phone_to_family ? member.phone : null,
    }];
  });
}
