"use client";

import { useActionFeedback } from "@/components/action-modal-provider";
import { useLocale, type AppLocale } from "@/components/locale-provider";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
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
  Pencil,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  WalletCards,
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
import { canDeleteWelfareDocument } from "@/lib/welfare-document-policy";
import { welfareDocumentErrorCopy } from "@/lib/welfare-document-action-copy";
import { welfareErrorCopy } from "@/lib/welfare-error-copy";
import { welfareLedger } from "@/lib/welfare-ledger";
import { welfareMoney } from "@/lib/welfare-validation";
import { welfareExportHeaders, type WelfareExportSheet } from "@/lib/welfare-export-headers";
import type { WelfareContribution, WelfareDocument, WelfareExpense, WelfareFund, WelfarePayload, WelfarePledge, WelfareRequest } from "@/lib/welfare-types";

type CreateKind = "fund" | "contribution" | "expense" | "request" | "pledge";
type WelfareEditable = WelfareFund | WelfareContribution | WelfareExpense | WelfareRequest | WelfarePledge;
type FormState = Record<string, string>;
const today = () => { const value = new Date(); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 10); };
const num = (value: number | string | null | undefined) => Number(value ?? 0) || 0;
const titleByKindBn: Record<CreateKind, string> = { fund: "নতুন কল্যাণ তহবিল", contribution: "অনুদান জমা দিন", expense: "নতুন ব্যয়ের অনুরোধ", request: "সহায়তার আবেদন", pledge: "পুনরাবৃত্ত অঙ্গীকার" };
const titleByKindEn: Record<CreateKind, string> = { fund: "New Welfare Fund", contribution: "Submit Contribution", expense: "New Expense Request", request: "Assistance Request", pledge: "Recurring Pledge" };
const categoryLabels: Record<string, string> = { general: "General welfare", emergency: "Emergency", medical: "Medical", education: "Education", charity: "Charity", livelihood: "Livelihood", operations: "Operations", other: "Other" };
const categoryLabelsBn: Record<string, string> = { general: "সাধারণ কল্যাণ", emergency: "জরুরি", medical: "চিকিৎসা", education: "শিক্ষা", charity: "দান", livelihood: "জীবিকা", operations: "পরিচালনা", other: "অন্যান্য" };
const valueLabelsBn: Record<string, string> = { cash: "নগদ", bank: "ব্যাংক", mobile: "মোবাইল ব্যাংকিং", card: "কার্ড", other: "অন্যান্য", monthly: "মাসিক", quarterly: "ত্রৈমাসিক", yearly: "বার্ষিক", one_time: "এককালীন", admins: "শুধু অ্যাডমিন", family: "পুরো পরিবার", normal: "সাধারণ", high: "উচ্চ", critical: "সংকটপূর্ণ", receipt: "রসিদ", invoice: "চালান", approval: "অনুমোদন", evidence: "প্রমাণ" };
const valueLabelsEn: Record<string, string> = { cash: "Cash", bank: "Bank", mobile: "Mobile banking", card: "Card", one_time: "One time", admins: "Admins only", family: "Whole family" };
const recordLabelsBn: Record<string, string> = { fund: "তহবিল", contribution: "অনুদান", expense: "ব্যয়", request: "আবেদন", pledge: "অঙ্গীকার" };
const statusLabelsBn: Record<string, string> = { active: "সক্রিয়", approved: "অনুমোদিত", paid: "পরিশোধিত", disbursed: "বিতরণ করা", completed: "সম্পন্ন", rejected: "প্রত্যাখ্যাত", refunded: "ফেরত দেওয়া", cancelled: "বাতিল", closed: "বন্ধ", pending: "অপেক্ষমাণ", submitted: "জমা দেওয়া", under_review: "পর্যালোচনাধীন", paused: "স্থগিত" };
function welfareValueLabel(value: string, locale: AppLocale) {
  if (locale === "bn") return categoryLabelsBn[value] ?? valueLabelsBn[value] ?? statusLabelsBn[value] ?? recordLabelsBn[value] ?? value;
  return categoryLabels[value] ?? valueLabelsEn[value] ?? value.replaceAll("_", " ");
}

function initialForm(kind: CreateKind, fundId = ""): FormState {
  if (kind === "fund") return { category: "general", visibility: "family", targetAmount: "0", openingBalance: "0" };
  if (kind === "contribution") return { fundId, amount: "", contributionDate: today(), paymentMethod: "cash" };
  if (kind === "expense") return { fundId, category: "other", amount: "", expenseDate: today(), paymentMethod: "cash" };
  if (kind === "request") return { fundId, requestType: "medical", requestedAmount: "", urgency: "normal", visibility: "admins" };
  return { fundId, frequency: "monthly", amount: "", startDate: today(), nextDueDate: today() };
}

