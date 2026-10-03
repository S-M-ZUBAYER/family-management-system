"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Database, Download, Eye, KeyRound, LoaderCircle, Search, UserCheck, UserRoundPlus, X } from "lucide-react";

import { useActionFeedback } from "@/components/action-modal-provider";
import { useLocale, type AppLocale } from "@/components/locale-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Applicant = {
  id: string;
  name: string;
  english: string;
  relation: string;
  sponsor: string;
  email: string;
  phone: string;
  requestedRole: string;
  submitted: string;
  submittedRaw: string;
  initials: string;
  duplicate: boolean;
};

type ApiMemberRequest = {
  id: string;
  requested_name_bn: string;
  requested_name_en: string | null;
  relationship_text: string;
  sponsor_name: string | null;
  email: string | null;
  phone: string | null;
  requested_role: string;
  duplicate_hint: boolean;
  created_at: string;
};

type ApprovalPayload = {
  family?: { id: string; name_bn: string; name_en: string; join_code: string } | null;
  requests?: ApiMemberRequest[];
  metrics?: { pending: number; duplicates: number; approvedThisMonth: number };
  code?: string;
  error?: string;
};

function applicantFromApi(request: ApiMemberRequest, locale: AppLocale): Applicant {
  const name = request.requested_name_bn;
  return {
    id: request.id,
    name,
    english: request.requested_name_en ?? "",
    relation: request.relationship_text,
    sponsor: request.sponsor_name ?? (locale === "bn" ? "সরাসরি আবেদন" : "Direct request"),
    email: request.email ?? "",
    phone: request.phone ?? "",
    requestedRole: request.requested_role === "manager" ? (locale === "bn" ? "ম্যানেজার" : "Manager") : (locale === "bn" ? "সাধারণ সদস্য" : "Member"),
    submitted: new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.created_at)),
    submittedRaw: request.created_at,
    initials: name.trim().slice(0, 2),
    duplicate: request.duplicate_hint,
  };
}

