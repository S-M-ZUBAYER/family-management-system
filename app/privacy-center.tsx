"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Clock3, Download, FileKey2, LoaderCircle, LockKeyhole, Plus, Search, Settings2, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useActionFeedback } from "@/components/action-modal-provider";
import { useLocale, type AppLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DirectoryVisibility, PrivacyConsent, PrivacyPayload, PrivacyPolicy, PrivacyRequest, PrivacyRequestStatus, PrivacyRequestType } from "@/lib/privacy-types";

const requestTypes: PrivacyRequestType[] = ["access_export", "correction", "deletion", "restriction"];
const requestStatuses: PrivacyRequestStatus[] = ["pending", "in_review", "approved", "completed", "rejected", "cancelled"];
const typeLabels: Record<PrivacyRequestType, [string, string]> = { access_export: ["তথ্যের কপি/এক্সপোর্ট", "Data copy/export"], correction: ["তথ্য সংশোধন", "Data correction"], deletion: ["তথ্য মুছে ফেলা", "Data deletion"], restriction: ["ব্যবহার সীমিত করা", "Restrict processing"] };
const statusLabels: Record<PrivacyRequestStatus, [string, string]> = { pending: ["অপেক্ষমাণ", "Pending"], in_review: ["পর্যালোচনায়", "In review"], approved: ["অনুমোদিত", "Approved"], completed: ["সম্পন্ন", "Completed"], rejected: ["প্রত্যাখ্যাত", "Rejected"], cancelled: ["বাতিল", "Cancelled"] };
const visibilityLabels: Record<DirectoryVisibility, [string, string]> = { family: ["পরিবারের সদস্য", "Family members"], admins_only: ["শুধু অ্যাডমিন", "Admins only"], hidden: ["লুকানো", "Hidden"] };
const pair = (locale: AppLocale, value: [string, string]) => locale === "bn" ? value[0] : value[1];
const emptyRequest = { requestType: "access_export" as PrivacyRequestType, subject: "", details: "" };

