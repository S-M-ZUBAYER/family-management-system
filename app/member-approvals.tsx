"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Database, Download, Eye, KeyRound, LoaderCircle, Search, UserCheck, UserRoundPlus, X } from "lucide-react";

import { useActionFeedback } from "@/components/action-modal-provider";
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
  error?: string;
};

const dateTime = new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium", timeStyle: "short" });

function applicantFromApi(request: ApiMemberRequest): Applicant {
  const name = request.requested_name_bn;
  return {
    id: request.id,
    name,
    english: request.requested_name_en ?? "",
    relation: request.relationship_text,
    sponsor: request.sponsor_name ?? "সরাসরি আবেদন",
    email: request.email ?? "",
    phone: request.phone ?? "",
    requestedRole: request.requested_role === "manager" ? "ম্যানেজার" : "সাধারণ সদস্য",
    submitted: dateTime.format(new Date(request.created_at)),
    submittedRaw: request.created_at,
    initials: name.trim().slice(0, 2),
    duplicate: request.duplicate_hint,
  };
}

export function MemberApprovals() {
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
    const response = await fetch("/api/member-requests", { cache: "no-store", signal });
    const payload = await response.json() as ApprovalPayload;
    if (!response.ok) throw new Error(payload.error ?? "সদস্য আবেদন লোড করা যায়নি।");
    const rows = (payload.requests ?? []).map(applicantFromApi);
    setApplicants(rows);
    setFamily(payload.family ?? null);
    setMetrics(payload.metrics ?? { pending: rows.length, duplicates: rows.filter((item) => item.duplicate).length, approvedThisMonth: 0 });
    setDataSource("postgresql");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadRequests(controller.signal)).catch((error: unknown) => {
      if ((error as { name?: string }).name === "AbortError") return;
      setDataSource("error");
      setFeedback(error instanceof Error ? error.message : "সদস্য আবেদন লোড করা যায়নি।");
    });
    return () => controller.abort();
  }, [loadRequests, setFeedback]);

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
      if (!response.ok) throw new Error(payload.error ?? "Review save করা যায়নি।");
      setApplicants((items) => items.filter((item) => item.id !== id));
      setMetrics((current) => ({ ...current, pending: Math.max(0, current.pending - 1), duplicates: Math.max(0, current.duplicates - (applicants.find((item) => item.id === id)?.duplicate ? 1 : 0)), approvedThisMonth: current.approvedThisMonth + (decision === "approve" ? 1 : 0) }));
      setSelected(null);
      setRejectionReason("");
      return { requestId: id, decision, status: "completed", persisted: true };
    } finally {
      setReviewing(false);
    }
  }, [applicants]);

  async function exportRequests() {
    if (!applicants.length) {
      setFeedback("Export করার মতো pending আবেদন নেই।");
      return;
    }
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(applicants.map((item) => ({ "নাম (বাংলা)": item.name, "Name (English)": item.english, সম্পর্ক: item.relation, Reference: item.sponsor, Email: item.email, Phone: item.phone, "Requested role": item.requestedRole, "Duplicate warning": item.duplicate ? "Yes" : "No", "Submitted at": item.submittedRaw })));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Pending members");
      XLSX.writeFile(book, `${family?.name_en || "family"}-member-requests.xlsx`);
      setFeedback("Pending member requests XLSX export হয়েছে।");
    } catch {
      setFeedback("XLSX export সম্পন্ন হয়নি।");
    } finally {
      setExporting(false);
    }
  }

  async function copyJoinCode() {
    if (!family?.join_code) return;
    try {
      await navigator.clipboard.writeText(family.join_code);
      setFeedback("Family join code copy হয়েছে।");
    } catch {
      setFeedback("Join code copy করা যায়নি। কোডটি manually copy করুন।");
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
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><UserCheck className="size-4" /> Family Admin workflow</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">সদস্য অনুমোদন কেন্দ্র</h1><p className="mt-1 max-w-2xl text-muted-foreground">শুধু আপনার পরিবারের live আবেদন যাচাই করুন, existing profile-এর সঙ্গে মিলিয়ে তারপর access দিন।</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" className="gap-2 rounded-xl" disabled={exporting || !applicants.length} onClick={() => void exportRequests()}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} XLSX Export</Button><Button className="gap-2 rounded-xl" disabled={!family?.join_code} onClick={() => setInviteOpen(true)}><UserRoundPlus className="size-4" /> সদস্য আমন্ত্রণ</Button></div>
      </section>

      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${dataSource === "postgresql" ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-800 dark:text-emerald-200" : dataSource === "error" ? "border-rose-500/25 bg-rose-500/8 text-rose-800 dark:text-rose-200" : "border-amber-500/30 bg-amber-500/8 text-amber-800 dark:text-amber-200"}`}>{dataSource === "loading" ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" /> : <Database className="mt-0.5 size-4 shrink-0" />}<div><p className="font-semibold">{dataSource === "postgresql" ? "Live PostgreSQL সংযুক্ত" : dataSource === "loading" ? "PostgreSQL data লোড হচ্ছে" : "Live data লোড করা যায়নি"}</p>{dataSource === "error" ? <Button size="sm" variant="outline" className="mt-2 rounded-lg" onClick={() => { setDataSource("loading"); void loadRequests().catch((error: unknown) => { setDataSource("error"); setFeedback(error instanceof Error ? error.message : "আবার চেষ্টা করা যায়নি।"); }); }}>আবার চেষ্টা করুন</Button> : null}</div></div>

      <section className="grid gap-4 sm:grid-cols-3">{[["অপেক্ষমাণ আবেদন", metrics.pending.toLocaleString("bn-BD"), "Admin review প্রয়োজন"], ["Duplicate সতর্কতা", metrics.duplicates.toLocaleString("bn-BD"), "Existing profile মিলিয়ে দেখুন"], ["এই মাসে অনুমোদিত", metrics.approvedThisMonth.toLocaleString("bn-BD"), "Live approval count"]].map(([label, value, note]) => <Card key={label} className="rounded-2xl border-border/75 py-0 shadow-none"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card>)}</section>

      <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5"><div className="relative w-full md:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="নাম, সম্পর্ক, email বা phone" className="h-10 rounded-xl pl-10" /></div><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-full rounded-xl md:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">সব pending আবেদন</SelectItem><SelectItem value="duplicate">Duplicate সতর্কতা</SelectItem></SelectContent></Select></div>
        <Table><TableHeader><TableRow className="bg-muted/35"><TableHead className="pl-5">আবেদনকারী</TableHead><TableHead>দাবিকৃত সম্পর্ক</TableHead><TableHead>Reference</TableHead><TableHead>অবস্থা</TableHead><TableHead>সময়</TableHead><TableHead className="pr-5 text-right">Action</TableHead></TableRow></TableHeader><TableBody>{visibleApplicants.map((applicant) => <TableRow key={applicant.id}><TableCell className="pl-5"><div className="flex items-center gap-3"><Avatar className="size-9"><AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{applicant.initials}</AvatarFallback></Avatar><div><p className="font-semibold">{applicant.name}</p><p className="text-xs text-muted-foreground">{applicant.english || applicant.email}</p></div></div></TableCell><TableCell>{applicant.relation}</TableCell><TableCell>{applicant.sponsor}</TableCell><TableCell>{applicant.duplicate ? <Badge variant="outline" className="border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-300">Duplicate check</Badge> : <Badge variant="secondary">Pending review</Badge>}</TableCell><TableCell className="text-muted-foreground">{applicant.submitted}</TableCell><TableCell className="pr-5 text-right"><Button variant="ghost" size="sm" className="gap-2 rounded-xl" onClick={() => { setSelected(applicant); setRejectionReason(""); }}><Eye className="size-4" /> যাচাই</Button></TableCell></TableRow>)}</TableBody></Table>
        {!visibleApplicants.length ? <div className="px-6 py-14 text-center text-sm text-muted-foreground">{dataSource === "loading" ? "আবেদন লোড হচ্ছে…" : "এই filter-এ কোনো pending আবেদন নেই।"}</div> : null}
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setRejectionReason(""); } }}><DialogContent className="rounded-3xl sm:max-w-lg"><DialogHeader><DialogTitle>সদস্য আবেদন যাচাই</DialogTitle><DialogDescription>Relationship, existing profile এবং family reference নিশ্চিত করুন।</DialogDescription></DialogHeader>{selected ? <div className="space-y-4 py-2"><div className="flex items-center gap-4 rounded-2xl bg-muted/55 p-4"><Avatar className="size-12"><AvatarFallback className="bg-primary text-primary-foreground">{selected.initials}</AvatarFallback></Avatar><div><p className="text-lg font-bold">{selected.name}</p><p className="text-sm text-muted-foreground">{selected.english}</p></div></div><dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-3 text-sm"><dt className="text-muted-foreground">সম্পর্ক</dt><dd className="font-medium">{selected.relation}</dd><dt className="text-muted-foreground">Reference</dt><dd className="font-medium">{selected.sponsor}</dd><dt className="text-muted-foreground">Email</dt><dd className="break-all font-medium">{selected.email || "—"}</dd><dt className="text-muted-foreground">Phone</dt><dd className="font-medium">{selected.phone || "—"}</dd><dt className="text-muted-foreground">Requested role</dt><dd className="font-medium">{selected.requestedRole}</dd><dt className="text-muted-foreground">Duplicate check</dt><dd className="font-medium">{selected.duplicate ? "সম্ভাব্য profile পাওয়া গেছে" : "কোনো match নেই"}</dd></dl><div className="space-y-2"><Label htmlFor="rejection-reason">Reject করলে কারণ লিখুন</Label><Textarea id="rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} placeholder="আবেদনকারীকে দেখানোর সংক্ষিপ্ত কারণ" /></div></div> : null}<DialogFooter className="gap-2 sm:justify-between"><Button variant="outline" className="gap-2 rounded-xl" disabled={reviewing || rejectionReason.trim().length < 3} onClick={() => selected && void completeReview(selected.id, "reject", rejectionReason).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Review save করা যায়নি।"))}><X className="size-4" /> Reject</Button><Button className="gap-2 rounded-xl" disabled={reviewing} onClick={() => selected && void completeReview(selected.id, "approve").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Review save করা যায়নি।"))}>{reviewing ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Approve member</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}><DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle>পরিবারে নতুন সদস্য আমন্ত্রণ</DialogTitle><DialogDescription>এই code শুধু বিশ্বস্ত পরিবারের সদস্যকে দিন। তিনি sign in করে আবেদন করবেন, তারপর Admin approval প্রয়োজন হবে।</DialogDescription></DialogHeader><div className="rounded-2xl border bg-muted/45 p-5 text-center"><KeyRound className="mx-auto size-7 text-primary" /><p className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Family join code</p><p className="mt-2 font-mono text-2xl font-black tracking-[0.2em]">{family?.join_code ?? "—"}</p></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setInviteOpen(false)}>বন্ধ করুন</Button><Button className="gap-2 rounded-xl" onClick={() => void copyJoinCode()}><Copy className="size-4" /> Code copy করুন</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
