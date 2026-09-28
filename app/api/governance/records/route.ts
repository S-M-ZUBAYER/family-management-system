import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageGovernance, getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { governanceErrorResponse } from "../route";

const actions = ["create_poll", "vote", "set_poll_status", "add_comment", "moderate_comment", "create_decision", "update_decision"] as const;
type Action = (typeof actions)[number];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const bool = (value: unknown) => value === true || value === "true";
const integer = (value: unknown, fallback: number) => { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : fallback; };
function choice<T extends string>(value: unknown, values: readonly T[], fallback: T) { const candidate = text(value, 40); return candidate && values.includes(candidate as T) ? candidate as T : fallback; }
function ids(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && uuid.test(item)))].slice(0, 20) : []; }

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageGovernance(membership.role);
    const body = await request.json() as { action?: Action; data?: Record<string, unknown> };
    if (!body.action || !actions.includes(body.action)) return Response.json({ error: "Valid governance action প্রয়োজন।" }, { status: 400 });
    const data = body.data ?? {};

    if (body.action === "create_poll") return createPoll(data, membership.family_id, user.userId, user.displayName, canManage);
    if (body.action === "vote") return castVote(data, membership.family_id, user.userId, canManage);
    if (body.action === "set_poll_status") return setPollStatus(data, membership.family_id, user.userId, canManage);
    if (body.action === "add_comment") return addComment(data, membership.family_id, user.userId, user.displayName, canManage);
    if (body.action === "moderate_comment") return moderateComment(data, membership.family_id, user.userId, canManage);
    if (body.action === "create_decision") return createDecision(data, membership.family_id, user.userId, user.displayName, canManage);
    return updateDecision(data, membership.family_id, user.userId, canManage);
  } catch (error) {
    return governanceErrorResponse(error, "Unable to save governance record");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageGovernance(membership.role);
    const body = await request.json() as { kind?: "poll" | "decision"; recordId?: string; data?: Record<string, unknown> };
    if (!body.kind || !body.recordId || !uuid.test(body.recordId)) return Response.json({ error: "Valid record প্রয়োজন।" }, { status: 400 });
    const data = body.data ?? {};

    if (body.kind === "poll") {
      const poll = await getPoll(body.recordId, membership.family_id);
      if (!poll) return Response.json({ error: "Poll পাওয়া যায়নি।" }, { status: 404 });
      if (!canManage && poll.created_by_user_id !== user.userId) return Response.json({ error: "এই poll edit করার অনুমতি নেই।" }, { status: 403 });
      if (!["proposed", "draft"].includes(String(poll.status))) return Response.json({ error: "Voting শুরু হওয়ার পর poll details edit করা যাবে না।" }, { status: 409 });
      const voteQuery = new URLSearchParams({ select: "id", family_id: `eq.${membership.family_id}`, poll_id: `eq.${body.recordId}`, limit: "1" });
      if ((await supabaseRest<Array<{ id: string }>>(`poll_votes?${voteQuery}`))[0]) return Response.json({ error: "Vote থাকা poll edit করা যাবে না।" }, { status: 409 });
      const parsed = parsePoll(data, canManage);
      if (parsed instanceof Response) return parsed;
      const filter = new URLSearchParams({ id: `eq.${body.recordId}`, family_id: `eq.${membership.family_id}` });
      await supabaseRest(`family_polls?${filter}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...parsed.poll, updated_at: new Date().toISOString() }) });
      await supabaseRest(`poll_options?${new URLSearchParams({ family_id: `eq.${membership.family_id}`, poll_id: `eq.${body.recordId}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await supabaseRest("poll_options", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(parsed.options.map((label, position) => ({ family_id: membership.family_id, poll_id: body.recordId, label, position }))) });
      await audit(membership.family_id, user.userId, "governance_poll_updated", "family_polls", body.recordId, { optionCount: parsed.options.length });
      return Response.json({ success: true });
    }

    if (!canManage) return Response.json({ error: "Family Admin formal decision edit করবেন।" }, { status: 403 });
    const decision = await getDecision(body.recordId, membership.family_id);
    if (!decision) return Response.json({ error: "Decision পাওয়া যায়নি।" }, { status: 404 });
    const title = text(data.title, 180), summary = text(data.summary, 5000), outcome = text(data.finalOutcome, 5000), pollId = text(data.pollId, 80);
    if (!title || !summary || !outcome) return Response.json({ error: "Decision title, summary ও final outcome প্রয়োজন।" }, { status: 400 });
    const linkedPoll = pollId && uuid.test(pollId) ? await getPoll(pollId, membership.family_id) : null;
    if (pollId && !linkedPoll) return Response.json({ error: "Linked poll পাওয়া যায়নি।" }, { status: 400 });
    if (linkedPoll && linkedPoll.status !== "closed") return Response.json({ error: "শুধু closed poll decision-এর সাথে link করা যাবে।" }, { status: 409 });
    const changes = { poll_id: pollId || null, title, summary, final_outcome: outcome, effective_date: text(data.effectiveDate, 10), status: choice(data.status, ["adopted", "rejected", "superseded", "archived"] as const, String(decision.status) as "adopted" | "rejected" | "superseded" | "archived"), updated_at: new Date().toISOString() };
    await supabaseRest(`family_decisions?${new URLSearchParams({ id: `eq.${body.recordId}`, family_id: `eq.${membership.family_id}` })}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(changes) });
    await audit(membership.family_id, user.userId, "governance_decision_updated", "family_decisions", body.recordId);
    return Response.json({ success: true });
  } catch (error) {
    return governanceErrorResponse(error, "Unable to update governance record");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageGovernance(membership.role);
    const body = await request.json() as { kind?: "poll" | "decision"; recordId?: string };
    if (!body.kind || !body.recordId || !uuid.test(body.recordId)) return Response.json({ error: "Valid record প্রয়োজন।" }, { status: 400 });

    if (body.kind === "poll") {
      const poll = await getPoll(body.recordId, membership.family_id);
      if (!poll) return Response.json({ error: "Poll পাওয়া যায়নি।" }, { status: 404 });
      if (!canManage && poll.created_by_user_id !== user.userId) return Response.json({ error: "এই poll delete করার অনুমতি নেই।" }, { status: 403 });
      if (!["proposed", "draft", "rejected", "archived"].includes(String(poll.status))) return Response.json({ error: "Open বা closed poll delete করা যাবে না; audit history-এর জন্য archive করুন।" }, { status: 409 });
      const voteQuery = new URLSearchParams({ select: "id", family_id: `eq.${membership.family_id}`, poll_id: `eq.${body.recordId}`, limit: "1" });
      if ((await supabaseRest<Array<{ id: string }>>(`poll_votes?${voteQuery}`))[0]) return Response.json({ error: "Vote থাকা poll স্থায়ীভাবে delete করা যাবে না।" }, { status: 409 });
      await supabaseRest(`family_polls?${new URLSearchParams({ id: `eq.${body.recordId}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await audit(membership.family_id, user.userId, "governance_poll_deleted", "family_polls", body.recordId, { previousStatus: poll.status });
      return Response.json({ success: true, message: "Poll permanently delete হয়েছে।" });
    }

    if (!canManage) return Response.json({ error: "Family Admin decision delete করবেন।" }, { status: 403 });
    const decision = await getDecision(body.recordId, membership.family_id);
    if (!decision) return Response.json({ error: "Decision পাওয়া যায়নি।" }, { status: 404 });
    if (!["rejected", "archived"].includes(String(decision.status))) return Response.json({ error: "Adopted decision আগে archive বা reject করুন।" }, { status: 409 });
    await supabaseRest(`family_decisions?${new URLSearchParams({ id: `eq.${body.recordId}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await audit(membership.family_id, user.userId, "governance_decision_deleted", "family_decisions", body.recordId, { previousStatus: decision.status });
    return Response.json({ success: true, message: "Decision permanently delete হয়েছে।" });
  } catch (error) {
    return governanceErrorResponse(error, "Unable to delete governance record");
  }
}

function parsePoll(data: Record<string, unknown>, canManage: boolean) {
  const title = text(data.title, 180), description = text(data.description, 5000);
  if (!title) return Response.json({ error: "Poll title প্রয়োজন।" }, { status: 400 });
  const votingMode = choice(data.votingMode, ["single", "multiple", "yes_no"] as const, "single");
  const rawOptions = votingMode === "yes_no" ? ["হ্যাঁ", "না"] : (typeof data.options === "string" ? data.options.split("\n") : []).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  const options = [...new Set(rawOptions.map((item) => item.slice(0, 180)))];
  if (options.length < 2) return Response.json({ error: "কমপক্ষে ২টি আলাদা option প্রয়োজন।" }, { status: 400 });
  const opensAt = text(data.opensAt, 40), closesAt = text(data.closesAt, 40);
  if (opensAt && Number.isNaN(new Date(opensAt).getTime())) return Response.json({ error: "Opening time সঠিক নয়।" }, { status: 400 });
  if (closesAt && (Number.isNaN(new Date(closesAt).getTime()) || (opensAt && new Date(closesAt).getTime() <= new Date(opensAt).getTime()))) return Response.json({ error: "Closing time opening-এর পরে হতে হবে।" }, { status: 400 });
  const maxChoices = votingMode === "multiple" ? Math.min(Math.max(integer(data.maxChoices, 2), 1), options.length) : 1;
  return { options, poll: { title, description, category: choice(data.category, ["event", "finance", "welfare", "property", "qurbani", "policy", "general"] as const, "general"), decision_type: choice(data.decisionType, ["advisory", "binding", "informal"] as const, "advisory"), voting_mode: votingMode, max_choices: maxChoices, is_anonymous: bool(data.isAnonymous), results_visibility: choice(data.resultsVisibility, ["live", "after_close", "admins"] as const, "after_close"), audience: canManage ? choice(data.audience, ["family", "admins"] as const, "family") : "family", quorum_percent: Math.min(Math.max(integer(data.quorumPercent, 50), 0), 100), opens_at: opensAt, closes_at: closesAt } };
}

async function createPoll(data: Record<string, unknown>, familyId: string, userId: string, displayName: string, canManage: boolean) {
  const title = text(data.title, 180), description = text(data.description, 5000);
  if (!title) return Response.json({ error: "Poll title প্রয়োজন।" }, { status: 400 });
  const votingMode = choice(data.votingMode, ["single", "multiple", "yes_no"] as const, "single");
  const rawOptions = votingMode === "yes_no" ? ["হ্যাঁ", "না"] : (typeof data.options === "string" ? data.options.split("\n") : []).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  const options = [...new Set(rawOptions.map((item) => item.slice(0, 180)))];
  if (options.length < 2) return Response.json({ error: "কমপক্ষে ২টি আলাদা option প্রয়োজন।" }, { status: 400 });
  const maxChoices = votingMode === "multiple" ? Math.min(Math.max(integer(data.maxChoices, 2), 1), options.length) : 1;
  const quorumPercent = Math.min(Math.max(integer(data.quorumPercent, 50), 0), 100);
  const opensAt = text(data.opensAt, 40), closesAt = text(data.closesAt, 40);
  if (opensAt && Number.isNaN(new Date(opensAt).getTime())) return Response.json({ error: "Opening time সঠিক নয়।" }, { status: 400 });
  if (closesAt && (Number.isNaN(new Date(closesAt).getTime()) || (opensAt && new Date(closesAt).getTime() <= new Date(opensAt).getTime()))) return Response.json({ error: "Closing time opening-এর পরে হতে হবে।" }, { status: 400 });
  const publishNow = canManage && bool(data.publishNow);
  if (publishNow && closesAt && new Date(closesAt).getTime() <= Date.now()) return Response.json({ error: "Closing time ভবিষ্যতে হতে হবে।" }, { status: 400 });

  const poll = {
    family_id: familyId,
    title,
    description,
    category: choice(data.category, ["event", "finance", "welfare", "property", "qurbani", "policy", "general"] as const, "general"),
    decision_type: choice(data.decisionType, ["advisory", "binding", "informal"] as const, "advisory"),
    voting_mode: votingMode,
    max_choices: maxChoices,
    is_anonymous: bool(data.isAnonymous),
    results_visibility: choice(data.resultsVisibility, ["live", "after_close", "admins"] as const, "after_close"),
    audience: canManage ? choice(data.audience, ["family", "admins"] as const, "family") : "family",
    quorum_percent: quorumPercent,
    opens_at: publishNow ? (opensAt ?? new Date().toISOString()) : opensAt,
    closes_at: closesAt,
    status: publishNow ? "open" : canManage ? "draft" : "proposed",
    created_by_user_id: userId,
    created_by_name: displayName,
  };
  const [created] = await supabaseRest<Array<{ id: string }>>("family_polls", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(poll) });
  try {
    await supabaseRest("poll_options", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(options.map((label, position) => ({ family_id: familyId, poll_id: created.id, label, position }))) });
  } catch (error) {
    await supabaseRest(`family_polls?${new URLSearchParams({ id: `eq.${created.id}`, family_id: `eq.${familyId}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => undefined);
    throw error;
  }
  await audit(familyId, userId, "governance_poll_created", "family_polls", created.id, { status: poll.status, optionCount: options.length });
  return Response.json({ id: created.id, status: poll.status }, { status: 201 });
}

async function castVote(data: Record<string, unknown>, familyId: string, userId: string, canManage: boolean) {
  const pollId = text(data.pollId, 80), optionIds = ids(data.optionIds);
  if (!pollId || !uuid.test(pollId) || !optionIds.length) return Response.json({ error: "Poll এবং option নির্বাচন করুন।" }, { status: 400 });
  const poll = await getPoll(pollId, familyId);
  if (!poll) return Response.json({ error: "Poll পাওয়া যায়নি।" }, { status: 404 });
  const now = Date.now();
  if (poll.status !== "open" || (poll.opens_at && new Date(String(poll.opens_at)).getTime() > now) || (poll.closes_at && new Date(String(poll.closes_at)).getTime() <= now)) return Response.json({ error: "এই poll-এ এখন vote দেওয়া যাবে না।" }, { status: 409 });
  if (poll.audience === "admins" && !canManage) return Response.json({ error: "এই ballot শুধু admins-এর জন্য।" }, { status: 403 });
  const maximum = poll.voting_mode === "multiple" ? Number(poll.max_choices) : 1;
  if (optionIds.length > maximum) return Response.json({ error: `সর্বোচ্চ ${maximum}টি option নির্বাচন করা যাবে।` }, { status: 400 });
  const optionQuery = new URLSearchParams({ select: "id", family_id: `eq.${familyId}`, poll_id: `eq.${pollId}`, id: `in.(${optionIds.join(",")})` });
  const validOptions = await supabaseRest<Array<{ id: string }>>(`poll_options?${optionQuery}`);
  if (validOptions.length !== optionIds.length) return Response.json({ error: "এক বা একাধিক option গ্রহণযোগ্য নয়।" }, { status: 400 });
  const existingQuery = new URLSearchParams({ select: "id", family_id: `eq.${familyId}`, poll_id: `eq.${pollId}`, voter_user_id: `eq.${userId}`, limit: "1" });
  if ((await supabaseRest<Array<{ id: string }>>(`poll_votes?${existingQuery}`))[0]) return Response.json({ error: "এই poll-এ আপনার vote ইতিমধ্যে জমা হয়েছে।" }, { status: 409 });
  await supabaseRest("poll_votes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(optionIds.map((optionId) => ({ family_id: familyId, poll_id: pollId, option_id: optionId, voter_user_id: userId }))) });
  await audit(familyId, userId, "governance_vote_cast", "family_polls", pollId, { anonymous: Boolean(poll.is_anonymous), selections: optionIds.length });
  return Response.json({ success: true });
}

async function setPollStatus(data: Record<string, unknown>, familyId: string, userId: string, canManage: boolean) {
  const pollId = text(data.pollId, 80), requestedStatus = text(data.status, 40);
  const statuses = ["draft", "open", "closed", "rejected", "archived"] as const;
  if (!pollId || !uuid.test(pollId) || !requestedStatus || !statuses.includes(requestedStatus as (typeof statuses)[number])) return Response.json({ error: "Valid poll ও status প্রয়োজন।" }, { status: 400 });
  const status = requestedStatus as (typeof statuses)[number];
  const poll = await getPoll(pollId, familyId);
  if (!poll) return Response.json({ error: "Poll পাওয়া যায়নি।" }, { status: 404 });
  if (!canManage) {
      if (poll.created_by_user_id !== userId || poll.status !== "proposed" || status !== "archived") return Response.json({ error: "Poll status পরিবর্তনের অনুমতি নেই।" }, { status: 403 });
  }
  const transitions: Record<string, string[]> = {
    proposed: ["draft", "open", "rejected", "archived"],
    draft: ["open", "rejected", "archived"],
    open: ["closed", "archived"],
    closed: ["archived"],
    rejected: ["archived"],
    archived: [],
  };
  if (!(transitions[String(poll.status)] ?? []).includes(status)) return Response.json({ error: `${String(poll.status)} poll থেকে ${status} করা যাবে না।` }, { status: 409 });
  if (status === "open") {
    const optionQuery = new URLSearchParams({ select: "id", family_id: `eq.${familyId}`, poll_id: `eq.${pollId}` });
    if ((await supabaseRest<Array<{ id: string }>>(`poll_options?${optionQuery}`)).length < 2) return Response.json({ error: "Poll open করতে কমপক্ষে ২টি option প্রয়োজন।" }, { status: 409 });
    if (poll.closes_at && new Date(String(poll.closes_at)).getTime() <= Date.now()) return Response.json({ error: "Poll deadline ইতিমধ্যে শেষ হয়েছে।" }, { status: 409 });
  }
  const changes: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "open" && !poll.opens_at) changes.opens_at = new Date().toISOString();
  const filter = new URLSearchParams({ id: `eq.${pollId}`, family_id: `eq.${familyId}` });
  await supabaseRest(`family_polls?${filter}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(changes) });
  await audit(familyId, userId, `governance_poll_${status}`, "family_polls", pollId);
  return Response.json({ success: true, status });
}

async function addComment(data: Record<string, unknown>, familyId: string, userId: string, displayName: string, canManage: boolean) {
  const pollId = text(data.pollId, 80), body = text(data.body, 2000);
  if (!pollId || !uuid.test(pollId) || !body) return Response.json({ error: "Poll এবং comment প্রয়োজন।" }, { status: 400 });
  const poll = await getPoll(pollId, familyId);
  if (!poll) return Response.json({ error: "Poll পাওয়া যায়নি।" }, { status: 404 });
  if (poll.audience === "admins" && !canManage) return Response.json({ error: "এই discussion শুধু admins-এর জন্য।" }, { status: 403 });
  if (!canManage && !["open", "closed"].includes(String(poll.status)) && poll.created_by_user_id !== userId) return Response.json({ error: "এই proposal-এ comment করা যাবে না।" }, { status: 403 });
  const [created] = await supabaseRest<Array<{ id: string }>>("poll_comments", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: familyId, poll_id: pollId, body, author_user_id: userId, author_name: displayName, status: "visible" }) });
  await audit(familyId, userId, "governance_comment_added", "poll_comments", created.id, { pollId });
  return Response.json({ id: created.id }, { status: 201 });
}

async function moderateComment(data: Record<string, unknown>, familyId: string, userId: string, canManage: boolean) {
  if (!canManage) return Response.json({ error: "Family Admin comment moderate করবেন।" }, { status: 403 });
  const commentId = text(data.commentId, 80), status = choice(data.status, ["visible", "hidden"] as const, "hidden");
  if (!commentId || !uuid.test(commentId)) return Response.json({ error: "Valid comment প্রয়োজন।" }, { status: 400 });
  const filter = new URLSearchParams({ id: `eq.${commentId}`, family_id: `eq.${familyId}` });
  await supabaseRest(`poll_comments?${filter}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
  await audit(familyId, userId, `governance_comment_${status}`, "poll_comments", commentId);
  return Response.json({ success: true });
}

async function createDecision(data: Record<string, unknown>, familyId: string, userId: string, displayName: string, canManage: boolean) {
  if (!canManage) return Response.json({ error: "Family Admin formal decision record করবেন।" }, { status: 403 });
  const title = text(data.title, 180), summary = text(data.summary, 5000), outcome = text(data.finalOutcome, 5000), pollId = text(data.pollId, 80);
  if (!title || !summary || !outcome) return Response.json({ error: "Decision title, summary ও final outcome প্রয়োজন।" }, { status: 400 });
  const linkedPoll = pollId && uuid.test(pollId) ? await getPoll(pollId, familyId) : null;
  if (pollId && !linkedPoll) return Response.json({ error: "Linked poll পাওয়া যায়নি।" }, { status: 400 });
  if (linkedPoll && linkedPoll.status !== "closed" && !(linkedPoll.status === "open" && linkedPoll.closes_at && new Date(String(linkedPoll.closes_at)).getTime() <= Date.now())) return Response.json({ error: "Linked poll close হওয়ার আগে formal decision করা যাবে না।" }, { status: 409 });
  const record = { family_id: familyId, poll_id: pollId || null, title, summary, final_outcome: outcome, effective_date: text(data.effectiveDate, 10), status: choice(data.status, ["adopted", "rejected"] as const, "adopted"), decided_by_user_id: userId, decided_by_name: displayName };
  const [created] = await supabaseRest<Array<{ id: string }>>("family_decisions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) });
  await audit(familyId, userId, "governance_decision_created", "family_decisions", created.id, { pollId: pollId || null, status: record.status });
  return Response.json({ id: created.id }, { status: 201 });
}

async function updateDecision(data: Record<string, unknown>, familyId: string, userId: string, canManage: boolean) {
  if (!canManage) return Response.json({ error: "Family Admin decision status পরিবর্তন করবেন।" }, { status: 403 });
  const decisionId = text(data.decisionId, 80), status = choice(data.status, ["adopted", "rejected", "superseded", "archived"] as const, "archived");
  if (!decisionId || !uuid.test(decisionId)) return Response.json({ error: "Valid decision প্রয়োজন।" }, { status: 400 });
  const filter = new URLSearchParams({ id: `eq.${decisionId}`, family_id: `eq.${familyId}` });
  await supabaseRest(`family_decisions?${filter}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
  await audit(familyId, userId, `governance_decision_${status}`, "family_decisions", decisionId);
  return Response.json({ success: true });
}

async function getPoll(id: string, familyId: string) {
  const query = new URLSearchParams({ select: "*", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" });
  return (await supabaseRest<Array<Record<string, unknown>>>(`family_polls?${query}`))[0] ?? null;
}

async function getDecision(id: string, familyId: string) {
  const query = new URLSearchParams({ select: "*", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" });
  return (await supabaseRest<Array<Record<string, unknown>>>(`family_decisions?${query}`))[0] ?? null;
}

async function audit(familyId: string, userId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: entityType, entity_id: entityId, metadata: { module: "governance", ...metadata } }) });
}