export function PrivacyCenter() {
  const { locale, pick } = useLocale();
  const [, setFeedback] = useActionFeedback();
  const [payload, setPayload] = useState<PrivacyPayload>({});
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState(""), [statusFilter, setStatusFilter] = useState("all");
  const [consentOpen, setConsentOpen] = useState(false), [policyOpen, setPolicyOpen] = useState(false), [requestOpen, setRequestOpen] = useState(false);
  const [selected, setSelected] = useState<PrivacyRequest | null>(null), [form, setForm] = useState(emptyRequest);
  const [consent, setConsent] = useState<PrivacyConsent | null>(null), [policy, setPolicy] = useState<PrivacyPolicy | null>(null);
  const [review, setReview] = useState({ status: "in_review" as PrivacyRequestStatus, adminResponse: "", assignedToName: "" });
  const date = useMemo(() => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { dateStyle: "medium", timeStyle: "short" }), [locale]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/privacy", { cache: "no-store" }); const data = await response.json() as PrivacyPayload;
      if (data.code === "FAMILY_SETUP_REQUIRED") { setPayload(data); return; }
      if (!response.ok) throw new Error(data.error ?? pick("Privacy Center লোড হয়নি।", "Privacy Center could not be loaded."));
      setPayload(data); setConsent(data.consent ?? null); setPolicy(data.policy ?? null);
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("Privacy Center লোড হয়নি।", "Privacy Center could not be loaded.")); }
    finally { setLoading(false); }
  }, [pick, setFeedback]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const requests = useMemo(() => payload.requests ?? [], [payload.requests]);
  const visible = useMemo(() => requests.filter((item) => {
    const needle = query.trim().toLowerCase();
    return (statusFilter === "all" || item.status === statusFilter) && (!needle || `${item.subject} ${item.details} ${item.requested_by_name} ${item.admin_response ?? ""}`.toLowerCase().includes(needle));
  }), [query, requests, statusFilter]);
  const openCount = requests.filter((item) => ["pending", "in_review", "approved"].includes(item.status)).length;
  const completedCount = requests.filter((item) => item.status === "completed").length;

  async function saveConsent() {
    if (!consent) return; setSaving(true);
    try {
      const response = await fetch("/api/privacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_consent", directoryVisibility: consent.directory_visibility, showEmailToFamily: consent.show_email_to_family, showPhoneToFamily: consent.show_phone_to_family, allowEmergencyAccess: consent.allow_emergency_access, allowFamilyAnalytics: consent.allow_family_analytics }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? pick("Privacy পছন্দ সংরক্ষণ হয়নি।", "Privacy choices could not be saved."));
      setConsentOpen(false); await load(); setFeedback(pick("Privacy পছন্দ সংরক্ষিত হয়েছে।", "Privacy choices saved."));
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("Privacy পছন্দ সংরক্ষণ হয়নি।", "Privacy choices could not be saved.")); }
    finally { setSaving(false); }
  }

  async function savePolicy() {
    if (!policy) return; setSaving(true);
    try {
      const response = await fetch("/api/privacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_policy", privacyNoticeBn: policy.privacy_notice_bn, privacyNoticeEn: policy.privacy_notice_en, recordRetentionDays: policy.record_retention_days, inactiveMemberRetentionDays: policy.inactive_member_retention_days, allowMemberDataRequests: policy.allow_member_data_requests }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? pick("Privacy policy সংরক্ষণ হয়নি।", "Privacy policy could not be saved."));
      setPolicyOpen(false); await load(); setFeedback(pick("Family privacy policy সংরক্ষিত হয়েছে।", "Family privacy policy saved."));
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("Privacy policy সংরক্ষণ হয়নি।", "Privacy policy could not be saved.")); }
    finally { setSaving(false); }
  }

  async function createRequest() {
    if (!form.subject.trim() || !form.details.trim()) { setFeedback(pick("বিষয় ও বিস্তারিত লিখুন।", "Enter a subject and details.")); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/privacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_request", ...form }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? pick("অনুরোধ জমা হয়নি।", "Request could not be submitted."));
      setRequestOpen(false); setForm(emptyRequest); await load(); setFeedback(pick("Data-rights অনুরোধ জমা হয়েছে।", "Data-rights request submitted."));
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("অনুরোধ জমা হয়নি।", "Request could not be submitted.")); }
    finally { setSaving(false); }
  }

  function openReview(item: PrivacyRequest) { setSelected(item); setReview({ status: item.status === "pending" ? "in_review" : item.status, adminResponse: item.admin_response ?? "", assignedToName: item.assigned_to_name ?? "" }); }
  async function updateRequest(item: PrivacyRequest, values: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch("/api/privacy", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, ...values }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? pick("অনুরোধ হালনাগাদ হয়নি।", "Request could not be updated."));
      setSelected(null); await load(); setFeedback(pick("Privacy অনুরোধ হালনাগাদ হয়েছে।", "Privacy request updated."));
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("অনুরোধ হালনাগাদ হয়নি।", "Request could not be updated.")); }
    finally { setSaving(false); }
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = visible.map((item) => ({ [pick("ধরন", "Type")]: pair(locale, typeLabels[item.request_type]), [pick("বিষয়", "Subject")]: item.subject, [pick("বিস্তারিত", "Details")]: item.details, [pick("আবেদনকারী", "Requester")]: item.requested_by_name, [pick("অবস্থা", "Status")]: pair(locale, statusLabels[item.status]), [pick("অ্যাডমিন উত্তর", "Admin response")]: item.admin_response ?? "", [pick("দায়িত্বপ্রাপ্ত", "Assigned to")]: item.assigned_to_name ?? "", [pick("তৈরির সময়", "Created at")]: item.created_at, [pick("সমাধানের সময়", "Resolved at")]: item.resolved_at ?? "" }));
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), pick("Privacy অনুরোধ", "Privacy Requests")); XLSX.writeFile(book, `${payload.family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-privacy-requests.xlsx`); setFeedback(pick("Privacy XLSX তৈরি হয়েছে।", "The privacy XLSX was created."));
    } catch { setFeedback(pick("XLSX তৈরি হয়নি।", "The XLSX could not be created.")); }
    finally { setExporting(false); }
  }

  if (loading) return <main className="grid min-h-[calc(100vh-4rem)] place-items-center"><LoaderCircle className="size-7 animate-spin text-primary" /></main>;
  if (payload.code === "FAMILY_SETUP_REQUIRED") return <main className="grid min-h-[calc(100vh-4rem)] place-items-center p-6 text-center"><div><LockKeyhole className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{pick("ফ্যামিলি অ্যাক্সেস প্রয়োজন", "Family access required")}</h1><Button asChild className="mt-4"><a href="/setup">{pick("ফ্যামিলিতে যোগ দিন", "Join a family")}</a></Button></div></main>;

  return <main className="mx-auto w-full max-w-[1450px] space-y-5 px-4 py-5 md:px-7 md:py-7">
    <section className="overflow-hidden rounded-3xl bg-[linear-gradient(125deg,#172554_0%,#164e63_55%,#115e59_100%)] p-5 text-white shadow-xl md:p-7"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><p className="flex items-center gap-2 text-sm text-cyan-100"><LockKeyhole className="size-4" /> {pick("আপনার তথ্য, আপনার নিয়ন্ত্রণ", "Your data, your control")}</p><h1 className="mt-2 text-2xl font-bold md:text-4xl">{pick("Privacy ও Data Rights", "Privacy & Data Rights")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">{pick("কে আপনার তথ্য দেখবে তা নিয়ন্ত্রণ করুন এবং তথ্যের কপি, সংশোধন, সীমাবদ্ধতা বা মুছে ফেলার অনুরোধ পরিচালনা করুন।", "Control who can see your information and manage requests for a copy, correction, restriction, or deletion of your data.")}</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setConsentOpen(true)} disabled={payload.migrationRequired}><UserRoundCheck /> {pick("আমার পছন্দ", "My choices")}</Button>{payload.permissions?.canManage ? <Button variant="secondary" onClick={() => setPolicyOpen(true)} disabled={payload.migrationRequired}><Settings2 /> {pick("নীতি", "Policy")}</Button> : null}<Button variant="secondary" onClick={() => void exportXlsx()} disabled={exporting || !visible.length}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} XLSX</Button><Button className="bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={() => setRequestOpen(true)} disabled={payload.migrationRequired || payload.policy?.allow_member_data_requests === false}><Plus /> {pick("নতুন অনুরোধ", "New request")}</Button></div></div></section>

    {payload.migrationRequired ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">{pick("Privacy Center চালু করতে Supabase SQL Editor-এ", "To activate Privacy Center, run")} <b>supabase/migrations/20260930_family_privacy_center.sql</b> {pick("চালান।", "in the Supabase SQL Editor.")}</div> : null}

    <section className="grid gap-4 sm:grid-cols-3"><Metric icon={<FileKey2 />} label={pick("মোট অনুরোধ", "Total requests")} value={requests.length} /><Metric icon={<Clock3 />} label={pick("চলমান", "Open")} value={openCount} /><Metric icon={<CheckCircle2 />} label={pick("সম্পন্ন", "Completed")} value={completedCount} /></section>

    <Card className="rounded-3xl shadow-none"><CardContent className="grid gap-5 p-5 lg:grid-cols-[0.85fr_1.15fr]"><section className="rounded-2xl border bg-muted/25 p-5"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck /></span><div><h2 className="font-bold">{pick("পারিবারিক Privacy Notice", "Family privacy notice")}</h2><p className="text-sm text-muted-foreground">{payload.policy?.updated_at ? `${pick("হালনাগাদ", "Updated")}: ${date.format(new Date(payload.policy.updated_at))}` : pick("ডিফল্ট নীতি", "Default policy")}</p></div></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{locale === "bn" ? payload.policy?.privacy_notice_bn || payload.policy?.privacy_notice_en || "পরিবারের তথ্য শুধুমাত্র অনুমোদিত সদস্য ও দায়িত্বপ্রাপ্ত অ্যাডমিনরা প্রয়োজন অনুযায়ী ব্যবহার করবেন। সংবেদনশীল তথ্য অনুমতি ছাড়া শেয়ার করা যাবে না।" : payload.policy?.privacy_notice_en || payload.policy?.privacy_notice_bn || "Family data is used only by approved members and responsible administrators when needed. Sensitive information must not be shared without permission."}</p><div className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><Info label={pick("রেকর্ড সংরক্ষণ", "Record retention")} value={`${payload.policy?.record_retention_days ?? 3650} ${pick("দিন", "days")}`} /><Info label={pick("নিষ্ক্রিয় সদস্য", "Inactive member data")} value={`${payload.policy?.inactive_member_retention_days ?? 730} ${pick("দিন", "days")}`} /></div></section>
      <section><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick("বিষয়, বিস্তারিত বা সদস্য খুঁজুন", "Search subject, details, or member")} className="pl-9" /></div><Native value={statusFilter} onChange={setStatusFilter} options={[["all", pick("সব অবস্থা", "All statuses")], ...requestStatuses.map((item) => [item, pair(locale, statusLabels[item])])]} /></div><div className="mt-4 space-y-3">{visible.map((item) => <article key={item.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{pair(locale, typeLabels[item.request_type])}</Badge><Badge variant={item.status === "rejected" || item.status === "cancelled" ? "destructive" : item.status === "completed" ? "default" : "secondary"}>{pair(locale, statusLabels[item.status])}</Badge><span className="ml-auto text-xs text-muted-foreground">{date.format(new Date(item.created_at))}</span></div><h3 className="mt-3 font-bold">{item.subject}</h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.details}</p><div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">{item.requested_by_name}</span>{payload.permissions?.canManage ? <Button size="sm" variant="outline" className="ml-auto" onClick={() => openReview(item)}>{pick("পর্যালোচনা", "Review")}</Button> : item.is_mine && item.status === "pending" ? <Button size="sm" variant="outline" className="ml-auto" onClick={() => void updateRequest(item, { action: "cancel_request" })}>{pick("বাতিল করুন", "Cancel request")}</Button> : null}</div></article>)}{!visible.length ? <div className="rounded-2xl border border-dashed p-8 text-center"><FileKey2 className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-semibold">{pick("কোনো Privacy অনুরোধ পাওয়া যায়নি", "No privacy requests found")}</p></div> : null}</div></section>
    </CardContent></Card>

    <Dialog open={consentOpen} onOpenChange={setConsentOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>{pick("আমার Privacy পছন্দ", "My privacy choices")}</DialogTitle><DialogDescription>{pick("পরিবারের ভেতরে আপনার যোগাযোগ ও directory তথ্য কীভাবে দেখা যাবে তা নিয়ন্ত্রণ করুন।", "Control how your contact and directory information is shown inside the family.")}</DialogDescription></DialogHeader>{consent ? <div className="space-y-4"><Field label={pick("ডিরেক্টরি দৃশ্যমানতা", "Directory visibility")}><Native value={consent.directory_visibility} onChange={(value) => setConsent({ ...consent, directory_visibility: value as DirectoryVisibility })} options={(Object.keys(visibilityLabels) as DirectoryVisibility[]).map((item) => [item, pair(locale, visibilityLabels[item])])} /></Field><Preference checked={consent.show_email_to_family} onChange={(checked) => setConsent({ ...consent, show_email_to_family: checked })} label={pick("পরিবারকে email দেখান", "Show email to family")} /><Preference checked={consent.show_phone_to_family} onChange={(checked) => setConsent({ ...consent, show_phone_to_family: checked })} label={pick("পরিবারকে phone দেখান", "Show phone to family")} /><Preference checked={consent.allow_emergency_access} onChange={(checked) => setConsent({ ...consent, allow_emergency_access: checked })} label={pick("জরুরি অবস্থায় health/contact access", "Emergency health/contact access")} /><Preference checked={consent.allow_family_analytics} onChange={(checked) => setConsent({ ...consent, allow_family_analytics: checked })} label={pick("নামবিহীন family analytics", "Anonymous family analytics")} /></div> : null}<DialogFooter><Button variant="outline" onClick={() => setConsentOpen(false)}>{pick("বাতিল", "Cancel")}</Button><Button onClick={() => void saveConsent()} disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}{pick("সংরক্ষণ করুন", "Save choices")}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={requestOpen} onOpenChange={setRequestOpen}><DialogContent className="rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>{pick("Data-rights অনুরোধ", "Data-rights request")}</DialogTitle><DialogDescription>{pick("এই অনুরোধ একটি tracked workflow তৈরি করবে; তথ্য তাৎক্ষণিকভাবে মুছে যাবে না।", "This creates a tracked review workflow; data is not deleted immediately.")}</DialogDescription></DialogHeader><div className="space-y-4"><Field label={pick("অনুরোধের ধরন", "Request type")}><Native value={form.requestType} onChange={(value) => setForm({ ...form, requestType: value as PrivacyRequestType })} options={requestTypes.map((item) => [item, pair(locale, typeLabels[item])])} /></Field><Field label={pick("বিষয়", "Subject")}><Input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></Field><Field label={pick("বিস্তারিত", "Details")}><Textarea rows={6} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setRequestOpen(false)}>{pick("বাতিল", "Cancel")}</Button><Button onClick={() => void createRequest()} disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}{pick("জমা দিন", "Submit request")}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={policyOpen} onOpenChange={setPolicyOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl"><DialogHeader><DialogTitle>{pick("পারিবারিক গোপনীয়তা নীতি", "Family Privacy Policy")}</DialogTitle><DialogDescription>{pick("Notice এবং retention defaults নির্ধারণ করুন। Policy পরিবর্তন audit log-এ থাকবে।", "Set the notice and retention defaults. Policy changes are recorded in the audit log.")}</DialogDescription></DialogHeader>{policy ? <div className="grid gap-4 sm:grid-cols-2"><Field label={pick("বাংলা Privacy Notice", "Bangla privacy notice")} wide><Textarea rows={6} value={policy.privacy_notice_bn ?? ""} onChange={(event) => setPolicy({ ...policy, privacy_notice_bn: event.target.value })} /></Field><Field label={pick("ইংরেজি Privacy Notice", "English privacy notice")} wide><Textarea rows={6} value={policy.privacy_notice_en ?? ""} onChange={(event) => setPolicy({ ...policy, privacy_notice_en: event.target.value })} /></Field><Field label={pick("রেকর্ড রাখার দিন", "Record retention days")}><Input type="number" min={30} max={36500} value={policy.record_retention_days} onChange={(event) => setPolicy({ ...policy, record_retention_days: Number(event.target.value) })} /></Field><Field label={pick("নিষ্ক্রিয় সদস্যের তথ্য রাখার দিন", "Inactive member retention days")}><Input type="number" min={30} max={36500} value={policy.inactive_member_retention_days} onChange={(event) => setPolicy({ ...policy, inactive_member_retention_days: Number(event.target.value) })} /></Field><Preference checked={policy.allow_member_data_requests} onChange={(checked) => setPolicy({ ...policy, allow_member_data_requests: checked })} label={pick("নতুন data-rights request গ্রহণ করুন", "Accept new data-rights requests")} /></div> : null}<DialogFooter><Button variant="outline" onClick={() => setPolicyOpen(false)}>{pick("বাতিল", "Cancel")}</Button><Button onClick={() => void savePolicy()} disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}{pick("Policy সংরক্ষণ", "Save policy")}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>{selected?.subject}</DialogTitle><DialogDescription>{selected ? `${pair(locale, typeLabels[selected.request_type])} · ${selected.requested_by_name}` : ""}</DialogDescription></DialogHeader>{selected ? <div className="space-y-4"><div className="rounded-xl bg-muted p-4 text-sm leading-6">{selected.details}</div>{selected.admin_response ? <div className="rounded-xl border p-4 text-sm"><b>{pick("বর্তমান উত্তর", "Current response")}:</b><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{selected.admin_response}</p></div> : null}{!["completed", "rejected", "cancelled"].includes(selected.status) ? <><Field label={pick("অবস্থা", "Status")}><Native value={review.status} onChange={(value) => setReview({ ...review, status: value as PrivacyRequestStatus })} options={requestStatuses.filter((item) => item !== "cancelled").map((item) => [item, pair(locale, statusLabels[item])])} /></Field><Field label={pick("দায়িত্বপ্রাপ্ত", "Assigned to")}><Input value={review.assignedToName} onChange={(event) => setReview({ ...review, assignedToName: event.target.value })} /></Field><Field label={pick("অ্যাডমিনের উত্তর", "Admin response")}><Textarea rows={5} value={review.adminResponse} onChange={(event) => setReview({ ...review, adminResponse: event.target.value })} /></Field></> : null}</div> : null}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>{pick("বন্ধ করুন", "Close")}</Button>{selected && !["completed", "rejected", "cancelled"].includes(selected.status) ? <Button onClick={() => void updateRequest(selected, { action: "review_request", ...review })} disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}{pick("হালনাগাদ", "Update request")}</Button> : null}</DialogFooter></DialogContent></Dialog>
  </main>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) { return <Card className="rounded-2xl shadow-none"><CardContent className="flex items-center gap-4 p-4"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border bg-background p-3"><span className="text-muted-foreground">{label}</span><b className="mt-1 block">{value}</b></div>; }
function Native({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<[string, string]> }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full min-w-40 rounded-xl border bg-background px-3 text-sm">{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>; }
function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) { return <div className={`space-y-2 ${wide ? "sm:col-span-2" : ""}`}><Label>{label}</Label>{children}</div>; }
function Preference({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) { return <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-[var(--primary)]" /></label>; }
