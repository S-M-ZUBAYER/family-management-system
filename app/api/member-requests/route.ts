import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  canReviewMembers,
  getActiveFamilyMembership,
} from "@/lib/family-access";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

type MemberRequestRow = {
  id: string;
  requested_name_bn: string;
  requested_name_en: string | null;
  relationship_text: string;
  sponsor_name: string | null;
  email: string | null;
  phone: string | null;
  requested_role: string;
  duplicate_hint: boolean;
  created_at: string;
};

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();

    const user = await getChatGPTUser();
    if (!user) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }

    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canReviewMembers(membership.role)) {
      return Response.json(
        { error: "Family Admin permission is required." },
        { status: 403 },
      );
    }

    const query = new URLSearchParams({
      select:
        "id,requested_name_bn,requested_name_en,relationship_text,sponsor_name,email,phone,requested_role,duplicate_hint,created_at",
      family_id: `eq.${membership.family_id}`,
      status: "eq.pending",
      order: "created_at.desc",
    });
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [requests, approvedThisMonth, family] = await Promise.all([
      supabaseRest<MemberRequestRow[]>(`family_member_requests?${query}`),
      supabaseRest<Array<{ id: string }>>(`family_member_requests?${new URLSearchParams({
        select: "id",
        family_id: `eq.${membership.family_id}`,
        status: "eq.approved",
        reviewed_at: `gte.${monthStart.toISOString()}`,
      })}`),
      supabaseRest<Array<{ id: string; name_bn: string; name_en: string; join_code: string }>>(`families?${new URLSearchParams({
        select: "id,name_bn,name_en,join_code",
        id: `eq.${membership.family_id}`,
        limit: "1",
      })}`),
    ]);

    return Response.json({
      source: "postgresql",
      familyId: membership.family_id,
      family: family[0] ?? null,
      requests,
      metrics: {
        pending: requests.length,
        duplicates: requests.filter((item) => item.duplicate_hint).length,
        approvedThisMonth: approvedThisMonth.length,
      },
    });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return Response.json(
        {
          code: "BACKEND_NOT_CONFIGURED",
          error: "PostgreSQL connection has not been configured yet.",
        },
        { status: 503 },
      );
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to load member requests", error.status, error.message);
      return Response.json(
        { error: "Member requests are temporarily unavailable." },
        { status: 502 },
      );
    }
    console.error("Unable to load member requests", error);
    return Response.json(
      { error: "Member requests are temporarily unavailable." },
      { status: 500 },
    );
  }
}
