import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership, getAnyActiveFamilyMembership } from "@/lib/family-access";
import { activeFamilyCookieHeader, familyCreationSlug } from "@/lib/family-selection";
import { collectPaginatedRows } from "@/lib/paginated-rows";
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
  status?: "active" | "suspended" | "archived";
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

type FamilyChoiceRow = {
  family_id: string;
  families: { id: string; name_bn: string; name_en: string } | null;
};

class FamilySetupAccessError extends Error {}

function cleanName(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function findFamilyCreatedBy(authUserId: string) {
  const query = new URLSearchParams({
    select: "id,name_bn,name_en,slug,status",
    created_by_user_id: `eq.${authUserId}`,
    order: "created_at.desc",
    limit: "1",
  });
  const rows = await supabaseRest<FamilyRow[]>(`families?${query}`);
  return rows[0] ?? null;
}

async function findFamilyBySlug(slug: string, authUserId: string) {
  const query = new URLSearchParams({
    select: "id,name_bn,name_en,slug,status",
    slug: `eq.${slug}`,
    created_by_user_id: `eq.${authUserId}`,
    limit: "1",
  });
  const rows = await supabaseRest<FamilyRow[]>(`families?${query}`);
  return rows[0] ?? null;
}

async function completeOwnerSetup(
  family: FamilyRow,
  user: { userId: string; email: string; displayName: string },
  source: "initial_setup" | "additional_setup" = "initial_setup",
) {
  const membershipQuery = new URLSearchParams({
    select: "id,status",
    family_id: `eq.${family.id}`,
    auth_user_id: `eq.${user.userId}`,
    limit: "1",
  });
  const membership = await supabaseRest<Array<{ id: string; status: string }>>(
    `family_memberships?${membershipQuery}`,
  );
  if (membership.length && membership[0].status !== "active") {
    throw new FamilySetupAccessError("Your previous family access is inactive. Ask a Family Admin to review it.");
  }
  if (!membership.length) {
    // An interrupted setup may be resumed, but a removed owner cannot
    // silently restore access through onboarding.
    const previousSetup = await supabaseRest<Array<{ id: number }>>(`audit_logs?${new URLSearchParams({
      select: "id",
      family_id: `eq.${family.id}`,
      actor_user_id: `eq.${user.userId}`,
      action: "eq.family_created",
      limit: "1",
    })}`);
    if (previousSetup.length) {
      throw new FamilySetupAccessError("This family was already set up. Ask a Family Admin to restore access.");
    }
  }

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
        metadata: { source },
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
      const [requests, families, choices] = await Promise.all([
        supabaseRest<JoinRequestRow[]>(`family_member_requests?${new URLSearchParams({
          select: "id,family_id,status,rejection_reason,created_at,families(name_bn,name_en)",
          requester_user_id: `eq.${user.userId}`,
          order: "created_at.desc",
          limit: "1",
        })}`),
        supabaseRest<Array<{ id: string }>>("families?select=id&status=eq.active&limit=1"),
        collectPaginatedRows<FamilyChoiceRow>((offset, limit) => supabaseRest<FamilyChoiceRow[]>(`family_memberships?${new URLSearchParams({
          select: "family_id,families!inner(id,name_bn,name_en)",
          auth_user_id: `eq.${user.userId}`,
          status: "eq.active",
          "families.status": "eq.active",
          order: "created_at.asc",
          offset: String(offset),
          limit: String(limit),
        })}`), { pageSize: 100, maxRows: 1000 }),
      ]);
      return Response.json({
        configured: true,
        setupComplete: false,
        initialSetupAvailable: true,
        suggestedMode: families.length === 0 ? "create" : "join",
        joinRequest: requests[0] ?? null,
        availableFamilies: choices.filter((choice) => choice.families).map((choice) => choice.families),
      });
    }

    const requests = await supabaseRest<JoinRequestRow[]>(`family_member_requests?${new URLSearchParams({
      select: "id,family_id,status,rejection_reason,created_at,families(name_bn,name_en)",
      requester_user_id: `eq.${user.userId}`,
      family_id: `neq.${membership.family_id}`,
      order: "created_at.desc",
      limit: "1",
    })}`);
    const query = new URLSearchParams({
      select: "id,name_bn,name_en,slug",
      id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const family = (await supabaseRest<FamilyRow[]>(`families?${query}`))[0] ?? null;
    return Response.json({ configured: true, setupComplete: true, family, joinRequest: requests[0] ?? null });
  } catch (error) {
    return setupErrorResponse(error, "Unable to read family setup status");
  }
}

export async function POST(request: Request) {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const body = (await request.json()) as {
      mode?: unknown;
      nameBn?: unknown;
      nameEn?: unknown;
      joinCode?: unknown;
      relationship?: unknown;
      sponsor?: unknown;
      phone?: unknown;
      creationKey?: unknown;
    };
    const mode = body.mode === "join" ? "join" : "create";
    // Creation/join onboarding is explicit and is not a mutation of the
    // cookie-selected family. Preserve additional-family idempotency even
    // when that cookie points to a suspended or revoked family.
    const currentMembership = await getAnyActiveFamilyMembership(user.userId);
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

      const existingMembership = await supabaseRest<Array<{ status: string }>>(`family_memberships?${new URLSearchParams({
        select: "status",
        family_id: `eq.${family.id}`,
        auth_user_id: `eq.${user.userId}`,
        limit: "1",
      })}`);
      if (existingMembership.length) {
        return Response.json({ error: existingMembership[0].status === "active" ? "You already belong to this family." : "Your prior access to this family is inactive. Ask its Family Admin to review it." }, { status: 409 });
      }

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

    const creationSlug = body.creationKey === undefined && !currentMembership
      ? null
      : familyCreationSlug(body.creationKey);
    if (currentMembership && !creationSlug) {
      return Response.json({ error: "A valid creation request is required." }, { status: 400 });
    }
    if (body.creationKey !== undefined && !creationSlug) {
      return Response.json({ error: "A valid creation request is required." }, { status: 400 });
    }

    let family = currentMembership
      ? await findFamilyBySlug(creationSlug!, user.userId)
      : await findFamilyCreatedBy(user.userId);
    if (family && family.status !== "active") {
      throw new FamilySetupAccessError("This family is not active. Contact the family administrator before creating another workspace.");
    }
    if (!family) {
      [family] = await supabaseRest<FamilyRow[]>("families", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name_bn: nameBn,
          name_en: nameEn,
          slug: creationSlug ?? `${nameEn.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "family"}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
          join_code: crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase(),
          theme: "heritage",
          created_by_user_id: user.userId,
        }),
      });
    }

    await completeOwnerSetup(family, user, currentMembership ? "additional_setup" : "initial_setup");
    const response = Response.json({ setupComplete: true, family, message: "Family workspace is ready." });
    response.headers.set("Set-Cookie", activeFamilyCookieHeader(family.id));
    return response;
  } catch (error) {
    return setupErrorResponse(error, "Unable to complete family setup");
  }
}

function setupErrorResponse(error: unknown, logMessage: string) {
  if (error instanceof FamilySetupAccessError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
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
