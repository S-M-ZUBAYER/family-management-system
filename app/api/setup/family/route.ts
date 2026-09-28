import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

type FamilyRow = {
  id: string;
  name_bn: string;
  name_en: string;
  slug: string;
  join_code?: string;
};

type ProfileRow = { id: string };

type JoinRequestRow = {
  id: string;
  family_id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  rejection_reason: string | null;
  created_at: string;
  families: { name_bn: string; name_en: string } | null;
};

function cleanName(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function findFamilyCreatedBy(authUserId: string) {
  const query = new URLSearchParams({
    select: "id,name_bn,name_en,slug",
    created_by_user_id: `eq.${authUserId}`,
    limit: "1",
  });
  const rows = await supabaseRest<FamilyRow[]>(`families?${query}`);
  return rows[0] ?? null;
}

async function completeOwnerSetup(
  family: FamilyRow,
  user: { userId: string; email: string; displayName: string },
) {
  const profileQuery = new URLSearchParams({
    select: "id",
    family_id: `eq.${family.id}`,
    auth_user_id: `eq.${user.userId}`,
    limit: "1",
  });
  let profile = (
    await supabaseRest<ProfileRow[]>(`member_profiles?${profileQuery}`)
  )[0];

  if (!profile) {
    [profile] = await supabaseRest<ProfileRow[]>("member_profiles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: family.id,
        auth_user_id: user.userId,
        name_bn: user.displayName,
        name_en: user.displayName,
        email: user.email,
        relationship_text: "পরিবারের প্রতিষ্ঠাতা",
      }),
    });
  }

  const membershipQuery = new URLSearchParams({
    select: "id",
    family_id: `eq.${family.id}`,
    auth_user_id: `eq.${user.userId}`,
    limit: "1",
  });
  const membership = await supabaseRest<Array<{ id: string }>>(
    `family_memberships?${membershipQuery}`,
  );
  if (!membership.length) {
    await supabaseRest("family_memberships", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: family.id,
        auth_user_id: user.userId,
        member_profile_id: profile.id,
        role: "owner",
        status: "active",
      }),
    });
    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: family.id,
        actor_user_id: user.userId,
        action: "family_created",
        entity_type: "family",
        entity_id: family.id,
        metadata: { source: "initial_setup" },
      }),
    });
  }

  return family;
}

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) {
      const [requests, families] = await Promise.all([
        supabaseRest<JoinRequestRow[]>(`family_member_requests?${new URLSearchParams({
          select: "id,family_id,status,rejection_reason,created_at,families(name_bn,name_en)",
          requester_user_id: `eq.${user.userId}`,
          order: "created_at.desc",
          limit: "1",
        })}`),
        supabaseRest<Array<{ id: string }>>("families?select=id&status=eq.active&limit=1"),
      ]);
      return Response.json({
        configured: true,
        setupComplete: false,
        initialSetupAvailable: families.length === 0,
        joinRequest: requests[0] ?? null,
      });
    }

    const query = new URLSearchParams({
      select: "id,name_bn,name_en,slug",
      id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const family = (await supabaseRest<FamilyRow[]>(`families?${query}`))[0] ?? null;
    return Response.json({ configured: true, setupComplete: true, family });
  } catch (error) {
    return setupErrorResponse(error, "Unable to read family setup status");
  }
}

