"use client";

import { useActionFeedback } from "@/components/action-modal-provider";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Download,
  Ellipsis,
  ImagePlus,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  ShieldAlert,
  TriangleAlert,
  Upload,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type FamilyEvent = {
  id: string;
  title_bn: string;
  title_en: string | null;
  description_bn: string;
  description_en: string | null;
  event_type: "reunion" | "tour" | "wedding" | "religious" | "meeting" | "other";
  start_at: string;
  end_at: string | null;
  venue: string;
  city: string | null;
  meeting_point: string | null;
  estimated_cost_per_person: number | string;
  total_budget: number | string;
  capacity: number | null;
  registration_deadline: string | null;
  status: "draft" | "published" | "registration_closed" | "completed" | "cancelled";
  created_at: string;
};

type EventRsvp = {
  id: string;
  event_id: string;
  is_current_user: boolean;
  respondent_name: string;
  response: "going" | "maybe" | "not_going";
  guest_count: number;
  note: string | null;
  updated_at: string;
};

type EventComment = {
  id: string;
  event_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

type EventMedia = {
  id: string;
  event_id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  caption: string | null;
  uploader_name: string;
  created_at: string;
};

type EventPayload = {
  family?: { id: string; name_bn: string; name_en: string };
  events?: FamilyEvent[];
  rsvps?: EventRsvp[];
  comments?: EventComment[];
  media?: EventMedia[];
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};

type EventForm = {
  titleBn: string;
  titleEn: string;
  descriptionBn: string;
  descriptionEn: string;
  eventType: FamilyEvent["event_type"];
  startAt: string;
  endAt: string;
  venue: string;
  city: string;
  meetingPoint: string;
  estimatedCostPerPerson: string;
  totalBudget: string;
  capacity: string;
  registrationDeadline: string;
  status: "draft" | "published";
};

const emptyForm: EventForm = {
  titleBn: "",
  titleEn: "",
  descriptionBn: "",
  descriptionEn: "",
  eventType: "reunion",
  startAt: "",
  endAt: "",
  venue: "",
  city: "",
  meetingPoint: "",
  estimatedCostPerPerson: "",
  totalBudget: "",
  capacity: "",
  registrationDeadline: "",
  status: "published",
};

const typeLabels: Record<FamilyEvent["event_type"], string> = {
  reunion: "পারিবারিক মিলনমেলা",
  tour: "ট্যুর",
  wedding: "বিবাহ অনুষ্ঠান",
  religious: "ধর্মীয় আয়োজন",
  meeting: "পারিবারিক সভা",
  other: "অন্যান্য",
};

const statusLabels: Record<FamilyEvent["status"], string> = {
  draft: "খসড়া",
  published: "রেজিস্ট্রেশন চলছে",
  registration_closed: "রেজিস্ট্রেশন বন্ধ",
  completed: "সম্পন্ন",
  cancelled: "বাতিল",
};

const responseLabels: Record<EventRsvp["response"], string> = {
  going: "যাব",
  maybe: "হয়তো",
  not_going: "যেতে পারব না",
};

const dateFormatter = new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium", timeStyle: "short" });
const moneyFormatter = new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });

