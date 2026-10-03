import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canAccessChatChannel } from "@/lib/chat-access-policy";
import { canReviewMembers, getActiveFamilyMembership } from "@/lib/family-access";
import type { DashboardPayload } from "@/lib/dashboard-types";
import { PaginatedRowLimitError } from "@/lib/paginated-rows";
import { readAllSupabaseRows } from "@/lib/supabase-pagination";
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
  const ids = new Set(profiles.map((profile) => profile.id));
  const children = new Map<string, string[]>();
  const incoming = new Map(profiles.map((profile) => [profile.id, 0]));
  const depth = new Map(profiles.map((profile) => [profile.id, 1]));
  for (const edge of relationships) {
    if (edge.relationship_type !== "parent" || !ids.has(edge.from_member_id) || !ids.has(edge.to_member_id)) continue;
    children.set(edge.from_member_id, [...(children.get(edge.from_member_id) ?? []), edge.to_member_id]);
    incoming.set(edge.to_member_id, (incoming.get(edge.to_member_id) ?? 0) + 1);
  }
  const queue = profiles.filter((profile) => incoming.get(profile.id) === 0).map((profile) => profile.id);
  let maximum = 1;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const currentDepth = depth.get(current) ?? 1;
    maximum = Math.max(maximum, currentDepth);
    for (const child of children.get(current) ?? []) {
      depth.set(child, Math.max(depth.get(child) ?? 1, currentDepth + 1));
      const remaining = (incoming.get(child) ?? 0) - 1;
      incoming.set(child, remaining);
      if (remaining === 0) queue.push(child);
    }
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

    const [families, profiles, relationships, approvals, events, campaigns, channelRows, channelMembers, receipts] = await Promise.all([
      supabaseRest<DashboardPayload["family"][]>(`families?${new URLSearchParams({ select: "id,name_bn,name_en,theme", id: `eq.${familyId}`, limit: "1" })}`),
      readAllSupabaseRows<ProfileRow>("member_profiles", new URLSearchParams({ select: "id,auth_user_id,name_bn,name_en", ...common, profile_status: "eq.active", order: "created_at.asc,id.asc" })),
      readAllSupabaseRows<RelationshipRow>("family_relationships", new URLSearchParams({ select: "id,from_member_id,to_member_id,relationship_type", ...common, order: "id.asc" })),
      canReviewMembers(membership.role)
        ? readAllSupabaseRows<RequestRow>("family_member_requests", new URLSearchParams({ select: "id,requested_name_bn,relationship_text,created_at", ...common, status: "eq.pending", order: "created_at.desc,id.asc" }))
        : Promise.resolve([] as RequestRow[]),
      readAllSupabaseRows<EventRow>("family_events", new URLSearchParams({ select: "id,title_bn,start_at,venue,city", ...common, status: "in.(published,registration_closed)", start_at: `gte.${now.toISOString()}`, order: "start_at.asc,id.asc" })),
      readAllSupabaseRows<CampaignRow>("qurbani_campaigns", new URLSearchParams({ select: "id,title,year,status,target_shares", ...common, status: "neq.closed", order: "year.desc,created_at.desc,id.asc" })),
      readAllSupabaseRows<ChannelRow>("chat_channels", new URLSearchParams({ select: "id,visibility", ...common, status: "eq.active", order: "id.asc" })),
      readAllSupabaseRows<ChannelMemberRow>("chat_channel_members", new URLSearchParams({ select: "id,channel_id,auth_user_id", ...common, status: "eq.active", order: "id.asc" })),
      readAllSupabaseRows<ReceiptRow>("chat_read_receipts", new URLSearchParams({ select: "id,channel_id,last_read_at", ...common, auth_user_id: `eq.${user.userId}`, order: "id.asc" })),
    ]);

    const family = families[0];
    if (!family) return Response.json({ error: "Family workspace পাওয়া যায়নি।" }, { status: 404 });

    const profile = profiles.find((item) => item.auth_user_id === user.userId);
    const activeCampaign = campaigns[0] ?? null;
    const nextEvent = events[0] ?? null;

    const [participants, rsvps] = await Promise.all([
      activeCampaign
        ? readAllSupabaseRows<ParticipantRow>("qurbani_participants", new URLSearchParams({ select: "id,campaign_id,share_count,amount_due,amount_paid,status", ...common, campaign_id: `eq.${activeCampaign.id}`, order: "id.asc" }))
        : Promise.resolve([]),
      nextEvent
        ? readAllSupabaseRows<RsvpRow>("event_rsvps", new URLSearchParams({ select: "id,event_id,response,guest_count", ...common, event_id: `eq.${nextEvent.id}`, order: "id.asc" }))
        : Promise.resolve([]),
    ]);

    const explicitChannelIds = new Set(
      channelMembers.filter((item) => item.auth_user_id === user.userId).map((item) => item.channel_id),
    );
    const accessibleChannelIds = new Set(
      channelRows
        .filter((channel) => canAccessChatChannel(
          channel.visibility, membership.role, explicitChannelIds.has(channel.id),
        ))
        .map((channel) => channel.id),
    );
    const messages = accessibleChannelIds.size
      ? await readAllSupabaseRows<MessageRow>("chat_messages", new URLSearchParams({
          select: "id,channel_id,auth_user_id,created_at",
          ...common,
          channel_id: `in.(${[...accessibleChannelIds].join(",")})`,
          order: "created_at.desc,id.desc",
        }))
      : [];
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
    if (error instanceof PaginatedRowLimitError) {
      return Response.json({ code: "DASHBOARD_ROW_LIMIT", maxRows: error.maxRows, error: `Dashboard totals exceed ${error.maxRows} rows in one section and cannot be shown accurately. Contact support for a scalable summary.` }, { status: 413 });
    }
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
