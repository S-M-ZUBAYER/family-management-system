import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  canManageProfiles,
  getActiveFamilyMembership,
} from "@/lib/family-access";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

export type MemberProfileRow = {
  id: string;
  family_id: string;
  auth_user_id: string | null;
  name_bn: string;
  name_en: string | null;
  email: string | null;
  phone: string | null;
  relationship_text: string | null;
  gender: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  occupation: string | null;
  city: string | null;
  country: string | null;
  profile_status: string;
  created_at: string;
  profile_photo_file_id?: string | null;
};

export type FamilyRelationshipRow = {
  id: string;
  from_member_id: string;
  to_member_id: string;
  relationship_type: "parent" | "spouse" | "guardian";
};

type CreateMemberBody = {
  nameBn?: unknown;
  nameEn?: unknown;
  relationship?: unknown;
  gender?: unknown;
  dateOfBirth?: unknown;
  bloodGroup?: unknown;
  occupation?: unknown;
  city?: unknown;
  country?: unknown;
  email?: unknown;
  phone?: unknown;
  parentId?: unknown;
  relationshipTargetId?: unknown;
  relationshipType?: unknown;
};

type UpdateMemberBody = {
  action?: unknown;
  memberId?: unknown;
  relationshipId?: unknown;
  fromMemberId?: unknown;
  toMemberId?: unknown;
  relationshipType?: unknown;
  data?: CreateMemberBody & { profileStatus?: unknown };
};

