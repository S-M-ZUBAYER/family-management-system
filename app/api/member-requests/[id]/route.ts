import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  canReviewMembers,
  getActiveFamilyMembership,
} from "@/lib/family-access";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
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

    const { id } = await context.params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const decision = body?.decision;
    if (!uuidPattern.test(id) || (decision !== "approve" && decision !== "reject")) {
      return Response.json({ error: "A valid decision is required." }, { status: 400 });
    }
    const rejectionReason = typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : "";
    if (decision === "reject" && (rejectionReason.length < 3 || rejectionReason.length > 500)) {
      return Response.json(
        { error: "Rejection reason must be 3 to 500 characters." },
        { status: 400 },
      );
    }

    const requestQuery = new URLSearchParams({
      select: "id,status,requester_user_id",
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const target = (await supabaseRest<Array<{ id: string; status: string; requester_user_id: string }>>(
      `family_member_requests?${requestQuery}`,
    ))[0];
    if (!target) return Response.json({ error: "This family's request was not found." }, { status: 404 });
    if (target.status !== "pending") {
      return Response.json({ error: "This request has already been reviewed." }, { status: 409 });
    }
    if (decision === "approve") {
      const existingMembership = await supabaseRest<Array<{ id: string }>>(`family_memberships?${new URLSearchParams({
        select: "id",
        family_id: `eq.${membership.family_id}`,
        auth_user_id: `eq.${target.requester_user_id}`,
        limit: "1",
      })}`);
      if (existingMembership.length) {
        return Response.json({ error: "This person already has a membership record. An administrator must review restoration separately." }, { status: 409 });
      }
    }

    const result = await supabaseRest<Record<string, unknown>>(
      "rpc/review_member_request",
      {
        method: "POST",
        body: JSON.stringify({
          p_request_id: id,
          p_decision: decision,
          p_reviewer_user_id: user.userId,
          p_rejection_reason: decision === "reject" ? rejectionReason : null,
        }),
      },
    );

    return Response.json({ result });
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
      console.error("Unable to review member request", error.status, error.message);
      const status = /Membership request is no longer pending|Membership already exists/.test(error.message) ? 409
        : /Family Admin permission is required/.test(error.message) ? 403
          : error.status === 400 || error.status === 404 ? error.status : 502;
      return Response.json(
        { error: "The request could not be reviewed." },
        { status },
      );
    }
    console.error("Unable to review member request", error);
    return Response.json(
      { error: "The request could not be reviewed." },
      { status: 500 },
    );
  }
}
