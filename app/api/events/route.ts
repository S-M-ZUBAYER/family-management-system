import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageEvents, getActiveFamilyMembership } from "@/lib/family-access";
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
};

type CreateEventBody = {
  titleBn?: unknown;
  titleEn?: unknown;
  descriptionBn?: unknown;
  descriptionEn?: unknown;
  eventType?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  venue?: unknown;
  city?: unknown;
  meetingPoint?: unknown;
  estimatedCostPerPerson?: unknown;
  totalBudget?: unknown;
  capacity?: unknown;
  registrationDeadline?: unknown;
  status?: unknown;
};

const eventTypes = ["reunion", "tour", "wedding", "religious", "meeting", "other"] as const;
const createStatuses = ["draft", "published"] as const;

const optionalText = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const optionalNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function requiredTimestamp(value: unknown) {
  const text = optionalText(value, 40);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function optionalTimestamp(value: unknown) {
  const text = optionalText(value, 40);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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
        order: "start_at.asc",
      });
      const rsvpQuery = new URLSearchParams({
        select: "id,event_id,auth_user_id,respondent_name,response,guest_count,note,updated_at",
        ...common,
        order: "updated_at.desc",
      });
      const commentQuery = new URLSearchParams({
        select: "id,event_id,auth_user_id,author_name,body,created_at",
        ...common,
        order: "created_at.asc",
      });
      const mediaQuery = new URLSearchParams({
        select: "id,event_id,file_name,mime_type,file_size,caption,uploader_name,created_at",
        ...common,
        order: "created_at.desc",
      });
      [events, rsvps, comments, media] = await Promise.all([
        supabaseRest<FamilyEventRow[]>(`family_events?${eventQuery}`),
        supabaseRest<EventRsvpRow[]>(`event_rsvps?${rsvpQuery}`),
        supabaseRest<EventCommentRow[]>(`event_comments?${commentQuery}`),
        supabaseRest<EventMediaRow[]>(`event_media?${mediaQuery}`),
      ]);
    } catch (error) {
      if (error instanceof SupabaseRequestError) migrationRequired = true;
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
    }));

    return Response.json({
      family,
      events,
      rsvps: safeRsvps,
      comments: safeComments,
      media,
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

    const body = (await request.json()) as CreateEventBody;
    const titleBn = optionalText(body.titleBn, 180);
    const descriptionBn = optionalText(body.descriptionBn, 5000);
    const venue = optionalText(body.venue, 220);
    const eventType = optionalText(body.eventType, 20) ?? "reunion";
    const status = optionalText(body.status, 24) ?? "draft";
    const startAt = requiredTimestamp(body.startAt);
    const endAt = optionalTimestamp(body.endAt);
    const registrationDeadline = optionalTimestamp(body.registrationDeadline);
    const cost = optionalNumber(body.estimatedCostPerPerson);
    const budget = optionalNumber(body.totalBudget);
    const capacity = optionalNumber(body.capacity);

    if (!titleBn || titleBn.length < 3 || !descriptionBn || descriptionBn.length < 5 || !venue || !startAt) {
      return Response.json({ error: "Title, details, date এবং venue পূরণ করুন।" }, { status: 400 });
    }
    if (!eventTypes.includes(eventType as (typeof eventTypes)[number])) {
      return Response.json({ error: "Event type সঠিক নয়।" }, { status: 400 });
    }
    if (!createStatuses.includes(status as (typeof createStatuses)[number])) {
      return Response.json({ error: "Event status সঠিক নয়।" }, { status: 400 });
    }
    if ([endAt, registrationDeadline, cost, budget, capacity].includes(undefined)) {
      return Response.json({ error: "Event date বা budget value সঠিক নয়।" }, { status: 400 });
    }
    if (endAt && new Date(endAt) < new Date(startAt)) {
      return Response.json({ error: "Event শেষ হওয়ার সময় শুরুর পরে হতে হবে।" }, { status: 400 });
    }
    if ((cost ?? 0) < 0 || (budget ?? 0) < 0 || (capacity !== null && (capacity! < 1 || capacity! > 10000))) {
      return Response.json({ error: "Budget বা capacity value সঠিক নয়।" }, { status: 400 });
    }

    const [event] = await supabaseRest<FamilyEventRow[]>("family_events", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        title_bn: titleBn,
        title_en: optionalText(body.titleEn, 180),
        description_bn: descriptionBn,
        description_en: optionalText(body.descriptionEn, 5000),
        event_type: eventType,
        start_at: startAt,
        end_at: endAt,
        venue,
        city: optionalText(body.city, 120),
        meeting_point: optionalText(body.meetingPoint, 220),
        estimated_cost_per_person: cost ?? 0,
        total_budget: budget ?? 0,
        capacity,
        registration_deadline: registrationDeadline,
        status,
        created_by_user_id: user.userId,
      }),
    });

    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: "family_event_created",
        entity_type: "family_event",
        entity_id: event.id,
        metadata: { status: event.status, event_type: event.event_type },
      }),
    });

    return Response.json({ event }, { status: 201 });
  } catch (error) {
    return eventErrorResponse(error, "Unable to create event");
  }
}

function eventErrorResponse(error: unknown, logMessage: string) {
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
