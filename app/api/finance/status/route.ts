import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

const config = {
  account: {
    table: "personal_finance_accounts",
    statuses: ["active", "archived"],
  },
  bill: {
    table: "personal_finance_bills",
    statuses: ["pending", "paid", "skipped"],
  },
  debt: {
    table: "personal_finance_debts",
    statuses: ["open", "partial", "settled", "overdue"],
  },
  goal: {
    table: "personal_finance_goals",
    statuses: ["active", "completed", "paused"],
  },
} as const;

type Entity = keyof typeof config;

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });

    const body = (await request.json()) as {
      entity?: Entity;
      id?: unknown;
      status?: unknown;
      amount?: unknown;
    };
    const entity = body.entity;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!entity || !(entity in config) || !id) {
      return Response.json({ error: "Valid finance entity ও id প্রয়োজন।" }, { status: 400 });
    }

    const entityConfig = config[entity];
    const query = new URLSearchParams({
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
      auth_user_id: `eq.${user.userId}`,
      limit: "1",
    });
    const existing = (
      await supabaseRest<Array<Record<string, unknown>>>(
        `${entityConfig.table}?${query}&select=*`,
      )
    )[0];
    if (!existing) return Response.json({ error: "নিজের finance record পাওয়া যায়নি।" }, { status: 404 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (entity === "debt" || entity === "goal") {
      const amount = Number(body.amount);
      const target = Number(
        entity === "debt" ? existing.principal_amount : existing.target_amount,
      );
      if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(target)) {
        return Response.json({ error: "Valid progress amount প্রয়োজন।" }, { status: 400 });
      }
      if (entity === "debt") {
        if (amount > target) return Response.json({ error: "Settled amount principal-এর বেশি হতে পারে না।" }, { status: 400 });
        update.settled_amount = amount;
        update.status = amount >= target ? "settled" : amount > 0 ? "partial" : "open";
      } else {
        update.current_amount = amount;
        update.status = amount >= target ? "completed" : "active";
      }
    } else {
      const status = typeof body.status === "string" ? body.status.trim() : "";
      if (!entityConfig.statuses.includes(status as never)) {
        return Response.json({ error: "Valid status প্রয়োজন।" }, { status: 400 });
      }
      update.status = status;
    }

    const rows = await supabaseRest<Array<Record<string, unknown>>>(
      `${entityConfig.table}?${query}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(update),
      },
    );
    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: `personal_finance_${entity}_updated`,
        entity_type: `personal_finance_${entity}`,
        entity_id: id,
        metadata: { private: true },
      }),
    });
    return Response.json({ record: rows[0] });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to update private finance record", error.status, error.message);
      return Response.json({ error: "Finance update হয়নি।" }, { status: 502 });
    }
    console.error("Unable to update private finance record", error);
    return Response.json({ error: "Finance update হয়নি।" }, { status: 500 });
  }
}