export async function POST(request: Request) {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const currentMembership = await getActiveFamilyMembership(user.userId);
    if (currentMembership) {
      return Response.json({ setupComplete: true, familyId: currentMembership.family_id });
    }

    const body = (await request.json()) as {
      mode?: unknown;
      nameBn?: unknown;
      nameEn?: unknown;
      joinCode?: unknown;
      relationship?: unknown;
      sponsor?: unknown;
      phone?: unknown;
    };
    const mode = body.mode === "join" ? "join" : "create";
    const nameBn = cleanName(body.nameBn, 120);
    const nameEn = cleanName(body.nameEn, 120);
    if (nameBn.length < 2 || (mode === "create" && nameEn.length < 2)) {
      return Response.json(
        { error: mode === "join" ? "আপনার বাংলা নাম দিন।" : "বাংলা ও ইংরেজি—দুইটি পরিবারের নাম দিন।" },
        { status: 400 },
      );
    }

    if (mode === "join") {
      const joinCode = cleanName(body.joinCode, 24).replace(/\s+/g, "").toUpperCase();
      const relationship = cleanName(body.relationship, 160);
      if (joinCode.length < 6 || relationship.length < 2) {
        return Response.json({ error: "সঠিক join code এবং পারিবারিক সম্পর্ক দিন।" }, { status: 400 });
      }

      const family = (await supabaseRest<FamilyRow[]>(`families?${new URLSearchParams({
        select: "id,name_bn,name_en,slug",
        join_code: `eq.${joinCode}`,
        status: "eq.active",
        limit: "1",
      })}`))[0];
      if (!family) return Response.json({ error: "এই join code-এর কোনো active family পাওয়া যায়নি।" }, { status: 404 });

      const pending = await supabaseRest<Array<{ id: string }>>(`family_member_requests?${new URLSearchParams({
        select: "id",
        family_id: `eq.${family.id}`,
        requester_user_id: `eq.${user.userId}`,
        status: "eq.pending",
        limit: "1",
      })}`);
      if (pending.length) {
        return Response.json({ error: "এই পরিবারের জন্য আপনার একটি আবেদন ইতোমধ্যে pending আছে।" }, { status: 409 });
      }

      const duplicateProfiles = await supabaseRest<Array<{ id: string }>>(`member_profiles?${new URLSearchParams({
        select: "id",
        family_id: `eq.${family.id}`,
        email: `eq.${user.email}`,
        limit: "1",
      })}`);
      const [joinRequest] = await supabaseRest<Array<{ id: string; status: string }>>("family_member_requests", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          family_id: family.id,
          requester_user_id: user.userId,
          requested_name_bn: nameBn,
          requested_name_en: nameEn || null,
          relationship_text: relationship,
          sponsor_name: cleanName(body.sponsor, 120) || null,
          email: user.email,
          phone: cleanName(body.phone, 40) || null,
          requested_role: "member",
          duplicate_hint: duplicateProfiles.length > 0,
        }),
      });
      await supabaseRest("audit_logs", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          family_id: family.id,
          actor_user_id: user.userId,
          action: "member_request_submitted",
          entity_type: "family_member_request",
          entity_id: joinRequest.id,
          metadata: { duplicate_hint: duplicateProfiles.length > 0 },
        }),
      });
      return Response.json({
        setupComplete: false,
        requestSubmitted: true,
        joinRequest,
        family: { id: family.id, name_bn: family.name_bn, name_en: family.name_en, slug: family.slug },
        message: "Membership request Family Admin-এর কাছে পাঠানো হয়েছে।",
      }, { status: 201 });
    }

    let family = await findFamilyCreatedBy(user.userId);
    if (!family) {
      const anyFamily = await supabaseRest<Array<{ id: string }>>(
        "families?select=id&limit=1",
      );
      if (anyFamily.length) {
        return Response.json(
          { error: "Initial family setup has already been completed." },
          { status: 409 },
        );
      }

      [family] = await supabaseRest<FamilyRow[]>("families", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name_bn: nameBn,
          name_en: nameEn,
          slug: "sheikh-monsuf-family",
          join_code: crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
          theme: "heritage",
          created_by_user_id: user.userId,
        }),
      });
    }

    await completeOwnerSetup(family, user);
    return Response.json({ setupComplete: true, family });
  } catch (error) {
    return setupErrorResponse(error, "Unable to complete family setup");
  }
}

function setupErrorResponse(error: unknown, logMessage: string) {
  if (error instanceof BackendNotConfiguredError) {
    return Response.json(
      { error: "PostgreSQL connection has not been configured yet." },
      { status: 503 },
    );
  }
  if (error instanceof SupabaseRequestError) {
    console.error(logMessage, error.status, error.message);
    return Response.json(
      { error: "PostgreSQL setup is temporarily unavailable." },
      { status: 502 },
    );
  }
  console.error(logMessage, error);
  return Response.json(
    { error: "Family setup could not be completed." },
    { status: 500 },
  );
}
