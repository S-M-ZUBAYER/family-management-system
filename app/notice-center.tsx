"use client";

import { useActionFeedback, useActionResult } from "@/components/action-modal-provider";
import { useLocale } from "@/components/locale-provider";
import { useCurrentTime } from "@/components/use-current-time";
import { noticeErrorCopy } from "@/lib/notice-validation";
import { readNoticeMutation, noticeWriteFeedback, NoticeRequestGate } from "@/lib/notice-write-outcome";
import { readNotices, noticeEditorStillAvailable } from "@/lib/notice-read";
import { noticeIsActive } from "@/lib/notice-visibility";
import { noticeExportRows, noticeWorksheet } from "@/lib/notice-export";
import { qurbaniIsoToLocalDateTime, qurbaniLocalDateTimeToIso } from "@/lib/qurbani-validation";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  CheckCircle2,
  Clock3,
  Download,
  Ellipsis,
  LoaderCircle,
  Megaphone,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  ShieldAlert,
  TriangleAlert,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { NoticeTicker } from "./notice-ticker";

export type FamilyNotice = {
  id: string;
  title_bn: string;
  title_en: string | null;
  body_bn: string;
  body_en: string | null;
  category: "general" | "urgent" | "event" | "finance" | "qurbani" | "health";
  priority: "normal" | "high" | "urgent";
  status: "draft" | "published" | "archived";
  is_pinned: boolean;
  publish_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type NoticePayload = {
  family?: { id: string; name_bn: string; name_en: string | null };
  notices?: FamilyNotice[];
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};

type NoticeForm = {
  titleBn: string;
  titleEn: string;
  bodyBn: string;
  bodyEn: string;
  category: FamilyNotice["category"];
  priority: FamilyNotice["priority"];
  status: FamilyNotice["status"];
  publishAt: string;
  expiresAt: string;
  isPinned: boolean;
};

const emptyForm: NoticeForm = {
  titleBn: "",
  titleEn: "",
  bodyBn: "",
  bodyEn: "",
  category: "general",
  priority: "normal",
  status: "published",
  publishAt: "",
  expiresAt: "",
  isPinned: false,
};

const categoryLabelsBn: Record<FamilyNotice["category"], string> = {
  general: "সাধারণ",
  urgent: "জরুরি",
  event: "ইভেন্ট",
  finance: "হিসাব ও ফান্ড",
  qurbani: "কোরবানি",
  health: "স্বাস্থ্য",
};
const categoryLabelsEn: Record<FamilyNotice["category"], string> = { general: "General", urgent: "Urgent", event: "Event", finance: "Finance & fund", qurbani: "Qurbani", health: "Health" };

const statusLabelsBn: Record<FamilyNotice["status"], string> = {
  draft: "খসড়া",
  published: "প্রকাশিত",
  archived: "আর্কাইভ",
};
const statusLabelsEn: Record<FamilyNotice["status"], string> = { draft: "Draft", published: "Published", archived: "Archived" };

const priorityLabelsBn: Record<FamilyNotice["priority"], string> = {
  normal: "সাধারণ",
  high: "গুরুত্বপূর্ণ",
  urgent: "অতি জরুরি",
};
const priorityLabelsEn: Record<FamilyNotice["priority"], string> = { normal: "Normal", high: "High", urgent: "Urgent" };

export function NoticeCenter() {
  const { locale, pick } = useLocale();
  const categoryLabels = locale === "bn" ? categoryLabelsBn : categoryLabelsEn;
  const statusLabels = locale === "bn" ? statusLabelsBn : statusLabelsEn;
  const priorityLabels = locale === "bn" ? priorityLabelsBn : priorityLabelsEn;
  const dateFormatter = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const [notices, setNotices] = useState<FamilyNotice[]>([]);
  const [family, setFamily] = useState<NoticePayload["family"]>();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<FamilyNotice | null>(null);
  const [selected, setSelected] = useState<FamilyNotice | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [form, setForm] = useState<NoticeForm>(emptyForm);
  const showResult = useActionResult();
  const [verificationBlocked, setVerificationBlocked] = useState(false);
  const requestGate = useRef(new NoticeRequestGate());
  const mounted = useRef(false);
  const readFamily = useRef<string | undefined>(undefined);
  const editorNotice = useRef<FamilyNotice | null>(null);
  const access = useRef({ ready: false, canManage: false, migrationRequired: true, blocked: false, busy: false });

  const loadNotices = useCallback(async () => {
    if (!mounted.current) return false;
    return readNotices({ gate: requestGate.current, expectedFamilyId: readFamily.current,
      request: (init) => fetch("/api/notices", init),
      start: () => {
        access.current.ready = false; access.current.canManage = false; access.current.migrationRequired = true;
        setLoading(true); setFamily(undefined); setNotices([]); setCanManage(false); setSelected(null); setSetupRequired(false); setMigrationRequired(false);
      },
      loaded: (snapshot) => {
        readFamily.current = snapshot.family.id;
        setFamily(snapshot.family); setNotices(snapshot.notices); setCanManage(snapshot.permissions.canManage); setMigrationRequired(snapshot.migrationRequired);
        access.current.ready = !snapshot.migrationRequired; access.current.canManage = snapshot.permissions.canManage; access.current.migrationRequired = snapshot.migrationRequired;
        if (!noticeEditorStillAvailable(snapshot, editorNotice.current)) { editorNotice.current = null; setCreateOpen(false); setEditingNotice(null); }
      },
      setup: () => { setSetupRequired(true); setCreateOpen(false); },
      failed: (error) => showResult({ kind: "error", title: pick("নোটিশ লোড হয়নি", "Notices could not be loaded"), message: noticeErrorCopy(error.code, locale) ?? noticeErrorCopy("NOTICE_LOAD_FAILED", locale)! }),
      settled: () => setLoading(false),
    });
  }, [locale, pick, showResult]);

  const mutateNotice = useCallback(async (method: "POST" | "PATCH" | "DELETE", id: string | undefined, body: Record<string, unknown>) => {
    const gate = access.current;
    if (!gate.ready || !gate.canManage || gate.migrationRequired || gate.blocked || gate.busy) throw new Error(noticeErrorCopy("NOTICE_INVALID_SNAPSHOT", locale)!);
    gate.busy = true;
    const generation = requestGate.current.begin();
    const path = id ? `/api/notices/${id}` : "/api/notices";
    const editing = method === "POST" || body.action === "edit";
    if (editing) setSaving(true); else setUpdatingId(id ?? null);
    try {
      const outcome = await readNoticeMutation(async () => {
        const response = await fetch(path, { method: method, headers: { "Content-Type": "application/json" }, ...(method === "DELETE" ? {} : { body: JSON.stringify(body) }) });
        if (response.status === 499) return response;
        return response;
      }, method, id, body);
      if (!mounted.current) return null;
      if (outcome.kind === "cancelled") return null;
      if (outcome.kind === "unknown" || !requestGate.current.current(generation)) {
        access.current.blocked = true;
        setVerificationBlocked(true);
        setCreateOpen(false);
        setSelected(null);
        showResult(noticeWriteFeedback(path, 503, { outcomeUnknown: true }, locale)!);
        return null;
      }
      if (outcome.kind === "rejected") throw new Error(noticeErrorCopy(outcome.payload.code, locale) ?? (typeof outcome.payload.error === "string" ? outcome.payload.error : pick("নোটিশের পরিবর্তন গ্রহণ করা হয়নি।", "The notice change was rejected.")));
      return outcome;
    } finally {
      access.current.busy = false;
      if (mounted.current) { setSaving(false); setUpdatingId(null); }
    }
  }, [locale, pick, showResult]);

  async function verifyNoticeOutcome() {
    if (access.current.busy) return;
    setCreateOpen(false); setSelected(null);
    if (await loadNotices()) {
      access.current.blocked = false;
      setVerificationBlocked(false);
      showResult({ kind: "info", title: pick("তালিকা পুনরায় লোড হয়েছে", "List reloaded"), message: pick("নোটিশের অবস্থা মিলিয়ে দেখুন। রিলোড audit log ঠিক করে না এবং কোনো পরিবর্তন আবার পাঠায় না।", "Review the notice state. Reloading does not repair audit logs or resubmit any change.") });
    }
  }

  async function updateNoticeDetails(id: string, input: NoticeForm) {
      const publishAt = qurbaniLocalDateTimeToIso(input.publishAt);
      const expiresAt = qurbaniLocalDateTimeToIso(input.expiresAt);
      if (publishAt === undefined || expiresAt === undefined) throw new Error(pick("সঠিক প্রকাশ ও মেয়াদের সময় দিন।", "Enter valid publish and expiry times."));
      const outcome = await mutateNotice("PATCH", id, { action: "edit", data: { ...input, publishAt, expiresAt } });
      if (!outcome?.notice) return;
      const payload = outcome;
      setNotices((current) => current.map((notice) => notice.id === id ? payload.notice! : notice));
      setSelected((current) => current?.id === id ? payload.notice! : current);
      setCreateOpen(false);
      setEditingNotice(null);
      editorNotice.current = null;
      setForm(emptyForm);
      if (!outcome.auditPending) setFeedback(pick("নোটিশের বিস্তারিত আপডেট হয়েছে।", "Notice details updated."));
  }

  function openCreateNotice() {
    if (!access.current.ready || access.current.blocked || access.current.busy || !access.current.canManage) return;
    setEditingNotice(null);
    editorNotice.current = null;
    setForm(emptyForm);
    setCreateOpen(true);
  }

  function openEditNotice(notice: FamilyNotice) {
    if (!access.current.ready || access.current.blocked || access.current.busy || !access.current.canManage) return;
    setEditingNotice(notice);
    editorNotice.current = notice;
    setForm({
      titleBn: notice.title_bn,
      titleEn: notice.title_en ?? "",
      bodyBn: notice.body_bn,
      bodyEn: notice.body_en ?? "",
      category: notice.category,
      priority: notice.priority,
      status: notice.status,
      publishAt: qurbaniIsoToLocalDateTime(notice.publish_at),
      expiresAt: qurbaniIsoToLocalDateTime(notice.expires_at),
      isPinned: notice.is_pinned,
    });
    setSelected(null);
    setCreateOpen(true);
  }

  async function deleteNotice(id: string) {
      const outcome = await mutateNotice("DELETE", id, {});
      if (!outcome) return;
      setNotices((current) => current.filter((notice) => notice.id !== id));
      setSelected((current) => current?.id === id ? null : current);
      if (!outcome.auditPending) setFeedback(pick("নোটিশ মুছে ফেলা হয়েছে।", "Notice deleted."));
  }

  useEffect(() => {
    mounted.current = true;
    const currentAccess = access.current, currentRequestGate = requestGate.current;
    let active = true;
    queueMicrotask(() => { if (active) void loadNotices(); });
    return () => { active = false; mounted.current = false; currentAccess.ready = false; currentRequestGate.cancel(); };
  }, [loadNotices]);

  const now = useCurrentTime();
  const activeNotices = useMemo(() => {
    return notices.filter((notice) => noticeIsActive(notice, now));
  }, [notices, now]);

  const visibleNotices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return notices.filter((notice) => {
      const matchesText = !needle || [notice.title_bn, notice.title_en, notice.body_bn, notice.body_en, categoryLabels[notice.category]]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "active" && activeNotices.some((item) => item.id === notice.id))
        || notice.status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [activeNotices, categoryLabels, notices, query, statusFilter]);

  const createNotice = useCallback(async (input: NoticeForm) => {
    setFeedback(null);
      const publishAt = qurbaniLocalDateTimeToIso(input.publishAt);
      const expiresAt = qurbaniLocalDateTimeToIso(input.expiresAt);
      if (publishAt === undefined || expiresAt === undefined) throw new Error(pick("সঠিক প্রকাশ ও মেয়াদের সময় দিন।", "Enter valid publish and expiry times."));
      const outcome = await mutateNotice("POST", undefined, { ...input, publishAt, expiresAt });
      if (!outcome?.notice) return;
      const payload = outcome;
      setNotices((current) => [payload.notice!, ...current]);
      setForm(emptyForm);
      setCreateOpen(false);
      editorNotice.current = null;
      if (!outcome.auditPending) setFeedback(outcome.notice.status === "published" ? pick("নোটিশ প্রকাশিত হয়েছে।", "Notice published.") : pick("নোটিশ খসড়া হিসেবে সংরক্ষিত হয়েছে।", "Notice saved as a draft."));
      return { id: outcome.notice.id, status: outcome.notice.status, title: outcome.notice.title_bn, auditPending: outcome.auditPending };
  }, [mutateNotice, pick, setFeedback]);

  async function updateNotice(id: string, action: "publish" | "draft" | "archive" | "pin" | "unpin") {
    setFeedback(null);
      const outcome = await mutateNotice("PATCH", id, { action });
      if (!outcome?.notice) return;
      const payload = outcome;
      setNotices((current) => current.map((notice) => notice.id === id ? payload.notice! : notice));
      setSelected((current) => current?.id === id ? payload.notice! : current);
      if (!outcome.auditPending) setFeedback(pick("নোটিশের অবস্থা আপডেট হয়েছে।", "Notice status updated."));
      return { id, action, status: outcome.notice.status, isPinned: outcome.notice.is_pinned, auditPending: outcome.auditPending };
  }

  async function exportXlsx() {
    if (!access.current.ready || access.current.blocked || access.current.busy || exporting) return;
    setExporting(true);
    const checkpoint = requestGate.current.checkpoint();
    try {
      const XLSX = await import("xlsx");
      if (!access.current.ready || access.current.blocked || access.current.busy || !requestGate.current.current(checkpoint)) {
        showResult({ kind: "info", title: pick("Export পাঠানো হয়নি", "Export not submitted"), message: noticeErrorCopy("NOTICE_EXPORT_SUPERSEDED", locale)! });
        return;
      }
      const rows = noticeExportRows(visibleNotices, locale, { category: categoryLabels, priority: priorityLabels, status: statusLabels });
      const worksheet = noticeWorksheet(XLSX, rows, locale, Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dhaka");
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, pick("পারিবারিক নোটিশ", "Family Notices"));
      XLSX.writeFile(workbook, `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-notices.xlsx`);
      setFeedback(pick("নোটিশ XLSX তৈরি হয়েছে।", "The notices XLSX was created."));
    } catch (error) {
      setFeedback(error instanceof Error && error.message === "NOTICE_EXPORT_INVALID_DATA"
        ? pick("নোটিশে ভুল বা Excel-অসমর্থিত তথ্য আছে। তথ্য যাচাই করুন; অসম্পূর্ণ XLSX নামানো হয়নি।", "A notice contains invalid or Excel-unsupported data. Review the records; no partial XLSX was downloaded.")
        : pick("নোটিশ XLSX তৈরি হয়নি। আবার চেষ্টা করুন।", "The notices XLSX could not be created. Please try again."));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    const modelContext = (document as Document & {
      modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> };
    }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(modelContext.registerTool({
      name: "list_family_notices",
      title: "List family notices",
      description: "Read notices currently available in the family notice center.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        count: notices.length,
        notices: notices.map((notice) => ({
          id: notice.id,
          title: notice.title_bn,
          category: notice.category,
          priority: notice.priority,
          status: notice.status,
          publishAt: notice.publish_at,
          expiresAt: notice.expires_at,
        })),
      }),
    }, { signal: lifecycle.signal })).catch(() => undefined);

    if (canManage) {
      void Promise.resolve(modelContext.registerTool({
        name: "create_family_notice",
        title: "Create a family notice",
        description: "Create and optionally publish one notice for the current family.",
        inputSchema: {
          type: "object",
          properties: {
            titleBn: { type: "string", minLength: 3 },
            bodyBn: { type: "string", minLength: 5 },
            titleEn: { type: "string" },
            bodyEn: { type: "string" },
            category: { type: "string", enum: Object.keys(categoryLabels) },
            priority: { type: "string", enum: ["normal", "high", "urgent"] },
            status: { type: "string", enum: ["draft", "published"] },
            isPinned: { type: "boolean" },
          },
          required: ["titleBn", "bodyBn"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const value = input as Partial<NoticeForm>;
          if (typeof value.titleBn !== "string" || typeof value.bodyBn !== "string") {
            throw new Error("A Bengali title and notice body are required.");
          }
          return createNotice({ ...emptyForm, ...value });
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    }
    return () => lifecycle.abort();
  }, [canManage, categoryLabels, createNotice, notices]);

  if (loading) return <main role="status" aria-live="polite" className="grid min-h-[calc(100vh-4rem)] place-items-center"><div className="flex items-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />{pick("নোটিশ লোড হচ্ছে", "Loading notices")}</div></main>;

  if (setupRequired) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-7">
        <Card className="rounded-3xl border-amber-500/30 py-0 shadow-none"><CardContent className="flex flex-col items-start gap-5 p-7 md:flex-row md:items-center"><ShieldAlert className="size-10 text-amber-700" /><div className="flex-1"><h1 className="text-2xl font-bold">{pick("ফ্যামিলি access সক্রিয় নয়", "Family access is not active")}</h1><p className="mt-1 text-muted-foreground">{pick("Join code দিয়ে আবেদন করুন। Admin অনুমোদনের পর Notice Center ব্যবহার করা যাবে।", "Apply with a join code. You can use Notice Center after admin approval.")}</p></div><Button asChild className="rounded-xl"><a href="/setup">{pick("Family onboarding খুলুন", "Open family onboarding")}</a></Button></CardContent></Card>
      </main>
    );
  }

  if (!loading && !family) return <main className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-7"><Card className="rounded-3xl py-0"><CardContent className="space-y-4 p-7"><h1 className="text-2xl font-bold">{pick("নোটিশ তালিকা পাওয়া যায়নি", "Notice list unavailable")}</h1><p className="text-muted-foreground">{noticeErrorCopy("NOTICE_INVALID_SNAPSHOT", locale)}</p><Button onClick={() => void (verificationBlocked ? verifyNoticeOutcome() : loadNotices())}>{pick("আবার লোড করুন", "Reload list")}</Button></CardContent></Card></main>;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      {verificationBlocked ? <div role="status" className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"><p>{noticeErrorCopy("NOTICE_WRITE_OUTCOME_UNKNOWN", locale)}</p><Button disabled={loading || saving || !!updatingId} onClick={() => void verifyNoticeOutcome()}>{pick("তালিকা লোড করে যাচাই করুন", "Reload to verify")}</Button></div> : null}
      <fieldset disabled={loading || verificationBlocked || saving || !!updatingId || !family || migrationRequired} className="contents">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><Megaphone className="size-4" /> {pick("ফ্যামিলি নোটিশ কেন্দ্র", "Family Notice Center")}</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{pick("স্মার্ট নোটিশ বোর্ড", "Smart notice board")}</h1><p className="mt-1 text-muted-foreground">{pick("জরুরি ঘোষণা, ইভেন্ট, হিসাব ও পারিবারিক আপডেট এক জায়গায়।", "Urgent announcements, events, accounts, and family updates in one place.")}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" className="gap-2 rounded-xl" disabled={!visibleNotices.length || exporting || loading || verificationBlocked || saving || !!updatingId || !family || migrationRequired} onClick={() => void exportXlsx()}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} {pick("XLSX Export", "Export XLSX")}</Button>{canManage ? <Button className="gap-2 rounded-xl" disabled={migrationRequired || loading || verificationBlocked || saving || !!updatingId} onClick={openCreateNotice}><Plus className="size-4" /> {pick("নতুন নোটিশ", "New notice")}</Button> : null}</div>
      </section>

      {migrationRequired ? <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> {pick("Notice database migration একবার Supabase SQL Editor-এ চালাতে হবে। এরপর create, publish ও archive সক্রিয় হবে।", "Run the Notice database migration once in the Supabase SQL Editor. Create, publish, and archive will then be enabled.")}</div> : null}
      {feedback ? <div className="rounded-2xl border bg-muted/35 px-4 py-3 text-sm font-medium">{feedback}</div> : null}

      <NoticeTicker notices={notices} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: pick("সক্রিয় নোটিশ", "Active notices"), value: activeNotices.length, icon: CheckCircle2 },
          { label: pick("পিন করা", "Pinned"), value: notices.filter((notice) => notice.is_pinned && notice.status === "published").length, icon: Pin },
          { label: pick("খসড়া", "Drafts"), value: notices.filter((notice) => notice.status === "draft").length, icon: Clock3 },
          { label: pick("জরুরি", "Urgent"), value: activeNotices.filter((notice) => notice.priority === "urgent").length, icon: TriangleAlert },
        ].map(({ label, value, icon: Icon }) => <Card key={label} className="rounded-2xl border-border/75 py-0 shadow-none"><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value.toLocaleString(locale === "bn" ? "bn-BD" : "en-US")}</p></div><span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span></CardContent></Card>)}
      </section>

      <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5"><div className="relative w-full md:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick("নোটিশের শিরোনাম বা বিষয় খুঁজুন", "Search notice title or topic")} className="h-10 rounded-xl pl-10" /></div><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full rounded-xl md:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{pick("সক্রিয়", "Active")}</SelectItem><SelectItem value="all">{pick("সব নোটিশ", "All notices")}</SelectItem><SelectItem value="published">{pick("প্রকাশিত", "Published")}</SelectItem><SelectItem value="draft">{pick("খসড়া", "Draft")}</SelectItem><SelectItem value="archived">{pick("আর্কাইভ", "Archived")}</SelectItem></SelectContent></Select></div>
        {loading ? <div className="flex min-h-80 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> {pick("নোটিশ লোড হচ্ছে", "Loading notices")}</div> : visibleNotices.length ? <div className="grid gap-4 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">{visibleNotices.map((notice) => <article key={notice.id} className={`relative rounded-2xl border bg-card p-5 transition hover:border-primary/30 hover:shadow-sm ${notice.priority === "urgent" ? "border-destructive/35" : notice.is_pinned ? "border-primary/35" : "border-border/75"}`}>
          <div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge variant={notice.priority === "urgent" ? "destructive" : "secondary"}>{priorityLabels[notice.priority]}</Badge><Badge variant="outline">{categoryLabels[notice.category]}</Badge>{notice.is_pinned ? <Badge variant="outline" className="gap-1 text-primary"><Pin className="size-3" /> {pick("পিন", "Pinned")}</Badge> : null}</div>{canManage ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mr-2 -mt-2 rounded-xl" disabled={loading || verificationBlocked || saving || !!updatingId}><Ellipsis className="size-4" /><span className="sr-only">{pick("নোটিশের কাজ", "Notice actions")}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={() => openEditNotice(notice)}><Pencil /> {pick("বিস্তারিত সম্পাদনা", "Edit details")}</DropdownMenuItem>{notice.status !== "published" ? <DropdownMenuItem onClick={() => void updateNotice(notice.id, "publish").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("নোটিশ আপডেট হয়নি।", "The notice could not be updated.")))}><CheckCircle2 /> {pick("প্রকাশ করুন", "Publish")}</DropdownMenuItem> : <DropdownMenuItem onClick={() => void updateNotice(notice.id, "draft").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("নোটিশ আপডেট হয়নি।", "The notice could not be updated.")))}><Clock3 /> {pick("খসড়া করুন", "Move to draft")}</DropdownMenuItem>}<DropdownMenuItem onClick={() => void updateNotice(notice.id, notice.is_pinned ? "unpin" : "pin").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("নোটিশ আপডেট হয়নি।", "The notice could not be updated.")))}>{notice.is_pinned ? <PinOff /> : <Pin />} {notice.is_pinned ? pick("পিন সরান", "Unpin") : pick("পিন করুন", "Pin")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void updateNotice(notice.id, "archive").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("নোটিশ আপডেট হয়নি।", "The notice could not be updated.")))}><Archive /> {pick("আর্কাইভ", "Archive")}</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void deleteNotice(notice.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("নোটিশ মোছা যায়নি।", "The notice could not be deleted.")))}><Trash2 /> {pick("স্থায়ীভাবে মুছুন", "Delete permanently")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</div>
          <button type="button" className="mt-4 block w-full text-left" onClick={() => setSelected(notice)}><h2 className="text-lg font-bold leading-snug">{locale === "en" ? notice.title_en || notice.title_bn : notice.title_bn}</h2>{locale === "bn" && notice.title_en ? <p className="mt-1 text-sm text-muted-foreground">{notice.title_en}</p> : null}<p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{locale === "en" ? notice.body_en || notice.body_bn : notice.body_bn}</p></button>
          <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"><Badge variant="outline">{statusLabels[notice.status]}</Badge><span>{notice.publish_at ? dateFormatter.format(new Date(notice.publish_at)) : dateFormatter.format(new Date(notice.created_at))}</span></div>
        </article>)}</div> : <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center"><Megaphone className="size-11 text-muted-foreground/45" /><h2 className="mt-4 text-xl font-bold">{pick("এই তালিকায় কোনো নোটিশ নেই", "There are no notices in this list")}</h2><p className="mt-1 text-sm text-muted-foreground">{pick("Filter বদলান অথবা নতুন পারিবারিক নোটিশ তৈরি করুন।", "Change the filter or create a new family notice.")}</p>{canManage && !migrationRequired ? <Button className="mt-5 gap-2 rounded-xl" onClick={openCreateNotice}><Plus className="size-4" /> {pick("প্রথম নোটিশ তৈরি করুন", "Create first notice")}</Button> : null}</div>}
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!access.current.ready || access.current.busy || access.current.blocked) return; setCreateOpen(open); if (!open) { editorNotice.current = null; setEditingNotice(null); setForm(emptyForm); } }}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-3xl"><DialogHeader><DialogTitle>{editingNotice ? pick("নোটিশ সম্পাদনা করুন", "Edit notice") : pick("নতুন পারিবারিক নোটিশ", "New family notice")}</DialogTitle><DialogDescription>{editingNotice ? pick("শিরোনাম, বিস্তারিত, সময় ও প্রকাশের সেটিংস আপডেট করুন।", "Update the title, details, schedule and publishing settings.") : pick("প্রকাশের সময়, অগ্রাধিকার ও মেয়াদ ঠিক করে সদস্যদের জন্য নোটিশ তৈরি করুন।", "Create a notice for members with a publish time, priority and expiry.")}</DialogDescription></DialogHeader><fieldset disabled={saving || loading || verificationBlocked} className="contents"><div className="grid gap-4 py-2 sm:grid-cols-2"><Field label={pick("শিরোনাম (বাংলা)", "Title (Bangla)")} id="notice-title-bn"><Input id="notice-title-bn" value={form.titleBn} onChange={(event) => setForm({ ...form, titleBn: event.target.value })} /></Field><Field label={pick("শিরোনাম (ইংরেজি)", "Title (English)")} id="notice-title-en"><Input id="notice-title-en" value={form.titleEn} onChange={(event) => setForm({ ...form, titleEn: event.target.value })} /></Field><div className="sm:col-span-2"><Field label={pick("বিস্তারিত (বাংলা)", "Details (Bangla)")} id="notice-body-bn"><Textarea id="notice-body-bn" rows={5} value={form.bodyBn} onChange={(event) => setForm({ ...form, bodyBn: event.target.value })} /></Field></div><div className="sm:col-span-2"><Field label={pick("বিস্তারিত (ইংরেজি)", "Details (English)")} id="notice-body-en"><Textarea id="notice-body-en" rows={3} value={form.bodyEn} onChange={(event) => setForm({ ...form, bodyEn: event.target.value })} /></Field></div><Field label={pick("ক্যাটাগরি", "Category")} id="notice-category"><Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value as FamilyNotice["category"] })}><SelectTrigger id="notice-category" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(categoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label={pick("অগ্রাধিকার", "Priority")} id="notice-priority"><Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value as FamilyNotice["priority"] })}><SelectTrigger id="notice-priority" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">{priorityLabels.normal}</SelectItem><SelectItem value="high">{priorityLabels.high}</SelectItem><SelectItem value="urgent">{priorityLabels.urgent}</SelectItem></SelectContent></Select></Field><Field label={pick("অবস্থা", "Status")} id="notice-status"><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as NoticeForm["status"] })}><SelectTrigger id="notice-status" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="published">{pick("এখন প্রকাশ", "Publish now")}</SelectItem><SelectItem value="draft">{pick("খসড়া", "Draft")}</SelectItem>{editingNotice ? <SelectItem value="archived">{pick("আর্কাইভ", "Archived")}</SelectItem> : null}</SelectContent></Select></Field><Field label={pick("প্রকাশের সময় (ঐচ্ছিক)", "Publish time (optional)")} id="notice-publish"><Input id="notice-publish" type="datetime-local" value={form.publishAt} onChange={(event) => setForm({ ...form, publishAt: event.target.value })} /></Field><Field label={pick("মেয়াদ শেষ (ঐচ্ছিক)", "Expiry (optional)")} id="notice-expiry"><Input id="notice-expiry" type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></Field><div className="flex items-center justify-between rounded-2xl border p-4"><div><Label htmlFor="notice-pin">{pick("গুরুত্বপূর্ণ হিসেবে পিন", "Pin as important")}</Label><p className="mt-1 text-xs text-muted-foreground">{pick("টিকার ও তালিকার উপরে থাকবে", "Shown at the top of the ticker and list")}</p></div><Switch id="notice-pin" checked={form.isPinned} onCheckedChange={(checked) => setForm({ ...form, isPinned: checked })} /></div></div><DialogFooter><Button variant="outline" className="rounded-xl" disabled={saving || loading || verificationBlocked} onClick={() => { editorNotice.current = null; setCreateOpen(false); setEditingNotice(null); setForm(emptyForm); }}>{pick("বাতিল", "Cancel")}</Button><Button className="gap-2 rounded-xl" disabled={saving || loading || verificationBlocked || form.titleBn.trim().length < 3 || form.bodyBn.trim().length < 5} onClick={() => void (editingNotice ? updateNoticeDetails(editingNotice.id, form) : createNotice(form)).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("নোটিশ সেভ হয়নি।", "The notice could not be saved.")))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : editingNotice ? <Pencil className="size-4" /> : <Megaphone className="size-4" />} {editingNotice ? pick("নোটিশ আপডেট", "Update notice") : form.status === "published" ? pick("প্রকাশ করুন", "Publish") : pick("খসড়া সংরক্ষণ", "Save draft")}</Button></DialogFooter></fieldset></DialogContent></Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl"><DialogHeader><div className="flex flex-wrap gap-2 pb-2">{selected ? <><Badge variant={selected.priority === "urgent" ? "destructive" : "secondary"}>{priorityLabels[selected.priority]}</Badge><Badge variant="outline">{categoryLabels[selected.category]}</Badge></> : null}</div><DialogTitle className="text-2xl leading-snug">{locale === "en" ? selected?.title_en || selected?.title_bn : selected?.title_bn}</DialogTitle><DialogDescription>{locale === "bn" ? selected?.title_en || (selected?.publish_at ? dateFormatter.format(new Date(selected.publish_at)) : "ফ্যামিলি নোটিশ") : selected?.publish_at ? dateFormatter.format(new Date(selected.publish_at)) : "Family notice"}</DialogDescription></DialogHeader>{selected ? <div className="space-y-5"><p className="whitespace-pre-wrap text-base leading-7">{locale === "en" ? selected.body_en || selected.body_bn : selected.body_bn}</p>{locale === "bn" && selected.body_en ? <div className="rounded-2xl bg-muted/45 p-5"><p className="whitespace-pre-wrap leading-7 text-muted-foreground">{selected.body_en}</p></div> : null}{selected.expires_at ? <p className="text-sm text-muted-foreground">{pick("মেয়াদ শেষ", "Expires")}: {dateFormatter.format(new Date(selected.expires_at))}</p> : null}</div> : null}</DialogContent></Dialog>
      </fieldset>
    </main>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
