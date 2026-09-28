import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageNotices, getActiveFamilyMembership } from "@/lib/family-access";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

import type { FamilyNoticeRow } from "../route";

type NoticeAction = "publish" | "draft" | "archive" | "pin" | "unpin" | "edit";
type UpdateNoticeBody = {
  action?: NoticeAction;
  data?: {
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
};

const actions: NoticeAction[] = ["publish", "draft", "archive", "pin", "unpin", "edit"];
const categories = ["general", "urgent", "event", "finance", "qurbani", "health"] as const;
const priorities = ["normal", "high", "urgent"] as const;
const statuses = ["draft", "published", "archived"] as const;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const timestamp = (value: unknown) => {
  const candidate = text(value, 40);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageNotices(membership.role)) {
      return Response.json({ error: "Notice পরিচালনার permission নেই।" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as UpdateNoticeBody;
    if (!id || !body.action || !actions.includes(body.action)) {
      return Response.json({ error: "Valid notice action প্রয়োজন।" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.action === "edit") {
      const data = body.data ?? {};
      const titleBn = text(data.titleBn, 180);
      const bodyBn = text(data.bodyBn, 5000);
      const category = text(data.category, 20) ?? "general";
      const priority = text(data.priority, 20) ?? "normal";
      const status = text(data.status, 20) ?? "draft";
      const publishAt = timestamp(data.publishAt);
      const expiresAt = timestamp(data.expiresAt);
      if (!titleBn || titleBn.length < 3 || !bodyBn || bodyBn.length < 5) {
        return Response.json({ error: "Notice title ও বিস্তারিত লিখুন।" }, { status: 400 });
      }
      if (!categories.includes(category as (typeof categories)[number]) || !priorities.includes(priority as (typeof priorities)[number]) || !statuses.includes(status as (typeof statuses)[number])) {
        return Response.json({ error: "Notice category, priority বা status সঠিক নয়।" }, { status: 400 });
      }
      if (publishAt === undefined || expiresAt === undefined || (publishAt && expiresAt && new Date(expiresAt) <= new Date(publishAt))) {
        return Response.json({ error: "Notice date/time সঠিক নয়।" }, { status: 400 });
      }
      Object.assign(patch, {
        title_bn: titleBn,
        title_en: text(data.titleEn, 180),
        body_bn: bodyBn,
        body_en: text(data.bodyEn, 5000),
        category,
        priority,
        status,
        is_pinned: data.isPinned === true,
        publish_at: status === "published" ? publishAt ?? new Date().toISOString() : publishAt,
        expires_at: expiresAt,
      });
    } else if (body.action === "publish") {
      patch.status = "published";
      patch.publish_at = new Date().toISOString();
    } else if (body.action === "draft" || body.action === "archive") {
      patch.status = body.action;
    } else {
      patch.is_pinned = body.action === "pin";
    }

    const query = new URLSearchParams({
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
    });
    const notices = await supabaseRest<FamilyNoticeRow[]>(`family_notices?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!notices.length) {
      return Response.json({ error: "Notice পাওয়া যায়নি।" }, { status: 404 });
    }

    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: body.action === "edit" ? "family_notice_updated" : `family_notice_${body.action}`,
        entity_type: "family_notice",
        entity_id: id,
        metadata: {},
      }),
    });

    return Response.json({ notice: notices[0], message: body.action === "edit" ? "Notice details update হয়েছে।" : "Notice status update হয়েছে।" });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return Response.json({ error: "PostgreSQL connection has not been configured yet." }, { status: 503 });
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to update notice", error.status, error.message);
      return Response.json({ error: "Notice update হয়নি।" }, { status: 502 });
    }
    console.error("Unable to update notice", error);
    return Response.json({ error: "Notice update হয়নি।" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageNotices(membership.role)) {
      return Response.json({ error: "Notice delete করার permission নেই।" }, { status: 403 });
    }
    const { id } = await context.params;
    const existing = await supabaseRest<FamilyNoticeRow[]>(`family_notices?${new URLSearchParams({ select: "*", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`);
    if (!existing.length) return Response.json({ error: "Notice পাওয়া যায়নি।" }, { status: 404 });
    await supabaseRest(`family_notices?${new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "family_notice_deleted", entity_type: "family_notice", entity_id: id, metadata: { title: existing[0].title_bn } }),
    });
    return Response.json({ message: "Notice স্থায়ীভাবে delete হয়েছে।" });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection has not been configured yet." }, { status: 503 });
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to delete notice", error.status, error.message);
      return Response.json({ error: "Notice delete হয়নি।" }, { status: 502 });
    }
    console.error("Unable to delete notice", error);
    return Response.json({ error: "Notice delete হয়নি।" }, { status: 500 });
  }
}
