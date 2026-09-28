"use client";

import { useActionFeedback } from "@/components/action-modal-provider";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  HandCoins,
  HeartHandshake,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  ReceiptText,
  ShieldCheck,
  Upload,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { WelfareContribution, WelfareDocument, WelfareExpense, WelfareFund, WelfarePayload, WelfarePledge, WelfareRequest } from "@/lib/welfare-types";

type CreateKind = "fund" | "contribution" | "expense" | "request" | "pledge";
type FormState = Record<string, string>;
const money = new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });
const dateLabel = new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium" });
const today = () => new Date().toISOString().slice(0, 10);
const num = (value: number | string | null | undefined) => Number(value ?? 0) || 0;
const titleByKind: Record<CreateKind, string> = { fund: "নতুন Welfare Fund", contribution: "Contribution জমা দিন", expense: "নতুন expense request", request: "সহায়তার আবেদন", pledge: "Recurring pledge" };
const categoryLabels: Record<string, string> = { general: "General welfare", emergency: "Emergency", medical: "Medical", education: "Education", charity: "Charity", livelihood: "Livelihood", operations: "Operations", other: "Other" };

function initialForm(kind: CreateKind, fundId = ""): FormState {
  if (kind === "fund") return { category: "general", visibility: "family", targetAmount: "0", openingBalance: "0" };
  if (kind === "contribution") return { fundId, amount: "", contributionDate: today(), paymentMethod: "cash" };
  if (kind === "expense") return { fundId, category: "other", amount: "", expenseDate: today(), paymentMethod: "cash" };
  if (kind === "request") return { fundId, requestType: "medical", requestedAmount: "", urgency: "normal", visibility: "admins" };
  return { fundId, frequency: "monthly", amount: "", startDate: today(), nextDueDate: today() };
}