export function MemberApprovals() {
  const { locale, pick } = useLocale();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [family, setFamily] = useState<ApprovalPayload["family"]>(null);
  const [metrics, setMetrics] = useState({ pending: 0, duplicates: 0, approvedThisMonth: 0 });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Applicant | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [dataSource, setDataSource] = useState<"loading" | "postgresql" | "error">("loading");
  const [reviewing, setReviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [, setFeedback] = useActionFeedback();

  const visibleApplicants = useMemo(() => applicants.filter((applicant) => {
    const matchesQuery = `${applicant.name} ${applicant.english} ${applicant.relation} ${applicant.sponsor} ${applicant.email} ${applicant.phone}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === "all" || applicant.duplicate);
  }), [applicants, filter, query]);

  const loadRequests = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/member-requests", { cache: "no-store", signal });
      const payload = await response.json() as ApprovalPayload;
      if (payload.code === "MEMBER_REQUESTS_ROW_LIMIT") throw new Error(pick("সদস্য আবেদনের কোনো অংশ ২০,০০০ সারির সীমা ছাড়িয়েছে। অসম্পূর্ণ আবেদন বা XLSX তথ্য দেখানো হয়নি।", "One section of member requests exceeds 20,000 rows. No partial approvals or XLSX data was shown."));
      if (!response.ok) throw new Error(payload.error ?? pick("সদস্য আবেদন লোড করা যায়নি।", "Could not load member requests."));
      const rows = (payload.requests ?? []).map((request) => applicantFromApi(request, locale));
      setApplicants(rows);
      setFamily(payload.family ?? null);
      setMetrics(payload.metrics ?? { pending: rows.length, duplicates: rows.filter((item) => item.duplicate).length, approvedThisMonth: 0 });
      setDataSource("postgresql");
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        setApplicants([]);
        setFamily(null);
        setMetrics({ pending: 0, duplicates: 0, approvedThisMonth: 0 });
        setSelected(null);
        setDataSource("error");
      }
      throw error;
    }
  }, [locale, pick]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadRequests(controller.signal)).catch((error: unknown) => {
      if ((error as { name?: string }).name === "AbortError") return;
      setDataSource("error");
      setFeedback(error instanceof Error ? error.message : pick("সদস্য আবেদন লোড করা যায়নি।", "Could not load member requests."));
    });
    return () => controller.abort();
  }, [loadRequests, pick, setFeedback]);

  const completeReview = useCallback(async (id: string, decision: "approve" | "reject", reason?: string) => {
    setReviewing(true);
    try {
      const response = await fetch(`/api/member-requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, rejectionReason: reason?.trim() || undefined }),
      });
      if (response.status === 499) return { cancelled: true };
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? pick("যাচাইয়ের সিদ্ধান্ত সংরক্ষণ করা যায়নি।", "Could not save the review decision."));
      setApplicants((items) => items.filter((item) => item.id !== id));
      setMetrics((current) => ({ ...current, pending: Math.max(0, current.pending - 1), duplicates: Math.max(0, current.duplicates - (applicants.find((item) => item.id === id)?.duplicate ? 1 : 0)), approvedThisMonth: current.approvedThisMonth + (decision === "approve" ? 1 : 0) }));
      setSelected(null);
      setRejectionReason("");
      return { requestId: id, decision, status: "completed", persisted: true };
    } finally {
      setReviewing(false);
    }
  }, [applicants, pick]);

  async function exportRequests() {
    if (!visibleApplicants.length) {
      setFeedback(pick("Export করার মতো অপেক্ষমাণ আবেদন নেই।", "There are no pending requests to export."));
      return;
    }
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(visibleApplicants.map((item) => ({
        [pick("বাংলা নাম", "Bangla name")]: item.name,
        [pick("ইংরেজি নাম", "English name")]: item.english,
        [pick("সম্পর্ক", "Relationship")]: item.relation,
        [pick("রেফারেন্স", "Reference")]: item.sponsor,
        [pick("ইমেইল", "Email")]: item.email,
        [pick("ফোন", "Phone")]: item.phone,
        [pick("চাওয়া ভূমিকা", "Requested role")]: item.requestedRole,
        [pick("সম্ভাব্য ডুপ্লিকেট", "Possible duplicate")]: item.duplicate ? pick("হ্যাঁ", "Yes") : pick("না", "No"),
        [pick("আবেদনের সময়", "Submitted at")]: item.submitted,
      })));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, pick("সদস্য আবেদন", "Member Requests"));
      XLSX.writeFile(book, `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-member-requests.xlsx`);
      setFeedback(pick("অপেক্ষমাণ সদস্য আবেদন XLSX-এ export হয়েছে।", "Pending member requests were exported to XLSX."));
    } catch {
      setFeedback(pick("XLSX export সম্পন্ন হয়নি।", "XLSX export could not be completed."));
    } finally {
      setExporting(false);
    }
  }

  async function copyJoinCode() {
    if (!family?.join_code) return;
    try {
      await navigator.clipboard.writeText(family.join_code);
      setFeedback(pick("ফ্যামিলি জয়েন কোড কপি হয়েছে।", "Family join code copied."));
    } catch {
      setFeedback(pick("জয়েন কোড কপি করা যায়নি। কোডটি নিজে কপি করুন।", "Could not copy the join code. Please copy it manually."));
    }
  }

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(modelContext.registerTool({
      name: "list_pending_member_requests",
      title: "List pending family members",
      description: "Read pending family membership requests from the live approval queue.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({ source: dataSource, count: applicants.length, requests: applicants.map(({ id, name, english, relation, duplicate }) => ({ id, name, english, relation, duplicate })) }),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [applicants, dataSource]);

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><UserCheck className="size-4" /> {pick("Family Admin কার্যপ্রবাহ", "Family Admin workflow")}</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{pick("সদস্য অনুমোদন কেন্দ্র", "Member approval center")}</h1><p className="mt-1 max-w-2xl text-muted-foreground">{pick("শুধু আপনার পরিবারের live আবেদন যাচাই করুন, existing profile-এর সঙ্গে মিলিয়ে তারপর প্রবেশাধিকার দিন।", "Review only your family's live requests, compare them with existing profiles, and then grant access.")}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" className="gap-2 rounded-xl" disabled={exporting || !visibleApplicants.length} onClick={() => void exportRequests()}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} {pick("XLSX Export", "Export XLSX")}</Button><Button className="gap-2 rounded-xl" disabled={!family?.join_code} onClick={() => setInviteOpen(true)}><UserRoundPlus className="size-4" /> {pick("সদস্য আমন্ত্রণ", "Invite member")}</Button></div>
      </section>

      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${dataSource === "postgresql" ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-800 dark:text-emerald-200" : dataSource === "error" ? "border-rose-500/25 bg-rose-500/8 text-rose-800 dark:text-rose-200" : "border-amber-500/30 bg-amber-500/8 text-amber-800 dark:text-amber-200"}`}>{dataSource === "loading" ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" /> : <Database className="mt-0.5 size-4 shrink-0" />}<div><p className="font-semibold">{dataSource === "postgresql" ? pick("Live PostgreSQL সংযুক্ত", "Live PostgreSQL connected") : dataSource === "loading" ? pick("PostgreSQL data লোড হচ্ছে", "Loading PostgreSQL data") : pick("Live data লোড করা যায়নি", "Could not load live data")}</p>{dataSource === "error" ? <Button size="sm" variant="outline" className="mt-2 rounded-lg" onClick={() => { setDataSource("loading"); void loadRequests().catch((error: unknown) => { setDataSource("error"); setFeedback(error instanceof Error ? error.message : pick("আবার চেষ্টা করা যায়নি।", "Could not retry.")); }); }}>{pick("আবার চেষ্টা করুন", "Try again")}</Button> : null}</div></div>

      <section className="grid gap-4 sm:grid-cols-3">{[[pick("অপেক্ষমাণ আবেদন", "Pending requests"), metrics.pending.toLocaleString(locale === "bn" ? "bn-BD" : "en-US"), pick("Admin যাচাই প্রয়োজন", "Admin review required")], [pick("Duplicate সতর্কতা", "Duplicate warnings"), metrics.duplicates.toLocaleString(locale === "bn" ? "bn-BD" : "en-US"), pick("Existing profile মিলিয়ে দেখুন", "Compare with existing profiles")], [pick("এই মাসে অনুমোদিত", "Approved this month"), metrics.approvedThisMonth.toLocaleString(locale === "bn" ? "bn-BD" : "en-US"), pick("Live অনুমোদনের সংখ্যা", "Live approval count")]].map(([label, value, note]) => <Card key={label} className="rounded-2xl border-border/75 py-0 shadow-none"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card>)}</section>

      <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5"><div className="relative w-full md:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick("নাম, সম্পর্ক, email বা phone", "Name, relationship, email, or phone")} className="h-10 rounded-xl pl-10" /></div><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-full rounded-xl md:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{pick("সব অপেক্ষমাণ আবেদন", "All pending requests")}</SelectItem><SelectItem value="duplicate">{pick("Duplicate সতর্কতা", "Duplicate warnings")}</SelectItem></SelectContent></Select></div>
        <Table><TableHeader><TableRow className="bg-muted/35"><TableHead className="pl-5">{pick("আবেদনকারী", "Applicant")}</TableHead><TableHead>{pick("দাবিকৃত সম্পর্ক", "Claimed relationship")}</TableHead><TableHead>{pick("রেফারেন্স", "Reference")}</TableHead><TableHead>{pick("অবস্থা", "Status")}</TableHead><TableHead>{pick("সময়", "Time")}</TableHead><TableHead className="pr-5 text-right">{pick("কাজ", "Action")}</TableHead></TableRow></TableHeader><TableBody>{visibleApplicants.map((applicant) => <TableRow key={applicant.id}><TableCell className="pl-5"><div className="flex items-center gap-3"><Avatar className="size-9"><AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{applicant.initials}</AvatarFallback></Avatar><div><p className="font-semibold">{locale === "en" ? applicant.english || applicant.name : applicant.name}</p><p className="text-xs text-muted-foreground">{locale === "en" ? applicant.name : applicant.english || applicant.email}</p></div></div></TableCell><TableCell>{applicant.relation}</TableCell><TableCell>{applicant.sponsor}</TableCell><TableCell>{applicant.duplicate ? <Badge variant="outline" className="border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-300">{pick("Duplicate যাচাই", "Duplicate check")}</Badge> : <Badge variant="secondary">{pick("যাচাই অপেক্ষমাণ", "Pending review")}</Badge>}</TableCell><TableCell className="text-muted-foreground">{applicant.submitted}</TableCell><TableCell className="pr-5 text-right"><Button variant="ghost" size="sm" className="gap-2 rounded-xl" onClick={() => { setSelected(applicant); setRejectionReason(""); }}><Eye className="size-4" /> {pick("যাচাই", "Review")}</Button></TableCell></TableRow>)}</TableBody></Table>
        {!visibleApplicants.length ? <div className="px-6 py-14 text-center text-sm text-muted-foreground">{dataSource === "loading" ? pick("আবেদন লোড হচ্ছে…", "Loading requests…") : pick("এই filter-এ কোনো অপেক্ষমাণ আবেদন নেই।", "There are no pending requests in this filter.")}</div> : null}
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setRejectionReason(""); } }}><DialogContent className="rounded-3xl sm:max-w-lg"><DialogHeader><DialogTitle>{pick("সদস্য আবেদন যাচাই", "Review member request")}</DialogTitle><DialogDescription>{pick("সম্পর্ক, existing profile এবং family reference নিশ্চিত করুন।", "Confirm the relationship, existing profile, and family reference.")}</DialogDescription></DialogHeader>{selected ? <div className="space-y-4 py-2"><div className="flex items-center gap-4 rounded-2xl bg-muted/55 p-4"><Avatar className="size-12"><AvatarFallback className="bg-primary text-primary-foreground">{selected.initials}</AvatarFallback></Avatar><div><p className="text-lg font-bold">{locale === "en" ? selected.english || selected.name : selected.name}</p><p className="text-sm text-muted-foreground">{locale === "en" ? selected.name : selected.english}</p></div></div><dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-3 text-sm"><dt className="text-muted-foreground">{pick("সম্পর্ক", "Relationship")}</dt><dd className="font-medium">{selected.relation}</dd><dt className="text-muted-foreground">{pick("রেফারেন্স", "Reference")}</dt><dd className="font-medium">{selected.sponsor}</dd><dt className="text-muted-foreground">Email</dt><dd className="break-all font-medium">{selected.email || "—"}</dd><dt className="text-muted-foreground">{pick("ফোন", "Phone")}</dt><dd className="font-medium">{selected.phone || "—"}</dd><dt className="text-muted-foreground">{pick("আবেদিত ভূমিকা", "Requested role")}</dt><dd className="font-medium">{selected.requestedRole}</dd><dt className="text-muted-foreground">{pick("Duplicate যাচাই", "Duplicate check")}</dt><dd className="font-medium">{selected.duplicate ? pick("সম্ভাব্য profile পাওয়া গেছে", "A possible profile was found") : pick("কোনো মিল নেই", "No match found")}</dd></dl><div className="space-y-2"><Label htmlFor="rejection-reason">{pick("প্রত্যাখ্যান করলে কারণ লিখুন", "Provide a reason when rejecting")}</Label><Textarea id="rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} placeholder={pick("আবেদনকারীকে দেখানোর সংক্ষিপ্ত কারণ", "A brief reason to show the applicant")} /></div></div> : null}<DialogFooter className="gap-2 sm:justify-between"><Button variant="outline" className="gap-2 rounded-xl" disabled={reviewing || rejectionReason.trim().length < 3} onClick={() => selected && void completeReview(selected.id, "reject", rejectionReason).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("যাচাইয়ের সিদ্ধান্ত সংরক্ষণ করা যায়নি।", "Could not save the review decision.")))}><X className="size-4" /> {pick("প্রত্যাখ্যান", "Reject")}</Button><Button className="gap-2 rounded-xl" disabled={reviewing} onClick={() => selected && void completeReview(selected.id, "approve").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("যাচাইয়ের সিদ্ধান্ত সংরক্ষণ করা যায়নি।", "Could not save the review decision.")))}>{reviewing ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} {pick("সদস্য অনুমোদন", "Approve member")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}><DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle>{pick("পরিবারে নতুন সদস্য আমন্ত্রণ", "Invite a new family member")}</DialogTitle><DialogDescription>{pick("এই code শুধু বিশ্বস্ত পরিবারের সদস্যকে দিন। তিনি sign in করে আবেদন করবেন, তারপর Admin approval প্রয়োজন হবে।", "Share this code only with a trusted family member. They will sign in and request access, which still requires Admin approval.")}</DialogDescription></DialogHeader><div className="rounded-2xl border bg-muted/45 p-5 text-center"><KeyRound className="mx-auto size-7 text-primary" /><p className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{pick("ফ্যামিলি জয়েন কোড", "Family join code")}</p><p className="mt-2 font-mono text-2xl font-black tracking-[0.2em]">{family?.join_code ?? "—"}</p></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setInviteOpen(false)}>{pick("বন্ধ করুন", "Close")}</Button><Button className="gap-2 rounded-xl" onClick={() => void copyJoinCode()}><Copy className="size-4" /> {pick("কোড কপি করুন", "Copy code")}</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
