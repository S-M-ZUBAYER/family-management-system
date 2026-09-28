"use client";

import { useActionFeedback } from "@/components/action-modal-provider";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  CheckCircle2,
  Clock3,
  Download,
  Ellipsis,
  LoaderCircle,
  Megaphone,
  Pin,
  PinOff,
  Plus,
  Search,
  ShieldAlert,
  TriangleAlert,
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
  family?: { id: string; name_bn: string; name_en: string };
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
  status: "draft" | "published";
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

const categoryLabels: Record<FamilyNotice["category"], string> = {
  general: "সাধারণ",
  urgent: "জরুরি",
  event: "ইভেন্ট",
  finance: "হিসাব ও ফান্ড",
  qurbani: "কোরবানি",
  health: "স্বাস্থ্য",
};

const statusLabels: Record<FamilyNotice["status"], string> = {
  draft: "খসড়া",
  published: "প্রকাশিত",
  archived: "আর্কাইভ",
};

const priorityLabels: Record<FamilyNotice["priority"], string> = {
  normal: "সাধারণ",
  high: "গুরুত্বপূর্ণ",
  urgent: "অতি জরুরি",
};

const dateFormatter = new Intl.DateTimeFormat("bn-BD", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function NoticeCenter() {
  const [notices, setNotices] = useState<FamilyNotice[]>([]);
  const [family, setFamily] = useState<NoticePayload["family"]>();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<FamilyNotice | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [form, setForm] = useState<NoticeForm>(emptyForm);

  const loadNotices = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/notices", { cache: "no-store" });
      const payload = (await response.json()) as NoticePayload;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        setSetupRequired(true);
        setNotices([]);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "Notice board পাওয়া যায়নি।");
      setFamily(payload.family);
      setNotices(payload.notices ?? []);
      setMigrationRequired(Boolean(payload.migrationRequired));
      setCanManage(Boolean(payload.permissions?.canManage));
      setSetupRequired(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Notice board পাওয়া যায়নি।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  const activeNotices = useMemo(() => {
    const now = Date.now();
    return notices.filter((notice) => {
      const starts = notice.publish_at ? new Date(notice.publish_at).getTime() <= now : true;
      const valid = notice.expires_at ? new Date(notice.expires_at).getTime() > now : true;
      return notice.status === "published" && starts && valid;
    });
  }, [notices]);

  const visibleNotices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return notices.filter((notice) => {
      const matchesText = !needle || [notice.title_bn, notice.title_en, notice.body_bn, categoryLabels[notice.category]]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "active" && activeNotices.some((item) => item.id === notice.id))
        || notice.status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [activeNotices, notices, query, statusFilter]);

  async function createNotice(input: NoticeForm) {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as { notice?: FamilyNotice; error?: string };
      if (!response.ok || !payload.notice) throw new Error(payload.error ?? "Notice save হয়নি।");
      setNotices((current) => [payload.notice!, ...current]);
      setForm(emptyForm);
      setCreateOpen(false);
      setFeedback(payload.notice.status === "published" ? "Notice প্রকাশিত হয়েছে।" : "Notice খসড়া হিসেবে সংরক্ষিত হয়েছে।");
      return { id: payload.notice.id, status: payload.notice.status, title: payload.notice.title_bn };
    } finally {
      setSaving(false);
    }
  }

  async function updateNotice(id: string, action: "publish" | "draft" | "archive" | "pin" | "unpin") {
    setUpdatingId(id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/notices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { notice?: FamilyNotice; error?: string };
      if (!response.ok || !payload.notice) throw new Error(payload.error ?? "Notice update হয়নি।");
      setNotices((current) => current.map((notice) => notice.id === id ? payload.notice! : notice));
      setSelected((current) => current?.id === id ? payload.notice! : current);
      setFeedback("Notice status update হয়েছে।");
      return { id, action, status: payload.notice.status, isPinned: payload.notice.is_pinned };
    } finally {
      setUpdatingId(null);
    }
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(visibleNotices.map((notice, index) => ({
        "ক্রমিক": index + 1,
        "শিরোনাম": notice.title_bn,
        "Title (English)": notice.title_en ?? "",
        "বিস্তারিত": notice.body_bn,
        "ক্যাটাগরি": categoryLabels[notice.category],
        "অগ্রাধিকার": priorityLabels[notice.priority],
        "অবস্থা": statusLabels[notice.status],
        "পিন করা": notice.is_pinned ? "হ্যাঁ" : "না",
        "প্রকাশের সময়": notice.publish_at ? dateFormatter.format(new Date(notice.publish_at)) : "",
        "মেয়াদ শেষ": notice.expires_at ? dateFormatter.format(new Date(notice.expires_at)) : "",
        "তৈরির সময়": dateFormatter.format(new Date(notice.created_at)),
      })));
      worksheet["!cols"] = [8, 34, 30, 60, 20, 18, 16, 12, 24, 24, 24].map((wch) => ({ wch }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Family Notices");
      XLSX.writeFile(workbook, `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-notices.xlsx`);
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
  }, [canManage, notices]);

  if (setupRequired) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-7">
        <Card className="rounded-3xl border-amber-500/30 py-0 shadow-none"><CardContent className="flex flex-col items-start gap-5 p-7 md:flex-row md:items-center"><ShieldAlert className="size-10 text-amber-700" /><div className="flex-1"><h1 className="text-2xl font-bold">Family Owner setup বাকি</h1><p className="mt-1 text-muted-foreground">Notice Center ব্যবহার করার আগে প্রথম পরিবার সক্রিয় করুন।</p></div><Button asChild className="rounded-xl"><a href="/setup">Owner setup খুলুন</a></Button></CardContent></Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><Megaphone className="size-4" /> Family Notice Center</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">স্মার্ট নোটিশ বোর্ড</h1><p className="mt-1 text-muted-foreground">জরুরি ঘোষণা, ইভেন্ট, হিসাব ও পারিবারিক আপডেট এক জায়গায়।</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" className="gap-2 rounded-xl" disabled={!visibleNotices.length || exporting} onClick={() => void exportXlsx()}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} XLSX Export</Button>{canManage ? <Button className="gap-2 rounded-xl" disabled={migrationRequired} onClick={() => setCreateOpen(true)}><Plus className="size-4" /> নতুন নোটিশ</Button> : null}</div>
      </section>

      {migrationRequired ? <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> Notice database migration একবার Supabase SQL Editor-এ চালাতে হবে। এর পর create, publish ও archive সক্রিয় হবে।</div> : null}
      {feedback ? <div className="rounded-2xl border bg-muted/35 px-4 py-3 text-sm font-medium">{feedback}</div> : null}

      <NoticeTicker notices={notices} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "সক্রিয় নোটিশ", value: activeNotices.length, icon: CheckCircle2 },
          { label: "পিন করা", value: notices.filter((notice) => notice.is_pinned && notice.status === "published").length, icon: Pin },
          { label: "খসড়া", value: notices.filter((notice) => notice.status === "draft").length, icon: Clock3 },
          { label: "জরুরি", value: activeNotices.filter((notice) => notice.priority === "urgent").length, icon: TriangleAlert },
        ].map(({ label, value, icon: Icon }) => <Card key={label} className="rounded-2xl border-border/75 py-0 shadow-none"><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value.toLocaleString("bn-BD")}</p></div><span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span></CardContent></Card>)}
      </section>

      <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5"><div className="relative w-full md:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="নোটিশের শিরোনাম বা বিষয় খুঁজুন" className="h-10 rounded-xl pl-10" /></div><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full rounded-xl md:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">সক্রিয়</SelectItem><SelectItem value="all">সব নোটিশ</SelectItem><SelectItem value="published">প্রকাশিত</SelectItem><SelectItem value="draft">খসড়া</SelectItem><SelectItem value="archived">আর্কাইভ</SelectItem></SelectContent></Select></div>
        {loading ? <div className="flex min-h-80 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Notice load হচ্ছে</div> : visibleNotices.length ? <div className="grid gap-4 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">{visibleNotices.map((notice) => <article key={notice.id} className={`relative rounded-2xl border bg-card p-5 transition hover:border-primary/30 hover:shadow-sm ${notice.priority === "urgent" ? "border-destructive/35" : notice.is_pinned ? "border-primary/35" : "border-border/75"}`}>
          <div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge variant={notice.priority === "urgent" ? "destructive" : "secondary"}>{priorityLabels[notice.priority]}</Badge><Badge variant="outline">{categoryLabels[notice.category]}</Badge>{notice.is_pinned ? <Badge variant="outline" className="gap-1 text-primary"><Pin className="size-3" /> পিন</Badge> : null}</div>{canManage ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mr-2 -mt-2 rounded-xl" disabled={updatingId === notice.id}><Ellipsis className="size-4" /><span className="sr-only">Notice actions</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-44">{notice.status !== "published" ? <DropdownMenuItem onClick={() => void updateNotice(notice.id, "publish").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Notice update হয়নি।"))}><CheckCircle2 /> প্রকাশ করুন</DropdownMenuItem> : <DropdownMenuItem onClick={() => void updateNotice(notice.id, "draft").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Notice update হয়নি।"))}><Clock3 /> খসড়া করুন</DropdownMenuItem>}<DropdownMenuItem onClick={() => void updateNotice(notice.id, notice.is_pinned ? "unpin" : "pin").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Notice update হয়নি।"))}>{notice.is_pinned ? <PinOff /> : <Pin />} {notice.is_pinned ? "Unpin" : "Pin"}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void updateNotice(notice.id, "archive").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Notice update হয়নি।"))}><Archive /> আর্কাইভ</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</div>
          <button type="button" className="mt-4 block w-full text-left" onClick={() => setSelected(notice)}><h2 className="text-lg font-bold leading-snug">{notice.title_bn}</h2>{notice.title_en ? <p className="mt-1 text-sm text-muted-foreground">{notice.title_en}</p> : null}<p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{notice.body_bn}</p></button>
          <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"><Badge variant="outline">{statusLabels[notice.status]}</Badge><span>{notice.publish_at ? dateFormatter.format(new Date(notice.publish_at)) : dateFormatter.format(new Date(notice.created_at))}</span></div>
        </article>)}</div> : <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center"><Megaphone className="size-11 text-muted-foreground/45" /><h2 className="mt-4 text-xl font-bold">এই তালিকায় কোনো নোটিশ নেই</h2><p className="mt-1 text-sm text-muted-foreground">Filter বদলান অথবা নতুন পারিবারিক নোটিশ তৈরি করুন।</p>{canManage && !migrationRequired ? <Button className="mt-5 gap-2 rounded-xl" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> প্রথম নোটিশ তৈরি করুন</Button> : null}</div>}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-3xl"><DialogHeader><DialogTitle>নতুন পারিবারিক নোটিশ</DialogTitle><DialogDescription>প্রকাশের সময়, priority এবং মেয়াদ ঠিক করে সদস্যদের জন্য notice তৈরি করুন।</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="শিরোনাম (বাংলা)" id="notice-title-bn"><Input id="notice-title-bn" value={form.titleBn} onChange={(event) => setForm({ ...form, titleBn: event.target.value })} /></Field><Field label="Title (English)" id="notice-title-en"><Input id="notice-title-en" value={form.titleEn} onChange={(event) => setForm({ ...form, titleEn: event.target.value })} /></Field><div className="sm:col-span-2"><Field label="বিস্তারিত (বাংলা)" id="notice-body-bn"><Textarea id="notice-body-bn" rows={5} value={form.bodyBn} onChange={(event) => setForm({ ...form, bodyBn: event.target.value })} /></Field></div><div className="sm:col-span-2"><Field label="Details (English)" id="notice-body-en"><Textarea id="notice-body-en" rows={3} value={form.bodyEn} onChange={(event) => setForm({ ...form, bodyEn: event.target.value })} /></Field></div><Field label="ক্যাটাগরি" id="notice-category"><Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value as FamilyNotice["category"] })}><SelectTrigger id="notice-category" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(categoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="অগ্রাধিকার" id="notice-priority"><Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value as FamilyNotice["priority"] })}><SelectTrigger id="notice-priority" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">সাধারণ</SelectItem><SelectItem value="high">গুরুত্বপূর্ণ</SelectItem><SelectItem value="urgent">অতি জরুরি</SelectItem></SelectContent></Select></Field><Field label="অবস্থা" id="notice-status"><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as NoticeForm["status"] })}><SelectTrigger id="notice-status" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="published">এখন প্রকাশ</SelectItem><SelectItem value="draft">খসড়া</SelectItem></SelectContent></Select></Field><Field label="প্রকাশের সময় (ঐচ্ছিক)" id="notice-publish"><Input id="notice-publish" type="datetime-local" value={form.publishAt} onChange={(event) => setForm({ ...form, publishAt: event.target.value })} /></Field><Field label="মেয়াদ শেষ (ঐচ্ছিক)" id="notice-expiry"><Input id="notice-expiry" type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></Field><div className="flex items-center justify-between rounded-2xl border p-4"><div><Label htmlFor="notice-pin">গুরুত্বপূর্ণ হিসেবে পিন</Label><p className="mt-1 text-xs text-muted-foreground">Ticker ও তালিকার উপরে থাকবে</p></div><Switch id="notice-pin" checked={form.isPinned} onCheckedChange={(checked) => setForm({ ...form, isPinned: checked })} /></div></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>বাতিল</Button><Button className="gap-2 rounded-xl" disabled={saving || form.titleBn.trim().length < 3 || form.bodyBn.trim().length < 5} onClick={() => void createNotice(form).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Notice save হয়নি।"))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Megaphone className="size-4" />} {form.status === "published" ? "প্রকাশ করুন" : "খসড়া সংরক্ষণ"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl"><DialogHeader><div className="flex flex-wrap gap-2 pb-2">{selected ? <><Badge variant={selected.priority === "urgent" ? "destructive" : "secondary"}>{priorityLabels[selected.priority]}</Badge><Badge variant="outline">{categoryLabels[selected.category]}</Badge></> : null}</div><DialogTitle className="text-2xl leading-snug">{selected?.title_bn}</DialogTitle><DialogDescription>{selected?.title_en || (selected?.publish_at ? dateFormatter.format(new Date(selected.publish_at)) : "Family notice")}</DialogDescription></DialogHeader>{selected ? <div className="space-y-5"><p className="whitespace-pre-wrap text-base leading-7">{selected.body_bn}</p>{selected.body_en ? <div className="rounded-2xl bg-muted/45 p-5"><p className="whitespace-pre-wrap leading-7 text-muted-foreground">{selected.body_en}</p></div> : null}{selected.expires_at ? <p className="text-sm text-muted-foreground">মেয়াদ শেষ: {dateFormatter.format(new Date(selected.expires_at))}</p> : null}</div> : null}</DialogContent></Dialog>
    </main>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
