"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArchiveRestore, Bell, BellRing, CheckCheck, Clock3, Download, LoaderCircle, Megaphone, Plus, Search, Settings2 } from "lucide-react";
import { useActionFeedback } from "@/components/action-modal-provider";
import { useLocale, type AppLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FamilyNotification, NotificationCategory, NotificationDigest, NotificationPayload, NotificationPreferences, NotificationSeverity } from "@/lib/notification-types";

const categories: NotificationCategory[] = ["announcement", "membership", "event", "qurbani", "health", "finance", "governance", "household", "system"];
const categoryLabels: Record<NotificationCategory, [string, string]> = {
  announcement: ["ঘোষণা", "Announcement"], membership: ["সদস্য", "Membership"], event: ["ইভেন্ট", "Event"], qurbani: ["কোরবানি", "Qurbani"], health: ["স্বাস্থ্য", "Health"], finance: ["অর্থব্যবস্থা", "Finance"], governance: ["সিদ্ধান্ত", "Governance"], household: ["বাসা", "Household"], system: ["সিস্টেম", "System"],
};
const severityLabels: Record<NotificationSeverity, [string, string]> = { info: ["তথ্য", "Info"], success: ["সফল", "Success"], warning: ["সতর্কতা", "Warning"], urgent: ["জরুরি", "Urgent"] };
const digestLabels: Record<NotificationDigest, [string, string]> = { instant: ["তাৎক্ষণিক", "Instant"], daily: ["দৈনিক সারাংশ", "Daily digest"], weekly: ["সাপ্তাহিক সারাংশ", "Weekly digest"], off: ["বন্ধ", "Off"] };
const pickPair = (locale: AppLocale, pair: [string, string]) => locale === "bn" ? pair[0] : pair[1];
const emptyForm = { category: "announcement" as NotificationCategory, severity: "info" as NotificationSeverity, titleBn: "", titleEn: "", messageBn: "", messageEn: "", actionUrl: "", scheduledFor: "", expiresAt: "" };

