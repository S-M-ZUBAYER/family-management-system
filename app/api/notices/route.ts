import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  canManageNotices,
  getActiveFamilyMembership,
} from "@/lib/family-access";
import { collectPaginatedRows, PaginatedRowLimitError } from "@/lib/paginated-rows";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

export type FamilyNoticeRow = {
  id: string;
  family_id: string;
  title_bn: string;
  title_en: string | null;
  body_bn: string;
  body_en: string | null;
  category: "general" | "urgent" | "event" | "finance" | "qurbani" | "health";
  priority: "normal" | "high" | "urgent";
  status: "draft" | "published" | "archived";
  is_pinned: boolean;
  publish_at: string | null;
  expires_at: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type CreateNoticeBody = {
  titleBn?: unknown;
  titleEn?: unknown;
  bodyBn?: unknown;
  bodyEn?: unknown;
  category?: unknown;
  priority?: unknown;
  status?: unknown;
  isPinned?: unknown;
  publishAt?: unknown;
  expiresAt?: unknown;
};

const categories = ["general", "urgent", "event", "finance", "qurbani", "health"] as const;
const priorities = ["normal", "high", "urgent"] as const;
const statuses = ["draft", "published"] as const;

const optionalText = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

function optionalTimestamp(value: unknown) {
  const text = optionalText(value, 40);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function readAllNotices(query: URLSearchParams): Promise<FamilyNoticeRow[]> {
  return collectPaginatedRows(
    (offset, limit) => {
      const pageQuery = new URLSearchParams(query);
      pageQuery.set("offset", String(offset));
      pageQuery.set("limit", String(limit));
      return supabaseRest<FamilyNoticeRow[]>(`family_notices?${pageQuery}`);
    },
    { pageSize: 500, maxRows: 20000 },
  );
}

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

    const canManage = canManageNotices(membership.role);
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

    let notices: FamilyNoticeRow[] = [];
    let migrationRequired = false;
    try {
      const noticeQuery = new URLSearchParams({
        select: "id,family_id,title_bn,title_en,body_bn,body_en,category,priority,status,is_pinned,publish_at,expires_at,created_by_user_id,created_at,updated_at",
        family_id: `eq.${membership.family_id}`,
        order: "is_pinned.desc,publish_at.desc.nullslast,created_at.desc,id.asc",
      });
      notices = await readAllNotices(noticeQuery);
    } catch (error) {
      if (error instanceof SupabaseRequestError && /PGRST205|42P01|42703/.test(error.message)) migrationRequired = true;
      else throw error;
    }

    if (!canManage) {
      const now = Date.now();
      notices = notices.filter((notice) => {
        const publishTime = notice.publish_at ? new Date(notice.publish_at).getTime() : 0;
        const expiryTime = notice.expires_at ? new Date(notice.expires_at).getTime() : null;
        return notice.status === "published" && publishTime <= now && (!expiryTime || expiryTime > now);
      });
    }

    return Response.json({
      family,
      notices,
      migrationRequired,
      permissions: { canManage },
    });
  } catch (error) {
    return noticeErrorResponse(error, "Unable to load notices");
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
    if (!canManageNotices(membership.role)) {
      return Response.json({ error: "Notice তৈরি করার permission নেই।" }, { status: 403 });
    }

    const body = (await request.json()) as CreateNoticeBody;
    const titleBn = optionalText(body.titleBn, 180);
    const bodyBn = optionalText(body.bodyBn, 5000);
    const category = optionalText(body.category, 20) ?? "general";
    const priority = optionalText(body.priority, 20) ?? "normal";
    const status = optionalText(body.status, 20) ?? "draft";
    const publishAt = optionalTimestamp(body.publishAt);
    const expiresAt = optionalTimestamp(body.expiresAt);

    if (!titleBn || titleBn.length < 3 || !bodyBn || bodyBn.length < 5) {
      return Response.json({ error: "Notice title ও বিস্তারিত লিখুন।" }, { status: 400 });
    }
    if (!categories.includes(category as (typeof categories)[number])) {
      return Response.json({ error: "Notice category সঠিক নয়।" }, { status: 400 });
    }
    if (!priorities.includes(priority as (typeof priorities)[number])) {
      return Response.json({ error: "Notice priority সঠিক নয়।" }, { status: 400 });
    }
    if (!statuses.includes(status as (typeof statuses)[number])) {
      return Response.json({ error: "Notice status সঠিক নয়।" }, { status: 400 });
    }
    if (publishAt === undefined || expiresAt === undefined) {
      return Response.json({ error: "Notice date/time সঠিক নয়।" }, { status: 400 });
    }
    if (publishAt && expiresAt && new Date(expiresAt) <= new Date(publishAt)) {
      return Response.json({ error: "Expiry সময় publish সময়ের পরে হতে হবে।" }, { status: 400 });
    }

    const [notice] = await supabaseRest<FamilyNoticeRow[]>("family_notices", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        title_bn: titleBn,
        title_en: optionalText(body.titleEn, 180),
        body_bn: bodyBn,
        body_en: optionalText(body.bodyEn, 5000),
        category,
        priority,
        status,
        is_pinned: body.isPinned === true,
        publish_at: status === "published" ? publishAt ?? new Date().toISOString() : publishAt,
        expires_at: expiresAt,
        created_by_user_id: user.userId,
      }),
    });

    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: "family_notice_created",
        entity_type: "family_notice",
        entity_id: notice.id,
        metadata: { status: notice.status, priority: notice.priority },
      }),
    });

    return Response.json({ notice }, { status: 201 });
  } catch (error) {
    return noticeErrorResponse(error, "Unable to create notice");
  }
}

function noticeErrorResponse(error: unknown, logMessage: string) {
  if (error instanceof PaginatedRowLimitError) {
    return Response.json({ code: "NOTICES_ROW_LIMIT", maxRows: error.maxRows, error: `Notice history exceeds ${error.maxRows} rows. No partial data was shown or exported; contact support for a paged export.` }, { status: 413 });
  }
  if (error instanceof BackendNotConfiguredError) {
    return Response.json(
      { error: "PostgreSQL connection has not been configured yet." },
      { status: 503 },
    );
  }
  if (error instanceof SupabaseRequestError) {
    console.error(logMessage, error.status, error.message);
    return Response.json({ error: "Notice data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 });
  }
  console.error(logMessage, error);
  return Response.json({ error: "Notice request সম্পন্ন হয়নি।" }, { status: 500 });
}
