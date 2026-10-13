import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageEvents, getActiveFamilyMembership } from "@/lib/family-access";
import { collectPaginatedRows, PaginatedRowLimitError } from "@/lib/paginated-rows";
import { eventRecord, EventValidationError, eventErrorCopy } from "@/lib/event-validation";
import { eventPublicRow, eventWrite, eventWriteResponse, EventWriteOutcomeUnknownError, EventWriteRejectedError } from "@/lib/event-write-outcome";
import { eventMediaPublicRow } from "@/lib/event-media-workflow";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

export type FamilyEventRow = {
  id: string;
  family_id: string;
  title_bn: string;
  title_en: string | null;
  description_bn: string;
  description_en: string | null;
  event_type: "reunion" | "tour" | "wedding" | "religious" | "meeting" | "other";
  start_at: string;
  end_at: string | null;
  venue: string;
  city: string | null;
  meeting_point: string | null;
  estimated_cost_per_person: number | string;
  total_budget: number | string;
  capacity: number | null;
  registration_deadline: string | null;
  status: "draft" | "published" | "registration_closed" | "completed" | "cancelled";
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type EventRsvpRow = {
  id: string;
  event_id: string;
  auth_user_id: string;
  respondent_name: string;
  response: "going" | "maybe" | "not_going";
  guest_count: number;
  note: string | null;
  updated_at: string;
};

export type EventCommentRow = {
  id: string;
  event_id: string;
  auth_user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type EventMediaRow = {
  id: string;
  event_id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  caption: string | null;
  uploader_name: string;
  created_at: string;
  uploaded_by_user_id: string;
};

async function readAllEventRows<T>(table: string, query: URLSearchParams): Promise<T[]> {
  return collectPaginatedRows(
    (offset, limit) => {
      const pageQuery = new URLSearchParams(query);
      pageQuery.set("offset", String(offset));
      pageQuery.set("limit", String(limit));
      return supabaseRest<T[]>(`${table}?${pageQuery}`);
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

    const canManage = canManageEvents(membership.role);
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

    let events: FamilyEventRow[] = [];
    let rsvps: EventRsvpRow[] = [];
    let comments: EventCommentRow[] = [];
    let media: EventMediaRow[] = [];
    let migrationRequired = false;
    try {
      const common = { family_id: `eq.${membership.family_id}` };
      const eventQuery = new URLSearchParams({
        select: "id,family_id,title_bn,title_en,description_bn,description_en,event_type,start_at,end_at,venue,city,meeting_point,estimated_cost_per_person,total_budget,capacity,registration_deadline,status,created_by_user_id,created_at,updated_at",
        ...common,
        order: "start_at.asc,id.asc",
      });
      const rsvpQuery = new URLSearchParams({
        select: "id,event_id,auth_user_id,respondent_name,response,guest_count,note,updated_at",
        ...common,
        order: "updated_at.desc,id.asc",
      });
      const commentQuery = new URLSearchParams({
        select: "id,event_id,auth_user_id,author_name,body,created_at",
        ...common,
        order: "created_at.asc,id.asc",
      });
      const mediaQuery = new URLSearchParams({
        select: "id,event_id,file_name,mime_type,file_size,caption,uploader_name,created_at,uploaded_by_user_id",
        ...common,
        order: "created_at.desc,id.asc",
      });
      [events, rsvps, comments, media] = await Promise.all([
        readAllEventRows<FamilyEventRow>("family_events", eventQuery),
        readAllEventRows<EventRsvpRow>("event_rsvps", rsvpQuery),
        readAllEventRows<EventCommentRow>("event_comments", commentQuery),
        readAllEventRows<EventMediaRow>("event_media", mediaQuery),
      ]);
    } catch (error) {
      if (error instanceof SupabaseRequestError && /PGRST205|42P01|42703/.test(error.message)) migrationRequired = true;
      else throw error;
    }

    if (!canManage) {
      events = events.filter((event) => event.status !== "draft");
      const visibleIds = new Set(events.map((event) => event.id));
      rsvps = rsvps.filter((item) => visibleIds.has(item.event_id));
      comments = comments.filter((item) => visibleIds.has(item.event_id));
      media = media.filter((item) => visibleIds.has(item.event_id));
    }

    const safeRsvps = rsvps.map(({ auth_user_id, ...item }) => ({
      ...item,
      is_current_user: auth_user_id === user.userId,
    }));
    const safeComments = comments.map((comment) => ({
      id: comment.id,
      event_id: comment.event_id,
      author_name: comment.author_name,
      body: comment.body,
      created_at: comment.created_at,
      is_current_user: comment.auth_user_id === user.userId,
    }));

    return Response.json({
      family,
      events: events.map(event => { const row = eventPublicRow(event); if (!row) throw new EventValidationError("EVENT_INVALID_SNAPSHOT"); return row; }),
      rsvps: safeRsvps,
      comments: safeComments,
      media: media.map(item => {
        if (typeof item.uploaded_by_user_id !== "string" || !item.uploaded_by_user_id.trim()) throw new EventValidationError("EVENT_INVALID_SNAPSHOT");
        const row = eventMediaPublicRow(item, item.uploaded_by_user_id === user.userId);
        if (!row) throw new EventValidationError("EVENT_INVALID_SNAPSHOT");
        return row;
      }),
      migrationRequired,
      permissions: { canManage },
    });
  } catch (error) {
    return eventErrorResponse(error, "Unable to load events");
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
    if (!canManageEvents(membership.role)) {
      return Response.json({ error: "Event তৈরি করার permission নেই।" }, { status: 403 });
    }

    const record = eventRecord(await request.json().catch(() => { throw new EventValidationError("EVENT_INVALID_BODY"); }));
    const result = await eventWrite({ confirmedRejected: eventWriteConfirmedRejected,
      write: () => supabaseRest<FamilyEventRow[]>("family_events", { method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ family_id: membership.family_id, ...record, created_by_user_id: user.userId }) }),
      audit: (id) => supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
        family_id: membership.family_id, actor_user_id: user.userId, action: "family_event_created", entity_type: "family_event", entity_id: id,
        metadata: { status: record.status, event_type: record.event_type },
      }) }),
    });
    return eventWriteResponse(result, 201);
  } catch (error) {
    return eventErrorResponse(error, "Unable to create event");
  }
}

