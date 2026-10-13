"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { useActionResult } from "@/components/action-modal-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { chatMembershipInput, chatMembershipSnapshot, chatMembershipAcknowledged, chatMembershipCopy, type ChatMembershipInput, type ChatMembershipSnapshot } from "@/lib/chat-membership-workflow";
import { noticeUuid } from "@/lib/notice-validation";
export function ChatMembershipManagement({ channelId }: { channelId: string }) {
  const { locale } = useLocale(), show = useActionResult();
  const pick = (bn: string, en: string) => locale === "bn" ? bn : en;
  const [snapshot, setSnapshot] = useState<ChatMembershipSnapshot | null>(null);
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [uncertain, setUncertain] = useState<ChatMembershipInput | null>(null);
  const gate = useRef(false), mounted = useRef(false), generation = useRef(0), controller = useRef<AbortController | null>(null);
  const loadRef = useRef<() => Promise<ChatMembershipSnapshot | null>>(async () => null);
  const load = useCallback(async () => {
    if (gate.current) return null;
    gate.current = true; const epoch = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const deadline = setTimeout(() => abort.abort(), 25000);
    setLoading(true); setSnapshot(null); setTarget(""); setError(false);
    try {
      if (!noticeUuid(channelId)) throw Error("Invalid channel");
      const r = await fetch(`/api/chat-channels/${channelId}/members`, { cache: "no-store", signal: abort.signal });
      const p = chatMembershipSnapshot(await r.json());
      if (!r.ok || !p || p.channel.id !== channelId || abort.signal.aborted) throw Error("Invalid authorized snapshot");
      if (!mounted.current || epoch !== generation.current) return null;
      setSnapshot(p); return p;
    } catch {
      if (mounted.current && epoch === generation.current) { setError(true); show({ kind: "error", title: "Error", message: chatMembershipCopy("CHAT_MEMBER_LOAD", locale) }); }
      return null;
    } finally { clearTimeout(deadline); if (mounted.current && epoch === generation.current) { gate.current = false; setLoading(false); } }
  }, [channelId, locale, show]);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    const life = mounted, version = generation, read = controller;
    life.current = true; gate.current = false; void loadRef.current();
    return () => { life.current = false; version.current++; read.current?.abort(); };
  }, [channelId]);
  async function change(userId: string, action: ChatMembershipInput["action"]) {
    if (!snapshot || uncertain || loading || busy || gate.current) return;
    const row = snapshot.members.find(m => m.userId === userId);
    const body = { action, targetUserId: userId, expectedFamilyId: snapshot.familyId, expectedActorId: snapshot.actorId, expectedChannelUpdatedAt: snapshot.channel.updatedAt, expectedMembershipId: row?.id ?? null, expectedRole: row?.role ?? null, expectedStatus: row?.status ?? null, expectedUpdatedAt: row?.updatedAt ?? null, ...(!row ? { clientMembershipId: crypto.randomUUID() } : {}) };
    let input: ChatMembershipInput;
    try { input = chatMembershipInput(body); } catch { show({ kind: "error", title: "Error", message: chatMembershipCopy("CHAT_MEMBER_INVALID", locale) }); return; }
    gate.current = true; setBusy(true); const epoch = ++generation.current;
    const lock = () => { if (mounted.current && epoch === generation.current) { setUncertain(input); setSnapshot(null); setTarget(""); } };
    try {
      const r = await fetch(`/api/chat-channels/${channelId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
      if (r.status === 499) return;
      const p: unknown = await r.json().catch(() => null);
      if (!mounted.current || epoch !== generation.current) return;
      if (!chatMembershipAcknowledged(channelId, input, r.status, p)) { if (r.status < 400 || r.status >= 500 || r.status === 408 || !p) lock(); return; }
      gate.current = false; await load();
    } catch { lock(); }
    finally { if (mounted.current && (epoch === generation.current || !gate.current)) { gate.current = false; setBusy(false); } }
  }
  async function verify() {
    if (!uncertain || loading || busy || gate.current) return;
    const input = uncertain;
    const p = await load(); if (!p) return;
    if (p.familyId !== input.expectedFamilyId || p.actorId !== input.expectedActorId) { setSnapshot(null); setError(true); show({ kind: "error", title: "Error", message: chatMembershipCopy("CHAT_MEMBER_CHANGED", locale) }); return; }
    const row = p.members.find(m => m.userId === input.targetUserId);
    // Missing new invite can be reviewed as absent; losing an observed row
    // cannot prove the previous outcome, so remains blocked for support.
    if (!row && input.expectedMembershipId) { setSnapshot(null); show({ kind: "info", title: pick("যাচাই প্রয়োজন", "Review needed"), message: chatMembershipCopy("CHAT_MEMBER_UNKNOWN", locale) }); return; }
    setUncertain(null);
    show({ kind: "info", title: pick("বর্তমান তালিকা লোড হয়েছে", "Current list loaded"), message: pick("নতুন সিদ্ধান্তের আগে member role ও status যাচাই করুন। কোনো কাজ আবার পাঠানো হয়নি; reload audit মেরামত করে না।", "Review member role and status before a new decision. Nothing was resubmitted; reload does not repair audits.") });
  }
  const available = snapshot?.eligible.filter(e => !snapshot.members.some(m => m.userId === e.userId && m.status === "active")) ?? [];
  return <main className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{pick("Private group সদস্য পরিচালনা", "Private group membership")}</h1><Button asChild variant="outline"><a href="/chat/channels">{pick("Channel তালিকায় ফিরুন", "Back to channels")}</a></Button></div>
    <p className="text-sm text-muted-foreground">{pick("Approved login-enabled family account-কে invite করা যায়। Owner সুরক্ষিত; remove করলে history মুছবে না। Family/admin/direct channel membership এখানে বদলানো যায় না। Moderator role family admin বা অন্যের message edit/delete-এর permission দেয় না।", "Invite approved login-enabled family accounts. Owners are protected; removal retains history. Family/admin/direct channel memberships cannot change here. Moderator role does not grant family-admin or other-author message edit/delete permission.")}</p>
    {uncertain ? <Card><CardContent className="space-y-3 p-5"><p>{chatMembershipCopy("CHAT_MEMBER_UNKNOWN", locale)}</p><Button disabled={busy || loading} onClick={() => void verify()}>{pick("বর্তমান তালিকা যাচাই করুন", "Verify current list")}</Button><Button asChild variant="outline"><a href="/contact">Support</a></Button></CardContent></Card> : <Button disabled={busy || loading} variant="outline" onClick={() => void load()}>{pick("তালিকা আবার লোড করুন", "Reload list")}</Button>}
    {loading ? <p role="status">{pick("লোড হচ্ছে…", "Loading…")}</p> : error ? <p role="alert">{chatMembershipCopy("CHAT_MEMBER_LOAD", locale)}</p> : null}
    {!uncertain && snapshot ? <fieldset disabled={loading || busy} aria-busy={busy} className="space-y-4">
      <h2 className="text-lg font-semibold">{snapshot.channel.name}</h2>
      <Card><CardContent className="space-y-3 p-5"><Label htmlFor="invite-account">{pick("সদস্য invite করুন", "Invite a member")}</Label><select id="invite-account" className="w-full rounded-xl border bg-background p-3" value={target} onChange={e => setTarget(e.target.value)}><option value="">{pick("Approved account নির্বাচন করুন", "Select an approved account")}</option>{available.map(e => <option key={e.userId} value={e.userId}>{e.name}</option>)}</select><Button disabled={!target} onClick={() => void change(target, "invite")}>{pick("Invite নিশ্চিত করুন", "Confirm invitation")}</Button>{!available.length ? <p className="text-sm text-muted-foreground">{pick("নতুন eligible account নেই। Family approval ও login account থাকা প্রয়োজন; শুধু profile যথেষ্ট নয়।", "No new eligible account. Family approval and a login account are required; a profile alone is not enough.")}</p> : null}</CardContent></Card>
      {snapshot.members.map(m => <Card key={m.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="font-semibold">{m.userId === snapshot.actorId ? pick("Group owner (আপনি)", "Group owner (you)") : snapshot.eligible.find(e => e.userId === m.userId)?.name ?? pick("অনুপলব্ধ account", "Unavailable account")}</p><p className="text-sm text-muted-foreground">{m.role === "owner" ? pick("মালিক", "Owner") : m.role === "moderator" ? pick("মডারেটর", "Moderator") : pick("সদস্য", "Member")} · {m.status === "active" ? pick("চালু", "Active") : pick("Access বন্ধ", "Access removed")}</p></div>
        {m.role === "owner" || m.userId === snapshot.actorId ? <span className="text-sm">{pick("সুরক্ষিত", "Protected")}</span> : <div className="flex flex-wrap gap-2">{m.status === "active" ? <><Button disabled={!snapshot.eligible.some(e => e.userId === m.userId)} variant="outline" onClick={() => void change(m.userId, m.role === "moderator" ? "demote" : "promote")}>{m.role === "moderator" ? pick("Member করুন", "Make member") : pick("Moderator করুন", "Make moderator")}</Button><Button variant="destructive" onClick={() => void change(m.userId, "remove")}>{pick("Access সরান", "Remove access")}</Button></> : <Button disabled={!snapshot.eligible.some(e => e.userId === m.userId)} onClick={() => void change(m.userId, "invite")}>{pick("আবার invite করুন", "Invite again")}</Button>}</div>}
      </CardContent></Card>)}
    </fieldset> : null}
  </main>;
}