export function WelfareCenter() {
  const [family, setFamily] = useState<WelfarePayload["family"]>();
  const [funds, setFunds] = useState<WelfareFund[]>([]);
  const [contributions, setContributions] = useState<WelfareContribution[]>([]);
  const [expenses, setExpenses] = useState<WelfareExpense[]>([]);
  const [requests, setRequests] = useState<WelfareRequest[]>([]);
  const [pledges, setPledges] = useState<WelfarePledge[]>([]);
  const [documents, setDocuments] = useState<WelfareDocument[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [kind, setKind] = useState<CreateKind | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState<FormState>({ documentType: "receipt", visibility: "admins" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/welfare", { cache: "no-store" });
      const payload = await response.json() as WelfarePayload;
      if (payload.code === "FAMILY_SETUP_REQUIRED") { setSetupRequired(true); return; }
      if (!response.ok) throw new Error(payload.error ?? "Welfare Fund data load হয়নি।");
      setFamily(payload.family); setFunds(payload.funds ?? []); setContributions(payload.contributions ?? []); setExpenses(payload.expenses ?? []); setRequests(payload.requests ?? []); setPledges(payload.pledges ?? []); setDocuments(payload.documents ?? []);
      setCanManage(Boolean(payload.permissions?.canManage)); setMigrationRequired(Boolean(payload.migrationRequired)); setSetupRequired(false);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Welfare Fund load হয়নি।"); }
    finally { setLoading(false); }
  }, [setFeedback]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const approvedIncome = useMemo(() => contributions.filter((item) => item.status === "approved").reduce((sum, item) => sum + num(item.amount), 0), [contributions]);
  const paidExpense = useMemo(() => expenses.filter((item) => item.status === "paid").reduce((sum, item) => sum + num(item.amount), 0), [expenses]);
  const openingBalance = useMemo(() => funds.reduce((sum, item) => sum + num(item.opening_balance), 0), [funds]);
  const balance = openingBalance + approvedIncome - paidExpense;
  const pendingApprovals = contributions.filter((item) => item.status === "pending").length + expenses.filter((item) => item.status === "pending").length + requests.filter((item) => ["submitted", "under_review"].includes(item.status)).length;
  const myPledge = pledges.filter((item) => item.is_mine && item.status === "active").reduce((sum, item) => sum + num(item.amount), 0);

  function openCreate(nextKind: CreateKind) {
    setKind(nextKind);
    setForm(initialForm(nextKind, funds.find((item) => item.status === "active")?.id ?? ""));
  }

  async function postAction(action: string, data: Record<string, unknown>) {
    const response = await fetch("/api/welfare/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Record save হয়নি।");
  }

  async function createRecord() {
    if (!kind) return;
    setSaving(true);
    try {
      await postAction(`create_${kind}`, form);
      setKind(null); await load(); setFeedback(`${titleByKind[kind]} সফলভাবে save হয়েছে।`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Record save হয়নি।"); }
    finally { setSaving(false); }
  }

  async function changeStatus(entity: string, id: string, status: string, extra: Record<string, unknown> = {}) {
    setSaving(true);
    try { await postAction("update_status", { entity, id, status, ...extra }); await load(); setFeedback(`Status ${status.replaceAll("_", " ")} হয়েছে।`); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Status update হয়নি।"); }
    finally { setSaving(false); }
  }

  const uploadTargets = useMemo(() => [
    ...(canManage ? funds.map((item) => ({ value: `fund:${item.id}`, label: `Fund · ${item.name}` })) : []),
    ...contributions.filter((item) => canManage || item.is_mine).map((item) => ({ value: `contribution:${item.id}`, label: `Contribution · ${item.contributor_name} · ${money.format(num(item.amount))}` })),
    ...(canManage ? expenses.map((item) => ({ value: `expense:${item.id}`, label: `Expense · ${item.title}` })) : []),
    ...requests.filter((item) => canManage || item.is_mine).map((item) => ({ value: `request:${item.id}`, label: `Request · ${item.title}` })),
  ], [canManage, contributions, expenses, funds, requests]);

  async function uploadDocument() {
    if (!uploadFile || !uploadForm.target) { setFeedback("Document এবং linked record নির্বাচন করুন।"); return; }
    const [entityType, entityId] = uploadForm.target.split(":");
    const body = new FormData(); body.set("file", uploadFile); body.set("entityType", entityType); body.set("entityId", entityId); body.set("documentType", uploadForm.documentType || "other"); body.set("title", uploadForm.title || uploadFile.name); body.set("visibility", uploadForm.visibility || "admins");
    setSaving(true);
    try {
      const response = await fetch("/api/welfare/upload", { method: "POST", body }); const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Document upload হয়নি।");
      setUploadOpen(false); setUploadFile(null); setUploadForm({ documentType: "receipt", visibility: "admins" }); await load(); setFeedback("Receipt/document private vault-এ save হয়েছে।");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Document upload হয়নি।"); }
    finally { setSaving(false); }
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx"); const workbook = XLSX.utils.book_new();
      const add = (name: string, rows: Array<Record<string, unknown>>) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
      add("Funds", funds.map((item) => ({ Fund: item.name, Category: item.category, Target: num(item.target_amount), "Opening balance": num(item.opening_balance), Status: item.status, Visibility: item.visibility })));
      add("Contributions", contributions.map((item) => ({ Date: item.contribution_date, Fund: fundName(funds, item.fund_id), Contributor: item.contributor_name, Amount: num(item.amount), Method: item.payment_method, Reference: item.reference ?? "", Status: item.status, Approved: item.approved_by_name ?? "", Notes: item.notes ?? "" })));
      add("Expenses", expenses.map((item) => ({ Date: item.expense_date, Fund: fundName(funds, item.fund_id), Title: item.title, Beneficiary: item.beneficiary_name ?? "", Category: item.category, Amount: num(item.amount), Method: item.payment_method, Reference: item.reference ?? "", Status: item.status, Approved: item.approved_by_name ?? "", Notes: item.notes ?? "" })));
      add("Assistance Requests", requests.map((item) => ({ Date: item.created_at, Requester: item.requester_name, Type: item.request_type, Title: item.title, Requested: num(item.requested_amount), Approved: num(item.approved_amount), Urgency: item.urgency, Visibility: item.visibility, Status: item.status, "Admin note": item.admin_note ?? "" })));
      add("Pledges", pledges.map((item) => ({ Member: item.member_name, Fund: fundName(funds, item.fund_id), Frequency: item.frequency, Amount: num(item.amount), Start: item.start_date, "Next due": item.next_due_date ?? "", Status: item.status, Notes: item.notes ?? "" })));
      add("Documents", documents.map((item) => ({ Title: item.title, Type: item.document_type, "Linked record": `${item.entity_type}:${item.entity_id}`, File: item.file_name, Visibility: item.visibility, Uploader: item.uploaded_by_name, Date: item.created_at })));
      XLSX.writeFile(workbook, `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-welfare-fund.xlsx`);
    } finally { setExporting(false); }
  }

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(modelContext.registerTool({ name: "get_family_welfare_summary", title: "Get family welfare fund summary", description: "Read a privacy-safe summary of visible family welfare funds, approved totals and the signed-in member's own pledge.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input: unknown) { if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input as object).length) throw new Error("No input fields are accepted."); return { totalBalance: balance, approvedContributions: approvedIncome, paidExpenses: paidExpense, activeFunds: funds.filter((item) => item.status === "active").map((item) => ({ name: item.name, category: item.category })), myActivePledge: myPledge }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [approvedIncome, balance, funds, myPledge, paidExpense]);

  if (loading) return <main className="grid min-h-[calc(100vh-4rem)] place-items-center"><LoaderCircle className="size-7 animate-spin text-primary" /></main>;
  if (setupRequired) return <main className="mx-auto max-w-3xl p-6 md:p-10"><Empty icon={<Users />} title="Family access সক্রিয় নয়" text="Join code দিয়ে আবেদন করুন। Admin approval-এর পর Welfare Fund ব্যবহার করা যাবে।" action={<Button asChild className="rounded-xl"><a href="/setup">Family onboarding</a></Button>} /></main>;

  return <main className="mx-auto w-full max-w-[1550px] space-y-5 px-4 py-5 md:px-7 md:py-7">
    <section className="overflow-hidden rounded-3xl bg-[linear-gradient(125deg,#164e63_0%,#166534_55%,#854d0e_100%)] p-5 text-white shadow-xl md:p-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div className="max-w-2xl"><div className="flex items-center gap-2 text-sm text-emerald-100"><ShieldCheck className="size-4" /> Transparent family welfare</div><h1 className="mt-2 text-2xl font-bold tracking-tight md:text-4xl">Family Welfare Fund</h1><p className="mt-2 text-sm leading-6 text-white/75">Contribution, recurring pledge, সাহায্যের আবেদন, approval, expense ও receipts—একটি audited workspace-এ।</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" className="rounded-xl" onClick={() => void exportXlsx()} disabled={exporting}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} সব XLSX</Button><Button variant="secondary" className="rounded-xl" onClick={() => setUploadOpen(true)} disabled={migrationRequired || !uploadTargets.length}><Upload className="size-4" /> Receipt</Button><Button className="rounded-xl bg-emerald-500 text-white hover:bg-emerald-600" onClick={() => openCreate("contribution")} disabled={migrationRequired || !funds.length}><HandCoins className="size-4" /> Contribution</Button></div></div>
    </section>
    {migrationRequired ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">Supabase SQL Editor-এ <b>supabase/migrations/20260927_family_welfare_fund.sql</b> চালালে Welfare Fund data সক্রিয় হবে।</div> : null}
    {feedback ? <div className="flex items-start justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm"><span>{feedback}</span><Button size="icon-xs" variant="ghost" onClick={() => setFeedback(null)}><X /></Button></div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<WalletCards />} label="বর্তমান balance" value={money.format(balance)} note={`${funds.filter((item) => item.status === "active").length} active funds`} tone="emerald" /><Metric icon={<ArrowUpRight />} label="Approved collection" value={money.format(approvedIncome)} note={`${contributions.filter((item) => item.status === "approved").length} verified entries`} /><Metric icon={<ArrowDownRight />} label="Paid assistance" value={money.format(paidExpense)} note={`${expenses.filter((item) => item.status === "paid").length} disbursements`} tone="amber" /><Metric icon={<Clock3 />} label="Pending review" value={String(pendingApprovals)} note={canManage ? "Admin action needed" : `My pledge ${money.format(myPledge)}`} tone="rose" /></section>

    <section className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]"><Card className="rounded-3xl shadow-none"><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Fund portfolio</CardTitle><p className="mt-1 text-sm text-muted-foreground">Purpose, target ও available balance</p></div>{canManage ? <Button size="sm" className="rounded-xl" onClick={() => openCreate("fund")} disabled={migrationRequired}><Plus className="size-4" /> Fund</Button> : null}</CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{funds.map((fund) => <FundCard key={fund.id} fund={fund} contributions={contributions} expenses={expenses} canManage={canManage} saving={saving} onStatus={(status) => void changeStatus("fund", fund.id, status)} />)}{!funds.length ? <div className="md:col-span-2"><Empty icon={<HeartHandshake />} title="এখনও Welfare Fund নেই" text={canManage ? "প্রথম fund তৈরি করে collection শুরু করুন।" : "Family Admin fund তৈরি করলে এখানে দেখা যাবে।"} action={canManage && !migrationRequired ? <Button onClick={() => openCreate("fund")} className="rounded-xl"><Plus /> প্রথম fund</Button> : undefined} /></div> : null}</CardContent></Card>
      <Card className="rounded-3xl shadow-none"><CardHeader><CardTitle>Governance & privacy</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><Governance icon={<CheckCircle2 />} title="Approval-based ledger" text="Contribution ও expense approval ছাড়া balance-এ যোগ হয় না।" /><Governance icon={<LockKeyhole />} title="Confidential request" text="সহায়তার আবেদন defaultভাবে শুধু admin team দেখে।" /><Governance icon={<ReceiptText />} title="Receipt vault" text="Proof documents private R2 storage-এ রাখা হয়।" /><Governance icon={<FileCheck2 />} title="Audit trail" text="প্রতিটি create, approve, reject ও disbursement log হয়।" /></CardContent></Card></section>

    <Tabs defaultValue="contributions" className="space-y-4"><TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-muted/70 p-1"><TabsTrigger value="contributions">Contributions</TabsTrigger><TabsTrigger value="requests">Assistance</TabsTrigger><TabsTrigger value="expenses">Expenses</TabsTrigger><TabsTrigger value="pledges">Pledges</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger></TabsList>
      <TabsContent value="contributions"><DataCard title="Contribution ledger" description="Member submissions, verification এবং refund history" action={<Button className="rounded-xl" onClick={() => openCreate("contribution")} disabled={!funds.length || migrationRequired}><Plus /> Contribution</Button>}><TableWrap><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Contributor</TableHead><TableHead>Fund</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader><TableBody>{contributions.map((item) => <TableRow key={item.id}><TableCell>{dateLabel.format(new Date(item.contribution_date))}</TableCell><TableCell><p className="font-semibold">{item.contributor_name}</p><p className="text-xs text-muted-foreground">{item.reference || "No reference"}</p></TableCell><TableCell>{fundName(funds, item.fund_id)}</TableCell><TableCell className="capitalize">{item.payment_method}</TableCell><TableCell className="font-bold text-emerald-700 dark:text-emerald-300">{money.format(num(item.amount))}</TableCell><TableCell><Status value={item.status} /></TableCell>{canManage ? <TableCell><Actions disabled={saving} items={item.status === "pending" ? [["Approve", () => void changeStatus("contribution", item.id, "approved")], ["Reject", () => void changeStatus("contribution", item.id, "rejected")]] : item.status === "approved" ? [["Refund", () => void changeStatus("contribution", item.id, "refunded")]] : []} /></TableCell> : null}</TableRow>)}<EmptyRows show={!contributions.length} columns={canManage ? 7 : 6} /></TableBody></Table></TableWrap></DataCard></TabsContent>
      <TabsContent value="requests"><DataCard title="Assistance requests" description="Sensitive requests, review, approval এবং disbursement" action={<Button className="rounded-xl" onClick={() => openCreate("request")} disabled={migrationRequired}><Plus /> আবেদন</Button>}><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{requests.map((item) => <RequestCard key={item.id} request={item} fund={funds.find((fund) => fund.id === item.fund_id)} canManage={canManage} saving={saving} onStatus={(status, extra) => void changeStatus("request", item.id, status, extra)} />)}{!requests.length ? <div className="md:col-span-2 xl:col-span-3"><Empty icon={<HeartHandshake />} title="কোনো সাহায্যের আবেদন নেই" text="Medical, education, emergency বা livelihood সহায়তার আবেদন করা যাবে।" /></div> : null}</div></DataCard></TabsContent>
      <TabsContent value="expenses"><DataCard title="Expense & disbursement ledger" description="Approved assistance, operations এবং payment trail" action={canManage ? <Button className="rounded-xl" onClick={() => openCreate("expense")} disabled={!funds.length || migrationRequired}><Plus /> Expense</Button> : undefined}><TableWrap><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Expense</TableHead><TableHead>Fund</TableHead><TableHead>Beneficiary</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader><TableBody>{expenses.map((item) => <TableRow key={item.id}><TableCell>{dateLabel.format(new Date(item.expense_date))}</TableCell><TableCell><p className="font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">{categoryLabels[item.category] ?? item.category}</p></TableCell><TableCell>{fundName(funds, item.fund_id)}</TableCell><TableCell>{item.beneficiary_name || "—"}</TableCell><TableCell className="font-bold">{money.format(num(item.amount))}</TableCell><TableCell><Status value={item.status} /></TableCell>{canManage ? <TableCell><Actions disabled={saving} items={item.status === "pending" ? [["Approve", () => void changeStatus("expense", item.id, "approved")], ["Reject", () => void changeStatus("expense", item.id, "rejected")]] : item.status === "approved" ? [["Mark paid", () => void changeStatus("expense", item.id, "paid")]] : []} /></TableCell> : null}</TableRow>)}<EmptyRows show={!expenses.length} columns={canManage ? 7 : 6} /></TableBody></Table></TableWrap></DataCard></TabsContent>
      <TabsContent value="pledges"><DataCard title="Recurring commitments" description="Monthly, quarterly, yearly এবং one-time promises" action={<Button className="rounded-xl" onClick={() => openCreate("pledge")} disabled={!funds.length || migrationRequired}><Plus /> Pledge</Button>}><TableWrap><Table><TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Fund</TableHead><TableHead>Frequency</TableHead><TableHead>Amount</TableHead><TableHead>Next due</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{pledges.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.member_name}</TableCell><TableCell>{fundName(funds, item.fund_id)}</TableCell><TableCell className="capitalize">{item.frequency.replaceAll("_", " ")}</TableCell><TableCell>{money.format(num(item.amount))}</TableCell><TableCell>{item.next_due_date ? dateLabel.format(new Date(item.next_due_date)) : "—"}</TableCell><TableCell><Status value={item.status} /></TableCell><TableCell><Actions disabled={saving} items={(item.is_mine || canManage) && item.status === "active" ? [["Pause", () => void changeStatus("pledge", item.id, "paused")], ["Cancel", () => void changeStatus("pledge", item.id, "cancelled")]] : (item.is_mine || canManage) && item.status === "paused" ? [["Resume", () => void changeStatus("pledge", item.id, "active")]] : []} /></TableCell></TableRow>)}<EmptyRows show={!pledges.length} columns={7} /></TableBody></Table></TableWrap></DataCard></TabsContent>
      <TabsContent value="documents"><DataCard title="Receipt & evidence vault" description="Access-controlled receipts, invoices, approval letters ও evidence" action={<Button className="rounded-xl" onClick={() => setUploadOpen(true)} disabled={!uploadTargets.length || migrationRequired}><Upload /> Upload</Button>}><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{documents.map((item) => <a key={item.id} href={`/api/welfare-document/${item.id}`} target="_blank" rel="noreferrer" className="rounded-2xl border p-4 transition hover:border-primary/40 hover:bg-muted/30"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></span><Badge variant="outline">{item.visibility}</Badge></div><p className="mt-3 font-semibold">{item.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.file_name}</p><p className="mt-3 text-xs text-muted-foreground">{item.document_type} · {item.uploaded_by_name} · {dateLabel.format(new Date(item.created_at))}</p></a>)}{!documents.length ? <div className="md:col-span-2 xl:col-span-3"><Empty icon={<ReceiptText />} title="কোনো document নেই" text="Contribution receipt, expense invoice বা request evidence upload করুন।" /></div> : null}</div></DataCard></TabsContent>
    </Tabs>

    <Dialog open={Boolean(kind)} onOpenChange={(open) => !open && setKind(null)}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl"><DialogHeader><DialogTitle>{kind ? titleByKind[kind] : "নতুন record"}</DialogTitle><DialogDescription>Required তথ্য দিয়ে secure family record তৈরি করুন।</DialogDescription></DialogHeader>{kind ? <CreateForm kind={kind} form={form} setForm={setForm} funds={funds} canManage={canManage} /> : null}<DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setKind(null)}>বাতিল</Button><Button className="rounded-xl" onClick={() => void createRecord()} disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}><DialogContent className="rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>Receipt / evidence upload</DialogTitle><DialogDescription>JPG, PNG, WebP, PDF বা Word; সর্বোচ্চ ১২ MB।</DialogDescription></DialogHeader><div className="grid gap-4"><Field label="Linked record"><SelectNative value={uploadForm.target ?? ""} onChange={(value) => setUploadForm((old) => ({ ...old, target: value }))} options={uploadTargets.map((item) => [item.value, item.label])} placeholder="Record নির্বাচন করুন" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Document type"><SelectNative value={uploadForm.documentType} onChange={(value) => setUploadForm((old) => ({ ...old, documentType: value }))} options={[["receipt", "Receipt"], ["invoice", "Invoice"], ["approval", "Approval"], ["evidence", "Evidence"], ["other", "Other"]]} /></Field>{canManage ? <Field label="Visibility"><SelectNative value={uploadForm.visibility} onChange={(value) => setUploadForm((old) => ({ ...old, visibility: value }))} options={[["admins", "Admins only"], ["family", "Whole family"]]} /></Field> : null}</div><Field label="Title"><Input value={uploadForm.title ?? ""} onChange={(event) => setUploadForm((old) => ({ ...old, title: event.target.value }))} placeholder="যেমন: March contribution receipt" /></Field><Field label="File"><Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></Field></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setUploadOpen(false)}>বাতিল</Button><Button className="rounded-xl" onClick={() => void uploadDocument()} disabled={saving || !uploadFile}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

function CreateForm({ kind, form, setForm, funds, canManage }: { kind: CreateKind; form: FormState; setForm: (value: FormState) => void; funds: WelfareFund[]; canManage: boolean }) {
  const update = (key: string, value: string) => setForm({ ...form, [key]: value });
  const input = (key: string, label: string, type = "text", props: Record<string, string> = {}) => <Field label={label}><Input type={type} value={form[key] ?? ""} onChange={(event) => update(key, event.target.value)} {...props} /></Field>;
  const select = (key: string, label: string, options: string[][]) => <Field label={label}><SelectNative value={form[key] ?? ""} onChange={(value) => update(key, value)} options={options} /></Field>;
  const fund = <Field label="Fund"><SelectNative value={form.fundId ?? ""} onChange={(value) => update("fundId", value)} options={funds.filter((item) => item.status === "active").map((item) => [item.id, item.name])} placeholder="Fund নির্বাচন করুন" /></Field>;
  const notes = <Field label={kind === "request" ? "প্রয়োজনের বিস্তারিত" : "Notes"}><Textarea value={form[kind === "request" ? "description" : "notes"] ?? ""} onChange={(event) => update(kind === "request" ? "description" : "notes", event.target.value)} rows={4} /></Field>;
  if (kind === "fund") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("name", "Fund name")}{select("category", "Category", [["general", "General"], ["emergency", "Emergency"], ["medical", "Medical"], ["education", "Education"], ["charity", "Charity"]])}{input("targetAmount", "Target amount", "number", { min: "0" })}{input("openingBalance", "Opening balance", "number", { min: "0" })}{select("visibility", "Visibility", [["family", "Whole family"], ["admins", "Admins only"]])}<div className="sm:col-span-2">{input("description", "Description")}</div></div>;
  if (kind === "contribution") return <div className="grid gap-4 py-2 sm:grid-cols-2">{fund}{canManage ? input("contributorName", "Contributor name (optional)") : null}{input("amount", "Amount", "number", { min: "1" })}{input("contributionDate", "Date", "date")}{select("paymentMethod", "Payment method", paymentOptions)}{input("reference", "Transaction reference")}<div className="sm:col-span-2">{notes}</div></div>;
  if (kind === "expense") return <div className="grid gap-4 py-2 sm:grid-cols-2">{fund}{input("title", "Expense title")}{input("beneficiaryName", "Beneficiary / vendor")}{select("category", "Category", [["medical", "Medical"], ["education", "Education"], ["emergency", "Emergency"], ["charity", "Charity"], ["operations", "Operations"], ["other", "Other"]])}{input("amount", "Amount", "number", { min: "1" })}{input("expenseDate", "Expense date", "date")}{select("paymentMethod", "Payment method", paymentOptions)}{input("reference", "Reference")}<div className="sm:col-span-2">{notes}</div></div>;
  if (kind === "request") return <div className="grid gap-4 py-2 sm:grid-cols-2">{fund}{select("requestType", "Request type", [["medical", "Medical"], ["education", "Education"], ["emergency", "Emergency"], ["livelihood", "Livelihood"], ["charity", "Charity"], ["other", "Other"]])}{input("title", "Request title")}{input("requestedAmount", "Requested amount", "number", { min: "1" })}{select("urgency", "Urgency", [["normal", "Normal"], ["high", "High"], ["critical", "Critical"]])}{select("visibility", "Privacy", [["admins", "Admins only"], ["family", "Family visible after approval"]])}<div className="sm:col-span-2">{notes}</div></div>;
  return <div className="grid gap-4 py-2 sm:grid-cols-2">{fund}{select("frequency", "Frequency", [["monthly", "Monthly"], ["quarterly", "Quarterly"], ["yearly", "Yearly"], ["one_time", "One time"]])}{input("amount", "Amount per cycle", "number", { min: "1" })}{input("startDate", "Start date", "date")}{input("nextDueDate", "Next due date", "date")}<div className="sm:col-span-2">{notes}</div></div>;
}

const paymentOptions = [["cash", "Cash"], ["bank", "Bank"], ["mobile", "Mobile banking"], ["card", "Card"], ["other", "Other"]];
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }
function SelectNative({ value, onChange, options, placeholder }: { value?: string; onChange: (value: string) => void; options: string[][]; placeholder?: string }) { return <select value={value ?? ""} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">{placeholder ? <option value="">{placeholder}</option> : null}{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>; }
function fundName(funds: WelfareFund[], id: string) { return funds.find((item) => item.id === id)?.name ?? "Restricted fund"; }
function Metric({ icon, label, value, note, tone = "blue" }: { icon: ReactNode; label: string; value: string; note: string; tone?: "blue" | "emerald" | "amber" | "rose" }) { const colors = { blue: "bg-sky-500/10 text-sky-700 dark:text-sky-300", emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300", rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300" }; return <Card className="rounded-2xl shadow-none"><CardContent className="flex items-start gap-4 p-5"><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${colors[tone]}`}>{icon}</span><div className="min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 truncate text-2xl font-black">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div></CardContent></Card>; }
function FundCard({ fund, contributions, expenses, canManage, saving, onStatus }: { fund: WelfareFund; contributions: WelfareContribution[]; expenses: WelfareExpense[]; canManage: boolean; saving: boolean; onStatus: (status: string) => void }) { const income = contributions.filter((item) => item.fund_id === fund.id && item.status === "approved").reduce((sum, item) => sum + num(item.amount), 0); const spent = expenses.filter((item) => item.fund_id === fund.id && item.status === "paid").reduce((sum, item) => sum + num(item.amount), 0); const available = num(fund.opening_balance) + income - spent; const progress = num(fund.target_amount) ? Math.min(100, ((num(fund.opening_balance) + income) / num(fund.target_amount)) * 100) : 0; return <article className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><Badge variant="secondary">{categoryLabels[fund.category]}</Badge><Status value={fund.status} /></div><h3 className="mt-3 text-lg font-bold">{fund.name}</h3></div>{canManage ? <Actions disabled={saving} items={fund.status === "active" ? [["Pause fund", () => onStatus("paused")], ["Close fund", () => onStatus("closed")]] : fund.status === "paused" ? [["Activate fund", () => onStatus("active")], ["Close fund", () => onStatus("closed")]] : []} /> : null}</div><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{fund.description || "Family welfare purpose fund"}</p><div className="mt-4 flex justify-between text-sm"><span>Available</span><strong>{money.format(available)}</strong></div>{num(fund.target_amount) ? <><Progress value={progress} className="mt-2" /><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{Math.round(progress)}%</span><span>Target {money.format(num(fund.target_amount))}</span></div></> : <p className="mt-2 text-xs text-muted-foreground">No fixed target</p>}</article>; }
function RequestCard({ request, fund, canManage, saving, onStatus }: { request: WelfareRequest; fund?: WelfareFund; canManage: boolean; saving: boolean; onStatus: (status: string, extra?: Record<string, unknown>) => void }) { const approve = (status: string) => { const value = window.prompt("Approved amount", String(num(request.approved_amount) || num(request.requested_amount))); if (value === null) return; const note = window.prompt("Admin note (optional)", request.admin_note ?? "") ?? ""; onStatus(status, { approvedAmount: value, adminNote: note }); }; return <article className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge variant={request.urgency === "critical" ? "destructive" : "secondary"}>{request.urgency}</Badge><Status value={request.status} /><Badge variant="outline">{request.visibility}</Badge></div>{canManage ? <Actions disabled={saving} items={request.status === "submitted" ? [["Start review", () => onStatus("under_review")], ["Approve", () => approve("approved")], ["Reject", () => onStatus("rejected", { adminNote: window.prompt("Reason", "") ?? "" })]] : request.status === "under_review" ? [["Approve", () => approve("approved")], ["Reject", () => onStatus("rejected", { adminNote: window.prompt("Reason", "") ?? "" })]] : request.status === "approved" ? [["Disburse", () => approve("disbursed")]] : []} /> : request.is_mine && ["submitted", "under_review"].includes(request.status) ? <Button size="sm" variant="ghost" onClick={() => onStatus("cancelled")}>Cancel</Button> : null}</div><p className="mt-3 text-xs text-muted-foreground">{request.requester_name} · {categoryLabels[request.request_type] ?? request.request_type}</p><h3 className="mt-1 font-bold">{request.title}</h3><p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{request.description}</p><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Requested</p><p className="mt-1 font-bold">{money.format(num(request.requested_amount))}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Approved</p><p className="mt-1 font-bold">{money.format(num(request.approved_amount))}</p></div></div><p className="mt-3 text-xs text-muted-foreground">{fund?.name ?? "Fund not assigned"}{request.admin_note ? ` · ${request.admin_note}` : ""}</p></article>; }
function Governance({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span><div><p className="font-semibold">{title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{text}</p></div></div>; }
function DataCard({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) { return <Card className="overflow-hidden rounded-3xl py-0 shadow-none"><CardHeader className="flex-row items-start justify-between gap-4 border-b p-5 md:p-6"><div><CardTitle>{title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</CardHeader><CardContent className="p-0">{children}</CardContent></Card>; }
function TableWrap({ children }: { children: ReactNode }) { return <div className="overflow-x-auto">{children}</div>; }
function Status({ value }: { value: string }) { const good = ["active", "approved", "paid", "disbursed", "completed"]; const bad = ["rejected", "refunded", "cancelled", "closed"]; return <Badge variant={bad.includes(value) ? "destructive" : good.includes(value) ? "secondary" : "outline"} className="capitalize">{value.replaceAll("_", " ")}</Badge>; }
function Actions({ items, disabled }: { items: Array<[string, () => void]>; disabled: boolean }) { if (!items.length) return null; return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={disabled}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{items.map(([label, action]) => <DropdownMenuItem key={label} onClick={action}>{label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>; }
function EmptyRows({ show, columns }: { show: boolean; columns: number }) { return show ? <TableRow><TableCell colSpan={columns} className="h-32 text-center text-muted-foreground">এখনও কোনো record নেই।</TableCell></TableRow> : null; }
function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) { return <div className="flex min-h-52 flex-col items-center justify-center p-6 text-center"><span className="text-muted-foreground/50">{icon}</span><h3 className="mt-3 font-bold">{title}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{text}</p>{action ? <div className="mt-4">{action}</div> : null}</div>; }