export function NotificationCenter() {
  const { locale, pick } = useLocale();
  const [, setFeedback] = useActionFeedback();
  const [payload, setPayload] = useState<NotificationPayload>({});
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState(""), [view, setView] = useState<"active" | "unread" | "archived">("active"), [category, setCategory] = useState("all");
  const [createOpen, setCreateOpen] = useState(false), [preferencesOpen, setPreferencesOpen] = useState(false), [form, setForm] = useState(emptyForm);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const formatter = useMemo(() => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { dateStyle: "medium", timeStyle: "short" }), [locale]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json() as NotificationPayload;
      if (data.code === "FAMILY_SETUP_REQUIRED") { setPayload(data); return; }
      if (!response.ok) throw new Error(data.error ?? pick("নোটিফিকেশন লোড হয়নি।", "Notifications could not be loaded."));
      setPayload(data); setPreferences(data.preferences ?? null);
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("নোটিফিকেশন লোড হয়নি।", "Notifications could not be loaded.")); }
    finally { setLoading(false); }
  }, [pick, setFeedback]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const notifications = useMemo(() => payload.notifications ?? [], [payload.notifications]);
  const visible = useMemo(() => notifications.filter((item) => {
    const needle = query.trim().toLowerCase();
    const matchesView = view === "archived" ? Boolean(item.archived_at) : !item.archived_at && (view !== "unread" || !item.read_at);
    const text = `${item.title_bn ?? ""} ${item.title_en ?? ""} ${item.message_bn ?? ""} ${item.message_en ?? ""}`.toLowerCase();
    return matchesView && (category === "all" || item.category === category) && (!needle || text.includes(needle));
  }), [category, notifications, query, view]);
  const unread = notifications.filter((item) => !item.read_at && !item.archived_at).length;
  const urgent = notifications.filter((item) => item.severity === "urgent" && !item.archived_at).length;

  const localizedTitle = (item: FamilyNotification) => locale === "bn" ? item.title_bn || item.title_en || "—" : item.title_en || item.title_bn || "—";
  const localizedMessage = (item: FamilyNotification) => locale === "bn" ? item.message_bn || item.message_en || "" : item.message_en || item.message_bn || "";

  async function createNotification() {
    if (!form.titleBn.trim() && !form.titleEn.trim()) { setFeedback(pick("কমপক্ষে একটি শিরোনাম লিখুন।", "Enter at least one title.")); return; }
    setSaving(true);
    try {
      const body = { action: "create_notification", ...form, scheduledFor: form.scheduledFor ? new Date(form.scheduledFor).toISOString() : null, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null };
      const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? pick("নোটিফিকেশন প্রকাশ হয়নি।", "Notification could not be published."));
      setCreateOpen(false); setForm(emptyForm); await load(); setFeedback(pick("ফ্যামিলি নোটিফিকেশন প্রকাশ হয়েছে।", "Family notification published."));
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("নোটিফিকেশন প্রকাশ হয়নি।", "Notification could not be published.")); }
    finally { setSaving(false); }
  }

  async function updateState(item: FamilyNotification, action: "mark_read" | "mark_unread" | "archive" | "restore") {
    setSaving(true);
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? pick("অবস্থা হালনাগাদ হয়নি।", "Status could not be updated."));
      await load(); setFeedback(pick("নোটিফিকেশন অবস্থা হালনাগাদ হয়েছে।", "Notification status updated."));
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("অবস্থা হালনাগাদ হয়নি।", "Status could not be updated.")); }
    finally { setSaving(false); }
  }

  async function savePreferences() {
    if (!preferences) return;
    setSaving(true);
    try {
      const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_preferences", ...preferences, digestFrequency: preferences.digest_frequency, quietHoursStart: preferences.quiet_hours_start, quietHoursEnd: preferences.quiet_hours_end }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? pick("পছন্দ সংরক্ষণ হয়নি।", "Preferences could not be saved."));
      setPreferencesOpen(false); await load(); setFeedback(pick("নোটিফিকেশন পছন্দ সংরক্ষিত হয়েছে।", "Notification preferences saved."));
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("পছন্দ সংরক্ষণ হয়নি।", "Preferences could not be saved.")); }
    finally { setSaving(false); }
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = visible.map((item) => ({ [pick("শিরোনাম", "Title")]: localizedTitle(item), [pick("বার্তা", "Message")]: localizedMessage(item), [pick("বিভাগ", "Category")]: pickPair(locale, categoryLabels[item.category]), [pick("গুরুত্ব", "Severity")]: pickPair(locale, severityLabels[item.severity]), [pick("পড়া হয়েছে", "Read")]: item.read_at ? pick("হ্যাঁ", "Yes") : pick("না", "No"), [pick("নির্ধারিত সময়", "Scheduled for")]: item.scheduled_for, [pick("মেয়াদ", "Expires at")]: item.expires_at ?? "", [pick("প্রকাশকারী", "Published by")]: item.created_by_name }));
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), pick("নোটিফিকেশন", "Notifications")); XLSX.writeFile(book, `${payload.family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-notifications.xlsx`); setFeedback(pick("নোটিফিকেশন XLSX তৈরি হয়েছে।", "The notifications XLSX was created."));
    } catch { setFeedback(pick("XLSX তৈরি হয়নি।", "The XLSX could not be created.")); }
    finally { setExporting(false); }
  }

  if (loading) return <main className="grid min-h-[calc(100vh-4rem)] place-items-center"><LoaderCircle className="size-7 animate-spin text-primary" /></main>;
  if (payload.code === "FAMILY_SETUP_REQUIRED") return <main className="grid min-h-[calc(100vh-4rem)] place-items-center p-6 text-center"><div><Bell className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{pick("ফ্যামিলি অ্যাক্সেস প্রয়োজন", "Family access required")}</h1><Button asChild className="mt-4"><a href="/setup">{pick("ফ্যামিলিতে যোগ দিন", "Join a family")}</a></Button></div></main>;

  return <main className="mx-auto w-full max-w-[1450px] space-y-5 px-4 py-5 md:px-7 md:py-7">
    <section className="overflow-hidden rounded-3xl bg-[linear-gradient(125deg,#172554_0%,#4338ca_52%,#0f766e_100%)] p-5 text-white shadow-xl md:p-7"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><p className="flex items-center gap-2 text-sm text-indigo-100"><BellRing className="size-4" /> {pick("আপনার পারিবারিক আপডেট", "Your family updates")}</p><h1 className="mt-2 text-2xl font-bold md:text-4xl">{pick("নোটিফিকেশন ও রিমাইন্ডার", "Notifications & Reminders")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">{pick("গুরুত্বপূর্ণ ঘোষণা, ইভেন্ট, কোরবানি, স্বাস্থ্য ও পারিবারিক কাজের আপডেট এক জায়গায় দেখুন।", "See important announcements, event, Qurbani, health, and household updates in one place.")}</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setPreferencesOpen(true)} disabled={payload.migrationRequired}><Settings2 /> {pick("পছন্দ", "Preferences")}</Button><Button variant="secondary" onClick={() => void exportXlsx()} disabled={exporting || !visible.length}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} XLSX</Button>{payload.permissions?.canManage ? <Button className="bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={() => setCreateOpen(true)} disabled={payload.migrationRequired}><Plus /> {pick("প্রকাশ করুন", "Publish")}</Button> : null}</div></div></section>

    {payload.migrationRequired ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">{pick("নোটিফিকেশন কেন্দ্র চালু করতে Supabase SQL Editor-এ", "To activate Notifications, run")} <b>supabase/migrations/20260930_family_notifications.sql</b> {pick("চালান।", "in the Supabase SQL Editor.")}</div> : null}

    <section className="grid gap-4 sm:grid-cols-3"><Metric icon={<Bell />} label={pick("মোট আপডেট", "Total updates")} value={notifications.filter((item) => !item.archived_at).length} /><Metric icon={<BellRing />} label={pick("না-পড়া", "Unread")} value={unread} /><Metric icon={<Clock3 />} label={pick("জরুরি", "Urgent")} value={urgent} /></section>

    <Card className="rounded-3xl shadow-none"><CardContent className="space-y-4 p-5"><div className="flex flex-col gap-3 xl:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick("শিরোনাম বা বার্তা খুঁজুন", "Search title or message")} className="pl-9" /></div><Native value={category} onChange={setCategory} options={[["all", pick("সব বিভাগ", "All categories")], ...categories.map((item) => [item, pickPair(locale, categoryLabels[item])])]} /><div className="grid grid-cols-3 rounded-xl bg-muted p-1">{(["active", "unread", "archived"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`rounded-lg px-3 py-2 text-sm font-medium ${view === item ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{item === "active" ? pick("সক্রিয়", "Active") : item === "unread" ? pick("না-পড়া", "Unread") : pick("আর্কাইভ", "Archived")}</button>)}</div></div>
      <div className="grid gap-3 lg:grid-cols-2">{visible.map((item) => <article key={item.id} className={`rounded-2xl border p-4 ${!item.read_at ? "border-primary/35 bg-primary/[0.03]" : ""}`}><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge variant="outline">{pickPair(locale, categoryLabels[item.category])}</Badge><Badge variant={item.severity === "urgent" ? "destructive" : "secondary"}>{pickPair(locale, severityLabels[item.severity])}</Badge>{!item.read_at ? <Badge>{pick("নতুন", "New")}</Badge> : null}</div><span className="text-xs text-muted-foreground">{formatter.format(new Date(item.scheduled_for))}</span></div><h2 className="mt-3 text-lg font-bold">{localizedTitle(item)}</h2>{localizedMessage(item) ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{localizedMessage(item)}</p> : null}<div className="mt-4 flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => void updateState(item, item.read_at ? "mark_unread" : "mark_read")} disabled={saving}>{item.read_at ? pick("না-পড়া করুন", "Mark unread") : <><CheckCheck /> {pick("পড়া হয়েছে", "Mark read")}</>}</Button><Button size="sm" variant="ghost" onClick={() => void updateState(item, item.archived_at ? "restore" : "archive")} disabled={saving}>{item.archived_at ? <><ArchiveRestore /> {pick("ফিরিয়ে আনুন", "Restore")}</> : pick("আর্কাইভ", "Archive")}</Button>{item.action_url ? <Button size="sm" asChild><a href={item.action_url}>{pick("বিস্তারিত খুলুন", "Open details")}</a></Button> : null}<span className="ml-auto text-xs text-muted-foreground">{item.created_by_name}</span></div></article>)}</div>
      {!visible.length ? <div className="rounded-2xl border border-dashed p-10 text-center"><Megaphone className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 font-semibold">{pick("কোনো নোটিফিকেশন পাওয়া যায়নি", "No notifications found")}</p><p className="mt-1 text-sm text-muted-foreground">{pick("ফিল্টার পরিবর্তন করুন অথবা পরে আবার দেখুন।", "Change the filters or check again later.")}</p></div> : null}
    </CardContent></Card>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl"><DialogHeader><DialogTitle>{pick("ফ্যামিলি নোটিফিকেশন প্রকাশ", "Publish family notification")}</DialogTitle><DialogDescription>{pick("তাৎক্ষণিক বা ভবিষ্যৎ সময়ের জন্য দ্বিভাষিক আপডেট তৈরি করুন।", "Create a bilingual update for now or a future time.")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label={pick("বাংলা শিরোনাম", "Bangla title")}><Input value={form.titleBn} onChange={(event) => setForm({ ...form, titleBn: event.target.value })} /></Field><Field label={pick("ইংরেজি শিরোনাম", "English title")}><Input value={form.titleEn} onChange={(event) => setForm({ ...form, titleEn: event.target.value })} /></Field><Field label={pick("বিভাগ", "Category")}><Native value={form.category} onChange={(value) => setForm({ ...form, category: value as NotificationCategory })} options={categories.map((item) => [item, pickPair(locale, categoryLabels[item])])} /></Field><Field label={pick("গুরুত্ব", "Severity")}><Native value={form.severity} onChange={(value) => setForm({ ...form, severity: value as NotificationSeverity })} options={(["info", "success", "warning", "urgent"] as NotificationSeverity[]).map((item) => [item, pickPair(locale, severityLabels[item])])} /></Field><Field label={pick("বাংলা বার্তা", "Bangla message")} wide><Textarea rows={4} value={form.messageBn} onChange={(event) => setForm({ ...form, messageBn: event.target.value })} /></Field><Field label={pick("ইংরেজি বার্তা", "English message")} wide><Textarea rows={4} value={form.messageEn} onChange={(event) => setForm({ ...form, messageEn: event.target.value })} /></Field><Field label={pick("ভেতরের লিংক", "Internal action link")}><Input value={form.actionUrl} onChange={(event) => setForm({ ...form, actionUrl: event.target.value })} placeholder="/events" /></Field><Field label={pick("প্রকাশের সময়", "Publish time")}><Input type="datetime-local" value={form.scheduledFor} onChange={(event) => setForm({ ...form, scheduledFor: event.target.value })} /></Field><Field label={pick("মেয়াদ শেষ", "Expires at")}><Input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>{pick("বাতিল", "Cancel")}</Button><Button onClick={() => void createNotification()} disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}{pick("প্রকাশ করুন", "Publish")}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>{pick("নোটিফিকেশন পছন্দ", "Notification preferences")}</DialogTitle><DialogDescription>{pick("কোন ধরনের in-app update দেখতে চান তা বেছে নিন। Email, SMS ও push delivery provider পরবর্তী ধাপে যুক্ত হবে।", "Choose the in-app updates you want. Email, SMS, and push delivery providers will be connected in a later phase.")}</DialogDescription></DialogHeader>{preferences ? <div className="space-y-4"><Preference checked={preferences.in_app_enabled} onChange={(checked) => setPreferences({ ...preferences, in_app_enabled: checked })} label={pick("In-app নোটিফিকেশন চালু", "Enable in-app notifications")} />{([['family_announcements', pick("পারিবারিক ঘোষণা", "Family announcements")], ['membership_updates', pick("সদস্য আপডেট", "Membership updates")], ['event_reminders', pick("ইভেন্ট রিমাইন্ডার", "Event reminders")], ['qurbani_updates', pick("কোরবানি আপডেট", "Qurbani updates")], ['health_reminders', pick("স্বাস্থ্য রিমাইন্ডার", "Health reminders")], ['finance_reminders', pick("অর্থব্যবস্থা রিমাইন্ডার", "Finance reminders")], ['governance_updates', pick("ভোট ও সিদ্ধান্ত", "Governance updates")], ['household_updates', pick("বাসা ব্যবস্থাপনা", "Household updates")]] as Array<[keyof NotificationPreferences, string]>).map(([key, label]) => <Preference key={key} checked={Boolean(preferences[key])} onChange={(checked) => setPreferences({ ...preferences, [key]: checked })} label={label} />)}<div className="grid gap-4 sm:grid-cols-3"><Field label={pick("সারাংশ", "Digest")}><Native value={preferences.digest_frequency} onChange={(value) => setPreferences({ ...preferences, digest_frequency: value as NotificationDigest })} options={(["instant", "daily", "weekly", "off"] as NotificationDigest[]).map((item) => [item, pickPair(locale, digestLabels[item])])} /></Field><Field label={pick("নীরব সময় শুরু", "Quiet hours start")}><Input type="time" value={preferences.quiet_hours_start ?? ""} onChange={(event) => setPreferences({ ...preferences, quiet_hours_start: event.target.value || null })} /></Field><Field label={pick("নীরব সময় শেষ", "Quiet hours end")}><Input type="time" value={preferences.quiet_hours_end ?? ""} onChange={(event) => setPreferences({ ...preferences, quiet_hours_end: event.target.value || null })} /></Field></div></div> : null}<DialogFooter><Button variant="outline" onClick={() => setPreferencesOpen(false)}>{pick("বাতিল", "Cancel")}</Button><Button onClick={() => void savePreferences()} disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}{pick("সংরক্ষণ করুন", "Save preferences")}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) { return <Card className="rounded-2xl shadow-none"><CardContent className="flex items-center gap-4 p-4"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card>; }
function Native({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-40 rounded-xl border bg-background px-3 text-sm">{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>; }
function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) { return <div className={`space-y-2 ${wide ? "sm:col-span-2" : ""}`}><Label>{label}</Label>{children}</div>; }
function Preference({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) { return <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-[var(--primary)]" /></label>; }
