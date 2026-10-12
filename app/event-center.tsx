"use client";
/* Event media uses authenticated API URLs and must not be fetched by the image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { useActionFeedback, useActionResult } from "@/components/action-modal-provider";
import { useLocale } from "@/components/locale-provider";
import { useCurrentTime } from "@/components/use-current-time";
import { qurbaniIsoToLocalDateTime, qurbaniLocalDateTimeToIso } from "@/lib/qurbani-validation";
import { eventErrorCopy, EventValidationError } from "@/lib/event-validation";
import { eventRsvpRecord, eventCommentRecord, readEventParticipation, eventParticipationFeedback, type ParticipationKind } from "@/lib/event-participation";
import { validateEventMedia, eventMediaCaption, readEventMediaMutation, eventMediaFeedback } from "@/lib/event-media-workflow";
import { eventWorkbook } from "@/lib/event-export";
import { eventCommentChangeRecord, readEventCommentChange, eventCommentChangeFeedback, type CommentMethod } from "@/lib/event-comment-management";
import { readEvents, eventEditorStillAvailable } from "@/lib/event-read";
import { readEventMutation, eventWriteFeedback } from "@/lib/event-write-outcome";
import { NoticeRequestGate } from "@/lib/notice-write-outcome";

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
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  TriangleAlert,
  Trash2,
  Upload,
  Users,
  X,
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
  updated_at: string;
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
  is_current_user?: boolean;
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
  family?: { id: string; name_bn: string; name_en: string | null };
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
  status: FamilyEvent["status"];
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

const typeLabelsBn: Record<FamilyEvent["event_type"], string> = {
  reunion: "পারিবারিক মিলনমেলা",
  tour: "ট্যুর",
  wedding: "বিবাহ অনুষ্ঠান",
  religious: "ধর্মীয় আয়োজন",
  meeting: "পারিবারিক সভা",
  other: "অন্যান্য",
};
const typeLabelsEn: Record<FamilyEvent["event_type"], string> = { reunion: "Family reunion", tour: "Tour", wedding: "Wedding", religious: "Religious event", meeting: "Family meeting", other: "Other" };

const statusLabelsBn: Record<FamilyEvent["status"], string> = {
  draft: "খসড়া",
  published: "রেজিস্ট্রেশন চলছে",
  registration_closed: "রেজিস্ট্রেশন বন্ধ",
  completed: "সম্পন্ন",
  cancelled: "বাতিল",
};
const statusLabelsEn: Record<FamilyEvent["status"], string> = { draft: "Draft", published: "Registration open", registration_closed: "Registration closed", completed: "Completed", cancelled: "Cancelled" };

const responseLabelsBn: Record<EventRsvp["response"], string> = {
  going: "যাব",
  maybe: "হয়তো",
  not_going: "যেতে পারব না",
};
const responseLabelsEn: Record<EventRsvp["response"], string> = { going: "Going", maybe: "Maybe", not_going: "Not going" };

export function EventCenter() {
  const { locale, pick } = useLocale();
  const typeLabels = locale === "bn" ? typeLabelsBn : typeLabelsEn;
  const statusLabels = locale === "bn" ? statusLabelsBn : statusLabelsEn;
  const responseLabels = locale === "bn" ? responseLabelsBn : responseLabelsEn;
  const dateFormatter = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const moneyFormatter = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [rsvps, setRsvps] = useState<EventRsvp[]>([]);
  const [comments, setComments] = useState<EventComment[]>([]);
  const [media, setMedia] = useState<EventMedia[]>([]);
  const [family, setFamily] = useState<EventPayload["family"]>();
  const [canManage, setCanManage] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportBusy = useRef(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FamilyEvent | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("upcoming");
  const [feedback, setFeedback] = useActionFeedback();
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [guestCount, setGuestCount] = useState("0");
  const [rsvpNote, setRsvpNote] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentEdit, setCommentEdit] = useState<{ original: EventComment; body: string } | null>(null);
  const commentEditor = useRef<EventComment | null>(null);
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaFile, setMediaFile] = useState<{ eventId: string; file: File } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showResult = useActionResult();
  const [verificationBlocked, setVerificationBlocked] = useState(false);
  const access = useRef({ ready: false, canManage: false, blocked: false, busy: false });
  const requestGate = useRef(new NoticeRequestGate());
  const readFamily = useRef<string | undefined>(undefined);
  const editorEvent = useRef<FamilyEvent | null>(null);
  const mounted = useRef(false);

  const selected = useMemo(() => events.find((event) => event.id === selectedId) ?? null, [events, selectedId]);

  const loadEvents = useCallback(async () => {
    if (!mounted.current) return false;
    return readEvents({ gate: requestGate.current, expectedFamilyId: readFamily.current,
      request: init => fetch("/api/events", init),
      start: () => {
        access.current.ready = false; access.current.canManage = false;
        setLoading(true); setLoadError(null); setFamily(undefined); setEvents([]); setRsvps([]); setComments([]); setMedia([]); setCanManage(false); setSelectedId(null);
        setSetupRequired(false); setMigrationRequired(false); setFeedback(null);
      },
      loaded: snapshot => {
        readFamily.current = snapshot.family.id;
        setFamily(snapshot.family); setEvents(snapshot.events); setRsvps(snapshot.rsvps); setComments(snapshot.comments); setMedia(snapshot.media);
        setCanManage(snapshot.permissions.canManage && !snapshot.migrationRequired); setMigrationRequired(snapshot.migrationRequired);
        access.current.ready = !snapshot.migrationRequired; access.current.canManage = snapshot.permissions.canManage && !snapshot.migrationRequired;
        if (!eventEditorStillAvailable(snapshot, editorEvent.current)) { editorEvent.current = null; setCreateOpen(false); setEditingEvent(null); }
        if (commentEditor.current) {
          const original = commentEditor.current, current = snapshot.comments.find(row => row.id === original.id);
          const parent = snapshot.events.find(row => row.id === original.event_id);
          if (!current?.is_current_user || current.body !== original.body || current.event_id !== original.event_id || !parent || parent.status === "draft") { commentEditor.current = null; setCommentEdit(null); }
        }
      },
      setup: () => { setSetupRequired(true); setCreateOpen(false); },
      failed: error => {
        setLoadError(error.code);
        showResult({ kind: "error", title: pick("ইভেন্ট লোড হয়নি", "Events could not be loaded"), message: eventErrorCopy(error.code, locale) ?? eventErrorCopy("EVENT_LOAD_FAILED", locale)! });
      },
      settled: () => setLoading(false),
    });
  }, [locale, pick, setFeedback, showResult]);

  const mutateEvent = useCallback(async (method: "POST" | "PATCH" | "DELETE", id: string | undefined, body: Record<string, unknown>) => {
    const gate = access.current;
    if (!gate.ready || !gate.canManage || gate.blocked || gate.busy) throw new Error(eventErrorCopy("EVENT_INVALID_SNAPSHOT", locale)!);
    gate.busy = true;
    const ticket = requestGate.current.begin(), path = id ? `/api/events/${id}` : "/api/events";
    if (method === "POST" || body.action === "edit") setSaving(true); else setWorking(true);
    try {
      const outcome = await readEventMutation(async () => {
        const response = await fetch(path, { method: method, headers: { "Content-Type": "application/json" }, ...(method === "DELETE" ? {} : { body: JSON.stringify(body) }) });
        if (response.status === 499) return response;
        return response;
      }, method, id, body);
      if (!mounted.current || outcome.kind === "cancelled") return null;
      if (outcome.kind === "unknown" || !requestGate.current.current(ticket)) {
        access.current.blocked = true; setVerificationBlocked(true); setCreateOpen(false); setSelectedId(null);
        showResult(eventWriteFeedback(path, 503, { outcomeUnknown: true }, locale)!);
        return null;
      }
      if (outcome.kind === "rejected") throw new Error(eventErrorCopy(outcome.payload.code, locale) ?? (typeof outcome.payload.error === "string" ? outcome.payload.error : pick("ইভেন্টের পরিবর্তন গ্রহণ করা হয়নি।", "The event change was rejected.")));
      return outcome;
    } finally { access.current.busy = false; if (mounted.current) { setSaving(false); setWorking(false); } }
  }, [locale, pick, showResult]);

  function beginAuxiliary() {
    if (!access.current.ready || access.current.blocked || access.current.busy) return false;
    access.current.busy = true;
    requestGate.current.begin();
    return true;
  }
  async function mutateParticipation(kind: ParticipationKind, eventId: string, body: Record<string, unknown>) {
    if (!beginAuxiliary()) return null;
    const checkpoint = requestGate.current.checkpoint(), path = `/api/events/${eventId}/${kind === "rsvp" ? "rsvp" : "comments"}`;
    setWorking(true);
    try {
      const outcome = await readEventParticipation(async () => {
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (response.status === 499) return response;
        return response;
      }, kind, eventId, body);
      if (!mounted.current || outcome.kind === "cancelled") return null;
      if (outcome.kind === "unknown" || !requestGate.current.current(checkpoint)) {
        access.current.blocked = true; setVerificationBlocked(true); setCreateOpen(false); setSelectedId(null);
        showResult(eventParticipationFeedback(path, 503, { outcomeUnknown: true }, locale)!);
        return null;
      }
      if (outcome.kind === "rejected") throw new Error(eventErrorCopy(outcome.payload.code, locale) ?? (typeof outcome.payload.error === "string" ? outcome.payload.error : pick("RSVP বা মন্তব্য গ্রহণ করা হয়নি।", "The RSVP or comment was rejected.")));
      return outcome;
    } finally { access.current.busy = false; if (mounted.current) setWorking(false); }
  }
  function participationInput<T>(parse: () => T): T | null {
    try { return parse(); } catch (error) {
      if (error instanceof EventValidationError) {
        showResult({ kind: "error", title: pick("RSVP/মন্তব্যের তথ্য যাচাই করুন", "Check RSVP/comment input"), message: eventErrorCopy(error.code, locale) ?? error.message });
        return null;
      }
      throw error;
    }
  }
  async function verifyEventOutcome() {
    if (access.current.busy) return;
    setCreateOpen(false); setSelectedId(null);
    if (await loadEvents()) {
      access.current.blocked = false; setVerificationBlocked(false);
      showResult({ kind: "info", title: pick("তালিকা পুনরায় লোড হয়েছে", "List reloaded"), message: pick("ইভেন্টের অবস্থা মিলিয়ে দেখুন। রিলোড audit বা file cleanup ঠিক করে না এবং কোনো পরিবর্তন আবার পাঠায় না।", "Review the event state. Reloading does not repair audit or file cleanup, or resubmit any change.") });
    }
  }
  function openCreateEvent() {
    if (!access.current.ready || !access.current.canManage || access.current.blocked || access.current.busy) return;
    editorEvent.current = null; setEditingEvent(null);
    setForm(emptyForm);
    setCreateOpen(true);
  }

  function openEditEvent(event: FamilyEvent) {
    if (!access.current.ready || !access.current.canManage || access.current.blocked || access.current.busy) return;
    editorEvent.current = event; setEditingEvent(event);
    setForm({
      titleBn: event.title_bn,
      titleEn: event.title_en ?? "",
      descriptionBn: event.description_bn,
      descriptionEn: event.description_en ?? "",
      eventType: event.event_type,
      startAt: qurbaniIsoToLocalDateTime(event.start_at),
      endAt: qurbaniIsoToLocalDateTime(event.end_at),
      venue: event.venue,
      city: event.city ?? "",
      meetingPoint: event.meeting_point ?? "",
      estimatedCostPerPerson: String(event.estimated_cost_per_person ?? ""),
      totalBudget: String(event.total_budget ?? ""),
      capacity: event.capacity ? String(event.capacity) : "",
      registrationDeadline: qurbaniIsoToLocalDateTime(event.registration_deadline),
      status: event.status,
    });
    setSelectedId(null);
    setCreateOpen(true);
  }

  async function updateEventDetails(id: string, input: EventForm) {
      const startAt = qurbaniLocalDateTimeToIso(input.startAt);
      const endAt = qurbaniLocalDateTimeToIso(input.endAt);
      const registrationDeadline = qurbaniLocalDateTimeToIso(input.registrationDeadline);
      if (!startAt || endAt === undefined || registrationDeadline === undefined) throw new Error(pick("সঠিক সময়সূচি দিন।", "Enter a valid schedule."));
      const outcome = await mutateEvent("PATCH", id, { action: "edit", data: { ...input, startAt, endAt, registrationDeadline } });
      if (!outcome?.event) return;
      const payload = outcome;
      setEvents((current) => current.map((event) => event.id === id ? payload.event! : event).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()));
      setCreateOpen(false);
      editorEvent.current = null; setEditingEvent(null);
      setForm(emptyForm);
      if (!outcome.pending) setFeedback(pick("ইভেন্টের বিস্তারিত আপডেট হয়েছে।", "Event details updated."));
  }

  async function deleteEvent(id: string) {
      const outcome = await mutateEvent("DELETE", id, {});
      if (!outcome) return;
      setEvents((current) => current.filter((event) => event.id !== id));
      setRsvps((current) => current.filter((item) => item.event_id !== id));
      setComments((current) => current.filter((item) => item.event_id !== id));
      setMedia((current) => current.filter((item) => item.event_id !== id));
      setSelectedId(null);
      if (!outcome.pending) setFeedback(pick("ইভেন্ট ও সংশ্লিষ্ট তথ্য মুছে ফেলা হয়েছে।", "Event and linked records deleted."));
  }

  async function mutateMedia(method: "POST" | "DELETE", path: string, body?: FormData, validate?: () => Promise<unknown>) {
    if (!beginAuxiliary()) return null;
    const checkpoint = requestGate.current.checkpoint();
    setWorking(true);
    try {
      if (validate) {
        try { await validate(); } catch (error) {
          if (mounted.current && requestGate.current.current(checkpoint)) showResult({ kind: "error", title: pick("মিডিয়ার তথ্য যাচাই করুন", "Check media input"), message: eventErrorCopy(error instanceof EventValidationError ? error.code : "EVENT_MEDIA_INVALID_FILE", locale)! });
          return null;
        }
      }
      if (!mounted.current || !requestGate.current.current(checkpoint)) return null;
      const outcome = await readEventMediaMutation(async () => {
        const response = await fetch(path, { method: method, ...(body ? { body } : {}) });
        if (response.status === 499) return response;
        return response;
      }, path, method, body);
      if (!mounted.current || outcome.kind === "cancelled") return null;
      if (outcome.kind === "unknown" || !requestGate.current.current(checkpoint)) {
        access.current.blocked = true; setVerificationBlocked(true); setCreateOpen(false); setSelectedId(null);
        showResult(eventMediaFeedback(path, 503, outcome.kind === "unknown" ? outcome.payload : {}, locale, method, body)!);
        return null;
      }
      if (outcome.kind === "rejected") throw new Error(eventErrorCopy(outcome.payload.code, locale) ?? (typeof outcome.payload.error === "string" ? outcome.payload.error : pick("মিডিয়ার পরিবর্তন গ্রহণ করা হয়নি।", "The media change was rejected.")));
      return outcome;
    } finally { access.current.busy = false; if (mounted.current) setWorking(false); }
  }
  async function deleteMedia(id: string) {
    const outcome = await mutateMedia("DELETE", `/api/event-media/${id}`);
    if (!outcome) return;
    setMedia(current => current.filter(item => item.id !== id));
    if (!outcome.pending) setFeedback(pick("ইভেন্টের media মুছে ফেলা হয়েছে।", "Event media deleted."));
  }

  useEffect(() => {
    mounted.current = true;
    const gate = requestGate.current, currentAccess = access.current;
    let active = true;
    queueMicrotask(() => { if (active) void loadEvents(); });
    return () => { active = false; mounted.current = false; currentAccess.ready = false; gate.cancel(); };
  }, [loadEvents]);

  useEffect(() => {
    if (!selectedId) return;
    const mine = rsvps.find((item) => item.event_id === selectedId && item.is_current_user);
    queueMicrotask(() => {
      setGuestCount(String(mine?.guest_count ?? 0));
      setRsvpNote(mine?.note ?? "");
    });
  }, [rsvps, selectedId]);

  const now = useCurrentTime();
  const visibleEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesText = !needle || [event.title_bn, event.title_en, event.venue, event.city, typeLabels[event.event_type]]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
      const matchesFilter = filter === "all"
        || (filter === "upcoming" && now !== null && new Date(event.start_at).getTime() >= now && !["completed", "cancelled"].includes(event.status))
        || event.status === filter
        || event.event_type === filter;
      return matchesText && matchesFilter;
    });
  }, [events, filter, now, query, typeLabels]);

  const eventRsvps = (id: string) => rsvps.filter((item) => item.event_id === id);
  const goingCount = useCallback((id: string) => rsvps.filter((item) => item.event_id === id && item.response === "going").reduce((total, item) => total + 1 + item.guest_count, 0), [rsvps]);

  const createEvent = useCallback(async (input: EventForm) => {
    setFeedback(null);
      const startAt = qurbaniLocalDateTimeToIso(input.startAt);
      const endAt = qurbaniLocalDateTimeToIso(input.endAt);
      const registrationDeadline = qurbaniLocalDateTimeToIso(input.registrationDeadline);
      if (!startAt || endAt === undefined || registrationDeadline === undefined) throw new Error(pick("সঠিক সময়সূচি দিন।", "Enter a valid schedule."));
      const outcome = await mutateEvent("POST", undefined, { ...input, startAt, endAt, registrationDeadline });
      if (!outcome?.event) return;
      const payload = outcome;
      setEvents((current) => [...current, payload.event!].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()));
      setForm(emptyForm);
      setCreateOpen(false);
      if (!outcome.pending) setFeedback(outcome.event.status === "published" ? pick("ইভেন্ট প্রকাশিত হয়েছে।", "Event published.") : pick("ইভেন্ট খসড়া হিসেবে সংরক্ষিত হয়েছে।", "Event saved as a draft."));
      return { id: outcome.event.id, title: outcome.event.title_bn, status: outcome.event.status, pending: outcome.pending };
  }, [mutateEvent, pick, setFeedback]);

  async function updateEvent(action: "publish" | "close" | "complete" | "cancel" | "draft") {
    if (!selected) return;
    setFeedback(null);
      const outcome = await mutateEvent("PATCH", selected.id, { action });
      if (!outcome?.event) return;
      const payload = outcome;
      setEvents((current) => current.map((event) => event.id === selected.id ? payload.event! : event));
      if (!outcome.pending) setFeedback(pick("ইভেন্টের স্ট্যাটাস হালনাগাদ হয়েছে।", "Event status updated."));
  }

  async function saveRsvp(responseValue: EventRsvp["response"]) {
    if (!selected) return;
    const record = participationInput(() => eventRsvpRecord({ response: responseValue, guestCount, note: rsvpNote }));
    if (!record) return;
    const outcome = await mutateParticipation("rsvp", selected.id, { response: record.response, guestCount: record.guest_count, note: record.note });
    if (!outcome?.rsvp) return;
    const rsvp = outcome.rsvp;
    setRsvps(current => [...current.filter(item => item.id !== rsvp.id && !(item.event_id === rsvp.event_id && item.is_current_user)), rsvp]);
    if (!outcome.pending) setFeedback(pick(`আপনার উত্তর “${responseLabels[responseValue]}” হিসেবে সংরক্ষিত হয়েছে।`, `Your response was saved as “${responseLabels[responseValue]}”.`));
    return { eventId: selected.id, response: responseValue, guestCount: rsvp.guest_count, pending: outcome.pending };
  }

  async function addComment() {
    if (!selected) return;
    const record = participationInput(() => eventCommentRecord({ body: commentText }));
    if (!record) return;
    const outcome = await mutateParticipation("comment", selected.id, record);
    if (!outcome?.comment) return;
    const comment = outcome.comment;
    setComments(current => [...current.filter(item => item.id !== comment.id), comment]);
    setCommentText("");
    if (!outcome.pending) setFeedback(pick("মন্তব্য যোগ হয়েছে।", "Comment added."));
  }

  function closeCommentEditor() {
    if (access.current.busy) return;
    commentEditor.current = null; setCommentEdit(null);
  }
  function openCommentEditor(comment: EventComment) {
    if (!access.current.ready || access.current.busy || access.current.blocked || !comment.is_current_user || !selected || selected.status === "draft") return;
    commentEditor.current = comment; setCommentEdit({ original: comment, body: comment.body });
  }
  async function changeComment(method: CommentMethod, comment: EventComment, text?: string) {
    const parent = events.find(row => row.id === comment.event_id);
    if (!parent || (method === "PATCH" ? !comment.is_current_user || parent.status === "draft" : !(comment.is_current_user || access.current.canManage) || (parent.status === "draft" && !access.current.canManage))) return;
    const body = participationInput(() => eventCommentChangeRecord(method, { expectedBody: comment.body, ...(method === "PATCH" ? { body: text } : {}) }));
    if (!body || !beginAuxiliary()) return;
    const checkpoint = requestGate.current.checkpoint(), path = `/api/event-comments/${comment.id}`;
    setWorking(true);
    try {
      const outcome = await readEventCommentChange(async () => {
        const response = await fetch(path, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (response.status === 499) return response;
        return response;
      }, method, comment.id, comment.event_id, body);
      if (!mounted.current || outcome.kind === "cancelled") return;
      if (outcome.kind === "unknown" || !requestGate.current.current(checkpoint)) {
        access.current.blocked = true; setVerificationBlocked(true); setSelectedId(null);
        showResult(eventCommentChangeFeedback(path, 503, { outcomeUnknown: true }, locale)!);
        return;
      }
      if (outcome.kind === "rejected") {
        showResult({ kind: "error", title: pick("মন্তব্য বদলানো হয়নি", "Comment was not changed"), message: eventErrorCopy(outcome.payload.code, locale) ?? eventErrorCopy("EVENT_WRITE_REJECTED", locale)! });
        return;
      }
      const saved = outcome.comment;
      setComments(current => method === "DELETE" ? current.filter(row => row.id !== comment.id) : current.map(row => row.id === comment.id && saved ? saved : row));
      if (commentEditor.current?.id === comment.id) { commentEditor.current = null; setCommentEdit(null); }
      if (!outcome.pending) setFeedback(method === "PATCH" ? pick("মন্তব্য আপডেট হয়েছে।", "Comment updated.") : pick("মন্তব্য মুছে ফেলা হয়েছে।", "Comment removed."));
    } finally { access.current.busy = false; if (mounted.current) setWorking(false); }
  }

  function renderComment(comment: EventComment) {
    const editing = commentEdit?.original.id === comment.id && commentEdit.original.event_id === selected?.id;
    const disabled = verificationBlocked || loading || saving || working;
    return <div key={comment.id} className="flex gap-3">
      <Avatar className="size-9"><AvatarFallback>{comment.author_name.slice(0, 2)}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1 rounded-2xl bg-muted/45 p-3">
        <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{comment.author_name}</strong><span className="text-xs text-muted-foreground">{dateFormatter.format(new Date(comment.created_at))}</span></div>
        {editing && commentEdit ? <div className="mt-3 space-y-2">
          <Label htmlFor={`event-comment-${comment.id}`}>{pick("নিজের মন্তব্য সম্পাদনা", "Edit your comment")}</Label>
          <Textarea id={`event-comment-${comment.id}`} rows={3} maxLength={2000} disabled={disabled} value={commentEdit.body} onChange={event => setCommentEdit(current => current ? { ...current, body: event.target.value } : null)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={disabled || commentEdit.body.trim().length < 2 || commentEdit.body.trim() === commentEdit.original.body} onClick={() => void changeComment("PATCH", commentEdit.original, commentEdit.body)}>{pick("সংরক্ষণ করুন", "Save comment")}</Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={closeCommentEditor}>{pick("ফিরে যান", "Cancel edit")}</Button>
            <Button size="icon-sm" variant="ghost" disabled={disabled} onClick={closeCommentEditor} aria-label={pick("মন্তব্য editor বন্ধ করুন", "Close comment editor")}><X className="size-4" /></Button>
          </div>
        </div> : <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-6">{comment.body}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {comment.is_current_user && selected?.status !== "draft" && !editing ? <Button size="sm" variant="ghost" disabled={disabled} onClick={() => openCommentEditor(comment)}><Pencil className="size-3.5" />{pick("সম্পাদনা", "Edit comment")}</Button> : null}
          {(comment.is_current_user || canManage) && (selected?.status !== "draft" || canManage) ? <Button size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={() => void changeComment("DELETE", comment)}><Trash2 className="size-3.5" />{comment.is_current_user ? pick("মুছুন", "Delete comment") : pick("Admin হিসেবে সরান", "Remove as admin")}</Button> : null}
        </div>
      </div>
    </div>;
  }

  async function uploadMedia(file: File) {
    if (!selected) return;
    const body = new FormData();
    body.set("file", file); body.set("caption", mediaCaption);
    const outcome = await mutateMedia("POST", `/api/events/${selected.id}/media`, body, async () => {
      eventMediaCaption(mediaCaption); await validateEventMedia(file);
    });
    if (!outcome?.media) return;
    const saved = outcome.media;
    setMedia(current => [saved, ...current.filter(item => item.id !== saved.id)]);
    setMediaCaption(""); setMediaFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!outcome.pending) setFeedback(pick("ইভেন্ট গ্যালারিতে মিডিয়া যোগ হয়েছে।", "Media added to the event gallery."));
  }

  function changeEventView(kind: "query" | "filter", value: string) {
    if (!access.current.ready || access.current.busy || access.current.blocked) return;
    requestGate.current.cancel();
    if (kind === "query") setQuery(value); else setFilter(value);
  }
  async function exportXlsx() {
    if (!family || !access.current.ready || access.current.blocked || access.current.busy || exportBusy.current) return;
    exportBusy.current = true;
    const checkpoint = requestGate.current.checkpoint();
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      if (!mounted.current) return;
      if (!access.current.ready || access.current.blocked || access.current.busy || !requestGate.current.current(checkpoint)) {
        showResult({ kind: "info", title: pick("Export-এর তথ্য বদলে গেছে", "Export data changed"), message: eventErrorCopy("EVENT_EXPORT_SUPERSEDED", locale)! });
        return;
      }
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const workbook = eventWorkbook(XLSX, { family, events, rsvps, comments, media, permissions: { canManage }, migrationRequired }, visibleEvents.map(event => event.id), locale, timeZone);
      XLSX.writeFile(workbook, `${family.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-events.xlsx`);
      setFeedback(pick("ইভেন্ট XLSX রপ্তানি হয়েছে।", "Event XLSX exported."));
    } catch (error) {
      if (!mounted.current) return;
      if (!access.current.ready || access.current.blocked || access.current.busy || !requestGate.current.current(checkpoint)) {
        showResult({ kind: "info", title: pick("Export-এর তথ্য বদলে গেছে", "Export data changed"), message: eventErrorCopy("EVENT_EXPORT_SUPERSEDED", locale)! });
        return;
      }
      showResult({ kind: "error", title: pick("XLSX তৈরি হয়নি", "XLSX could not be created"),
        message: eventErrorCopy(error instanceof Error && error.message === "EVENT_EXPORT_INVALID_DATA" ? "EVENT_EXPORT_INVALID_DATA" : "EVENT_EXPORT_FAILED", locale)! });
    } finally {
      exportBusy.current = false;
      if (mounted.current) setExporting(false);
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
  }, [canManage, createEvent, events, goingCount, rsvps, typeLabels]);

  if (loading) return <main className="mx-auto max-w-3xl p-6"><Card className="rounded-3xl"><CardContent role="status" aria-live="polite" className="flex items-center gap-3 p-6"><LoaderCircle className="size-5 animate-spin" /><p>{pick("সম্পূর্ণ ইভেন্ট তালিকা লোড হচ্ছে।", "Loading the complete event list.")}</p></CardContent></Card></main>;

  if (migrationRequired) return <main className="mx-auto max-w-3xl p-6"><Card className="rounded-3xl"><CardContent className="space-y-4 p-6"><h1 className="text-2xl font-bold">{pick("ইভেন্ট database যাচাই প্রয়োজন", "Event database needs verification")}</h1><p>{eventErrorCopy("EVENT_SCHEMA_UNAVAILABLE", locale)}</p><Button disabled={saving || working} onClick={() => void (verificationBlocked ? verifyEventOutcome() : loadEvents())}>{pick("আবার লোড করুন", "Reload list")}</Button></CardContent></Card></main>;

  if (setupRequired) return <main className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-7"><Card className="rounded-3xl border-amber-500/30 py-0 shadow-none"><CardContent className="flex flex-col items-start gap-5 p-7 md:flex-row md:items-center"><ShieldAlert className="size-10 text-amber-700" /><div className="flex-1"><h1 className="text-2xl font-bold">{pick("ফ্যামিলি access সক্রিয় নয়", "Family access is not active")}</h1><p className="mt-1 text-muted-foreground">{pick("Join code দিয়ে আবেদন করুন। Admin অনুমোদনের পর Event Planner ব্যবহার করা যাবে।", "Apply with a join code. You can use Event Planner after admin approval.")}</p></div><Button asChild className="rounded-xl"><a href="/setup">{pick("Family onboarding খুলুন", "Open family onboarding")}</a></Button></CardContent></Card></main>;

  const selectedRsvps = selected ? eventRsvps(selected.id) : [];
  const selectedComments = selected ? comments.filter((item) => item.event_id === selected.id) : [];
  const selectedMedia = selected ? media.filter((item) => item.event_id === selected.id) : [];
  const myRsvp = selected ? selectedRsvps.find((item) => item.is_current_user) : undefined;
  const selectedGoing = selected ? goingCount(selected.id) : 0;
  const capacityProgress = selected?.capacity ? Math.min(100, (selectedGoing / selected.capacity) * 100) : 0;

  if (!family) return <main className="mx-auto max-w-3xl p-6"><Card className="rounded-3xl"><CardContent className="space-y-4 p-6"><h1 className="text-2xl font-bold">{pick("ইভেন্ট তালিকা পাওয়া যায়নি", "Event list unavailable")}</h1><p>{eventErrorCopy(loadError ?? "EVENT_INVALID_SNAPSHOT", locale)}</p><Button disabled={saving || working} onClick={() => void (verificationBlocked ? verifyEventOutcome() : loadEvents())}>{pick("আবার লোড করুন", "Reload list")}</Button></CardContent></Card></main>;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      {verificationBlocked ? <div role="status" className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"><p>{eventErrorCopy("EVENT_WRITE_OUTCOME_UNKNOWN", locale)}</p><Button disabled={loading || saving || working} onClick={() => void verifyEventOutcome()}>{pick("তালিকা লোড করে যাচাই করুন", "Reload to verify")}</Button></div> : null}
      <fieldset disabled={loading || saving || working || verificationBlocked || !family || migrationRequired} className="contents">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><CalendarDays className="size-4" /> {pick("ইভেন্ট ও ট্যুর কার্যক্রম", "Event & Tour Operations")}</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{pick("ইভেন্ট ও ট্যুর ম্যানেজমেন্ট", "Event & Tour Management")}</h1><p className="mt-1 text-muted-foreground">{pick("পরিকল্পনা, নিবন্ধন, আলোচনা, বাজেট ও স্মৃতির গ্যালারি এক জায়গায়।", "Planning, registration, discussion, budgets, and memory galleries in one place.")}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="rounded-xl" disabled={saving || working} onClick={() => void loadEvents()}>{pick("তালিকা আবার লোড করুন", "Reload list")}</Button><Button variant="outline" className="gap-2 rounded-xl" disabled={!visibleEvents.length || exporting} onClick={() => void exportXlsx()}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} {pick("XLSX রপ্তানি", "Export XLSX")}</Button>{canManage ? <Button className="gap-2 rounded-xl" disabled={migrationRequired} onClick={openCreateEvent}><Plus className="size-4" /> {pick("নতুন ইভেন্ট", "New event")}</Button> : null}</div></section>
      {migrationRequired ? <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> {pick("Event & Tour database migration Supabase SQL Editor-এ একবার চালাতে হবে।", "Run the Event & Tour database migration once in the Supabase SQL Editor.")}</div> : null}
      {feedback ? <div className="rounded-2xl border bg-muted/35 px-4 py-3 text-sm font-medium">{feedback}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: pick("আসন্ন আয়োজন", "Upcoming events"), value: events.filter((event) => new Date(event.start_at) >= new Date() && event.status === "published").length, icon: CalendarDays },
        { label: pick("নিবন্ধিত মানুষ", "Registered people"), value: rsvps.filter((item) => item.response === "going").reduce((sum, item) => sum + 1 + item.guest_count, 0), icon: Users },
        { label: pick("মোট পরিকল্পিত বাজেট", "Total planned budget"), value: moneyFormatter.format(events.reduce((sum, event) => sum + Number(event.total_budget), 0)), icon: CircleDollarSign, money: true },
        { label: pick("সম্পন্ন আয়োজন", "Completed events"), value: events.filter((event) => event.status === "completed").length, icon: CheckCircle2 },
      ].map(({ label, value, icon: Icon, money }) => <Card key={label} className="rounded-2xl border-border/75 py-0 shadow-none"><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 font-bold ${money ? "text-xl" : "text-3xl"}`}>{typeof value === "number" ? value.toLocaleString(locale === "bn" ? "bn-BD" : "en-US") : value}</p></div><span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span></CardContent></Card>)}</section>

      <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none"><div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5"><div className="relative w-full md:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => changeEventView("query", event.target.value)} placeholder={pick("ইভেন্ট, স্থান বা শহর খুঁজুন", "Search events, venues, or cities")} className="h-10 rounded-xl pl-10" /></div><Select value={filter} onValueChange={(value) => changeEventView("filter", value)}><SelectTrigger className="w-full rounded-xl md:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="upcoming">{pick("আসন্ন আয়োজন", "Upcoming events")}</SelectItem><SelectItem value="all">{pick("সব আয়োজন", "All events")}</SelectItem><SelectItem value="tour">{pick("শুধু ট্যুর", "Tours only")}</SelectItem><SelectItem value="published">{pick("Registration চলছে", "Registration open")}</SelectItem><SelectItem value="completed">{pick("সম্পন্ন", "Completed")}</SelectItem><SelectItem value="draft">{pick("খসড়া", "Draft")}</SelectItem></SelectContent></Select></div>
        {loading ? <div className="flex min-h-80 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> {pick("Event লোড হচ্ছে", "Loading events")}</div> : visibleEvents.length ? <div className="grid gap-4 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">{visibleEvents.map((event) => { const count = goingCount(event.id); const date = new Date(event.start_at); const numberLocale = locale === "bn" ? "bn-BD" : "en-GB"; return <article key={event.id} className="overflow-hidden rounded-2xl border border-border/75 bg-card transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"><div className="flex items-start gap-4 p-5"><div className="grid w-16 shrink-0 place-items-center rounded-2xl bg-primary/10 px-2 py-3 text-primary"><span className="text-xs font-bold uppercase">{date.toLocaleDateString(numberLocale, { month: "short" })}</span><span className="text-2xl font-black">{date.toLocaleDateString(numberLocale, { day: "2-digit" })}</span></div><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Badge variant="secondary">{typeLabels[event.event_type]}</Badge><Badge variant={event.status === "cancelled" ? "destructive" : "outline"}>{statusLabels[event.status]}</Badge></div><button type="button" className="mt-3 block w-full text-left" onClick={() => setSelectedId(event.id)}><h2 className="text-lg font-bold leading-snug">{locale === "en" ? event.title_en || event.title_bn : event.title_bn}</h2><p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4 shrink-0" /> <span className="truncate">{[event.venue, event.city].filter(Boolean).join(", ")}</span></p><p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> {dateFormatter.format(date)}</p></button></div></div><div className="grid grid-cols-2 border-t bg-muted/20"><button type="button" className="border-r px-4 py-3 text-left" onClick={() => setSelectedId(event.id)}><p className="text-xs text-muted-foreground">{pick("অংশগ্রহণকারী", "Participants")}</p><p className="mt-1 font-bold">{count.toLocaleString(numberLocale)}{event.capacity ? ` / ${event.capacity.toLocaleString(numberLocale)}` : ""}</p></button><button type="button" className="px-4 py-3 text-left" onClick={() => setSelectedId(event.id)}><p className="text-xs text-muted-foreground">{pick("প্রতি ব্যক্তি", "Per person")}</p><p className="mt-1 font-bold">{moneyFormatter.format(Number(event.estimated_cost_per_person))}</p></button></div></article>; })}</div> : <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center"><CalendarDays className="size-11 text-muted-foreground/45" /><h2 className="mt-4 text-xl font-bold">{pick("এই তালিকায় কোনো আয়োজন নেই", "There are no events in this list")}</h2><p className="mt-1 text-sm text-muted-foreground">{pick("Filter বদলান অথবা নতুন event/tour তৈরি করুন।", "Change the filter or create a new event or tour.")}</p>{canManage && !migrationRequired ? <Button className="mt-5 gap-2 rounded-xl" onClick={openCreateEvent}><Plus className="size-4" /> {pick("প্রথম ইভেন্ট তৈরি করুন", "Create first event")}</Button> : null}</div>}
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!access.current.ready || access.current.busy || access.current.blocked) return; setCreateOpen(open); if (!open) { editorEvent.current = null; setEditingEvent(null); setForm(emptyForm); } }}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-4xl"><DialogHeader><DialogTitle>{editingEvent ? pick("ইভেন্টের বিস্তারিত সম্পাদনা", "Edit event details") : pick("নতুন event বা tour", "New event or tour")}</DialogTitle><DialogDescription>{editingEvent ? pick("তারিখ, স্থান, capacity, budget এবং বর্তমান অবস্থা update করুন।", "Update the date, venue, capacity, budget, and current status.") : pick("তারিখ, স্থান, registration, capacity এবং budget নির্ধারণ করুন।", "Set the date, venue, registration, capacity, and budget.")}</DialogDescription></DialogHeader><fieldset disabled={verificationBlocked || loading || working || saving || !canManage || migrationRequired} className="contents"><div className="grid gap-4 py-2 sm:grid-cols-2"><Field label={pick("নাম (বাংলা)", "Name (Bangla)")} id="event-title-bn"><Input id="event-title-bn" value={form.titleBn} onChange={(event) => setForm({ ...form, titleBn: event.target.value })} /></Field><Field label={pick("নাম (ইংরেজি)", "Name (English)")} id="event-title-en"><Input id="event-title-en" value={form.titleEn} onChange={(event) => setForm({ ...form, titleEn: event.target.value })} /></Field><div className="sm:col-span-2"><Field label={pick("বিস্তারিত পরিকল্পনা (বাংলা)", "Detailed plan (Bangla)")} id="event-description-bn"><Textarea id="event-description-bn" rows={5} value={form.descriptionBn} onChange={(event) => setForm({ ...form, descriptionBn: event.target.value })} /></Field></div><div className="sm:col-span-2"><Field label={pick("বিস্তারিত পরিকল্পনা (ইংরেজি)", "Detailed plan (English)")} id="event-description-en"><Textarea id="event-description-en" rows={3} value={form.descriptionEn} onChange={(event) => setForm({ ...form, descriptionEn: event.target.value })} /></Field></div><Field label={pick("আয়োজনের ধরন", "Event type")} id="event-type"><Select value={form.eventType} onValueChange={(value) => setForm({ ...form, eventType: value as FamilyEvent["event_type"] })}><SelectTrigger id="event-type" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label={pick("অবস্থা", "Status")} id="event-status"><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as EventForm["status"] })}><SelectTrigger id="event-status" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="published">{statusLabels.published}</SelectItem><SelectItem value="draft">{statusLabels.draft}</SelectItem>{editingEvent ? <><SelectItem value="registration_closed">{statusLabels.registration_closed}</SelectItem><SelectItem value="completed">{statusLabels.completed}</SelectItem><SelectItem value="cancelled">{statusLabels.cancelled}</SelectItem></> : null}</SelectContent></Select></Field><Field label={pick("শুরুর সময়", "Start time")} id="event-start"><Input id="event-start" type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} /></Field><Field label={pick("শেষের সময়", "End time")} id="event-end"><Input id="event-end" type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} /></Field><Field label={pick("স্থান / Venue", "Venue")} id="event-venue"><Input id="event-venue" value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} /></Field><Field label={pick("শহর", "City")} id="event-city"><Input id="event-city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field><Field label={pick("Meeting point", "Meeting point")} id="event-meeting"><Input id="event-meeting" value={form.meetingPoint} onChange={(event) => setForm({ ...form, meetingPoint: event.target.value })} /></Field><Field label={pick("Registration deadline", "Registration deadline")} id="event-deadline"><Input id="event-deadline" type="datetime-local" value={form.registrationDeadline} onChange={(event) => setForm({ ...form, registrationDeadline: event.target.value })} /></Field><Field label={pick("প্রতি ব্যক্তির খরচ", "Cost per person")} id="event-cost"><Input id="event-cost" type="number" min="0" step="0.01" value={form.estimatedCostPerPerson} onChange={(event) => setForm({ ...form, estimatedCostPerPerson: event.target.value })} /></Field><Field label={pick("মোট budget", "Total budget")} id="event-budget"><Input id="event-budget" type="number" min="0" step="0.01" value={form.totalBudget} onChange={(event) => setForm({ ...form, totalBudget: event.target.value })} /></Field><Field label={pick("সর্বোচ্চ capacity", "Maximum capacity")} id="event-capacity"><Input id="event-capacity" type="number" min="1" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></Field></div><DialogFooter><Button variant="outline" className="rounded-xl" disabled={verificationBlocked || loading || working || saving || !canManage || migrationRequired} onClick={() => { editorEvent.current = null; setEditingEvent(null); setForm(emptyForm); setCreateOpen(false); }}>{pick("বাতিল", "Cancel")}</Button><Button className="gap-2 rounded-xl" disabled={verificationBlocked || loading || working || saving || form.titleBn.trim().length < 3 || form.descriptionBn.trim().length < 5 || !form.startAt || !form.venue.trim()} onClick={() => void (editingEvent ? updateEventDetails(editingEvent.id, form) : createEvent(form)).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Event save হয়নি।", "Event could not be saved.")))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : editingEvent ? <Pencil className="size-4" /> : <CalendarDays className="size-4" />} {editingEvent ? pick("Event update", "Update event") : form.status === "published" ? pick("প্রকাশ করুন", "Publish") : pick("খসড়া সংরক্ষণ", "Save draft")}</Button></DialogFooter></fieldset></DialogContent></Dialog>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}><SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl"><SheetHeader className="border-b p-6 text-left"><div className="flex items-start justify-between gap-4 pr-8"><div className="flex flex-wrap gap-2">{selected ? <><Badge variant="secondary">{typeLabels[selected.event_type]}</Badge><Badge variant={selected.status === "cancelled" ? "destructive" : "outline"}>{statusLabels[selected.status]}</Badge></> : null}</div>{canManage && selected ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-2 rounded-xl" disabled={verificationBlocked || loading || saving || working}><Ellipsis className="size-4" /> {pick("পরিচালনা", "Manage")}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuItem onClick={() => openEditEvent(selected)}><Pencil /> {pick("বিস্তারিত সম্পাদনা", "Edit details")}</DropdownMenuItem>{selected.status !== "published" ? <DropdownMenuItem onClick={() => void updateEvent("publish").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Update হয়নি।", "Update failed.")))}>{pick("Registration প্রকাশ করুন", "Publish registration")}</DropdownMenuItem> : <DropdownMenuItem onClick={() => void updateEvent("close").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Update হয়নি।", "Update failed.")))}>{pick("Registration বন্ধ করুন", "Close registration")}</DropdownMenuItem>}<DropdownMenuItem onClick={() => void updateEvent("complete").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Update হয়নি।", "Update failed.")))}>{pick("সম্পন্ন হিসেবে চিহ্নিত করুন", "Mark completed")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void updateEvent("cancel").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Update হয়নি।", "Update failed.")))}>{pick("ইভেন্ট বাতিল করুন", "Cancel event")}</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void deleteEvent(selected.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Event delete হয়নি।", "Event could not be deleted.")))}><Trash2 /> {pick("স্থায়ীভাবে মুছুন", "Delete permanently")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</div><SheetTitle className="text-2xl leading-snug">{locale === "en" ? selected?.title_en || selected?.title_bn : selected?.title_bn}</SheetTitle><SheetDescription>{locale === "bn" ? selected?.title_en || (selected ? `${dateFormatter.format(new Date(selected.start_at))} · ${selected.venue}` : "ইভেন্টের বিস্তারিত") : selected ? `${dateFormatter.format(new Date(selected.start_at))} · ${selected.venue}` : "Event details"}</SheetDescription></SheetHeader>{selected ? <div className="space-y-6 p-6"><div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 sm:grid-cols-2"><Info icon={<CalendarDays />} label={pick("সময়", "Time")} value={dateFormatter.format(new Date(selected.start_at))} /><Info icon={<MapPin />} label={pick("স্থান", "Venue")} value={[selected.venue, selected.city].filter(Boolean).join(", ")} /><Info icon={<CircleDollarSign />} label={pick("প্রতি ব্যক্তি", "Per person")} value={moneyFormatter.format(Number(selected.estimated_cost_per_person))} /><Info icon={<Users />} label={pick("নিবন্ধিত", "Registered")} value={`${selectedGoing.toLocaleString(locale === "bn" ? "bn-BD" : "en-US")}${selected.capacity ? ` / ${selected.capacity.toLocaleString(locale === "bn" ? "bn-BD" : "en-US")}` : ""}`} /></div>{selected.capacity ? <div><div className="mb-2 flex justify-between text-sm"><span>{pick("Capacity", "Capacity")}</span><strong>{Math.round(capacityProgress).toLocaleString(locale === "bn" ? "bn-BD" : "en-US")}%</strong></div><Progress value={capacityProgress} /></div> : null}
        {selected.status === "published" ? <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4"><div className="flex flex-wrap items-end gap-3"><div className="flex-1"><p className="font-bold">{pick("আপনার RSVP", "Your RSVP")}</p><p className="mt-1 text-sm text-muted-foreground">{pick("বর্তমান উত্তর", "Current response")}: {myRsvp ? responseLabels[myRsvp.response] : pick("দেওয়া হয়নি", "Not provided")}</p></div><Field label={pick("অতিথি", "Guests")} id="event-guests"><Input id="event-guests" className="w-24" type="number" min="0" max="10" value={guestCount} onChange={(event) => setGuestCount(event.target.value)} /></Field></div><Input className="mt-3" placeholder={pick("বিশেষ note (ঐচ্ছিক)", "Special note (optional)")} value={rsvpNote} onChange={(event) => setRsvpNote(event.target.value)} /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" className="rounded-xl" disabled={verificationBlocked || loading || saving || working} onClick={() => void saveRsvp("going").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("RSVP হয়নি।", "RSVP could not be saved.")))}>{responseLabels.going}</Button><Button size="sm" variant="outline" className="rounded-xl" disabled={verificationBlocked || loading || saving || working} onClick={() => void saveRsvp("maybe").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("RSVP হয়নি।", "RSVP could not be saved.")))}>{responseLabels.maybe}</Button><Button size="sm" variant="ghost" className="rounded-xl" disabled={verificationBlocked || loading || saving || working} onClick={() => void saveRsvp("not_going").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("RSVP হয়নি।", "RSVP could not be saved.")))}>{responseLabels.not_going}</Button></div></div> : null}
        <Tabs defaultValue="overview"><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="overview">{pick("পরিকল্পনা", "Plan")}</TabsTrigger><TabsTrigger value="discussion">{pick("আলোচনা", "Discussion")} ({selectedComments.length.toLocaleString(locale === "bn" ? "bn-BD" : "en-US")})</TabsTrigger><TabsTrigger value="gallery">{pick("Gallery", "Gallery")} ({selectedMedia.length.toLocaleString(locale === "bn" ? "bn-BD" : "en-US")})</TabsTrigger></TabsList><TabsContent value="overview" className="space-y-4 pt-4"><p className="whitespace-pre-wrap leading-7">{locale === "en" ? selected.description_en || selected.description_bn : selected.description_bn}</p>{locale === "bn" && selected.description_en ? <p className="rounded-2xl bg-muted/45 p-4 leading-7 text-muted-foreground">{selected.description_en}</p> : null}{selected.meeting_point ? <Info icon={<MapPin />} label={pick("Meeting point", "Meeting point")} value={selected.meeting_point} /> : null}{selected.registration_deadline ? <Info icon={<Clock3 />} label={pick("Registration deadline", "Registration deadline")} value={dateFormatter.format(new Date(selected.registration_deadline))} /> : null}<div className="rounded-2xl border p-4"><p className="text-sm text-muted-foreground">{pick("মোট পরিকল্পিত budget", "Total planned budget")}</p><p className="mt-1 text-2xl font-bold">{moneyFormatter.format(Number(selected.total_budget))}</p></div><div className="space-y-2"><p className="font-bold">{pick("অংশগ্রহণকারীরা", "Participants")}</p>{selectedRsvps.length ? selectedRsvps.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-muted/35 px-3 py-2 text-sm"><span>{item.respondent_name}{item.guest_count ? ` + ${item.guest_count}` : ""}</span><Badge variant="outline">{responseLabels[item.response]}</Badge></div>) : <p className="text-sm text-muted-foreground">{pick("এখনও কেউ RSVP করেননি।", "No one has responded yet.")}</p>}</div></TabsContent><TabsContent value="discussion" className="space-y-4 pt-4"><div className="max-h-80 space-y-3 overflow-y-auto">{selectedComments.length ? selectedComments.map(renderComment) : <p className="py-8 text-center text-sm text-muted-foreground">{pick("আলোচনা শুরু হয়নি।", "The discussion has not started.")}</p>}</div><Textarea rows={3} placeholder={pick("আপনার মতামত বা প্রশ্ন লিখুন", "Write your opinion or question")} value={commentText} onChange={(event) => setCommentText(event.target.value)} /><Button className="gap-2 rounded-xl" disabled={verificationBlocked || loading || saving || working || commentText.trim().length < 2} onClick={() => void addComment().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Comment হয়নি।", "Comment could not be added.")))}><MessageCircle className="size-4" /> {pick("Comment করুন", "Add comment")}</Button></TabsContent><TabsContent value="gallery" className="space-y-4 pt-4"><div className="grid grid-cols-2 gap-3">{selectedMedia.map((item) => <figure key={item.id} className="relative overflow-hidden rounded-2xl border bg-muted/30">{item.mime_type.startsWith("image/") ? <img src={`/api/event-media/${item.id}`} alt={item.caption || item.file_name} className="aspect-square w-full object-cover" /> : <video src={`/api/event-media/${item.id}`} controls className="aspect-video w-full bg-black" />}{canManage ? <Button type="button" variant="destructive" size="icon-sm" className="absolute right-2 top-2 rounded-full shadow" disabled={verificationBlocked || loading || saving || working} aria-label={pick("Media মুছুন", "Delete media")} onClick={() => void deleteMedia(item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Media delete হয়নি।", "Media could not be deleted.")))}><Trash2 className="size-4" /></Button> : null}<figcaption className="p-3 text-xs"><p className="font-medium">{item.caption || item.file_name}</p><p className="mt-1 text-muted-foreground">{item.uploader_name}</p></figcaption></figure>)}</div>{!selectedMedia.length ? <div className="rounded-2xl border border-dashed p-8 text-center"><ImagePlus className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm text-muted-foreground">{pick("এখনও কোনো ছবি বা ভিডিও নেই।", "There are no photos or videos yet.")}</p></div> : null}<div className="rounded-2xl border p-4"><Label htmlFor="event-media-file">{pick("ছবি বা ভিডিও যোগ করুন", "Add a photo or video")}</Label><Input disabled={verificationBlocked || loading || saving || working} className="mt-2" placeholder={pick("Caption (ঐচ্ছিক)", "Caption (optional)")} value={mediaCaption} onChange={(event) => setMediaCaption(event.target.value)} /><input ref={fileInputRef} id="event-media-file" disabled={verificationBlocked || loading || saving || working} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" className="mt-3 block w-full text-sm" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setMediaFile({ eventId: selected.id, file }); void uploadMedia(file).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Upload হয়নি।", "Upload failed."))); } }} /><p className="mt-2 text-xs text-muted-foreground">{pick("ছবি সর্বোচ্চ ৮ MB, ভিডিও সর্বোচ্চ ২৫ MB।", "Images up to 8 MB and videos up to 25 MB.")}</p><Button variant="outline" className="mt-3 gap-2 rounded-xl" disabled={verificationBlocked || loading || saving || working} onClick={() => fileInputRef.current?.click()}><Upload className="size-4" /> {pick("File নির্বাচন", "Choose file")}</Button>{mediaFile?.eventId === selected.id ? <Button variant="outline" className="ml-2 mt-3 rounded-xl" disabled={verificationBlocked || loading || saving || working} onClick={() => void uploadMedia(mediaFile.file).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Upload হয়নি।", "Upload failed.")))}>{pick("নির্বাচিত file আবার পাঠান", "Retry selected file")}</Button> : null}</div></TabsContent></Tabs>
      </div> : null}</SheetContent></Sheet>
      </fieldset>
    </main>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-primary [&_svg]:size-4">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div></div>;
}
