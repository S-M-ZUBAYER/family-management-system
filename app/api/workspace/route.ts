import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canReviewMembers, getActiveFamilyMembership } from "@/lib/family-access";
import { collectPaginatedRows, PaginatedRowLimitError } from "@/lib/paginated-rows";
import type { FamilyTheme, WorkspacePayload } from "@/lib/workspace-types";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

const themes: FamilyTheme[] = ["heritage", "emerald", "indigo", "terracotta"];

type FamilyChoiceRow = {
  family_id: string;
  role: WorkspacePayload["viewer"]["role"];
  families: { id: string; name_bn: string; name_en: string; status: string } | null;
};

async function context() {
  if (!isBackendConfigured()) throw new BackendNotConfiguredError();
  const user = await getChatGPTUser();
  if (!user) return { response: Response.json({ error: "Sign in is required." }, { status: 401 }) };
  const membership = await getActiveFamilyMembership(user.userId);
  if (!membership) {
    return { response: Response.json({ code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" }, { status: 409 }) };
  }
  return { user, membership };
}

export async function GET() {
  try {
    const current = await context();
    if (current.response) return current.response;
    const { user, membership } = current;
    const [family] = await supabaseRest<WorkspacePayload["family"][]>(`families?${new URLSearchParams({
      select: "id,name_bn,name_en,theme",
      id: `eq.${membership.family_id}`,
      limit: "1",
    })}`);
    if (!family) return Response.json({ error: "Family workspace পাওয়া যায়নি।" }, { status: 404 });
    const [profile] = await supabaseRest<Array<{ name_bn: string; name_en: string | null }>>(`member_profiles?${new URLSearchParams({
      select: "name_bn,name_en",
      family_id: `eq.${membership.family_id}`,
      auth_user_id: `eq.${user.userId}`,
      profile_status: "eq.active",
      limit: "1",
    })}`);
    const memberships = await collectPaginatedRows<FamilyChoiceRow>((offset, limit) => supabaseRest<FamilyChoiceRow[]>(`family_memberships?${new URLSearchParams({
      select: "family_id,role,families(id,name_bn,name_en,status)",
      auth_user_id: `eq.${user.userId}`,
      status: "eq.active",
      order: "created_at.asc",
      offset: String(offset),
      limit: String(limit),
    })}`), { pageSize: 100, maxRows: 1000 });
    const payload: WorkspacePayload = {
      family,
      viewer: {
        name: profile?.name_bn || profile?.name_en || user.displayName,
        role: membership.role,
        preferredLocale: membership.preferred_locale,
      },
      permissions: { canManageTheme: canReviewMembers(membership.role) },
      availableFamilies: memberships
        .filter((entry) => entry.families?.status === "active")
        .map((entry) => ({ id: entry.family_id, name_bn: entry.families!.name_bn, name_en: entry.families!.name_en, role: entry.role })),
    };
    return Response.json(payload);
  } catch (error) {
    return workspaceError(error, "Unable to load family workspace");
  }
}

export async function PATCH(request: Request) {
  try {
    const current = await context();
    if (current.response) return current.response;
    const { user, membership } = current;
    const body = await request.json() as { theme?: unknown; preferredLocale?: unknown };
    const preferredLocale = typeof body.preferredLocale === "string" ? body.preferredLocale : "";
    if (preferredLocale) {
      if (!(["bn", "en"] as const).includes(preferredLocale as "bn" | "en")) {
        return Response.json({ error: "Language selection is invalid." }, { status: 400 });
      }
      const [updated] = await supabaseRest<Array<{ preferred_locale: "bn" | "en" }>>(
        `family_memberships?${new URLSearchParams({
          id: `eq.${membership.id}`,
          family_id: `eq.${membership.family_id}`,
          auth_user_id: `eq.${user.userId}`,
        })}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ preferred_locale: preferredLocale, updated_at: new Date().toISOString() }),
        },
      );
      if (!updated) return Response.json({ error: "Language preference could not be saved." }, { status: 404 });
      return Response.json({
        preferredLocale: updated.preferred_locale,
        message: updated.preferred_locale === "bn" ? "ভাষার পছন্দ সংরক্ষিত হয়েছে।" : "Language preference saved.",
      });
    }

    if (!canReviewMembers(membership.role)) {
      return Response.json({ error: "শুধু Owner বা Family Admin theme পরিবর্তন করতে পারবেন।" }, { status: 403 });
    }

    const theme = typeof body.theme === "string" ? body.theme : "";
    if (!themes.includes(theme as FamilyTheme)) {
      return Response.json({ error: "Theme selection সঠিক নয়।" }, { status: 400 });
    }

    const [family] = await supabaseRest<WorkspacePayload["family"][]>(`families?id=eq.${membership.family_id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ theme, updated_at: new Date().toISOString() }),
    });

    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: "family_theme_updated",
        entity_type: "family",
        entity_id: membership.family_id,
        metadata: { theme },
      }),
    });

    return Response.json({ family, message: "Family theme সবার জন্য update হয়েছে।" });
  } catch (error) {
    return workspaceError(error, "Unable to update family theme");
  }
}

function workspaceError(error: unknown, message: string) {
  if (error instanceof PaginatedRowLimitError) {
    return Response.json({ error: "Too many family memberships to list safely." }, { status: 413 });
  }
  if (error instanceof BackendNotConfiguredError) {
    return Response.json({ error: "PostgreSQL connection has not been configured yet." }, { status: 503 });
  }
  if (error instanceof SupabaseRequestError) {
    console.error(message, error.status, error.message);
    return Response.json({ error: "Family workspace সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 });
  }
  console.error(message, error);
  return Response.json({ error: "Family workspace request সম্পন্ন হয়নি।" }, { status: 500 });
}