export function WelfareCenter() {
  const { locale, pick } = useLocale();
  const money = useMemo(() => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0, maximumFractionDigits: 2 }), [locale]);
  const dateLabel = useMemo(() => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { dateStyle: "medium" }), [locale]);
  const countLabel = useMemo(() => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD"), [locale]);
  const titleByKind = locale === "bn" ? titleByKindBn : titleByKindEn;
  const [family, setFamily] = useState<WelfarePayload["family"]>();
  const [funds, setFunds] = useState<WelfareFund[]>([]);
  const [contributions, setContributions] = useState<WelfareContribution[]>([]);
  const [expenses, setExpenses] = useState<WelfareExpense[]>([]);
  const [requests, setRequests] = useState<WelfareRequest[]>([]);
  const [pledges, setPledges] = useState<WelfarePledge[]>([]);
  const [documents, setDocuments] = useState<WelfareDocument[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [, setFeedback] = useActionFeedback();
  const [kind, setKind] = useState<CreateKind | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ id: string; kind: CreateKind } | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState<FormState>({ documentType: "receipt", visibility: "admins" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setLoadError(null);
    const clearLoadedWelfare = () => {
      setFamily(undefined); setFunds([]); setContributions([]); setExpenses([]); setRequests([]); setPledges([]); setDocuments([]);
      setCanManage(false); setMigrationRequired(false);
    };
    try {
      const response = await fetch("/api/welfare", { cache: "no-store" });
      const payload = await response.json() as WelfarePayload;
      if (version !== loadVersion.current) return;
      if (payload.code === "FAMILY_SETUP_REQUIRED") { clearLoadedWelfare(); setSetupRequired(true); return; }
      if (payload.code === "WELFARE_ROW_LIMIT") throw new Error(pick("কল্যাণ তহবিলের একটি বিভাগে ২০,০০০-এর বেশি রেকর্ড আছে। অসম্পূর্ণ হিসাব দেখানো হয়নি; পৃষ্ঠা-ভিত্তিক এক্সপোর্টের জন্য সাপোর্টে যোগাযোগ করুন।", "A Welfare Fund section has more than 20,000 records. No partial accounts were shown; contact support for a paged export."));
      if (!response.ok) throw new Error(payload.error ?? pick("কল্যাণ তহবিল লোড হয়নি।", "Welfare Fund could not be loaded."));
      welfareLedger(payload.funds ?? [], payload.contributions ?? [], payload.expenses ?? [], payload.pledges ?? []);
      setFamily(payload.family); setFunds(payload.funds ?? []); setContributions(payload.contributions ?? []); setExpenses(payload.expenses ?? []); setRequests(payload.requests ?? []); setPledges(payload.pledges ?? []); setDocuments(payload.documents ?? []);
      setCanManage(Boolean(payload.permissions?.canManage)); setMigrationRequired(Boolean(payload.migrationRequired)); setSetupRequired(false);
    } catch (error) {
      if (version !== loadVersion.current) return;
      clearLoadedWelfare(); setSetupRequired(false);
      const message = error instanceof RangeError ? pick("হিসাবের পরিমাণ বা মোটের সীমা সঠিক নয়। অসম্পূর্ণ ব্যালান্স দেখানো হয়নি; সাপোর্টে যোগাযোগ করুন।", "An amount or ledger total exceeds supported precision. No partial balance was shown; contact support.") : error instanceof Error ? error.message : pick("কল্যাণ তহবিল লোড হয়নি।", "Welfare Fund could not be loaded.");
      setLoadError(message); setFeedback(message);
    }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [pick, setFeedback]);

  useEffect(() => { queueMicrotask(() => void load()); return () => { loadVersion.current += 1; }; }, [load]);

  const { approvedIncome, paidExpense, balance, myPledge } = useMemo(() => welfareLedger(funds, contributions, expenses, pledges), [funds, contributions, expenses, pledges]);
  const pendingApprovals = contributions.filter((item) => item.status === "pending").length + expenses.filter((item) => item.status === "pending").length + requests.filter((item) => ["submitted", "under_review"].includes(item.status)).length;

  function documentIsDraft(item: WelfareDocument) {
    const parentStatus = item.entity_type === "fund" ? funds.find((fund) => fund.id === item.entity_id)?.status
      : item.entity_type === "contribution" ? contributions.find((contribution) => contribution.id === item.entity_id)?.status
      : item.entity_type === "expense" ? expenses.find((expense) => expense.id === item.entity_id)?.status
      : requests.find((request) => request.id === item.entity_id)?.status;
    return canDeleteWelfareDocument(item.entity_type, parentStatus ?? null);
  }

  function openCreate(nextKind: CreateKind) {
    setEditingRecord(null);
    setKind(nextKind);
    setForm(initialForm(nextKind, funds.find((item) => item.status === "active")?.id ?? ""));
  }

  function openEdit(nextKind: CreateKind, item: WelfareEditable) {
    const value = item as unknown as Record<string, unknown>;
    const forms: Record<CreateKind, FormState> = {
      fund: { name: String(value.name ?? ""), description: String(value.description ?? ""), category: String(value.category ?? "general"), targetAmount: String(value.target_amount ?? 0), openingBalance: String(value.opening_balance ?? 0), visibility: String(value.visibility ?? "family") },
      contribution: { fundId: String(value.fund_id ?? ""), contributorName: String(value.contributor_name ?? ""), amount: String(value.amount ?? ""), contributionDate: String(value.contribution_date ?? today()), paymentMethod: String(value.payment_method ?? "cash"), reference: String(value.reference ?? ""), notes: String(value.notes ?? "") },
      expense: { fundId: String(value.fund_id ?? ""), title: String(value.title ?? ""), beneficiaryName: String(value.beneficiary_name ?? ""), category: String(value.category ?? "other"), amount: String(value.amount ?? ""), expenseDate: String(value.expense_date ?? today()), paymentMethod: String(value.payment_method ?? "cash"), reference: String(value.reference ?? ""), notes: String(value.notes ?? "") },
      request: { fundId: String(value.fund_id ?? ""), requestType: String(value.request_type ?? "other"), title: String(value.title ?? ""), requestedAmount: String(value.requested_amount ?? ""), urgency: String(value.urgency ?? "normal"), visibility: String(value.visibility ?? "admins"), description: String(value.description ?? "") },
      pledge: { fundId: String(value.fund_id ?? ""), frequency: String(value.frequency ?? "monthly"), amount: String(value.amount ?? ""), startDate: String(value.start_date ?? today()), nextDueDate: String(value.next_due_date ?? ""), notes: String(value.notes ?? "") },
    };
    setEditingRecord({ id: item.id, kind: nextKind }); setKind(nextKind); setForm(forms[nextKind]);
  }

  async function postAction(action: string, data: Record<string, unknown>) {
    const response = await fetch("/api/welfare/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) });
    if (response.status === 499) return false;
    const payload = await response.json() as { code?: string; error?: string };
    if (!response.ok) throw new Error(welfareErrorCopy(payload.code, locale) ?? payload.error ?? pick("রেকর্ড সংরক্ষণ হয়নি।", "Could not save the record."));
    return true;
  }

  async function createRecord() {
    if (!kind) return;
    setSaving(true);
    try {
      if (editingRecord) {
        const response = await fetch("/api/welfare/records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, recordId: editingRecord.id, data: form }) });
        if (response.status === 499) return;
        const payload = await response.json() as { code?: string; error?: string }; if (!response.ok) throw new Error(welfareErrorCopy(payload.code, locale) ?? payload.error ?? pick("রেকর্ড হালনাগাদ হয়নি।", "Could not update the record."));
      } else if (!(await postAction(`create_${kind}`, form))) return;
      setKind(null); setEditingRecord(null); await load(); setFeedback(editingRecord ? pick("রেকর্ড হালনাগাদ হয়েছে।", "Record updated.") : pick("রেকর্ড সংরক্ষিত হয়েছে।", "Record saved."));
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("রেকর্ড সংরক্ষণ হয়নি।", "Could not save the record.")); }
    finally { setSaving(false); }
  }

  async function deleteRecord(recordKind: CreateKind, recordId: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/welfare/records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: recordKind, recordId }) });
      if (response.status === 499) return;
      const payload = await response.json() as { code?: string; error?: string };
      if (!response.ok) throw new Error(payload.code === "WELFARE_DOCUMENTS_ATTACHED"
        ? pick("এই খসড়া রেকর্ডের নথি আগে মুছুন।", "Remove this draft record's documents first.")
        : welfareErrorCopy(payload.code, locale) ?? payload.error ?? pick("রেকর্ড মুছতে ব্যর্থ হয়েছে।", "Could not delete the record."));
      await load();
      setFeedback(pick("রেকর্ড মুছে দেওয়া হয়েছে।", "Record deleted."));
    }
    catch (error) { setFeedback(error instanceof Error ? error.message : pick("রেকর্ড মুছতে ব্যর্থ হয়েছে।", "Could not delete the record.")); }
    finally { setSaving(false); }
  }

  async function changeStatus(entity: string, id: string, status: string, extra: Record<string, unknown> = {}) {
    setSaving(true);
    try { if (!(await postAction("update_status", { entity, id, status, ...extra }))) return; await load(); setFeedback(pick(`স্ট্যাটাস ${welfareValueLabel(status, "bn")} করা হয়েছে।`, `Status changed to ${welfareValueLabel(status, "en")}.`)); }
    catch (error) { setFeedback(error instanceof Error ? error.message : pick("স্ট্যাটাস হালনাগাদ হয়নি।", "Could not update the status.")); }
    finally { setSaving(false); }
  }

  const uploadTargets = useMemo(() => [
    ...(canManage ? funds.map((item) => ({ value: `fund:${item.id}`, label: `${pick("তহবিল", "Fund")} · ${item.name}` })) : []),
    ...contributions.filter((item) => canManage || item.is_mine).map((item) => ({ value: `contribution:${item.id}`, label: `${pick("অনুদান", "Contribution")} · ${item.contributor_name} · ${money.format(num(item.amount))}` })),
    ...(canManage ? expenses.map((item) => ({ value: `expense:${item.id}`, label: `${pick("ব্যয়", "Expense")} · ${item.title}` })) : []),
    ...requests.filter((item) => canManage || item.is_mine).map((item) => ({ value: `request:${item.id}`, label: `${pick("আবেদন", "Request")} · ${item.title}` })),
  ], [canManage, contributions, expenses, funds, money, pick, requests]);

  async function uploadDocument() {
    if (!uploadFile || !uploadForm.target) { setFeedback(pick("নথি এবং সংযুক্ত রেকর্ড নির্বাচন করুন।", "Select a document and linked record.")); return; }
    const [entityType, entityId] = uploadForm.target.split(":");
    const body = new FormData(); body.set("file", uploadFile); body.set("entityType", entityType); body.set("entityId", entityId); body.set("documentType", uploadForm.documentType || "other"); body.set("title", uploadForm.title || uploadFile.name); body.set("visibility", uploadForm.visibility || "admins");
    setSaving(true);
    try {
      const response = await fetch("/api/welfare/upload", { method: "POST", body });
      if (response.status === 499) return;
      if (response.status === 413) throw new Error(pick("নথি সার্ভারের আপলোড সীমা ছাড়িয়েছে; ছোট ফাইল দিন।", "The document exceeds the server upload limit; choose a smaller file."));
      const payload = await response.json() as { code?: string; error?: string };
      if (!response.ok) throw new Error(welfareDocumentErrorCopy(payload.code, locale) ?? payload.error ?? pick("নথি আপলোড হয়নি।", "Could not upload the document."));
      setUploadOpen(false); setUploadFile(null); setUploadForm({ documentType: "receipt", visibility: "admins" }); await load();
      if (response.status !== 202) setFeedback(pick("নথি নিরাপদ ভল্টে সংরক্ষিত হয়েছে।", "Document saved in the private vault."));
    } catch (error) { setFeedback(error instanceof Error ? error.message : pick("নথি আপলোড হয়নি।", "Could not upload the document.")); }
    finally { setSaving(false); }
  }

  async function deleteDocument(id: string) {
    setSaving(true);
    try {
      const response = await fetch(`/api/welfare-document/${id}`, { method: "DELETE" });
      if (response.status === 499) return;
      const payload = await response.json() as { code?: string; error?: string; cleanupPending?: boolean };
      if (!response.ok) throw new Error(welfareDocumentErrorCopy(payload.code, locale) ?? payload.error ?? pick("নথি মোছা যায়নি।", "Could not delete the document."));
      await load();
      if (response.status !== 202) setFeedback(pick("নথি মুছে দেওয়া হয়েছে।", "Document deleted."));
    }
    catch (error) { setFeedback(error instanceof Error ? error.message : pick("নথি মোছা যায়নি।", "Could not delete the document.")); }
    finally { setSaving(false); }
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx"); const workbook = XLSX.utils.book_new();
      const add = (bn: string, en: WelfareExportSheet, rows: Array<Record<string, unknown>>) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: welfareExportHeaders(en, locale) }), pick(bn, en));
      add("তহবিল", "Funds", funds.map((item) => ({ [pick("তহবিল", "Fund")]: item.name, [pick("শ্রেণি", "Category")]: welfareValueLabel(item.category, locale), [pick("লক্ষ্যমাত্রা", "Target")]: num(item.target_amount), [pick("প্রারম্ভিক ব্যালান্স", "Opening balance")]: num(item.opening_balance), [pick("স্ট্যাটাস", "Status")]: welfareValueLabel(item.status, locale), [pick("দৃশ্যমানতা", "Visibility")]: welfareValueLabel(item.visibility, locale) })));
      add("অনুদান", "Contributions", contributions.map((item) => ({ [pick("তারিখ", "Date")]: item.contribution_date, [pick("তহবিল", "Fund")]: fundName(funds, item.fund_id), [pick("অনুদানকারী", "Contributor")]: item.contributor_name, [pick("পরিমাণ", "Amount")]: num(item.amount), [pick("পদ্ধতি", "Method")]: welfareValueLabel(item.payment_method, locale), [pick("রেফারেন্স", "Reference")]: item.reference ?? "", [pick("স্ট্যাটাস", "Status")]: welfareValueLabel(item.status, locale), [pick("অনুমোদনকারী", "Approved by")]: item.approved_by_name ?? "", [pick("নোট", "Notes")]: item.notes ?? "" })));
      add("ব্যয়", "Expenses", expenses.map((item) => ({ [pick("তারিখ", "Date")]: item.expense_date, [pick("তহবিল", "Fund")]: fundName(funds, item.fund_id), [pick("শিরোনাম", "Title")]: item.title, [pick("উপকারভোগী", "Beneficiary")]: item.beneficiary_name ?? "", [pick("শ্রেণি", "Category")]: welfareValueLabel(item.category, locale), [pick("পরিমাণ", "Amount")]: num(item.amount), [pick("পদ্ধতি", "Method")]: welfareValueLabel(item.payment_method, locale), [pick("রেফারেন্স", "Reference")]: item.reference ?? "", [pick("স্ট্যাটাস", "Status")]: welfareValueLabel(item.status, locale), [pick("অনুমোদনকারী", "Approved by")]: item.approved_by_name ?? "", [pick("নোট", "Notes")]: item.notes ?? "" })));
      add("সহায়তার আবেদন", "Assistance Requests", requests.map((item) => ({ [pick("তারিখ", "Date")]: item.created_at, [pick("আবেদনকারী", "Requester")]: item.requester_name, [pick("ধরন", "Type")]: welfareValueLabel(item.request_type, locale), [pick("শিরোনাম", "Title")]: item.title, [pick("আবেদনের পরিমাণ", "Requested")]: num(item.requested_amount), [pick("অনুমোদিত পরিমাণ", "Approved")]: num(item.approved_amount), [pick("জরুরিতা", "Urgency")]: welfareValueLabel(item.urgency, locale), [pick("দৃশ্যমানতা", "Visibility")]: welfareValueLabel(item.visibility, locale), [pick("স্ট্যাটাস", "Status")]: welfareValueLabel(item.status, locale), [pick("অ্যাডমিন নোট", "Admin note")]: item.admin_note ?? "" })));
      add("অঙ্গীকার", "Pledges", pledges.map((item) => ({ [pick("সদস্য", "Member")]: item.member_name, [pick("তহবিল", "Fund")]: fundName(funds, item.fund_id), [pick("পুনরাবৃত্তি", "Frequency")]: welfareValueLabel(item.frequency, locale), [pick("পরিমাণ", "Amount")]: num(item.amount), [pick("শুরু", "Start")]: item.start_date, [pick("পরবর্তী তারিখ", "Next due")]: item.next_due_date ?? "", [pick("স্ট্যাটাস", "Status")]: welfareValueLabel(item.status, locale), [pick("নোট", "Notes")]: item.notes ?? "" })));
      add("নথি", "Documents", documents.map((item) => ({ [pick("শিরোনাম", "Title")]: item.title, [pick("ধরন", "Type")]: welfareValueLabel(item.document_type, locale), [pick("সংযুক্ত রেকর্ড", "Linked record")]: `${welfareValueLabel(item.entity_type, locale)}:${item.entity_id}`, [pick("ফাইল", "File")]: item.file_name, [pick("দৃশ্যমানতা", "Visibility")]: welfareValueLabel(item.visibility, locale), [pick("আপলোডকারী", "Uploader")]: item.uploaded_by_name, [pick("তারিখ", "Date")]: item.created_at })));
      XLSX.writeFile(workbook, `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-welfare-fund.xlsx`);
      setFeedback(pick("কল্যাণ তহবিলের XLSX তৈরি হয়েছে।", "The Welfare Fund XLSX was created."));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : pick("কল্যাণ তহবিলের XLSX তৈরি হয়নি।", "Could not create the Welfare Fund XLSX."));
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
  if (loadError) return <main className="mx-auto max-w-3xl p-6 md:p-10"><Empty icon={<ShieldCheck />} title={pick("কল্যাণ তহবিল লোড হয়নি", "Welfare Fund could not be loaded")} text={loadError} action={<Button className="rounded-xl" onClick={() => void load()}>{pick("আবার চেষ্টা করুন", "Retry")}</Button>} /></main>;
  if (setupRequired) return <main className="mx-auto max-w-3xl p-6 md:p-10"><Empty icon={<Users />} title={pick("ফ্যামিলি অ্যাক্সেস সক্রিয় নয়", "Family access is not active")} text={pick("জয়েন কোড দিয়ে আবেদন করুন। অ্যাডমিন অনুমোদনের পর কল্যাণ তহবিল ব্যবহার করা যাবে।", "Apply with a join code. You can use the Welfare Fund after admin approval.")} action={<Button asChild className="rounded-xl"><a href="/setup">{pick("ফ্যামিলিতে যোগ দিন", "Family onboarding")}</a></Button>} /></main>;

  return <main className="mx-auto w-full max-w-[1550px] space-y-5 px-4 py-5 md:px-7 md:py-7">
    <section className="overflow-hidden rounded-3xl bg-[linear-gradient(125deg,#164e63_0%,#166534_55%,#854d0e_100%)] p-5 text-white shadow-xl md:p-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div className="max-w-2xl"><div className="flex items-center gap-2 text-sm text-emerald-100"><ShieldCheck className="size-4" /> {pick("স্বচ্ছ পারিবারিক কল্যাণ", "Transparent family welfare")}</div><h1 className="mt-2 text-2xl font-bold tracking-tight md:text-4xl">{pick("পারিবারিক কল্যাণ তহবিল", "Family Welfare Fund")}</h1><p className="mt-2 text-sm leading-6 text-white/75">{pick("অনুদান, পুনরাবৃত্ত অঙ্গীকার, সহায়তার আবেদন, অনুমোদন, ব্যয় ও রসিদ—একটি নিরীক্ষিত কর্মক্ষেত্রে।", "Contributions, recurring pledges, assistance requests, approvals, expenses, and receipts—in one audited workspace.")}</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" className="rounded-xl" onClick={() => void exportXlsx()} disabled={exporting}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} {pick("সব XLSX", "All XLSX")}</Button><Button variant="secondary" className="rounded-xl" onClick={() => setUploadOpen(true)} disabled={migrationRequired || !uploadTargets.length}><Upload className="size-4" /> {pick("রসিদ", "Receipt")}</Button><Button className="rounded-xl bg-emerald-500 text-white hover:bg-emerald-600" onClick={() => openCreate("contribution")} disabled={migrationRequired || !funds.length}><HandCoins className="size-4" /> {pick("অনুদান", "Contribution")}</Button></div></div>
    </section>
    {migrationRequired ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">{pick("কল্যাণ তহবিলের ডেটা সক্রিয় করতে Supabase SQL Editor-এ", "To activate Welfare Fund data, run")} <b>supabase/migrations/20260927_family_welfare_fund.sql</b> {pick("চালান।", "in the Supabase SQL Editor.")}</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<WalletCards />} label={pick("বর্তমান ব্যালান্স", "Current balance")} value={money.format(balance)} note={pick(`${countLabel.format(funds.filter((item) => item.status === "active").length)}টি সক্রিয় তহবিল`, `${funds.filter((item) => item.status === "active").length} active funds`)} tone="emerald" /><Metric icon={<ArrowUpRight />} label={pick("অনুমোদিত সংগ্রহ", "Approved collection")} value={money.format(approvedIncome)} note={pick(`${countLabel.format(contributions.filter((item) => item.status === "approved").length)}টি যাচাইকৃত এন্ট্রি`, `${contributions.filter((item) => item.status === "approved").length} verified entries`)} /><Metric icon={<ArrowDownRight />} label={pick("পরিশোধিত সহায়তা", "Paid assistance")} value={money.format(paidExpense)} note={pick(`${countLabel.format(expenses.filter((item) => item.status === "paid").length)}টি বিতরণ`, `${expenses.filter((item) => item.status === "paid").length} disbursements`)} tone="amber" /><Metric icon={<Clock3 />} label={pick("পর্যালোচনা বাকি", "Pending review")} value={countLabel.format(pendingApprovals)} note={canManage ? pick("অ্যাডমিনের পদক্ষেপ প্রয়োজন", "Admin action needed") : `${pick("আমার অঙ্গীকার", "My pledge")} ${money.format(myPledge)}`} tone="rose" /></section>

    <section className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]"><Card className="rounded-3xl shadow-none"><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>{pick("তহবিলের তালিকা", "Fund portfolio")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{pick("উদ্দেশ্য, লক্ষ্যমাত্রা ও বর্তমান ব্যালান্স", "Purpose, target, and available balance")}</p></div>{canManage ? <Button size="sm" className="rounded-xl" onClick={() => openCreate("fund")} disabled={migrationRequired}><Plus className="size-4" /> {pick("তহবিল", "Fund")}</Button> : null}</CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{funds.map((fund) => <FundCard key={fund.id} fund={fund} contributions={contributions} expenses={expenses} canManage={canManage} saving={saving} onStatus={(status) => void changeStatus("fund", fund.id, status)} onEdit={() => openEdit("fund", fund)} />)}{!funds.length ? <div className="md:col-span-2"><Empty icon={<HeartHandshake />} title={pick("এখনও কল্যাণ তহবিল নেই", "No welfare fund yet")} text={canManage ? pick("প্রথম তহবিল তৈরি করে সংগ্রহ শুরু করুন।", "Create the first fund to start collecting contributions.") : pick("ফ্যামিলি অ্যাডমিন তহবিল তৈরি করলে এখানে দেখা যাবে।", "Funds created by a Family Admin will appear here.")} action={canManage && !migrationRequired ? <Button onClick={() => openCreate("fund")} className="rounded-xl"><Plus /> {pick("প্রথম তহবিল", "First fund")}</Button> : undefined} /></div> : null}</CardContent></Card>
      <Card className="rounded-3xl shadow-none"><CardHeader><CardTitle>{pick("পরিচালনা ও গোপনীয়তা", "Governance & privacy")}</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><Governance icon={<CheckCircle2 />} title={pick("অনুমোদনভিত্তিক খতিয়ান", "Approval-based ledger")} text={pick("অনুমোদিত অনুদান ব্যালান্সে যোগ হয়; ব্যয় কেবল পরিশোধের পর বাদ যায়।", "Approved contributions increase the balance; expenses reduce it only when paid.")} /><Governance icon={<LockKeyhole />} title={pick("গোপন আবেদন", "Confidential requests")} text={pick("সহায়তার আবেদন ডিফল্টভাবে শুধু অ্যাডমিন দল দেখে।", "Assistance requests are visible only to the admin team by default.")} /><Governance icon={<ReceiptText />} title={pick("রসিদ ভল্ট", "Receipt vault")} text={pick("প্রমাণপত্র ব্যক্তিগত R2 স্টোরেজে রাখা হয়।", "Evidence documents are stored in private R2 storage.")} /><Governance icon={<FileCheck2 />} title={pick("অডিট ট্রেইল", "Audit trail")} text={pick("প্রতিটি তৈরি, অনুমোদন, প্রত্যাখ্যান ও বিতরণ লগ হয়।", "Every creation, approval, rejection, and disbursement is logged.")} /></CardContent></Card></section>

    <Tabs defaultValue="contributions" className="space-y-4"><TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-muted/70 p-1"><TabsTrigger value="contributions">{pick("অনুদান", "Contributions")}</TabsTrigger><TabsTrigger value="requests">{pick("সহায়তা", "Assistance")}</TabsTrigger><TabsTrigger value="expenses">{pick("ব্যয়", "Expenses")}</TabsTrigger><TabsTrigger value="pledges">{pick("অঙ্গীকার", "Pledges")}</TabsTrigger><TabsTrigger value="documents">{pick("নথি", "Documents")}</TabsTrigger></TabsList>
      <TabsContent value="contributions"><DataCard title={pick("অনুদানের খতিয়ান", "Contribution ledger")} description={pick("সদস্যের জমা, যাচাই ও ফেরতের ইতিহাস", "Member submissions, verification, and refund history")} action={<Button className="rounded-xl" onClick={() => openCreate("contribution")} disabled={!funds.length || migrationRequired}><Plus /> {pick("অনুদান", "Contribution")}</Button>}><TableWrap><Table><TableHeader><TableRow><TableHead>{pick("তারিখ", "Date")}</TableHead><TableHead>{pick("অনুদানকারী", "Contributor")}</TableHead><TableHead>{pick("তহবিল", "Fund")}</TableHead><TableHead>{pick("পদ্ধতি", "Method")}</TableHead><TableHead>{pick("পরিমাণ", "Amount")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{contributions.map((item) => <TableRow key={item.id}><TableCell>{dateLabel.format(new Date(item.contribution_date))}</TableCell><TableCell><p className="font-semibold">{item.contributor_name}</p><p className="text-xs text-muted-foreground">{item.reference || pick("রেফারেন্স নেই", "No reference")}</p></TableCell><TableCell>{fundName(funds, item.fund_id)}</TableCell><TableCell className="capitalize">{item.payment_method}</TableCell><TableCell className="font-bold text-emerald-700 dark:text-emerald-300">{money.format(num(item.amount))}</TableCell><TableCell><Status value={item.status} /></TableCell><TableCell><Actions disabled={saving} items={[...(canManage && item.status === "pending" ? [[pick("অনুমোদন", "Approve"), () => void changeStatus("contribution", item.id, "approved")], [pick("প্রত্যাখ্যান", "Reject"), () => void changeStatus("contribution", item.id, "rejected")]] as Array<[string, () => void]> : canManage && item.status === "approved" ? [[pick("ফেরত", "Refund"), () => void changeStatus("contribution", item.id, "refunded")]] as Array<[string, () => void]> : []), ...((canManage || item.is_mine) && item.status === "pending" ? [[pick("বিস্তারিত সম্পাদনা", "Edit details"), () => openEdit("contribution", item)], [pick("স্থায়ীভাবে মুছুন", "Delete permanently"), () => void deleteRecord("contribution", item.id)]] as Array<[string, () => void]> : [])]} /></TableCell></TableRow>)}<EmptyRows show={!contributions.length} columns={7} /></TableBody></Table></TableWrap></DataCard></TabsContent>
      <TabsContent value="requests"><DataCard title={pick("সহায়তার আবেদন", "Assistance requests")} description={pick("সংবেদনশীল আবেদন, পর্যালোচনা, অনুমোদন ও বিতরণ", "Sensitive requests, review, approval, and disbursement")} action={<Button className="rounded-xl" onClick={() => openCreate("request")} disabled={migrationRequired}><Plus /> {pick("আবেদন", "Request")}</Button>}><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{requests.map((item) => <RequestCard key={item.id} request={item} fund={funds.find((fund) => fund.id === item.fund_id)} canManage={canManage} saving={saving} onStatus={(status, extra) => void changeStatus("request", item.id, status, extra)} onEdit={() => openEdit("request", item)} onDelete={() => void deleteRecord("request", item.id)} />)}{!requests.length ? <div className="md:col-span-2 xl:col-span-3"><Empty icon={<HeartHandshake />} title={pick("কোনো সহায়তার আবেদন নেই", "No assistance requests")} text={pick("চিকিৎসা, শিক্ষা, জরুরি বা জীবিকা সহায়তার আবেদন করা যাবে।", "Members can request medical, education, emergency, or livelihood assistance.")} /></div> : null}</div></DataCard></TabsContent>
      <TabsContent value="expenses"><DataCard title={pick("ব্যয় ও বিতরণ খতিয়ান", "Expense & disbursement ledger")} description={pick("অনুমোদিত সহায়তা, পরিচালনা ও পেমেন্ট ইতিহাস", "Approved assistance, operations, and payment trail")} action={canManage ? <Button className="rounded-xl" onClick={() => openCreate("expense")} disabled={!funds.length || migrationRequired}><Plus /> {pick("ব্যয়", "Expense")}</Button> : undefined}><TableWrap><Table><TableHeader><TableRow><TableHead>{pick("তারিখ", "Date")}</TableHead><TableHead>{pick("ব্যয়", "Expense")}</TableHead><TableHead>{pick("তহবিল", "Fund")}</TableHead><TableHead>{pick("উপকারভোগী", "Beneficiary")}</TableHead><TableHead>{pick("পরিমাণ", "Amount")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader><TableBody>{expenses.map((item) => <TableRow key={item.id}><TableCell>{dateLabel.format(new Date(item.expense_date))}</TableCell><TableCell><p className="font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">{locale === "bn" ? categoryLabelsBn[item.category] ?? item.category : categoryLabels[item.category] ?? item.category}</p></TableCell><TableCell>{fundName(funds, item.fund_id)}</TableCell><TableCell>{item.beneficiary_name || "—"}</TableCell><TableCell className="font-bold">{money.format(num(item.amount))}</TableCell><TableCell><Status value={item.status} /></TableCell>{canManage ? <TableCell><Actions disabled={saving} items={[...(item.status === "pending" ? [[pick("অনুমোদন", "Approve"), () => void changeStatus("expense", item.id, "approved")], [pick("প্রত্যাখ্যান", "Reject"), () => void changeStatus("expense", item.id, "rejected")]] as Array<[string, () => void]> : item.status === "approved" ? [[pick("পরিশোধিত করুন", "Mark paid"), () => void changeStatus("expense", item.id, "paid")]] as Array<[string, () => void]> : []), ...(item.status === "pending" ? [[pick("বিস্তারিত সম্পাদনা", "Edit details"), () => openEdit("expense", item)], [pick("স্থায়ীভাবে মুছুন", "Delete permanently"), () => void deleteRecord("expense", item.id)]] as Array<[string, () => void]> : [])]} /></TableCell> : null}</TableRow>)}<EmptyRows show={!expenses.length} columns={canManage ? 7 : 6} /></TableBody></Table></TableWrap></DataCard></TabsContent>
      <TabsContent value="pledges"><DataCard title={pick("পুনরাবৃত্ত অঙ্গীকার", "Recurring commitments")} description={pick("মাসিক, ত্রৈমাসিক, বার্ষিক ও এককালীন প্রতিশ্রুতি", "Monthly, quarterly, yearly, and one-time promises")} action={<Button className="rounded-xl" onClick={() => openCreate("pledge")} disabled={!funds.length || migrationRequired}><Plus /> {pick("অঙ্গীকার", "Pledge")}</Button>}><TableWrap><Table><TableHeader><TableRow><TableHead>{pick("সদস্য", "Member")}</TableHead><TableHead>{pick("তহবিল", "Fund")}</TableHead><TableHead>{pick("পুনরাবৃত্তি", "Frequency")}</TableHead><TableHead>{pick("পরিমাণ", "Amount")}</TableHead><TableHead>{pick("পরবর্তী তারিখ", "Next due")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{pledges.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.member_name}</TableCell><TableCell>{fundName(funds, item.fund_id)}</TableCell><TableCell className="capitalize">{locale === "bn" ? valueLabelsBn[item.frequency] ?? item.frequency : item.frequency.replaceAll("_", " ")}</TableCell><TableCell>{money.format(num(item.amount))}</TableCell><TableCell>{item.next_due_date ? dateLabel.format(new Date(item.next_due_date)) : "—"}</TableCell><TableCell><Status value={item.status} /></TableCell><TableCell><Actions disabled={saving} items={(item.is_mine || canManage) && ["active", "paused"].includes(item.status) ? [...(item.status === "active" ? [[pick("স্থগিত", "Pause"), () => void changeStatus("pledge", item.id, "paused")], [pick("বাতিল", "Cancel"), () => void changeStatus("pledge", item.id, "cancelled")]] as Array<[string, () => void]> : item.status === "paused" ? [[pick("পুনরায় চালু", "Resume"), () => void changeStatus("pledge", item.id, "active")]] as Array<[string, () => void]> : []), [pick("বিস্তারিত সম্পাদনা", "Edit details"), () => openEdit("pledge", item)], [pick("স্থায়ীভাবে মুছুন", "Delete permanently"), () => void deleteRecord("pledge", item.id)]] : []} /></TableCell></TableRow>)}<EmptyRows show={!pledges.length} columns={7} /></TableBody></Table></TableWrap></DataCard></TabsContent>
      <TabsContent value="documents"><DataCard title={pick("রসিদ ও প্রমাণ ভল্ট", "Receipt & evidence vault")} description={pick("অ্যাক্সেস-নিয়ন্ত্রিত রসিদ, চালান, অনুমোদনপত্র ও প্রমাণ", "Access-controlled receipts, invoices, approval letters, and evidence")} action={<Button className="rounded-xl" onClick={() => setUploadOpen(true)} disabled={!uploadTargets.length || migrationRequired}><Upload /> {pick("আপলোড", "Upload")}</Button>}><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{documents.map((item) => <article key={item.id} className="rounded-2xl border p-4 transition hover:border-primary/40 hover:bg-muted/30"><div className="flex items-start justify-between gap-3"><a href={`/api/welfare-document/${item.id}`} target="_blank" rel="noreferrer" className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></a><div className="flex items-center"><Badge variant="outline">{locale === "bn" ? valueLabelsBn[item.visibility] ?? item.visibility : item.visibility}</Badge>{(canManage || item.is_mine) && documentIsDraft(item) ? <Button size="icon-sm" variant="ghost" className="text-destructive" disabled={saving} onClick={() => void deleteDocument(item.id)}><Trash2 /><span className="sr-only">{pick("নথি মুছুন", "Delete document")}</span></Button> : null}</div></div><a href={`/api/welfare-document/${item.id}`} target="_blank" rel="noreferrer"><p className="mt-3 font-semibold">{item.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.file_name}</p><p className="mt-3 text-xs text-muted-foreground">{locale === "bn" ? valueLabelsBn[item.document_type] ?? item.document_type : item.document_type} · {item.uploaded_by_name} · {dateLabel.format(new Date(item.created_at))}</p></a></article>)}{!documents.length ? <div className="md:col-span-2 xl:col-span-3"><Empty icon={<ReceiptText />} title={pick("কোনো নথি নেই", "No documents")} text={pick("অনুদানের রসিদ, ব্যয়ের চালান বা আবেদনের প্রমাণ আপলোড করুন।", "Upload contribution receipts, expense invoices, or request evidence.")} /></div> : null}</div></DataCard></TabsContent>
    </Tabs>

    <Dialog open={Boolean(kind)} onOpenChange={(open) => { if (!open) { setKind(null); setEditingRecord(null); } }}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl"><DialogHeader><DialogTitle>{kind ? titleByKind[kind] : pick("নতুন রেকর্ড", "New record")} {editingRecord ? pick("সম্পাদনা", "edit") : ""}</DialogTitle><DialogDescription>{editingRecord ? pick("প্রয়োজনীয় তথ্য দিয়ে নিরাপদ পারিবারিক রেকর্ডটি হালনাগাদ করুন।", "Update the secure family record with the required information.") : pick("প্রয়োজনীয় তথ্য দিয়ে একটি নিরাপদ পারিবারিক রেকর্ড তৈরি করুন।", "Create a secure family record with the required information.")}</DialogDescription></DialogHeader>{kind ? <CreateForm kind={kind} form={form} setForm={setForm} funds={funds} canManage={canManage} isEditing={Boolean(editingRecord)} /> : null}<DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => { setKind(null); setEditingRecord(null); }}>{pick("বাতিল", "Cancel")}</Button><Button className="rounded-xl" onClick={() => void createRecord()} disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : editingRecord ? <Pencil className="size-4" /> : <CheckCircle2 className="size-4" />} {editingRecord ? pick("হালনাগাদ", "Update") : pick("সংরক্ষণ", "Save")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}><DialogContent className="rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>{pick("রসিদ / প্রমাণ আপলোড", "Receipt / evidence upload")}</DialogTitle><DialogDescription>{pick("JPG, PNG, WebP, PDF বা Word; সর্বোচ্চ ১২ MB।", "JPG, PNG, WebP, PDF, or Word; maximum 12 MB.")}</DialogDescription></DialogHeader><div className="grid gap-4"><Field label={pick("সংযুক্ত রেকর্ড", "Linked record")}><SelectNative value={uploadForm.target ?? ""} onChange={(value) => setUploadForm((old) => ({ ...old, target: value }))} options={uploadTargets.map((item) => [item.value, item.label])} placeholder={pick("রেকর্ড নির্বাচন করুন", "Select a record")} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label={pick("নথির ধরন", "Document type")}><SelectNative value={uploadForm.documentType} onChange={(value) => setUploadForm((old) => ({ ...old, documentType: value }))} options={[["receipt", pick("রসিদ", "Receipt")], ["invoice", pick("চালান", "Invoice")], ["approval", pick("অনুমোদন", "Approval")], ["evidence", pick("প্রমাণ", "Evidence")], ["other", pick("অন্যান্য", "Other")]]} /></Field>{canManage ? <Field label={pick("দৃশ্যমানতা", "Visibility")}><SelectNative value={uploadForm.visibility} onChange={(value) => setUploadForm((old) => ({ ...old, visibility: value }))} options={[["admins", pick("শুধু অ্যাডমিন", "Admins only")], ["family", pick("পুরো পরিবার", "Whole family")]]} /></Field> : null}</div><Field label={pick("শিরোনাম", "Title")}><Input value={uploadForm.title ?? ""} onChange={(event) => setUploadForm((old) => ({ ...old, title: event.target.value }))} placeholder={pick("যেমন: মার্চের অনুদানের রসিদ", "For example: March contribution receipt")} /></Field><Field label={pick("ফাইল", "File")}><Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></Field></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setUploadOpen(false)}>{pick("বাতিল", "Cancel")}</Button><Button className="rounded-xl" onClick={() => void uploadDocument()} disabled={saving || !uploadFile}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} {pick("আপলোড", "Upload")}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

