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

type ReviewBody = {
  decision?: "approve" | "reject";
  rejectionReason?: string;
};

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
    const body = (await request.json()) as ReviewBody;
    if (!id || !body.decision || !["approve", "reject"].includes(body.decision)) {
      return Response.json({ error: "A valid decision is required." }, { status: 400 });
    }
    if (
      body.decision === "reject" &&
      body.rejectionReason &&
      body.rejectionReason.length > 500
    ) {
      return Response.json(
        { error: "Rejection reason must be 500 characters or fewer." },
        { status: 400 },
      );
    }

    const result = await supabaseRest<Record<string, unknown>>(
      "rpc/review_member_request",
      {
        method: "POST",
        body: JSON.stringify({
          p_request_id: id,
          p_decision: body.decision,
          p_reviewer_user_id: user.userId,
          p_rejection_reason: body.rejectionReason?.trim() || null,
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
      const status = error.status === 400 || error.status === 404 ? error.status : 502;
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

