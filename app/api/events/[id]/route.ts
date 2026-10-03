import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageEvents, getActiveFamilyMembership } from "@/lib/family-access";
import { collectPaginatedRows, PaginatedRowLimitError } from "@/lib/paginated-rows";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

import type { FamilyEventRow } from "../route";

type EventAction = "publish" | "close" | "complete" | "cancel" | "draft" | "edit";
const actions: EventAction[] = ["publish", "close", "complete", "cancel", "draft", "edit"];
const statusByAction: Record<EventAction, FamilyEventRow["status"]> = {
  publish: "published",
  close: "registration_closed",
  complete: "completed",
  cancel: "cancelled",
  draft: "draft",
  edit: "draft",
};

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const eventTypes = ["reunion", "tour", "wedding", "religious", "meeting", "other"] as const;
const eventStatuses = ["draft", "published", "registration_closed", "completed", "cancelled"] as const;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const number = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const date = (value: unknown, required = false) => {
  const candidate = text(value, 40);
  if (!candidate) return required ? undefined : null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageEvents(membership.role)) {
      return Response.json({ error: "Event পরিচালনার permission নেই।" }, { status: 403 });
    }
    const { id } = await context.params;
    const body = (await request.json()) as { action?: EventAction; data?: Record<string, unknown> };
    if (!id || !body.action || !actions.includes(body.action)) {
      return Response.json({ error: "Valid event action প্রয়োজন।" }, { status: 400 });
    }
    const query = new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${membership.family_id}` });
    let changes: Record<string, unknown>;
    if (body.action === "edit") {
      const data = body.data ?? {};
      const titleBn = text(data.titleBn, 180);
      const descriptionBn = text(data.descriptionBn, 5000);
      const venue = text(data.venue, 220);
      const eventType = text(data.eventType, 20) ?? "reunion";
      const status = text(data.status, 24) ?? "draft";
      const startAt = date(data.startAt, true);
      const endAt = date(data.endAt);
      const registrationDeadline = date(data.registrationDeadline);
      const cost = number(data.estimatedCostPerPerson);
      const budget = number(data.totalBudget);
      const capacity = number(data.capacity);
      if (!titleBn || titleBn.length < 3 || !descriptionBn || descriptionBn.length < 5 || !venue || !startAt) {
        return Response.json({ error: "Title, details, date এবং venue পূরণ করুন।" }, { status: 400 });
      }
      if (!eventTypes.includes(eventType as (typeof eventTypes)[number]) || !eventStatuses.includes(status as (typeof eventStatuses)[number])) {
        return Response.json({ error: "Event type বা status সঠিক নয়।" }, { status: 400 });
      }
      if ([endAt, registrationDeadline, cost, budget, capacity].includes(undefined) || (endAt && new Date(endAt) < new Date(startAt)) || (cost ?? 0) < 0 || (budget ?? 0) < 0 || (capacity !== null && (capacity! < 1 || capacity! > 10000))) {
        return Response.json({ error: "Event date, budget বা capacity value সঠিক নয়।" }, { status: 400 });
      }
      changes = {
        title_bn: titleBn,
        title_en: text(data.titleEn, 180),
        description_bn: descriptionBn,
        description_en: text(data.descriptionEn, 5000),
        event_type: eventType,
        start_at: startAt,
        end_at: endAt,
        venue,
        city: text(data.city, 120),
        meeting_point: text(data.meetingPoint, 220),
        estimated_cost_per_person: cost ?? 0,
        total_budget: budget ?? 0,
        capacity,
        registration_deadline: registrationDeadline,
        status,
        updated_at: new Date().toISOString(),
      };
    } else {
      changes = { status: statusByAction[body.action], updated_at: new Date().toISOString() };
    }
    const events = await supabaseRest<FamilyEventRow[]>(`family_events?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(changes),
    });
    if (!events.length) return Response.json({ error: "Event পাওয়া যায়নি।" }, { status: 404 });
    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: body.action === "edit" ? "family_event_updated" : `family_event_${body.action}`,
        entity_type: "family_event",
        entity_id: id,
        metadata: {},
      }),
    });
    return Response.json({ event: events[0], message: body.action === "edit" ? "Event details update হয়েছে।" : "Event status update হয়েছে।" });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to update event", error.status, error.message);
      return Response.json({ error: "Event update হয়নি।" }, { status: 502 });
    }
    console.error("Unable to update event", error);
    return Response.json({ error: "Event update হয়নি।" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageEvents(membership.role)) return Response.json({ error: "Event delete করার permission নেই।" }, { status: 403 });
    const { id } = await context.params;
    const existing = (await supabaseRest<FamilyEventRow[]>(`family_events?${new URLSearchParams({ select: "*", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (!existing) return Response.json({ error: "Event পাওয়া যায়নি।" }, { status: 404 });
    const media = await collectPaginatedRows(
      (offset, limit) => supabaseRest<Array<{ storage_key: string }>>(`event_media?${new URLSearchParams({ select: "storage_key", event_id: `eq.${id}`, family_id: `eq.${membership.family_id}`, order: "id.asc", offset: String(offset), limit: String(limit) })}`),
      { pageSize: 500, maxRows: 20000 },
    );
    const bucket = (env as RuntimeEnv).BUCKET;
    if (media.length) {
      if (!bucket) return Response.json({ error: "Media storage unavailable; event delete করা নিরাপদ নয়।" }, { status: 503 });
    }
    const deleted = await supabaseRest<Array<{ id: string }>>(`family_events?${new URLSearchParams({ select: "id", id: `eq.${id}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    if (!deleted.length) return Response.json({ error: "Event পাওয়া যায়নি।" }, { status: 404 });
    let cleanupPending = false;
    if (bucket) {
      for (let offset = 0; offset < media.length; offset += 500) {
        const keys = media.slice(offset, offset + 500).map((item) => item.storage_key);
        try { await bucket.delete(keys); }
        catch (error) {
          cleanupPending = true;
          console.error("Event media storage cleanup pending", id, error);
          try {
            await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "event_media_storage_cleanup_pending", entity_type: "family_event", entity_id: id, metadata: { storage_keys: keys } }) });
          } catch (auditError) { console.error("Unable to audit pending event media cleanup", auditError); }
        }
      }
    }
    try {
      await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "family_event_deleted", entity_type: "family_event", entity_id: id, metadata: { title: existing.title_bn, media_count: media.length, cleanup_pending: cleanupPending } }) });
    } catch (error) { console.error("Unable to audit event deletion", error); }
    return Response.json(cleanupPending ? { message: "Event and linked records removed. Private media cleanup is pending.", cleanupPending: true } : { message: "Event এবং linked data স্থায়ীভাবে delete হয়েছে।" }, { status: cleanupPending ? 202 : 200 });
  } catch (error) {
    if (error instanceof PaginatedRowLimitError) return Response.json({ code: "EVENT_MEDIA_ROW_LIMIT", maxRows: error.maxRows, error: `Event media exceeds ${error.maxRows} files. No partial deletion was performed; contact support for a paged cleanup.` }, { status: 413 });
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to delete event", error.status, error.message);
      return Response.json({ error: "Event delete হয়নি।" }, { status: 502 });
    }
    console.error("Unable to delete event", error);
    return Response.json({ error: "Event delete হয়নি।" }, { status: 500 });
  }
}
import { env } from "cloudflare:workers";