const optionalText = (value: unknown, max = 160) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) {
      return Response.json(
        { code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" },
        { status: 409 },
      );
    }

    const memberQuery = new URLSearchParams({
      select:
        "id,family_id,auth_user_id,name_bn,name_en,email,phone,relationship_text,gender,date_of_birth,blood_group,occupation,city,country,profile_status,created_at",
      family_id: `eq.${membership.family_id}`,
      profile_status: "neq.archived",
      order: "created_at.asc",
    });
    const members = await supabaseRest<MemberProfileRow[]>(
      `member_profiles?${memberQuery}`,
    );

    let relationships: FamilyRelationshipRow[] = [];
    let migrationRequired = false;
    try {
      const relationshipQuery = new URLSearchParams({
        select: "id,from_member_id,to_member_id,relationship_type",
        family_id: `eq.${membership.family_id}`,
        order: "created_at.asc",
      });
      relationships = await supabaseRest<FamilyRelationshipRow[]>(
        `family_relationships?${relationshipQuery}`,
      );
    } catch (error) {
      if (error instanceof SupabaseRequestError) migrationRequired = true;
      else throw error;
    }

    const membersWithPhotos = members.map((member) => ({ ...member, profile_photo_file_id: null as string | null }));
    try {
      const photoMemories = await supabaseRest<Array<{ id: string; people_tags: string[]; created_at: string }>>(`archive_memories?${new URLSearchParams({
        select: "id,people_tags,created_at",
        family_id: `eq.${membership.family_id}`,
        place: "eq.__profile_photo__",
        status: "eq.active",
        order: "created_at.desc",
      })}`);
      if (photoMemories.length) {
        const photoFiles = await supabaseRest<Array<{ id: string; entity_id: string }>>(`archive_files?${new URLSearchParams({
          select: "id,entity_id",
          family_id: `eq.${membership.family_id}`,
          entity_type: "eq.memory",
          entity_id: `in.(${photoMemories.map((item) => item.id).join(",")})`,
        })}`);
        const fileByMemory = new Map(photoFiles.map((file) => [file.entity_id, file.id]));
        const photoByMember = new Map<string, string>();
        photoMemories.forEach((memory) => {
          const memberTag = memory.people_tags.find((tag) => tag.startsWith("member:"));
          const fileId = fileByMemory.get(memory.id);
          if (memberTag && fileId && !photoByMember.has(memberTag.slice(7))) photoByMember.set(memberTag.slice(7), fileId);
        });
        membersWithPhotos.forEach((member) => { member.profile_photo_file_id = photoByMember.get(member.id) ?? null; });
      }
    } catch (error) {
      if (!(error instanceof SupabaseRequestError)) throw error;
    }

    const familyQuery = new URLSearchParams({
      select: "id,name_bn,name_en",
      id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const family = (
      await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(
        `families?${familyQuery}`,
      )
    )[0];

    return Response.json({
      family,
      members: membersWithPhotos,
      relationships,
      viewerMemberId: members.find((member) => member.auth_user_id === user.userId)?.id ?? null,
      migrationRequired,
      permissions: { canManage: canManageProfiles(membership.role) },
    });
  } catch (error) {
    return memberErrorResponse(error, "Unable to load family members");
  }
}

export async function POST(request: Request) {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) {
      return Response.json(
        { code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" },
        { status: 409 },
      );
    }
    if (!canManageProfiles(membership.role)) {
      return Response.json(
        { error: "Member profile তৈরি করার permission নেই।" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as CreateMemberBody;
    const nameBn = optionalText(body.nameBn, 120);
    if (!nameBn || nameBn.length < 2) {
      return Response.json({ error: "সদস্যের বাংলা নাম দিন।" }, { status: 400 });
    }
    const gender = optionalText(body.gender, 12);
    if (gender && !["male", "female", "other"].includes(gender)) {
      return Response.json({ error: "Gender value সঠিক নয়।" }, { status: 400 });
    }

    const relationshipTargetId = optionalText(body.relationshipTargetId, 64) ?? optionalText(body.parentId, 64);
    const relationshipType = optionalText(body.relationshipType, 16) ?? "parent";
    if (!["parent", "spouse", "guardian"].includes(relationshipType)) {
      return Response.json({ error: "Relationship type সঠিক নয়।" }, { status: 400 });
    }
    if (relationshipTargetId) {
      const parentQuery = new URLSearchParams({
        select: "id",
        id: `eq.${relationshipTargetId}`,
        family_id: `eq.${membership.family_id}`,
        limit: "1",
      });
      const parent = await supabaseRest<Array<{ id: string }>>(
        `member_profiles?${parentQuery}`,
      );
      if (!parent.length) {
        return Response.json(
          { error: "নির্বাচিত parent এই পরিবারের সদস্য নন।" },
          { status: 400 },
        );
      }
    }

    const [member] = await supabaseRest<MemberProfileRow[]>("member_profiles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        name_bn: nameBn,
        name_en: optionalText(body.nameEn, 120),
        relationship_text: optionalText(body.relationship, 160),
        gender,
        date_of_birth: optionalText(body.dateOfBirth, 10),
        blood_group: optionalText(body.bloodGroup, 8),
        occupation: optionalText(body.occupation, 120),
        city: optionalText(body.city, 100),
        country: optionalText(body.country, 100),
        email: optionalText(body.email, 180),
        phone: optionalText(body.phone, 40),
      }),
    });

    let relationshipSaved = true;
    if (relationshipTargetId) {
      try {
        await supabaseRest("family_relationships", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            family_id: membership.family_id,
            from_member_id: relationshipTargetId,
            to_member_id: member.id,
            relationship_type: relationshipType,
            created_by_user_id: user.userId,
          }),
        });
      } catch (error) {
        if (error instanceof SupabaseRequestError) relationshipSaved = false;
        else throw error;
      }
    }

    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: "member_profile_created",
        entity_type: "member_profile",
        entity_id: member.id,
        metadata: { relationship_saved: relationshipSaved },
      }),
    });

    return Response.json(
      {
        member,
        warning: relationshipSaved
          ? null
          : "Member save হয়েছে, তবে family tree migration চালানো বাকি।",
      },
      { status: 201 },
    );
  } catch (error) {
    return memberErrorResponse(error, "Unable to create family member");
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" }, { status: 409 });
    if (!canManageProfiles(membership.role)) return Response.json({ error: "Member profile পরিবর্তনের permission নেই।" }, { status: 403 });

    const body = await request.json() as UpdateMemberBody;
    const action = optionalText(body.action, 40);
    if (!action) return Response.json({ error: "Member action প্রয়োজন।" }, { status: 400 });

    if (action === "update_profile" || action === "update_status") {
      const memberId = optionalText(body.memberId, 64);
      if (!memberId) return Response.json({ error: "Member নির্বাচন করুন।" }, { status: 400 });
      const existingQuery = new URLSearchParams({ select: "id", id: `eq.${memberId}`, family_id: `eq.${membership.family_id}`, limit: "1" });
      if (!(await supabaseRest<Array<{ id: string }>>(`member_profiles?${existingQuery}`)).length) {
        return Response.json({ error: "সদস্যটি এই পরিবারের নয়।" }, { status: 404 });
      }

      const data = body.data ?? {};
      let changes: Record<string, unknown>;
      if (action === "update_status") {
        const profileStatus = optionalText(data.profileStatus, 16);
        if (!profileStatus || !["active", "inactive", "deceased", "archived"].includes(profileStatus)) {
          return Response.json({ error: "Profile status সঠিক নয়।" }, { status: 400 });
        }
        changes = { profile_status: profileStatus, updated_at: new Date().toISOString() };
      } else {
        const nameBn = optionalText(data.nameBn, 120);
        const gender = optionalText(data.gender, 12);
        const profileStatus = optionalText(data.profileStatus, 16) ?? "active";
        if (!nameBn || nameBn.length < 2) return Response.json({ error: "সদস্যের বাংলা নাম দিন।" }, { status: 400 });
        if (gender && !["male", "female", "other"].includes(gender)) return Response.json({ error: "Gender value সঠিক নয়।" }, { status: 400 });
        if (!["active", "inactive", "deceased", "archived"].includes(profileStatus)) return Response.json({ error: "Profile status সঠিক নয়।" }, { status: 400 });
        changes = {
          name_bn: nameBn,
          name_en: optionalText(data.nameEn, 120),
          relationship_text: optionalText(data.relationship, 160),
          gender,
          date_of_birth: optionalText(data.dateOfBirth, 10),
          blood_group: optionalText(data.bloodGroup, 8),
          occupation: optionalText(data.occupation, 120),
          city: optionalText(data.city, 100),
          country: optionalText(data.country, 100),
          email: optionalText(data.email, 180),
          phone: optionalText(data.phone, 40),
          profile_status: profileStatus,
          updated_at: new Date().toISOString(),
        };
      }
      const [member] = await supabaseRest<MemberProfileRow[]>(`member_profiles?${new URLSearchParams({ id: `eq.${memberId}`, family_id: `eq.${membership.family_id}` })}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(changes),
      });
      await writeMemberAudit(membership.family_id, user.userId, action, "member_profile", memberId, changes);
      return Response.json({ member, message: action === "update_status" ? "Member status update হয়েছে।" : "Member profile update হয়েছে।" });
    }

    if (action === "create_relationship") {
      const fromMemberId = optionalText(body.fromMemberId, 64);
      const toMemberId = optionalText(body.toMemberId, 64);
      const relationshipType = optionalText(body.relationshipType, 16);
      if (!fromMemberId || !toMemberId || fromMemberId === toMemberId || !relationshipType || !["parent", "spouse", "guardian"].includes(relationshipType)) {
        return Response.json({ error: "দুইজন আলাদা সদস্য ও সঠিক relationship type নির্বাচন করুন।" }, { status: 400 });
      }
      const scopedMembers = await supabaseRest<Array<{ id: string }>>(`member_profiles?${new URLSearchParams({ select: "id", family_id: `eq.${membership.family_id}`, id: `in.(${fromMemberId},${toMemberId})` })}`);
      if (scopedMembers.length !== 2) return Response.json({ error: "নির্বাচিত সদস্যরা এই পরিবারের নয়।" }, { status: 400 });
      const [relationship] = await supabaseRest<FamilyRelationshipRow[]>("family_relationships", {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
        body: JSON.stringify({ family_id: membership.family_id, from_member_id: fromMemberId, to_member_id: toMemberId, relationship_type: relationshipType, created_by_user_id: user.userId }),
      });
      await writeMemberAudit(membership.family_id, user.userId, action, "family_relationship", relationship?.id ?? null, { from_member_id: fromMemberId, to_member_id: toMemberId, relationship_type: relationshipType });
      return Response.json({ relationship: relationship ?? null, message: relationship ? "Family relationship সংরক্ষিত হয়েছে।" : "এই relationship আগে থেকেই আছে।" });
    }

    if (action === "delete_relationship") {
      const relationshipId = optionalText(body.relationshipId, 64);
      if (!relationshipId) return Response.json({ error: "Relationship নির্বাচন করুন।" }, { status: 400 });
      await supabaseRest(`family_relationships?${new URLSearchParams({ id: `eq.${relationshipId}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await writeMemberAudit(membership.family_id, user.userId, action, "family_relationship", relationshipId, {});
      return Response.json({ message: "Family relationship সরানো হয়েছে।" });
    }

    return Response.json({ error: "Unsupported member action." }, { status: 400 });
  } catch (error) {
    return memberErrorResponse(error, "Unable to update family member");
  }
}

async function writeMemberAudit(familyId: string, actorUserId: string, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown>) {
  await supabaseRest("audit_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ family_id: familyId, actor_user_id: actorUserId, action, entity_type: entityType, entity_id: entityId, metadata }),
  });
}

function memberErrorResponse(error: unknown, logMessage: string) {
  if (error instanceof BackendNotConfiguredError) {
    return Response.json(
      { error: "PostgreSQL connection has not been configured yet." },
      { status: 503 },
    );
  }
  if (error instanceof SupabaseRequestError) {
    console.error(logMessage, error.status, error.message);
    return Response.json(
      { error: "Family data সাময়িকভাবে পাওয়া যাচ্ছে না।" },
      { status: 502 },
    );
  }
  console.error(logMessage, error);
  return Response.json(
    { error: "Family data request সম্পন্ন হয়নি।" },
    { status: 500 },
  );
}
