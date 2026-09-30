import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageChat, canReviewMembers, getActiveFamilyMembership } from "@/lib/family-access";
import type { DashboardPayload } from "@/lib/dashboard-types";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

type ProfileRow = { id: string; auth_user_id: string | null; name_bn: string; name_en: string | null };
type RelationshipRow = { from_member_id: string; to_member_id: string; relationship_type: string };
type RequestRow = { id: string; requested_name_bn: string; relationship_text: string; created_at: string };
type EventRow = { id: string; title_bn: string; start_at: string; venue: string; city: string | null };
type RsvpRow = { event_id: string; response: string; guest_count: number };
type CampaignRow = { id: string; title: string; year: number; status: string; target_shares: number | string };
type ParticipantRow = { campaign_id: string; share_count: number | string; amount_due: number | string; amount_paid: number | string; status: string };
type ChannelRow = { id: string; visibility: "family" | "admins" | "invite_only" };
type ChannelMemberRow = { channel_id: string; auth_user_id: string };
type ReceiptRow = { channel_id: string; last_read_at: string };
type MessageRow = { channel_id: string; auth_user_id: string; created_at: string };

const numberValue = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

function generationCount(profiles: ProfileRow[], relationships: RelationshipRow[]) {
  if (!profiles.length) return 0;
  const parentEdges = relationships.filter((item) => item.relationship_type === "parent");
  if (!parentEdges.length) return 1;
  const childIds = new Set(parentEdges.map((item) => item.to_member_id));
  const roots = profiles.filter((profile) => !childIds.has(profile.id)).map((profile) => profile.id);
  const queue = roots.map((id) => ({ id, generation: 1 }));
  const visited = new Set<string>();
  let maximum = 1;

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    maximum = Math.max(maximum, current.generation);
    parentEdges
      .filter((edge) => edge.from_member_id === current.id)
      .forEach((edge) => queue.push({ id: edge.to_member_id, generation: current.generation + 1 }));
  }
  return maximum;
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

    const familyId = membership.family_id;
    const common = { family_id: `eq.${familyId}` };
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 86400000);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const [families, profiles, relationships, approvals, events, campaigns, channelRows, channelMembers, receipts, messages] = await Promise.all([
      supabaseRest<DashboardPayload["family"][]>(`families?${new URLSearchParams({ select: "id,name_bn,name_en,theme", id: `eq.${familyId}`, limit: "1" })}`),
      supabaseRest<ProfileRow[]>(`member_profiles?${new URLSearchParams({ select: "id,auth_user_id,name_bn,name_en", ...common, profile_status: "eq.active", order: "created_at.asc" })}`),
      supabaseRest<RelationshipRow[]>(`family_relationships?${new URLSearchParams({ select: "from_member_id,to_member_id,relationship_type", ...common })}`),
      canReviewMembers(membership.role)
        ? supabaseRest<RequestRow[]>(`family_member_requests?${new URLSearchParams({ select: "id,requested_name_bn,relationship_text,created_at", ...common, status: "eq.pending", order: "created_at.desc" })}`)
        : Promise.resolve([] as RequestRow[]),
      supabaseRest<EventRow[]>(`family_events?${new URLSearchParams({ select: "id,title_bn,start_at,venue,city", ...common, status: "in.(published,registration_closed)", start_at: `gte.${now.toISOString()}`, order: "start_at.asc" })}`),
      supabaseRest<CampaignRow[]>(`qurbani_campaigns?${new URLSearchParams({ select: "id,title,year,status,target_shares", ...common, status: "neq.closed", order: "year.desc,created_at.desc" })}`),
      supabaseRest<ChannelRow[]>(`chat_channels?${new URLSearchParams({ select: "id,visibility", ...common, status: "eq.active" })}`),
      supabaseRest<ChannelMemberRow[]>(`chat_channel_members?${new URLSearchParams({ select: "channel_id,auth_user_id", ...common, status: "eq.active" })}`),
      supabaseRest<ReceiptRow[]>(`chat_read_receipts?${new URLSearchParams({ select: "channel_id,last_read_at", ...common, auth_user_id: `eq.${user.userId}` })}`),
      supabaseRest<MessageRow[]>(`chat_messages?${new URLSearchParams({ select: "channel_id,auth_user_id,created_at", ...common, order: "created_at.desc", limit: "2000" })}`),
    ]);

    const family = families[0];
    if (!family) return Response.json({ error: "Family workspace পাওয়া যায়নি।" }, { status: 404 });

    const profile = profiles.find((item) => item.auth_user_id === user.userId);
    const activeCampaign = campaigns[0] ?? null;
    const nextEvent = events[0] ?? null;

    const [participants, rsvps] = await Promise.all([
      activeCampaign
        ? supabaseRest<ParticipantRow[]>(`qurbani_participants?${new URLSearchParams({ select: "campaign_id,share_count,amount_due,amount_paid,status", ...common, campaign_id: `eq.${activeCampaign.id}` })}`)
        : Promise.resolve([]),
      nextEvent
        ? supabaseRest<RsvpRow[]>(`event_rsvps?${new URLSearchParams({ select: "event_id,response,guest_count", ...common, event_id: `eq.${nextEvent.id}` })}`)
        : Promise.resolve([]),
    ]);

    const explicitChannelIds = new Set(
      channelMembers.filter((item) => item.auth_user_id === user.userId).map((item) => item.channel_id),
    );
    const accessibleChannelIds = new Set(
      channelRows
        .filter((channel) => channel.visibility === "family"
          || (channel.visibility === "admins" && canManageChat(membership.role))
          || explicitChannelIds.has(channel.id))
        .map((channel) => channel.id),
    );
    const readAt = new Map(receipts.map((receipt) => [receipt.channel_id, new Date(receipt.last_read_at).getTime()]));
    const unreadByChannel = new Map<string, number>();
    messages.forEach((message) => {
      if (!accessibleChannelIds.has(message.channel_id) || message.auth_user_id === user.userId) return;
      if (new Date(message.created_at).getTime() <= (readAt.get(message.channel_id) ?? 0)) return;
      unreadByChannel.set(message.channel_id, (unreadByChannel.get(message.channel_id) ?? 0) + 1);
    });

    const activeParticipants = participants.filter((item) => item.status !== "cancelled");
    const registeredShares = activeParticipants.reduce((sum, item) => sum + numberValue(item.share_count), 0);
    const amountDue = activeParticipants.reduce((sum, item) => sum + numberValue(item.amount_due), 0);
    const collected = activeParticipants.reduce((sum, item) => sum + numberValue(item.amount_paid), 0);
    const goingCount = rsvps
      .filter((item) => item.response === "going")
      .reduce((sum, item) => sum + 1 + numberValue(item.guest_count), 0);

    const payload: DashboardPayload = {
      family,
      viewer: {
        name: profile?.name_bn || profile?.name_en || user.displayName,
        role: membership.role,
        preferredLocale: membership.preferred_locale,
      },
      stats: {
        totalMembers: profiles.length,
        generations: generationCount(profiles, relationships),
        pendingApprovals: approvals.length,
        pendingToday: approvals.filter((item) => new Date(item.created_at).getTime() >= startOfToday.getTime()).length,
        upcomingEvents: events.length,
        eventsNextSevenDays: events.filter((item) => new Date(item.start_at).getTime() <= sevenDays.getTime()).length,
        unreadMessages: [...unreadByChannel.values()].reduce((sum, count) => sum + count, 0),
        unreadChannels: unreadByChannel.size,
      },
      approvals: approvals.slice(0, 3).map((item) => ({
        id: item.id,
        name: item.requested_name_bn,
        relationship: item.relationship_text,
        createdAt: item.created_at,
      })),
      qurbani: activeCampaign ? {
        id: activeCampaign.id,
        title: activeCampaign.title,
        year: activeCampaign.year,
        status: activeCampaign.status,
        targetShares: numberValue(activeCampaign.target_shares),
        registeredShares,
        collected,
        due: Math.max(0, amountDue - collected),
      } : null,
      nextEvent: nextEvent ? {
        id: nextEvent.id,
        title: nextEvent.title_bn,
        startAt: nextEvent.start_at,
        venue: nextEvent.venue,
        city: nextEvent.city,
        goingCount,
      } : null,
    };

    return Response.json(payload);
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return Response.json({ error: "PostgreSQL connection has not been configured yet." }, { status: 503 });
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to load dashboard", error.status, error.message);
      return Response.json({ error: "Dashboard data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 });
    }
    console.error("Unable to load dashboard", error);
    return Response.json({ error: "Dashboard request সম্পন্ন হয়নি।" }, { status: 500 });
  }
}
