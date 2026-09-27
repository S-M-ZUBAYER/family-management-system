import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageGovernance, getActiveFamilyMembership } from "@/lib/family-access";
import type { FamilyDecision, FamilyPoll, GovernancePayload, PollComment, PollOption } from "@/lib/governance-types";
import { BackendNotConfiguredError, isBackendConfigured, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

type PollRow = Omit<FamilyPoll, "options" | "eligible_voters" | "participant_count" | "quorum_reached" | "results_visible" | "has_voted" | "my_option_ids" | "is_mine">;
type OptionRow = Omit<PollOption, "vote_count" | "percentage">;
type VoteRow = { poll_id: string; option_id: string; voter_user_id: string };
type CommentRow = Omit<PollComment, "is_mine">;

export function governanceErrorResponse(error: unknown, label: string) {
  if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection configured নয়।" }, { status: 503 });
  if (error instanceof SupabaseRequestError) {
    console.error(label, error.status, error.message);
    return Response.json({ error: "Voting data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 });
  }
  console.error(label, error);
  return Response.json({ error: "Governance request সম্পন্ন হয়নি।" }, { status: 500 });
}

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" }, { status: 409 });

    const canManage = canManageGovernance(membership.role);
    const familyQuery = new URLSearchParams({ select: "id,name_bn,name_en", id: `eq.${membership.family_id}`, limit: "1" });
    const family = (await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(`families?${familyQuery}`))[0];
    let polls: PollRow[] = [], options: OptionRow[] = [], votes: VoteRow[] = [], comments: CommentRow[] = [], decisions: FamilyDecision[] = [];
    let memberRoles: Array<{ role: string }> = [];
    let migrationRequired = false;

    try {
      const familyFilter = `eq.${membership.family_id}`;
      const query = (select: string, order: string) => new URLSearchParams({ select, family_id: familyFilter, order });
      [polls, options, votes, comments, decisions, memberRoles] = await Promise.all([
        supabaseRest<PollRow[]>(`family_polls?${query("id,title,description,category,decision_type,voting_mode,max_choices,is_anonymous,results_visibility,audience,quorum_percent,opens_at,closes_at,status,created_by_user_id,created_by_name,created_at,updated_at", "created_at.desc")}`),
        supabaseRest<OptionRow[]>(`poll_options?${query("id,poll_id,label,description,position", "poll_id.asc,position.asc")}`),
        supabaseRest<VoteRow[]>(`poll_votes?${query("poll_id,option_id,voter_user_id", "created_at.asc")}`),
        supabaseRest<CommentRow[]>(`poll_comments?${query("id,poll_id,body,author_user_id,author_name,status,created_at", "created_at.asc")}`),
        supabaseRest<FamilyDecision[]>(`family_decisions?${query("id,poll_id,title,summary,final_outcome,effective_date,status,decided_by_user_id,decided_by_name,created_at,updated_at", "effective_date.desc.nullslast,created_at.desc")}`),
        supabaseRest<Array<{ role: string }>>(`family_memberships?${new URLSearchParams({ select: "role", family_id: familyFilter, status: "eq.active" })}`),
      ]);
    } catch (error) {
      if (error instanceof SupabaseRequestError) migrationRequired = true;
      else throw error;
    }

    const visiblePolls = polls.filter((poll) => canManage || poll.audience === "family" || poll.created_by_user_id === user.userId);
    const visiblePollIds = new Set(visiblePolls.map((poll) => poll.id));
    const optionByPoll = new Map<string, OptionRow[]>();
    for (const option of options) {
      if (!visiblePollIds.has(option.poll_id)) continue;
      optionByPoll.set(option.poll_id, [...(optionByPoll.get(option.poll_id) ?? []), option]);
    }
    const votesByPoll = new Map<string, VoteRow[]>();
    for (const vote of votes) {
      if (!visiblePollIds.has(vote.poll_id)) continue;
      votesByPoll.set(vote.poll_id, [...(votesByPoll.get(vote.poll_id) ?? []), vote]);
    }

    const now = Date.now();
    const hydratedPolls: FamilyPoll[] = visiblePolls.map((poll) => {
      const pollVotes = votesByPoll.get(poll.id) ?? [];
      const participantIds = new Set(pollVotes.map((vote) => vote.voter_user_id));
      const effectivelyClosed = poll.status === "closed" || (poll.status === "open" && Boolean(poll.closes_at) && new Date(poll.closes_at as string).getTime() <= now);
      const resultsVisible = canManage || poll.results_visibility === "live" || (poll.results_visibility === "after_close" && effectivelyClosed);
      const eligibleVoters = poll.audience === "admins" ? memberRoles.filter((item) => ["owner", "family_admin", "manager"].includes(item.role)).length : memberRoles.length;
      const participantCount = participantIds.size;
      const hydratedOptions = (optionByPoll.get(poll.id) ?? []).map((option) => {
        const count = pollVotes.filter((vote) => vote.option_id === option.id).length;
        return { ...option, vote_count: resultsVisible ? count : null, percentage: resultsVisible ? (participantCount ? Math.round((count / participantCount) * 1000) / 10 : 0) : null };
      });
      return {
        ...poll,
        status: effectivelyClosed ? "closed" : poll.status,
        options: hydratedOptions,
        eligible_voters: eligibleVoters,
        participant_count: resultsVisible ? participantCount : null,
        quorum_reached: resultsVisible ? (eligibleVoters === 0 ? false : participantCount / eligibleVoters * 100 >= poll.quorum_percent) : null,
        results_visible: resultsVisible,
        has_voted: participantIds.has(user.userId),
        my_option_ids: pollVotes.filter((vote) => vote.voter_user_id === user.userId).map((vote) => vote.option_id),
        is_mine: poll.created_by_user_id === user.userId,
      };
    });

    const payload: GovernancePayload = {
      family,
      viewer: { displayName: user.displayName, role: membership.role },
      polls: hydratedPolls,
      comments: comments.filter((comment) => visiblePollIds.has(comment.poll_id) && (comment.status === "visible" || canManage)).map((comment) => ({ ...comment, is_mine: comment.author_user_id === user.userId })),
      decisions,
      permissions: { canManage },
      migrationRequired,
    };
    return Response.json(payload);
  } catch (error) {
    return governanceErrorResponse(error, "Unable to load family governance");
  }
}
