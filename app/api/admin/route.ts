import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  canManageMembershipRoles,
  canViewAdministration,
  getActiveFamilyMembership,
  type FamilyRole,
} from "@/lib/family-access";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

type MembershipStatus = "active" | "suspended" | "left";

type MembershipRow = {
  id: string;
  family_id: string;
  auth_user_id: string;
  member_profile_id: string | null;
  role: FamilyRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
};

type MemberSummary = {
  id: string;
  auth_user_id: string | null;
  name_bn: string;
  name_en: string | null;
  email: string | null;
  phone: string | null;
  relationship_text: string | null;
};

type AuditRow = {
  id: number;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const roles: FamilyRole[] = ["owner", "family_admin", "manager", "member"];
const statuses: MembershipStatus[] = ["active", "suspended", "left"];

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const viewer = await getActiveFamilyMembership(user.userId);
    if (!viewer || !canViewAdministration(viewer.role)) {
      return Response.json({ error: "Family Owner বা Admin permission প্রয়োজন।" }, { status: 403 });
    }

    const [familyRows, memberships, profiles, auditLogs] = await Promise.all([
      supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(
        `families?${new URLSearchParams({
          select: "id,name_bn,name_en",
          id: `eq.${viewer.family_id}`,
          limit: "1",
        })}`,
      ),
      supabaseRest<MembershipRow[]>(
        `family_memberships?${new URLSearchParams({
          select: "id,family_id,auth_user_id,member_profile_id,role,status,created_at,updated_at",
          family_id: `eq.${viewer.family_id}`,
          order: "created_at.asc",
        })}`,
      ),
      supabaseRest<MemberSummary[]>(
        `member_profiles?${new URLSearchParams({
          select: "id,auth_user_id,name_bn,name_en,email,phone,relationship_text",
          family_id: `eq.${viewer.family_id}`,
          order: "created_at.asc",
        })}`,
      ),
      supabaseRest<AuditRow[]>(
        `audit_logs?${new URLSearchParams({
          select: "id,actor_user_id,action,entity_type,entity_id,metadata,created_at",
          family_id: `eq.${viewer.family_id}`,
          order: "created_at.desc",
          limit: "500",
        })}`,
      ),
    ]);

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const profileByUserId = new Map(
      profiles.filter((profile) => profile.auth_user_id).map((profile) => [profile.auth_user_id!, profile]),
    );
    const actorNames = Object.fromEntries(
      profiles
        .filter((profile) => profile.auth_user_id)
        .map((profile) => [profile.auth_user_id!, profile.name_bn]),
    );

    return Response.json({
      family: familyRows[0] ?? null,
      viewer: { userId: user.userId, role: viewer.role },
      permissions: { canManageRoles: canManageMembershipRoles(viewer.role) },
      memberships: memberships.map((membership) => ({
        ...membership,
        profile: membership.member_profile_id
          ? profileById.get(membership.member_profile_id) ?? null
          : profileByUserId.get(membership.auth_user_id) ?? null,
      })),
      auditLogs,
      actorNames,
    });
  } catch (error) {
    return adminErrorResponse(error, "Unable to load family administration");
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const viewer = await getActiveFamilyMembership(user.userId);
    if (!viewer || !canManageMembershipRoles(viewer.role)) {
      return Response.json({ error: "শুধু Family Owner role ও access পরিবর্তন করতে পারবেন।" }, { status: 403 });
    }

    const body = (await request.json()) as {
      action?: unknown;
      membershipId?: unknown;
      role?: unknown;
      status?: unknown;
    };
    if (body.action !== "update_membership") {
      return Response.json({ error: "Valid administration action প্রয়োজন।" }, { status: 400 });
    }
    const membershipId = typeof body.membershipId === "string" ? body.membershipId.trim() : "";
    const role = typeof body.role === "string" ? body.role as FamilyRole : null;
    const status = typeof body.status === "string" ? body.status as MembershipStatus : null;
    if (!membershipId || !role || !roles.includes(role) || !status || !statuses.includes(status)) {
      return Response.json({ error: "Valid member, role ও access status নির্বাচন করুন।" }, { status: 400 });
    }

    const targetQuery = new URLSearchParams({
      select: "id,family_id,auth_user_id,member_profile_id,role,status,created_at,updated_at",
      id: `eq.${membershipId}`,
      family_id: `eq.${viewer.family_id}`,
      limit: "1",
    });
    const target = (await supabaseRest<MembershipRow[]>(`family_memberships?${targetQuery}`))[0];
    if (!target) return Response.json({ error: "Membership পাওয়া যায়নি।" }, { status: 404 });
    if (target.auth_user_id === user.userId) {
      return Response.json({ error: "নিজের Owner role বা access এখান থেকে পরিবর্তন করা যাবে না।" }, { status: 409 });
    }

    if (target.role === "owner" && (role !== "owner" || status !== "active")) {
      const activeOwners = await supabaseRest<Array<{ id: string }>>(
        `family_memberships?${new URLSearchParams({
          select: "id",
          family_id: `eq.${viewer.family_id}`,
          role: "eq.owner",
          status: "eq.active",
        })}`,
      );
      if (activeOwners.length <= 1) {
        return Response.json({ error: "পরিবারে অন্তত একজন active Owner রাখতে হবে।" }, { status: 409 });
      }
    }

    const [updated] = await supabaseRest<MembershipRow[]>(
      `family_memberships?${new URLSearchParams({
        id: `eq.${membershipId}`,
        family_id: `eq.${viewer.family_id}`,
      })}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ role, status, updated_at: new Date().toISOString() }),
      },
    );

    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: viewer.family_id,
        actor_user_id: user.userId,
        action: "family_membership_updated",
        entity_type: "family_membership",
        entity_id: membershipId,
        metadata: {
          target_user_id: target.auth_user_id,
          previous_role: target.role,
          next_role: role,
          previous_status: target.status,
          next_status: status,
        },
      }),
    });

    return Response.json({ membership: updated, message: "Member role ও access সফলভাবে update হয়েছে।" });
  } catch (error) {
    return adminErrorResponse(error, "Unable to update family membership");
  }
}

function adminErrorResponse(error: unknown, logMessage: string) {
  if (error instanceof BackendNotConfiguredError) {
    return Response.json({ error: "PostgreSQL connection has not been configured yet." }, { status: 503 });
  }
  if (error instanceof SupabaseRequestError) {
    console.error(logMessage, error.status, error.message);
    return Response.json({ error: "Administration data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 });
  }
  console.error(logMessage, error);
  return Response.json({ error: "Administration request সম্পন্ন হয়নি।" }, { status: 500 });
}
