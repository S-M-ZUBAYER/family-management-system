"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { useActionResult } from "@/components/action-modal-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { chatLifecycleInput, chatLifecycleSnapshot, chatLifecycleAcknowledged, chatLifecycleCopy, type ManagedChatChannel, type ChatLifecycleInput } from "@/lib/chat-channel-lifecycle";

export function ChatChannelManagement() {
  const { locale } = useLocale();
  const show = useActionResult();
  const pick = (bn: string, en: string) => locale === "bn" ? bn : en;
  const [snapshot, setSnapshot] = useState<ReturnType<typeof chatLifecycleSnapshot>>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [editor, setEditor] = useState<ManagedChatChannel | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [uncertain, setUncertain] = useState<{ id: string; actor: string; input: ChatLifecycleInput } | null>(null);
  const gate = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const loadRef = useRef<() => Promise<ReturnType<typeof chatLifecycleSnapshot>>>(async () => null);
  const load = useCallback(async () => {
    if (gate.current) return null;
    gate.current = true;
    const epoch = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 25000);
    setLoading(true); setSnapshot(null); setEditor(null); setError(false);
    try {
      const r = await fetch("/api/chat-channels", { cache: "no-store", signal: abort.signal });
      const p = chatLifecycleSnapshot(await r.json());
      if (!r.ok || !p || abort.signal.aborted) throw Error("Invalid authorized list");
      if (!mounted.current || epoch !== generation.current) return null;
      setSnapshot(p); return p;
    } catch {
      if (mounted.current && epoch === generation.current) { setError(true); show({ kind: "error", title: "Error", message: chatLifecycleCopy("CHAT_CHANNEL_LOAD", locale) }); }
      return null;
    } finally {
      clearTimeout(timeout);
      if (mounted.current && epoch === generation.current) { gate.current = false; setLoading(false); }
    }
  }, [locale, show]);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    const lifetime = mounted, readGeneration = generation, activeRead = controller;
    mounted.current = true; gate.current = false;
    void loadRef.current();
    return () => { lifetime.current = false; readGeneration.current++; activeRead.current?.abort(); };
  }, []);
  async function change(channel: ManagedChatChannel, action: "edit" | "archive" | "restore") {
    if (gate.current || loading || busy || uncertain || !snapshot) return;
    let input: ChatLifecycleInput;
    const body = { action, expectedFamilyId: snapshot.familyId, expectedChannelType: channel.channelType, expectedVisibility: channel.visibility, expectedName: channel.name, expectedDescription: channel.description, expectedStatus: channel.status, expectedUpdatedAt: channel.updatedAt, ...(action === "edit" ? { name, description } : {}) };
    try { input = chatLifecycleInput(body); }
    catch { show({ kind: "error", title: "Error", message: chatLifecycleCopy("CHAT_CHANNEL_INVALID", locale) }); return; }
    const captured = { id: channel.id, actor: snapshot.actorId, input };
    const epoch = ++generation.current;
    gate.current = true; setBusy(true);
    const lock = () => {
      if (!mounted.current || epoch !== generation.current) return;
      setUncertain(captured); setSnapshot(null); setEditor(null);
    };
    try {
      const r = await fetch(`/api/chat-channels/${channel.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
      if (r.status === 499) return;
      const p: unknown = await r.json().catch(() => null);
      if (!mounted.current || epoch !== generation.current) return;
      if (!chatLifecycleAcknowledged(channel.id, input, r.status, p)) {
        if (r.status < 400 || r.status >= 500 || r.status === 408 || !p) lock();
        return;
      }
      // Audit pending is independently reported by the result modal. Loading
      // data reviews state only; it cannot repair or prove the audit.
      setEditor(null); gate.current = false; await load();
    } catch { lock(); }
    finally { if (mounted.current && (epoch === generation.current || !gate.current)) { gate.current = false; setBusy(false); } }
  }
  async function verify() {
    if (!uncertain || busy || gate.current) return;
    const captured = uncertain;
    const p = await load(); if (!p) return;
    if (p.familyId !== captured.input.expectedFamilyId || p.actorId !== captured.actor) {
      setSnapshot(null); setError(true); show({ kind: "error", title: "Error", message: chatLifecycleCopy("CHAT_CHANNEL_CHANGED", locale) }); return;
    }
    const c = p.channels.find(item => item.id === captured.id);
    if (!c) { setSnapshot(null); show({ kind: "info", title: pick("যাচাই প্রয়োজন", "Review needed"), message: chatLifecycleCopy("CHAT_CHANNEL_UNKNOWN", locale) }); return; }
    setUncertain(null);
    show({ kind: "info", title: pick("বর্তমান অবস্থা লোড হয়েছে", "Current state loaded"), message: c.name === captured.input.name && c.description === captured.input.description && c.status === captured.input.status
      ? pick("বর্তমান তথ্য অনুরোধের সঙ্গে মেলে। কোনো কাজ পুনরায় পাঠানো হয়নি; audit সমস্যা থাকলে Support-এর সহায়তা নিন।", "Current data matches the request. Nothing was resubmitted; contact support for any audit issue.")
      : pick("বর্তমান তথ্য অনুরোধের মতো নয়। নতুন সিদ্ধান্তের আগে তালিকা যাচাই করুন; কোনো কাজ পুনরায় পাঠানো হয়নি।", "Current data differs from the request. Review the list before a new decision; nothing was resubmitted.") });
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{pick("Chat channel পরিচালনা", "Manage chat channels")}</h1><Button asChild variant="outline"><a href="/chat">{pick("Chat-এ ফিরুন", "Back to chat")}</a></Button></div>
    <p className="text-sm text-muted-foreground">{pick("শুধু অনুমোদিত custom/admin channel। Archive করলে history/file থাকবে, তবে chat ও file access restore পর্যন্ত বন্ধ। Audience/member এখানে বদলানো যাবে না।", "Authorized custom/admin channels only. Archiving retains history/files but blocks chat and file access until restoration. Audience/members cannot be changed here.")}</p>
    {uncertain ? <Card><CardContent className="space-y-3 p-5"><p>{chatLifecycleCopy("CHAT_CHANNEL_UNKNOWN", locale)}</p><Button disabled={busy || loading} onClick={() => void verify()}>{pick("বর্তমান অবস্থা যাচাই করুন", "Verify current state")}</Button><Button asChild variant="outline"><a href="/contact">Support</a></Button></CardContent></Card> : null}
    {!uncertain ? <Button disabled={loading || busy} variant="outline" onClick={() => void load()}>{pick("তালিকা আবার লোড করুন", "Reload list")}</Button> : null}
    {loading ? <p role="status">{pick("লোড হচ্ছে…", "Loading…")}</p> : error ? <p role="alert">{chatLifecycleCopy("CHAT_CHANNEL_LOAD", locale)}</p> : null}
    {!uncertain && snapshot ? <fieldset disabled={busy || loading} aria-busy={busy} className="space-y-3">
      {!snapshot.channels.length ? <p>{pick("পরিচালনাযোগ্য channel নেই।", "No manageable channels.")}</p> : snapshot.channels.map(c => <Card key={c.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h2 className="font-semibold">{c.name}</h2><p className="text-sm text-muted-foreground">{c.description}</p><p className="text-xs">{c.status === "active" ? pick("চালু", "Active") : pick("আর্কাইভকৃত", "Archived")} · {c.visibility}</p></div><div className="flex gap-2">
        {c.status === "active" ? <><Button variant="outline" onClick={() => { setEditor(c); setName(c.name); setDescription(c.description ?? ""); }}>{pick("Edit করুন", "Edit")}</Button><Button variant="destructive" onClick={() => void change(c, "archive")}>{pick("Archive করুন", "Archive")}</Button></> : <Button onClick={() => void change(c, "restore")}>{pick("Restore করুন", "Restore")}</Button>}
      </div></CardContent></Card>)}
    </fieldset> : null}
    <Dialog open={!!editor} onOpenChange={open => { if (!open) setEditor(null); }}><DialogContent className="rounded-3xl"><fieldset disabled={busy} aria-busy={busy} className="space-y-4"><DialogHeader><DialogTitle>{pick("Channel সম্পাদনা", "Edit channel")}</DialogTitle><DialogDescription>{pick("নাম ও বিবরণ বদলান; গোপনীয়তা অপরিবর্তিত থাকবে।", "Change name and description; privacy remains unchanged.")}</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="managed-channel-name">{pick("নাম", "Name")}</Label><Input id="managed-channel-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="managed-channel-description">{pick("বিবরণ", "Description")}</Label><Textarea id="managed-channel-description" value={description} maxLength={500} onChange={e => setDescription(e.target.value)} /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditor(null)}>{pick("বাতিল", "Cancel")}</Button><Button disabled={name.trim().length < 2} onClick={() => editor && void change(editor, "edit")}>{pick("সংরক্ষণ করুন", "Save")}</Button></div></fieldset></DialogContent></Dialog>
  </main>;
}