export function eventWriteConfirmedRejected(error: unknown) {
  return error instanceof SupabaseRequestError && error.status >= 400 && error.status < 500 && error.status !== 408;
}
export function eventErrorResponse(error: unknown, logMessage: string) {
  if (error instanceof EventWriteOutcomeUnknownError) return Response.json({ code: "EVENT_WRITE_OUTCOME_UNKNOWN", outcomeUnknown: true, error: eventErrorCopy("EVENT_WRITE_OUTCOME_UNKNOWN", "en") }, { status: 503 });
  if (error instanceof EventWriteRejectedError) return Response.json({ code: "EVENT_WRITE_REJECTED", error: eventErrorCopy("EVENT_WRITE_REJECTED", "en") }, { status: 400 });
  if (error instanceof EventValidationError) return Response.json({ code: error.code, error: eventErrorCopy(error.code, "en") }, { status: error.code === "EVENT_INVALID_SNAPSHOT" ? 503 : ["EVENT_RECORD_CHANGED", "EVENT_DELETE_UNAVAILABLE", "EVENT_REGISTRATION_CLOSED", "EVENT_COMMENT_CHANGED"].includes(error.code) ? 409 : 400 });
  if (error instanceof PaginatedRowLimitError) {
    if (logMessage === "Unable to delete event") return Response.json({ code: "EVENT_MEDIA_ROW_LIMIT", maxRows: error.maxRows, error: `Event media exceeds ${error.maxRows} files. No partial deletion was performed; contact support for a paged cleanup.` }, { status: 413 });
    return Response.json({ code: "EVENTS_ROW_LIMIT", maxRows: error.maxRows, error: `Event history exceeds ${error.maxRows} rows in one section. No partial data was shown or exported; contact support for a paged export.` }, { status: 413 });
  }
  if (error instanceof BackendNotConfiguredError) {
    return Response.json({ error: "PostgreSQL connection has not been configured yet." }, { status: 503 });
  }
  if (error instanceof SupabaseRequestError) {
    console.error(logMessage, error.status, error.message);
    return Response.json({ error: "Event data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 });
  }
  console.error(logMessage, error);
  return Response.json({ error: "Event request সম্পন্ন হয়নি।" }, { status: 500 });
}
