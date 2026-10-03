import { getChatGPTUser } from "@/app/chatgpt-auth";
import { activeFamilyCookieHeader, validFamilyId } from "@/lib/family-selection";
import { BackendNotConfiguredError, isBackendConfigured, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

type MembershipRow = {
  family_id: string;
  families: { status: string } | null;
};

export async function POST(request: Request) {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const body = await request.json() as { familyId?: unknown };
    if (!validFamilyId(body.familyId)) {
      return Response.json({ error: "Choose a valid family." }, { status: 400 });
    }

    const [membership] = await supabaseRest<MembershipRow[]>(`family_memberships?${new URLSearchParams({
      select: "family_id,families(status)",
      auth_user_id: `eq.${user.userId}`,
      family_id: `eq.${body.familyId}`,
      status: "eq.active",
      limit: "1",
    })}`);
    if (!membership || membership.families?.status !== "active") {
      return Response.json({ error: "You do not have active access to this family." }, { status: 403 });
    }

    const response = Response.json({ familyId: membership.family_id, message: "Family workspace changed successfully." });
    response.headers.set("Set-Cookie", activeFamilyCookieHeader(membership.family_id));
    return response;
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection has not been configured yet." }, { status: 503 });
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to select family", error.status, error.message);
      return Response.json({ error: "Family selection is temporarily unavailable." }, { status: 502 });
    }
    console.error("Unable to select family", error);
    return Response.json({ error: "Family selection could not be completed." }, { status: 500 });
  }
}