function CreateForm({ kind, form, setForm, funds, canManage, isEditing }: { kind: CreateKind; form: FormState; setForm: Dispatch<SetStateAction<FormState>>; funds: WelfareFund[]; canManage: boolean; isEditing: boolean }) {
  const { locale, pick } = useLocale();
  const labelsBn: Record<string, string> = { "Fund name": "তহবিলের নাম", Category: "শ্রেণি", "Target amount": "লক্ষ্যমাত্রা", "Opening balance": "প্রারম্ভিক ব্যালেন্স", Visibility: "দৃশ্যমানতা", Description: "বিবরণ", "Contributor name (optional)": "অনুদানকারীর নাম (ঐচ্ছিক)", Amount: "পরিমাণ", Date: "তারিখ", "Payment method": "পেমেন্ট পদ্ধতি", "Transaction reference": "লেনদেন রেফারেন্স", "Expense title": "ব্যয়ের শিরোনাম", "Beneficiary / vendor": "উপকারভোগী / সেবাদাতা", "Expense date": "ব্যয়ের তারিখ", Reference: "রেফারেন্স", "Request type": "আবেদনের ধরন", "Request title": "আবেদনের শিরোনাম", "Requested amount": "আবেদনের পরিমাণ", Urgency: "জরুরিতা", Privacy: "গোপনীয়তা", Frequency: "পুনরাবৃত্তি", "Amount per cycle": "প্রতি চক্রের পরিমাণ", "Start date": "শুরুর তারিখ", "Next due date": "পরবর্তী তারিখ", Notes: "নোট" };
  const optionsBn: Record<string, string> = { General: "সাধারণ", Emergency: "জরুরি", Medical: "চিকিৎসা", Education: "শিক্ষা", Charity: "দান", "Whole family": "পুরো পরিবার", "Admins only": "শুধু অ্যাডমিন", Cash: "নগদ", Bank: "ব্যাংক", "Mobile banking": "মোবাইল ব্যাংকিং", Card: "কার্ড", Other: "অন্যান্য", Operations: "পরিচালনা", Livelihood: "জীবিকা", Normal: "সাধারণ", High: "উচ্চ", Critical: "সংকটপূর্ণ", "Family visible after approval": "অনুমোদনের পর পরিবার দেখতে পারবে", Monthly: "মাসিক", Quarterly: "ত্রৈমাসিক", Yearly: "বার্ষিক", "One time": "এককালীন" };
  const labelFor = (value: string) => locale === "bn" ? labelsBn[value] ?? value : value;
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const input = (key: string, label: string, type = "text", props: Record<string, string> = {}) => <Field label={labelFor(label)}><Input type={type} value={form[key] ?? ""} onChange={(event) => update(key, event.target.value)} onInput={type === "date" ? (event) => update(key, event.currentTarget.value) : undefined} {...props} /></Field>;
  const select = (key: string, label: string, options: string[][]) => <Field label={labelFor(label)}><SelectNative value={form[key] ?? ""} onChange={(value) => update(key, value)} options={options.map(([value, text]) => [value, locale === "bn" ? optionsBn[text] ?? text : text])} /></Field>;
  const fund = <Field label={pick("তহবিল", "Fund")}><SelectNative value={form.fundId ?? ""} onChange={(value) => update("fundId", value)} options={funds.filter((item) => item.status === "active").map((item) => [item.id, item.name])} placeholder={pick("তহবিল নির্বাচন করুন", "Select a fund")} /></Field>;
  const notes = <Field label={kind === "request" ? pick("প্রয়োজনের বিস্তারিত", "Need details") : labelFor("Notes")}><Textarea value={form[kind === "request" ? "description" : "notes"] ?? ""} onChange={(event) => update(kind === "request" ? "description" : "notes", event.target.value)} rows={4} /></Field>;
  if (kind === "fund") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("name", "Fund name")}{select("category", "Category", [["general", "General"], ["emergency", "Emergency"], ["medical", "Medical"], ["education", "Education"], ["charity", "Charity"]])}{input("targetAmount", "Target amount", "number", { min: "0" })}{isEditing ? <Field label={pick("প্রারম্ভিক ব্যালান্স", "Opening balance")}><Input type="number" value={form.openingBalance ?? ""} disabled /><p className="text-xs text-muted-foreground">{pick("তৈরির পর এই পরিমাণ বদলানো যায় না; সংশোধন অনুদান বা ব্যয় হিসেবে নথিভুক্ত করুন।", "This amount is fixed after creation; record later corrections as a contribution or expense.")}</p></Field> : input("openingBalance", "Opening balance", "number", { min: "0" })}{select("visibility", "Visibility", [["family", "Whole family"], ["admins", "Admins only"]])}<div className="sm:col-span-2">{input("description", "Description")}</div></div>;
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
function FundCard({ fund, contributions, expenses, canManage, saving, onStatus, onEdit }: { fund: WelfareFund; contributions: WelfareContribution[]; expenses: WelfareExpense[]; canManage: boolean; saving: boolean; onStatus: (status: string) => void; onEdit: () => void }) { const { locale, pick } = useLocale(); const formatter = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0, maximumFractionDigits: 2 }); const { approvedIncome: income, balance: available } = welfareLedger([fund], contributions.filter((item) => item.fund_id === fund.id), expenses.filter((item) => item.fund_id === fund.id)); const progress = num(fund.target_amount) ? Math.min(100, ((num(fund.opening_balance) + income) / num(fund.target_amount)) * 100) : 0; return <article className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><Badge variant="secondary">{locale === "bn" ? categoryLabelsBn[fund.category] ?? fund.category : categoryLabels[fund.category] ?? fund.category}</Badge><Status value={fund.status} /></div><h3 className="mt-3 text-lg font-bold">{fund.name}</h3></div>{canManage ? <Actions disabled={saving} items={[...(fund.status === "active" ? [["Pause fund", () => onStatus("paused")], ["Close fund", () => onStatus("closed")]] as Array<[string, () => void]> : fund.status === "paused" ? [["Activate fund", () => onStatus("active")], ["Close fund", () => onStatus("closed")]] as Array<[string, () => void]> : []), ["Edit details", onEdit]]} /> : null}</div><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{fund.description || pick("পারিবারিক কল্যাণের উদ্দেশ্যে তহবিল", "Family welfare purpose fund")}</p><div className="mt-4 flex justify-between text-sm"><span>{pick("বর্তমান ব্যালান্স", "Available")}</span><strong>{formatter.format(available)}</strong></div>{num(fund.target_amount) ? <><Progress value={progress} className="mt-2" /><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{Math.round(progress)}%</span><span>{pick("লক্ষ্যমাত্রা", "Target")} {formatter.format(num(fund.target_amount))}</span></div></> : <p className="mt-2 text-xs text-muted-foreground">{pick("নির্দিষ্ট লক্ষ্যমাত্রা নেই", "No fixed target")}</p>}</article>; }
function RequestCard({ request, fund, canManage, saving, onStatus, onEdit, onDelete }: { request: WelfareRequest; fund?: WelfareFund; canManage: boolean; saving: boolean; onStatus: (status: string, extra?: Record<string, unknown>) => void; onEdit: () => void; onDelete: () => void }) {
  const { locale, pick } = useLocale();
  const formatter = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const [review, setReview] = useState<{ status: "approved" | "rejected" | "disbursed"; amount: string; note: string; paymentMethod: string; reference: string } | null>(null);
  const openReview = (status: "approved" | "rejected" | "disbursed") => setReview({
    status, amount: String(num(request.approved_amount) || num(request.requested_amount)),
    note: request.admin_note ?? "", paymentMethod: "cash", reference: "",
  });
  const submitReview = () => {
    if (!review) return;
    onStatus(review.status, {
      approvedAmount: review.status === "rejected" ? undefined : review.amount,
      adminNote: review.note,
      ...(review.status === "disbursed" ? { paymentMethod: review.paymentMethod, reference: review.reference } : {}),
    });
    setReview(null);
  };
  const approvedValue = welfareMoney(review?.amount); const amountValid = review?.status === "rejected" || (approvedValue !== undefined && approvedValue > 0 && approvedValue <= num(request.requested_amount));
  const editable = (canManage || request.is_mine) && ["submitted", "under_review"].includes(request.status);
  const workflow: Array<[string, () => void]> = canManage
    ? request.status === "submitted"
      ? [["Start review", () => onStatus("under_review")], ["Approve", () => openReview("approved")], ["Reject", () => openReview("rejected")]]
      : request.status === "under_review"
        ? [["Approve", () => openReview("approved")], ["Reject", () => openReview("rejected")]]
        : request.status === "approved" ? [["Disburse", () => openReview("disbursed")]] : []
    : request.is_mine && ["submitted", "under_review"].includes(request.status) ? [["Cancel", () => onStatus("cancelled")]] : [];
  return <>
    <article className="rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant={request.urgency === "critical" ? "destructive" : "secondary"}>{welfareValueLabel(request.urgency, locale)}</Badge>
          <Status value={request.status} />
          <Badge variant="outline">{welfareValueLabel(request.visibility, locale)}</Badge>
        </div>
        {editable || workflow.length ? <Actions disabled={saving} items={[...workflow, ...(editable ? [["Edit details", onEdit]] as Array<[string, () => void]> : []), ...(editable && request.status === "submitted" ? [["Delete permanently", onDelete]] as Array<[string, () => void]> : [])]} /> : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{request.requester_name} · {welfareValueLabel(request.request_type, locale)}</p>
      <h3 className="mt-1 font-bold">{request.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{request.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{pick("আবেদনের পরিমাণ", "Requested")}</p><p className="mt-1 font-bold">{formatter.format(num(request.requested_amount))}</p></div>
        <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{pick("অনুমোদিত", "Approved")}</p><p className="mt-1 font-bold">{formatter.format(num(request.approved_amount))}</p></div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{fund?.name ?? pick("তহবিল নির্ধারিত নয়", "Fund not assigned")}{request.admin_note ? ` · ${request.admin_note}` : ""}</p>
    </article>
    <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{review?.status === "approved" ? pick("সহায়তা অনুমোদন", "Approve assistance") : review?.status === "disbursed" ? pick("সহায়তা বিতরণ", "Disburse assistance") : pick("সহায়তা প্রত্যাখ্যান", "Reject assistance")}</DialogTitle>
          <DialogDescription>{request.title} · {formatter.format(num(request.requested_amount))}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {review?.status !== "rejected" ? <Field label={pick("অনুমোদিত পরিমাণ", "Approved amount")}><Input type="number" min="0.01" max={String(num(request.requested_amount))} step="0.01" value={review?.amount ?? ""} onChange={(event) => setReview((current) => current ? { ...current, amount: event.target.value } : null)} /></Field> : null}
          {review?.status === "disbursed" ? <div className="grid gap-4 sm:grid-cols-2">
            <Field label={pick("পেমেন্ট পদ্ধতি", "Payment method")}><SelectNative value={review.paymentMethod} onChange={(value) => setReview((current) => current ? { ...current, paymentMethod: value } : null)} options={paymentOptions.map(([value, label]) => [value, welfareValueLabel(value, locale) || label])} /></Field>
            <Field label={pick("লেনদেন রেফারেন্স", "Transaction reference")}><Input value={review.reference} onChange={(event) => setReview((current) => current ? { ...current, reference: event.target.value } : null)} /></Field>
          </div> : null}
          <Field label={review?.status === "rejected" ? pick("প্রত্যাখ্যানের কারণ", "Reason for rejection") : pick("অ্যাডমিন নোট (ঐচ্ছিক)", "Admin note (optional)")}>
            <Textarea rows={3} value={review?.note ?? ""} onChange={(event) => setReview((current) => current ? { ...current, note: event.target.value } : null)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReview(null)}>{pick("বাতিল", "Cancel")}</Button>
          <Button variant={review?.status === "rejected" ? "destructive" : "default"} disabled={saving || !amountValid} onClick={submitReview}>{pick("এগিয়ে যান", "Continue")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
function Governance({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span><div><p className="font-semibold">{title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{text}</p></div></div>; }
function DataCard({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) { return <Card className="overflow-hidden rounded-3xl py-0 shadow-none"><CardHeader className="flex-row items-start justify-between gap-4 border-b p-5 md:p-6"><div><CardTitle>{title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</CardHeader><CardContent className="p-0">{children}</CardContent></Card>; }
function TableWrap({ children }: { children: ReactNode }) { return <div className="overflow-x-auto">{children}</div>; }
function Status({ value }: { value: string }) { const { locale } = useLocale(); const good = ["active", "approved", "paid", "disbursed", "completed"]; const bad = ["rejected", "refunded", "cancelled", "closed"]; return <Badge variant={bad.includes(value) ? "destructive" : good.includes(value) ? "secondary" : "outline"} className="capitalize">{welfareValueLabel(value, locale)}</Badge>; }
function Actions({ items, disabled }: { items: Array<[string, () => void]>; disabled: boolean }) { const { locale } = useLocale(); const bn: Record<string, string> = { "Pause fund": "তহবিল স্থগিত", "Close fund": "তহবিল বন্ধ", "Activate fund": "তহবিল সক্রিয়", "Edit details": "বিস্তারিত সম্পাদনা", "Delete permanently": "স্থায়ীভাবে মুছুন", "Start review": "পর্যালোচনা শুরু", Approve: "অনুমোদন", Reject: "প্রত্যাখ্যান", Disburse: "বিতরণ", Cancel: "বাতিল" }; if (!items.length) return null; return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={disabled}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{items.map(([label, action]) => <DropdownMenuItem key={label} onClick={action}>{locale === "bn" ? bn[label] ?? label : label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>; }
function EmptyRows({ show, columns }: { show: boolean; columns: number }) { const { pick } = useLocale(); return show ? <TableRow><TableCell colSpan={columns} className="h-32 text-center text-muted-foreground">{pick("এখনও কোনো রেকর্ড নেই।", "No records yet.")}</TableCell></TableRow> : null; }
function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) { return <div className="flex min-h-52 flex-col items-center justify-center p-6 text-center"><span className="text-muted-foreground/50">{icon}</span><h3 className="mt-3 font-bold">{title}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{text}</p>{action ? <div className="mt-4">{action}</div> : null}</div>; }
