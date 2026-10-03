import type { EmergencyHealthProfile } from "./health-types";

export type EmergencyDirectoryRow = EmergencyHealthProfile & { auth_user_id: string };

export function visibleEmergencyDirectory(
  rows: EmergencyDirectoryRow[],
  optedOutUserIds: Iterable<string>,
): EmergencyHealthProfile[] {
  const optedOut = new Set(optedOutUserIds);
  return rows.flatMap(({ auth_user_id: userId, ...profile }) => {
    if (!userId || optedOut.has(userId)) return [];
    if (profile.visibility === "private" && !profile.donor_available) return [];
    return [{
      ...profile,
      conditions: profile.visibility === "family" ? profile.conditions : null,
      allergies: profile.visibility === "private" ? null : profile.allergies,
      emergency_notes: profile.visibility === "private" ? null : profile.emergency_notes,
      emergency_contact_name: profile.visibility === "private" ? null : profile.emergency_contact_name,
      emergency_contact_phone: profile.visibility === "private" ? null : profile.emergency_contact_phone,
    }];
  });
}
