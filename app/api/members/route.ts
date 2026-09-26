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
      members,
      relationships,
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

    const parentId = optionalText(body.parentId, 64);
    if (parentId) {
      const parentQuery = new URLSearchParams({
        select: "id",
        id: `eq.${parentId}`,
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
    if (parentId) {
      try {
        await supabaseRest("family_relationships", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            family_id: membership.family_id,
            from_member_id: parentId,
            to_member_id: member.id,
            relationship_type: "parent",
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