export function EventCenter() {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [rsvps, setRsvps] = useState<EventRsvp[]>([]);
  const [comments, setComments] = useState<EventComment[]>([]);
  const [media, setMedia] = useState<EventMedia[]>([]);
  const [family, setFamily] = useState<EventPayload["family"]>();
  const [canManage, setCanManage] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("upcoming");
  const [feedback, setFeedback] = useActionFeedback();
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [guestCount, setGuestCount] = useState("0");
  const [rsvpNote, setRsvpNote] = useState("");
  const [commentText, setCommentText] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => events.find((event) => event.id === selectedId) ?? null, [events, selectedId]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/events", { cache: "no-store" });
      const payload = (await response.json()) as EventPayload;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        setSetupRequired(true);
        setEvents([]);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "Event planner পাওয়া যায়নি।");
      setFamily(payload.family);
      setEvents(payload.events ?? []);
      setRsvps(payload.rsvps ?? []);
      setComments(payload.comments ?? []);
      setMedia(payload.media ?? []);
      setCanManage(Boolean(payload.permissions?.canManage));
      setMigrationRequired(Boolean(payload.migrationRequired));
      setSetupRequired(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Event planner পাওয়া যায়নি।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!selectedId) return;
    const mine = rsvps.find((item) => item.event_id === selectedId && item.is_current_user);
    setGuestCount(String(mine?.guest_count ?? 0));
    setRsvpNote(mine?.note ?? "");
  }, [rsvps, selectedId]);

  const visibleEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const now = Date.now();
    return events.filter((event) => {
      const matchesText = !needle || [event.title_bn, event.title_en, event.venue, event.city, typeLabels[event.event_type]]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
      const matchesFilter = filter === "all"
        || (filter === "upcoming" && new Date(event.start_at).getTime() >= now && !["completed", "cancelled"].includes(event.status))
        || event.status === filter
        || event.event_type === filter;
      return matchesText && matchesFilter;
    });
  }, [events, filter, query]);

  const eventRsvps = (id: string) => rsvps.filter((item) => item.event_id === id);
  const goingCount = (id: string) => eventRsvps(id).filter((item) => item.response === "going").reduce((total, item) => total + 1 + item.guest_count, 0);

  async function createEvent(input: EventForm) {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as { event?: FamilyEvent; error?: string };
      if (!response.ok || !payload.event) throw new Error(payload.error ?? "Event save হয়নি।");
      setEvents((current) => [...current, payload.event!].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()));
      setForm(emptyForm);
      setCreateOpen(false);
      setFeedback(payload.event.status === "published" ? "Event প্রকাশিত হয়েছে।" : "Event খসড়া হিসেবে সংরক্ষিত হয়েছে।");
      return { id: payload.event.id, title: payload.event.title_bn, status: payload.event.status };
    } finally {
      setSaving(false);
    }
  }

  async function updateEvent(action: "publish" | "close" | "complete" | "cancel" | "draft") {
    if (!selected) return;
    setWorking(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/events/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { event?: FamilyEvent; error?: string };
      if (!response.ok || !payload.event) throw new Error(payload.error ?? "Event update হয়নি।");
      setEvents((current) => current.map((event) => event.id === selected.id ? payload.event! : event));
      setFeedback("Event status update হয়েছে।");
    } finally {
      setWorking(false);
    }
  }

  async function saveRsvp(responseValue: EventRsvp["response"]) {
    if (!selected) return;
    setWorking(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/events/${selected.id}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: responseValue, guestCount: Number(guestCount || 0), note: rsvpNote }),
      });
      const payload = (await response.json()) as { rsvp?: EventRsvp; error?: string };
      if (!response.ok || !payload.rsvp) throw new Error(payload.error ?? "RSVP save হয়নি।");
      setRsvps((current) => [...current.filter((item) => item.id !== payload.rsvp!.id && !(item.event_id === payload.rsvp!.event_id && item.is_current_user)), payload.rsvp!]);
      setFeedback(`আপনার উত্তর “${responseLabels[responseValue]}” হিসেবে সংরক্ষিত হয়েছে।`);
      return { eventId: selected.id, response: responseValue, guestCount: payload.rsvp.guest_count };
    } finally {
      setWorking(false);
    }
  }

  async function addComment() {
    if (!selected || commentText.trim().length < 2) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/events/${selected.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText }),
      });
      const payload = (await response.json()) as { comment?: EventComment; error?: string };
      if (!response.ok || !payload.comment) throw new Error(payload.error ?? "Comment save হয়নি।");
      setComments((current) => [...current, payload.comment!]);
      setCommentText("");
    } finally {
      setWorking(false);
    }
  }

  async function uploadMedia(file: File) {
    if (!selected) return;
    setWorking(true);
    setFeedback(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("caption", mediaCaption);
      const response = await fetch(`/api/events/${selected.id}/media`, { method: "POST", body });
      const payload = (await response.json()) as { media?: EventMedia; error?: string };
      if (!response.ok || !payload.media) throw new Error(payload.error ?? "Media upload হয়নি।");
      setMedia((current) => [payload.media!, ...current]);
      setMediaCaption("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFeedback("Event gallery-তে media যোগ হয়েছে।");
    } finally {
      setWorking(false);
    }
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const eventSheet = XLSX.utils.json_to_sheet(visibleEvents.map((event, index) => ({
        "ক্রমিক": index + 1,
        "ইভেন্ট": event.title_bn,
        "ধরন": typeLabels[event.event_type],
        "শুরু": dateFormatter.format(new Date(event.start_at)),
        "শেষ": event.end_at ? dateFormatter.format(new Date(event.end_at)) : "",
        "স্থান": [event.venue, event.city].filter(Boolean).join(", "),
        "প্রতি ব্যক্তি": Number(event.estimated_cost_per_person),
        "মোট বাজেট": Number(event.total_budget),
        "Capacity": event.capacity ?? "",
        "অংশগ্রহণকারী": goingCount(event.id),
        "অবস্থা": statusLabels[event.status],
      })));
      const rsvpSheet = XLSX.utils.json_to_sheet(rsvps.filter((item) => visibleEvents.some((event) => event.id === item.event_id)).map((item) => ({
        "ইভেন্ট": events.find((event) => event.id === item.event_id)?.title_bn ?? "",
        "সদস্য": item.respondent_name,
        "উত্তর": responseLabels[item.response],
        "অতিথি": item.guest_count,
        "মন্তব্য": item.note ?? "",
      })));
      const commentSheet = XLSX.utils.json_to_sheet(comments.filter((item) => visibleEvents.some((event) => event.id === item.event_id)).map((item) => ({
        "ইভেন্ট": events.find((event) => event.id === item.event_id)?.title_bn ?? "",
        "সদস্য": item.author_name,
        "মন্তব্য": item.body,
        "সময়": dateFormatter.format(new Date(item.created_at)),
      })));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, eventSheet, "Events");
      XLSX.utils.book_append_sheet(workbook, rsvpSheet, "RSVPs");
      XLSX.utils.book_append_sheet(workbook, commentSheet, "Discussion");
      XLSX.writeFile(workbook, `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-events.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(modelContext.registerTool({
      name: "list_family_events",
      title: "List family events",
      description: "Read family events with schedule, venue, status, budget and RSVP totals.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({ count: events.length, events: events.map((event) => ({ id: event.id, title: event.title_bn, type: event.event_type, startAt: event.start_at, venue: event.venue, status: event.status, going: goingCount(event.id) })) }),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    if (canManage) void Promise.resolve(modelContext.registerTool({
      name: "create_family_event",
      title: "Create a family event",
      description: "Create a family event or tour with schedule, venue and budget.",
      inputSchema: { type: "object", properties: { titleBn: { type: "string", minLength: 3 }, descriptionBn: { type: "string", minLength: 5 }, eventType: { type: "string", enum: Object.keys(typeLabels) }, startAt: { type: "string" }, venue: { type: "string" }, city: { type: "string" }, status: { type: "string", enum: ["draft", "published"] } }, required: ["titleBn", "descriptionBn", "startAt", "venue"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => createEvent({ ...emptyForm, ...(input as Partial<EventForm>) }),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [canManage, events, rsvps]);

  if (setupRequired) return <main className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-7"><Card className="rounded-3xl border-amber-500/30 py-0 shadow-none"><CardContent className="flex flex-col items-start gap-5 p-7 md:flex-row md:items-center"><ShieldAlert className="size-10 text-amber-700" /><div className="flex-1"><h1 className="text-2xl font-bold">Family Owner setup বাকি</h1><p className="mt-1 text-muted-foreground">Event Planner ব্যবহার করার আগে প্রথম পরিবার সক্রিয় করুন।</p></div><Button asChild className="rounded-xl"><a href="/setup">Owner setup খুলুন</a></Button></CardContent></Card></main>;

  const selectedRsvps = selected ? eventRsvps(selected.id) : [];
  const selectedComments = selected ? comments.filter((item) => item.event_id === selected.id) : [];
  const selectedMedia = selected ? media.filter((item) => item.event_id === selected.id) : [];
  const myRsvp = selected ? selectedRsvps.find((item) => item.is_current_user) : undefined;
  const selectedGoing = selected ? goingCount(selected.id) : 0;
  const capacityProgress = selected?.capacity ? Math.min(100, (selectedGoing / selected.capacity) * 100) : 0;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><CalendarDays className="size-4" /> Event & Tour Operations</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">ইভেন্ট ও ট্যুর ম্যানেজমেন্ট</h1><p className="mt-1 text-muted-foreground">পরিকল্পনা, registration, আলোচনা, budget ও স্মৃতির gallery এক জায়গায়।</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="gap-2 rounded-xl" disabled={!visibleEvents.length || exporting} onClick={() => void exportXlsx()}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} XLSX Export</Button>{canManage ? <Button className="gap-2 rounded-xl" disabled={migrationRequired} onClick={() => setCreateOpen(true)}><Plus className="size-4" /> নতুন ইভেন্ট</Button> : null}</div></section>
      {migrationRequired ? <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> Event & Tour database migration Supabase SQL Editor-এ একবার চালাতে হবে।</div> : null}
      {feedback ? <div className="rounded-2xl border bg-muted/35 px-4 py-3 text-sm font-medium">{feedback}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "আসন্ন আয়োজন", value: events.filter((event) => new Date(event.start_at) >= new Date() && event.status === "published").length, icon: CalendarDays },
        { label: "নিবন্ধিত মানুষ", value: rsvps.filter((item) => item.response === "going").reduce((sum, item) => sum + 1 + item.guest_count, 0), icon: Users },
        { label: "মোট পরিকল্পিত বাজেট", value: moneyFormatter.format(events.reduce((sum, event) => sum + Number(event.total_budget), 0)), icon: CircleDollarSign, money: true },
        { label: "সম্পন্ন আয়োজন", value: events.filter((event) => event.status === "completed").length, icon: CheckCircle2 },
      ].map(({ label, value, icon: Icon, money }) => <Card key={label} className="rounded-2xl border-border/75 py-0 shadow-none"><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 font-bold ${money ? "text-xl" : "text-3xl"}`}>{typeof value === "number" ? value.toLocaleString("bn-BD") : value}</p></div><span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span></CardContent></Card>)}</section>

      <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none"><div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5"><div className="relative w-full md:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ইভেন্ট, স্থান বা শহর খুঁজুন" className="h-10 rounded-xl pl-10" /></div><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-full rounded-xl md:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="upcoming">আসন্ন আয়োজন</SelectItem><SelectItem value="all">সব আয়োজন</SelectItem><SelectItem value="tour">শুধু ট্যুর</SelectItem><SelectItem value="published">Registration চলছে</SelectItem><SelectItem value="completed">সম্পন্ন</SelectItem><SelectItem value="draft">খসড়া</SelectItem></SelectContent></Select></div>
        {loading ? <div className="flex min-h-80 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Event load হচ্ছে</div> : visibleEvents.length ? <div className="grid gap-4 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">{visibleEvents.map((event) => { const count = goingCount(event.id); const date = new Date(event.start_at); return <article key={event.id} className="overflow-hidden rounded-2xl border border-border/75 bg-card transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"><div className="flex items-start gap-4 p-5"><div className="grid w-16 shrink-0 place-items-center rounded-2xl bg-primary/10 px-2 py-3 text-primary"><span className="text-xs font-bold uppercase">{date.toLocaleDateString("bn-BD", { month: "short" })}</span><span className="text-2xl font-black">{date.toLocaleDateString("bn-BD", { day: "2-digit" })}</span></div><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Badge variant="secondary">{typeLabels[event.event_type]}</Badge><Badge variant={event.status === "cancelled" ? "destructive" : "outline"}>{statusLabels[event.status]}</Badge></div><button type="button" className="mt-3 block w-full text-left" onClick={() => setSelectedId(event.id)}><h2 className="text-lg font-bold leading-snug">{event.title_bn}</h2><p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4 shrink-0" /> <span className="truncate">{[event.venue, event.city].filter(Boolean).join(", ")}</span></p><p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> {dateFormatter.format(date)}</p></button></div></div><div className="grid grid-cols-2 border-t bg-muted/20"><button type="button" className="border-r px-4 py-3 text-left" onClick={() => setSelectedId(event.id)}><p className="text-xs text-muted-foreground">অংশগ্রহণকারী</p><p className="mt-1 font-bold">{count.toLocaleString("bn-BD")}{event.capacity ? ` / ${event.capacity.toLocaleString("bn-BD")}` : ""}</p></button><button type="button" className="px-4 py-3 text-left" onClick={() => setSelectedId(event.id)}><p className="text-xs text-muted-foreground">প্রতি ব্যক্তি</p><p className="mt-1 font-bold">{moneyFormatter.format(Number(event.estimated_cost_per_person))}</p></button></div></article>; })}</div> : <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center"><CalendarDays className="size-11 text-muted-foreground/45" /><h2 className="mt-4 text-xl font-bold">এই তালিকায় কোনো আয়োজন নেই</h2><p className="mt-1 text-sm text-muted-foreground">Filter বদলান অথবা নতুন event/tour তৈরি করুন।</p>{canManage && !migrationRequired ? <Button className="mt-5 gap-2 rounded-xl" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> প্রথম ইভেন্ট তৈরি করুন</Button> : null}</div>}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-4xl"><DialogHeader><DialogTitle>নতুন event বা tour</DialogTitle><DialogDescription>তারিখ, স্থান, registration, capacity এবং budget নির্ধারণ করুন।</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="নাম (বাংলা)" id="event-title-bn"><Input id="event-title-bn" value={form.titleBn} onChange={(event) => setForm({ ...form, titleBn: event.target.value })} /></Field><Field label="Name (English)" id="event-title-en"><Input id="event-title-en" value={form.titleEn} onChange={(event) => setForm({ ...form, titleEn: event.target.value })} /></Field><div className="sm:col-span-2"><Field label="বিস্তারিত পরিকল্পনা" id="event-description-bn"><Textarea id="event-description-bn" rows={5} value={form.descriptionBn} onChange={(event) => setForm({ ...form, descriptionBn: event.target.value })} /></Field></div><Field label="আয়োজনের ধরন" id="event-type"><Select value={form.eventType} onValueChange={(value) => setForm({ ...form, eventType: value as FamilyEvent["event_type"] })}><SelectTrigger id="event-type" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="অবস্থা" id="event-status"><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as EventForm["status"] })}><SelectTrigger id="event-status" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="published">এখন প্রকাশ</SelectItem><SelectItem value="draft">খসড়া</SelectItem></SelectContent></Select></Field><Field label="শুরুর সময়" id="event-start"><Input id="event-start" type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} /></Field><Field label="শেষের সময়" id="event-end"><Input id="event-end" type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} /></Field><Field label="স্থান / Venue" id="event-venue"><Input id="event-venue" value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} /></Field><Field label="শহর" id="event-city"><Input id="event-city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field><Field label="Meeting point" id="event-meeting"><Input id="event-meeting" value={form.meetingPoint} onChange={(event) => setForm({ ...form, meetingPoint: event.target.value })} /></Field><Field label="Registration deadline" id="event-deadline"><Input id="event-deadline" type="datetime-local" value={form.registrationDeadline} onChange={(event) => setForm({ ...form, registrationDeadline: event.target.value })} /></Field><Field label="প্রতি ব্যক্তির খরচ" id="event-cost"><Input id="event-cost" type="number" min="0" value={form.estimatedCostPerPerson} onChange={(event) => setForm({ ...form, estimatedCostPerPerson: event.target.value })} /></Field><Field label="মোট budget" id="event-budget"><Input id="event-budget" type="number" min="0" value={form.totalBudget} onChange={(event) => setForm({ ...form, totalBudget: event.target.value })} /></Field><Field label="সর্বোচ্চ capacity" id="event-capacity"><Input id="event-capacity" type="number" min="1" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></Field></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>বাতিল</Button><Button className="gap-2 rounded-xl" disabled={saving || form.titleBn.trim().length < 3 || form.descriptionBn.trim().length < 5 || !form.startAt || !form.venue.trim()} onClick={() => void createEvent(form).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Event save হয়নি।"))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <CalendarDays className="size-4" />} {form.status === "published" ? "প্রকাশ করুন" : "খসড়া সংরক্ষণ"}</Button></DialogFooter></DialogContent></Dialog>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}><SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl"><SheetHeader className="border-b p-6 text-left"><div className="flex items-start justify-between gap-4 pr-8"><div className="flex flex-wrap gap-2">{selected ? <><Badge variant="secondary">{typeLabels[selected.event_type]}</Badge><Badge variant={selected.status === "cancelled" ? "destructive" : "outline"}>{statusLabels[selected.status]}</Badge></> : null}</div>{canManage && selected ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-2 rounded-xl" disabled={working}><Ellipsis className="size-4" /> পরিচালনা</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{selected.status !== "published" ? <DropdownMenuItem onClick={() => void updateEvent("publish").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Update হয়নি।"))}>Publish registration</DropdownMenuItem> : <DropdownMenuItem onClick={() => void updateEvent("close").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Update হয়নি।"))}>Close registration</DropdownMenuItem>}<DropdownMenuItem onClick={() => void updateEvent("complete").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Update হয়নি।"))}>Mark completed</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void updateEvent("cancel").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Update হয়নি।"))}>Cancel event</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</div><SheetTitle className="text-2xl leading-snug">{selected?.title_bn}</SheetTitle><SheetDescription>{selected?.title_en || (selected ? `${dateFormatter.format(new Date(selected.start_at))} · ${selected.venue}` : "Event details")}</SheetDescription></SheetHeader>{selected ? <div className="space-y-6 p-6"><div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 sm:grid-cols-2"><Info icon={<CalendarDays />} label="সময়" value={dateFormatter.format(new Date(selected.start_at))} /><Info icon={<MapPin />} label="স্থান" value={[selected.venue, selected.city].filter(Boolean).join(", ")} /><Info icon={<CircleDollarSign />} label="প্রতি ব্যক্তি" value={moneyFormatter.format(Number(selected.estimated_cost_per_person))} /><Info icon={<Users />} label="নিবন্ধিত" value={`${selectedGoing.toLocaleString("bn-BD")}${selected.capacity ? ` / ${selected.capacity.toLocaleString("bn-BD")}` : ""}`} /></div>{selected.capacity ? <div><div className="mb-2 flex justify-between text-sm"><span>Capacity</span><strong>{Math.round(capacityProgress).toLocaleString("bn-BD")}%</strong></div><Progress value={capacityProgress} /></div> : null}
        {selected.status === "published" ? <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4"><div className="flex flex-wrap items-end gap-3"><div className="flex-1"><p className="font-bold">আপনার RSVP</p><p className="mt-1 text-sm text-muted-foreground">বর্তমান উত্তর: {myRsvp ? responseLabels[myRsvp.response] : "দেওয়া হয়নি"}</p></div><Field label="অতিথি" id="event-guests"><Input id="event-guests" className="w-24" type="number" min="0" max="10" value={guestCount} onChange={(event) => setGuestCount(event.target.value)} /></Field></div><Input className="mt-3" placeholder="বিশেষ note (ঐচ্ছিক)" value={rsvpNote} onChange={(event) => setRsvpNote(event.target.value)} /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" className="rounded-xl" disabled={working} onClick={() => void saveRsvp("going").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "RSVP হয়নি।"))}>যাব</Button><Button size="sm" variant="outline" className="rounded-xl" disabled={working} onClick={() => void saveRsvp("maybe").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "RSVP হয়নি।"))}>হয়তো</Button><Button size="sm" variant="ghost" className="rounded-xl" disabled={working} onClick={() => void saveRsvp("not_going").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "RSVP হয়নি।"))}>যেতে পারব না</Button></div></div> : null}
        <Tabs defaultValue="overview"><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="overview">পরিকল্পনা</TabsTrigger><TabsTrigger value="discussion">আলোচনা ({selectedComments.length.toLocaleString("bn-BD")})</TabsTrigger><TabsTrigger value="gallery">Gallery ({selectedMedia.length.toLocaleString("bn-BD")})</TabsTrigger></TabsList><TabsContent value="overview" className="space-y-4 pt-4"><p className="whitespace-pre-wrap leading-7">{selected.description_bn}</p>{selected.description_en ? <p className="rounded-2xl bg-muted/45 p-4 leading-7 text-muted-foreground">{selected.description_en}</p> : null}{selected.meeting_point ? <Info icon={<MapPin />} label="Meeting point" value={selected.meeting_point} /> : null}{selected.registration_deadline ? <Info icon={<Clock3 />} label="Registration deadline" value={dateFormatter.format(new Date(selected.registration_deadline))} /> : null}<div className="rounded-2xl border p-4"><p className="text-sm text-muted-foreground">মোট পরিকল্পিত budget</p><p className="mt-1 text-2xl font-bold">{moneyFormatter.format(Number(selected.total_budget))}</p></div><div className="space-y-2"><p className="font-bold">অংশগ্রহণকারীরা</p>{selectedRsvps.length ? selectedRsvps.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-muted/35 px-3 py-2 text-sm"><span>{item.respondent_name}{item.guest_count ? ` + ${item.guest_count}` : ""}</span><Badge variant="outline">{responseLabels[item.response]}</Badge></div>) : <p className="text-sm text-muted-foreground">এখনও কেউ RSVP করেননি।</p>}</div></TabsContent><TabsContent value="discussion" className="space-y-4 pt-4"><div className="max-h-80 space-y-3 overflow-y-auto">{selectedComments.length ? selectedComments.map((comment) => <div key={comment.id} className="flex gap-3"><Avatar className="size-9"><AvatarFallback>{comment.author_name.slice(0, 2)}</AvatarFallback></Avatar><div className="flex-1 rounded-2xl bg-muted/45 p-3"><div className="flex justify-between gap-3"><strong className="text-sm">{comment.author_name}</strong><span className="text-xs text-muted-foreground">{dateFormatter.format(new Date(comment.created_at))}</span></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{comment.body}</p></div></div>) : <p className="py-8 text-center text-sm text-muted-foreground">আলোচনা শুরু হয়নি।</p>}</div><Textarea rows={3} placeholder="আপনার মতামত বা প্রশ্ন লিখুন" value={commentText} onChange={(event) => setCommentText(event.target.value)} /><Button className="gap-2 rounded-xl" disabled={working || commentText.trim().length < 2} onClick={() => void addComment().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Comment হয়নি।"))}><MessageCircle className="size-4" /> Comment করুন</Button></TabsContent><TabsContent value="gallery" className="space-y-4 pt-4"><div className="grid grid-cols-2 gap-3">{selectedMedia.map((item) => <figure key={item.id} className="overflow-hidden rounded-2xl border bg-muted/30">{item.mime_type.startsWith("image/") ? <img src={`/api/event-media/${item.id}`} alt={item.caption || item.file_name} className="aspect-square w-full object-cover" /> : <video src={`/api/event-media/${item.id}`} controls className="aspect-video w-full bg-black" />}<figcaption className="p-3 text-xs"><p className="font-medium">{item.caption || item.file_name}</p><p className="mt-1 text-muted-foreground">{item.uploader_name}</p></figcaption></figure>)}</div>{!selectedMedia.length ? <div className="rounded-2xl border border-dashed p-8 text-center"><ImagePlus className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm text-muted-foreground">এখনও কোনো ছবি বা ভিডিও নেই।</p></div> : null}<div className="rounded-2xl border p-4"><Label htmlFor="event-media-file">ছবি বা ভিডিও যোগ করুন</Label><Input className="mt-2" placeholder="Caption (ঐচ্ছিক)" value={mediaCaption} onChange={(event) => setMediaCaption(event.target.value)} /><input ref={fileInputRef} id="event-media-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" className="mt-3 block w-full text-sm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(file).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Upload হয়নি।")); }} /><p className="mt-2 text-xs text-muted-foreground">ছবি সর্বোচ্চ ৮ MB, ভিডিও সর্বোচ্চ ২৫ MB।</p><Button variant="outline" className="mt-3 gap-2 rounded-xl" disabled={working} onClick={() => fileInputRef.current?.click()}><Upload className="size-4" /> File নির্বাচন</Button></div></TabsContent></Tabs>
      </div> : null}</SheetContent></Sheet>
    </main>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-primary [&_svg]:size-4">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div></div>;
}
