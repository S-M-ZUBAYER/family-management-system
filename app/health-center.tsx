"use client";

import { useActionFeedback } from "@/components/action-modal-provider";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  AlarmClockCheck,
  Ambulance,
  Bell,
  CalendarClock,
  CheckCircle2,
  Download,
  Droplets,
  FileHeart,
  FileText,
  HeartHandshake,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  MoreHorizontal,
  Navigation,
  Pill,
  Plus,
  ShieldCheck,
  Siren,
  Upload,
  Users,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  EmergencyHealthProfile,
  HealthAppointment,
  HealthDocument,
  HealthMeasurement,
  HealthMedication,
  HealthPayload,
  HealthProfile,
  HealthSosAlert,
  HealthSosResponse,
} from "@/lib/health-types";
import { cn } from "@/lib/utils";

type RecordKind = "medication" | "appointment" | "measurement";
type FormState = Record<string, string>;
type LocationState = { latitude: number; longitude: number; accuracy: number } | null;

const date = new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium", timeStyle: "short" });
const time = new Intl.DateTimeFormat("bn-BD", { hour: "numeric", minute: "2-digit" });
const today = () => new Date().toISOString().slice(0, 10);
const nowLocal = () => {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
};

const typeLabels: Record<HealthMeasurement["measurement_type"], string> = {
  blood_pressure: "Blood pressure",
  blood_sugar: "Blood sugar",
  pulse: "Pulse",
  temperature: "Temperature",
  weight: "Weight",
  oxygen: "Oxygen saturation",
};

const typeUnits: Record<HealthMeasurement["measurement_type"], string> = {
  blood_pressure: "mmHg",
  blood_sugar: "mg/dL",
  pulse: "bpm",
  temperature: "°C",
  weight: "kg",
  oxygen: "%",
};

const sosLabels: Record<HealthSosAlert["alert_type"], string> = {
  medical: "Medical emergency",
  accident: "Accident",
  fire: "Fire",
  safety: "Safety concern",
  other: "Other emergency",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function fileSize(size: number) {
  return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function initialForm(kind: RecordKind): FormState {
  if (kind === "medication") return { frequency: "প্রতিদিন", reminderTimes: "08:00, 20:00", startDate: today(), endDate: "" };
  if (kind === "appointment") return { scheduledAt: nowLocal(), reminderMinutes: "60" };
  return { measurementType: "blood_pressure", valuePrimary: "", valueSecondary: "", unit: "mmHg", measuredAt: nowLocal() };
}

export function HealthCenter() {
  const [family, setFamily] = useState<HealthPayload["family"]>();
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [medications, setMedications] = useState<HealthMedication[]>([]);
  const [appointments, setAppointments] = useState<HealthAppointment[]>([]);
  const [measurements, setMeasurements] = useState<HealthMeasurement[]>([]);
  const [documents, setDocuments] = useState<HealthDocument[]>([]);
  const [directory, setDirectory] = useState<EmergencyHealthProfile[]>([]);
  const [alerts, setAlerts] = useState<HealthSosAlert[]>([]);
  const [responses, setResponses] = useState<HealthSosResponse[]>([]);
  const [canManageSos, setCanManageSos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<FormState>({});
  const [donorAvailable, setDonorAvailable] = useState(false);
  const [recordKind, setRecordKind] = useState<RecordKind | null>(null);
  const [recordForm, setRecordForm] = useState<FormState>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState<FormState>({ category: "prescription", documentDate: today() });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [now] = useState(Date.now);
  const [sosOpen, setSosOpen] = useState(false);
  const [sosForm, setSosForm] = useState<FormState>({ alertType: "medical" });
  const [location, setLocation] = useState<LocationState>(null);
  const [locating, setLocating] = useState(false);
  const [responseTarget, setResponseTarget] = useState<HealthSosAlert | null>(null);
  const [responseType, setResponseType] = useState("acknowledged");
  const [responseNote, setResponseNote] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadHealth = useCallback(async () => {
    setFeedback(null);
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = (await response.json()) as HealthPayload;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        setSetupRequired(true);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "Health workspace পাওয়া যায়নি।");
      setFamily(payload.family);
      setProfile(payload.profile ?? null);
      setMedications(payload.medications ?? []);
      setAppointments(payload.appointments ?? []);
      setMeasurements(payload.measurements ?? []);
      setDocuments(payload.documents ?? []);
      setDirectory(payload.emergencyDirectory ?? []);
      setAlerts(payload.sosAlerts ?? []);
      setResponses(payload.sosResponses ?? []);
      setCanManageSos(Boolean(payload.permissions?.canManageSos));
      setMigrationRequired(Boolean(payload.migrationRequired));
      setSetupRequired(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Health workspace load হয়নি।");
    } finally {
      setLoading(false);
    }
  }, [setFeedback]);

  useEffect(() => {
    queueMicrotask(() => {
      setNotificationPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
      void loadHealth();
    });
    const timer = window.setInterval(() => void loadHealth(), 30000);
    return () => window.clearInterval(timer);
  }, [loadHealth]);

  const activeAlerts = useMemo(() => alerts.filter((alert) => ["active", "acknowledged"].includes(alert.status)), [alerts]);
  const activeMedications = useMemo(() => medications.filter((item) => item.status === "active"), [medications]);
  const upcomingAppointments = useMemo(() => appointments.filter((item) => item.status === "scheduled" && new Date(item.scheduled_at).getTime() >= now), [appointments, now]);
  const donors = useMemo(() => directory.filter((item) => item.donor_available), [directory]);
  const recentMeasurements = useMemo(() => measurements.slice(0, 6), [measurements]);
  const nextAppointment = upcomingAppointments[0];

  useEffect(() => {
    if (notificationPermission !== "granted" || typeof Notification === "undefined") return;
    const timers: number[] = [];
    const maxDelay = 24 * 60 * 60 * 1000;
    activeMedications.forEach((medicine) => {
      medicine.reminder_times.forEach((reminderTime) => {
        const [hour, minute] = reminderTime.split(":").map(Number);
        const next = new Date();
        next.setHours(hour, minute, 0, 0);
        if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
        const delay = next.getTime() - Date.now();
        if (delay > maxDelay) return;
        timers.push(window.setTimeout(() => new Notification(`Medicine reminder · ${medicine.medicine_name}`, {
          body: `${medicine.dosage} · ${medicine.instructions || medicine.frequency}`,
        }), delay));
      });
    });
    upcomingAppointments.forEach((appointment) => {
      const reminderAt = new Date(appointment.scheduled_at).getTime() - appointment.reminder_minutes * 60 * 1000;
      const delay = reminderAt - Date.now();
      if (delay <= 0 || delay > maxDelay) return;
      timers.push(window.setTimeout(() => new Notification(`Appointment reminder · ${appointment.title}`, {
        body: `${appointment.doctor_name || "Doctor visit"} · ${dateTime.format(new Date(appointment.scheduled_at))}`,
      }), delay));
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [activeMedications, notificationPermission, upcomingAppointments]);

  function openProfile() {
    setProfileForm({
      bloodGroup: profile?.blood_group ?? "Unknown",
      dateOfBirth: profile?.date_of_birth ?? "",
      heightCm: String(profile?.height_cm ?? ""),
      weightKg: String(profile?.weight_kg ?? ""),
      conditions: profile?.conditions ?? "",
      allergies: profile?.allergies ?? "",
      emergencyNotes: profile?.emergency_notes ?? "",
      doctorName: profile?.doctor_name ?? "",
      doctorPhone: profile?.doctor_phone ?? "",
      emergencyContactName: profile?.emergency_contact_name ?? "",
      emergencyContactPhone: profile?.emergency_contact_phone ?? "",
      lastDonationDate: profile?.last_donation_date ?? "",
      visibility: profile?.visibility ?? "private",
    });
    setDonorAvailable(Boolean(profile?.donor_available));
    setProfileOpen(true);
  }

  async function postAction(action: string, data: Record<string, unknown>) {
    const response = await fetch("/api/health/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
    });
    const payload = (await response.json()) as { record?: unknown; error?: string };
    if (!response.ok || !payload.record) throw new Error(payload.error ?? "Health record save হয়নি।");
    return payload.record;
  }

  async function saveProfile() {
    setSaving(true);
    try {
      await postAction("save_profile", { ...profileForm, donorAvailable });
      setProfileOpen(false);
      await loadHealth();
      setFeedback("Private health profile update হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  async function saveRecord() {
    if (!recordKind) return;
    setSaving(true);
    try {
      const action = recordKind === "medication" ? "create_medication" : recordKind === "appointment" ? "create_appointment" : "create_measurement";
      const data: Record<string, unknown> = { ...recordForm };
      if (recordKind === "medication") data.reminderTimes = recordForm.reminderTimes?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
      await postAction(action, data);
      setRecordKind(null);
      await loadHealth();
      setFeedback("Health record save হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(entity: "medication" | "appointment", id: string, status: string) {
    setSaving(true);
    try {
      await postAction("update_status", { entity, id, status });
      await loadHealth();
      setFeedback("Status update হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  async function uploadDocument() {
    if (!uploadFile) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("file", uploadFile);
      Object.entries(uploadForm).forEach(([key, value]) => formData.set(key, value));
      const response = await fetch("/api/health/upload", { method: "POST", body: formData });
      const payload = (await response.json()) as { document?: HealthDocument; error?: string };
      if (!response.ok || !payload.document) throw new Error(payload.error ?? "Document upload হয়নি।");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadForm({ category: "prescription", documentDate: today() });
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadHealth();
      setFeedback("Medical vault-এ document save হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setFeedback("এই browser-এ location পাওয়া যাচ্ছে না। Location ছাড়াও SOS পাঠাতে পারবেন।");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        setLocating(false);
      },
      () => {
        setLocation(null);
        setLocating(false);
        setFeedback("Location permission পাওয়া যায়নি। Location ছাড়া SOS পাঠানো যাবে।");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  async function createSos() {
    setSaving(true);
    try {
      await postAction("create_sos", {
        ...sosForm,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        locationAccuracyM: location?.accuracy ?? null,
      });
      setSosOpen(false);
      setSosForm({ alertType: "medical" });
      setLocation(null);
      await loadHealth();
      setFeedback("SOS alert পরিবারের dashboard-এ পাঠানো হয়েছে। স্থানীয় emergency service-এ call প্রয়োজন হলে নিজে call করুন।");
    } finally {
      setSaving(false);
    }
  }

  async function respondToSos() {
    if (!responseTarget) return;
    setSaving(true);
    try {
      await postAction("respond_sos", { alertId: responseTarget.id, responseType, note: responseNote });
      setResponseTarget(null);
      setResponseNote("");
      await loadHealth();
      setFeedback("SOS response update হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  async function closeSos(alert: HealthSosAlert, status: "resolved" | "cancelled") {
    setSaving(true);
    try {
      await postAction("update_sos", { alertId: alert.id, status, note: status === "resolved" ? "পরিবারের পক্ষ থেকে সমাধান হয়েছে" : "Reporter alert বাতিল করেছেন" });
      await loadHealth();
      setFeedback(status === "resolved" ? "SOS resolved হয়েছে।" : "SOS cancelled হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      setFeedback("এই browser notification support করে না।");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    setFeedback(permission === "granted" ? "Medicine ও appointment browser reminder চালু হয়েছে।" : "Notification permission দেওয়া হয়নি।");
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const add = (name: string, rows: Array<Record<string, unknown>>) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
      add("My Profile", profile ? [{ Name: profile.member_name, "Blood group": profile.blood_group, Conditions: profile.conditions, Allergies: profile.allergies, "Emergency notes": profile.emergency_notes, Doctor: profile.doctor_name, "Doctor phone": profile.doctor_phone, "Emergency contact": profile.emergency_contact_name, "Emergency phone": profile.emergency_contact_phone, "Donor available": profile.donor_available ? "Yes" : "No", Visibility: profile.visibility }] : []);
      add("Medications", medications.map((item) => ({ Medicine: item.medicine_name, Dosage: item.dosage, Frequency: item.frequency, Times: item.reminder_times.join(", "), Start: item.start_date, End: item.end_date ?? "", Doctor: item.prescribing_doctor ?? "", Status: item.status, Instructions: item.instructions ?? "" })));
      add("Appointments", appointments.map((item) => ({ Appointment: item.title, Doctor: item.doctor_name ?? "", Facility: item.facility ?? "", Schedule: item.scheduled_at, Status: item.status, Notes: item.notes ?? "" })));
      add("Measurements", measurements.map((item) => ({ Type: typeLabels[item.measurement_type], Primary: Number(item.value_primary), Secondary: item.value_secondary === null ? "" : Number(item.value_secondary), Unit: item.unit, Time: item.measured_at, Notes: item.notes ?? "" })));
      add("Documents", documents.map((item) => ({ Title: item.title, Category: item.category, Date: item.document_date ?? "", File: item.file_name, Size: item.file_size, Notes: item.notes ?? "" })));
      add("Blood Directory", directory.map((item) => ({ Member: item.member_name, "Blood group": item.blood_group ?? "", Donor: item.donor_available ? "Yes" : "No", "Last donation": item.last_donation_date ?? "", Allergies: item.allergies ?? "", Conditions: item.conditions ?? "", "Emergency contact": item.emergency_contact_name ?? "", Phone: item.emergency_contact_phone ?? "" })));
      add("SOS History", alerts.map((item) => ({ Time: item.created_at, Reporter: item.reporter_name, Type: item.alert_type, Message: item.message, Status: item.status, Location: item.location_label ?? (item.latitude ? `${item.latitude}, ${item.longitude}` : ""), Acknowledged: item.acknowledged_by_name ?? "", Resolved: item.resolved_at ?? "" })));
      XLSX.writeFile(workbook, `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-health-sos.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(modelContext.registerTool({
      name: "get_family_emergency_summary",
      title: "Get family emergency summary",
      description: "Read active family SOS alerts, blood donor availability and the signed-in user's upcoming care reminders. This is not medical advice.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input: unknown) {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input as object).length) throw new Error("No input fields are accepted.");
        return {
          activeAlerts: activeAlerts.map((item) => ({ id: item.id, type: item.alert_type, reporter: item.reporter_name, message: item.message, status: item.status, createdAt: item.created_at })),
          donors: donors.map((item) => ({ name: item.member_name, bloodGroup: item.blood_group })),
          activeMedications: activeMedications.length,
          nextAppointment: nextAppointment ? { title: nextAppointment.title, scheduledAt: nextAppointment.scheduled_at } : null,
        };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [activeAlerts, activeMedications.length, donors, nextAppointment]);

  if (loading) return <main className="grid min-h-[calc(100vh-4rem)] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Health workspace প্রস্তুত হচ্ছে…</p></div></main>;
  if (setupRequired) return <main className="mx-auto max-w-3xl p-6 md:p-10"><StateCard icon={<Users />} title="Family access সক্রিয় নয়" text="Join code দিয়ে আবেদন করুন। Admin approval-এর পর private health workspace ব্যবহার করা যাবে।" action={<Button asChild className="rounded-xl"><a href="/setup">Family onboarding</a></Button>} /></main>;

  return (
    <main className="mx-auto w-full max-w-[1550px] space-y-5 px-4 py-5 md:px-7 md:py-7">
      <section className="overflow-hidden rounded-3xl bg-[linear-gradient(130deg,#0f3d3a_0%,#155e75_58%,#1e3a5f_100%)] p-5 text-white shadow-xl md:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-sm text-emerald-200"><ShieldCheck className="size-4" /> Private medical workspace</div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-4xl">Health & Emergency SOS</h1>
            <p className="mt-2 text-sm leading-6 text-white/70">ওষুধ, appointment, health log ও medical documents নিরাপদে রাখুন। জরুরিতে পরিবারের সবাইকে দ্রুত alert করুন।</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => void enableNotifications()}><Bell className="size-4" /> Reminder চালু</Button>
            <Button variant="secondary" className="rounded-xl" onClick={() => void exportXlsx()} disabled={exporting}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} XLSX</Button>
            <Button className="rounded-xl bg-rose-500 text-white hover:bg-rose-600" onClick={() => setSosOpen(true)} disabled={migrationRequired}><Siren className="size-4" /> জরুরি SOS</Button>
          </div>
        </div>
      </section>

      {migrationRequired ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">Supabase SQL Editor-এ <b>supabase/migrations/20260927_health_sos.sql</b> চালালে Health ও SOS data সক্রিয় হবে।</div> : null}
      {feedback ? <div className="flex items-start justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm"><span>{feedback}</span><Button size="icon-xs" variant="ghost" onClick={() => setFeedback(null)}><X /></Button></div> : null}
      {activeAlerts.length ? <div className="space-y-2">{activeAlerts.map((alert) => <SosBanner key={alert.id} alert={alert} onRespond={() => setResponseTarget(alert)} onClose={(status) => void closeSos(alert, status).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "SOS update হয়নি।"))} canClose={alert.is_reporter || canManageSos} />)}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Pill />} label="Active medicines" value={String(activeMedications.length)} note={activeMedications.length ? `${activeMedications.reduce((sum, item) => sum + item.reminder_times.length, 0)} daily reminder times` : "Medicine যোগ করুন"} />
        <Metric icon={<CalendarClock />} label="Next appointment" value={nextAppointment ? date.format(new Date(nextAppointment.scheduled_at)) : "নেই"} note={nextAppointment ? time.format(new Date(nextAppointment.scheduled_at)) : "Schedule clear"} />
        <Metric icon={<Droplets />} label="Available blood donors" value={String(donors.length)} note={`${directory.length} shared emergency profiles`} />
        <Metric icon={<Activity />} label="Health logs" value={String(measurements.length)} note={measurements[0] ? `Last: ${date.format(new Date(measurements[0].measured_at))}` : "No measurement yet"} />
      </section>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-muted p-1">
          <TabsTrigger value="overview" className="rounded-xl">Overview</TabsTrigger>
          <TabsTrigger value="care" className="rounded-xl">Medicines & Appointments</TabsTrigger>
          <TabsTrigger value="records" className="rounded-xl">Logs & Documents</TabsTrigger>
          <TabsTrigger value="emergency" className="rounded-xl">SOS & Blood Directory</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
          <Card className="rounded-3xl shadow-none">
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>আমার health profile</CardTitle><p className="mt-1 text-sm text-muted-foreground">আপনার private এবং emergency-share settings</p></div><Button variant="outline" className="rounded-xl" onClick={openProfile}>{profile ? "Update" : "Create"}</Button></CardHeader>
            <CardContent>
              {profile ? <div className="grid gap-3 sm:grid-cols-2"><Info label="Blood group" value={profile.blood_group || "Not set"} icon={<Droplets />} /><Info label="Allergies" value={profile.allergies || "None added"} icon={<ShieldCheck />} /><Info label="Emergency contact" value={profile.emergency_contact_name ? `${profile.emergency_contact_name} · ${profile.emergency_contact_phone || "No phone"}` : "Not set"} icon={<HeartHandshake />} /><Info label="Visibility" value={profile.visibility === "private" ? "শুধু আমি" : profile.visibility === "emergency" ? "Emergency info family-visible" : "Shared with family"} icon={<LockKeyhole />} /></div> : <Empty icon={<FileHeart />} title="Health profile তৈরি করুন" text="Blood group, allergies, emergency contact ও privacy preference যোগ করুন।" />}
            </CardContent>
          </Card>
          <Card className="rounded-3xl shadow-none">
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>আজকের care plan</CardTitle><p className="mt-1 text-sm text-muted-foreground">Active medicines ও upcoming schedule</p></div><Button size="sm" className="rounded-xl" onClick={() => { setRecordKind("medication"); setRecordForm(initialForm("medication")); }}><Plus className="size-4" /> Medicine</Button></CardHeader>
            <CardContent className="space-y-3">
              {activeMedications.slice(0, 4).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border p-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Pill className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.medicine_name} · {item.dosage}</p><p className="text-xs text-muted-foreground">{item.frequency} · {item.reminder_times.join(", ") || "No browser time"}</p></div><Badge variant="secondary">Active</Badge></div>)}
              {nextAppointment ? <div className="flex items-center gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100"><CalendarClock className="size-5" /><div><p className="font-semibold">{nextAppointment.title}</p><p className="text-xs opacity-75">{dateTime.format(new Date(nextAppointment.scheduled_at))} · {nextAppointment.facility || "Location not set"}</p></div></div> : null}
              {!activeMedications.length && !nextAppointment ? <Empty icon={<AlarmClockCheck />} title="আজ কোনো reminder নেই" text="Medicine বা appointment যোগ করলে এখানে দেখা যাবে।" /> : null}
            </CardContent>
          </Card>
          <Card className="rounded-3xl shadow-none xl:col-span-2">
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Recent measurements</CardTitle><p className="mt-1 text-sm text-muted-foreground">Personal tracking only—clinical diagnosis নয়</p></div><Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setRecordKind("measurement"); setRecordForm(initialForm("measurement")); }}><Plus className="size-4" /> Add log</Button></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recentMeasurements.map((item) => <div key={item.id} className="rounded-2xl border p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold">{typeLabels[item.measurement_type]}</span><Activity className="size-4 text-primary" /></div><p className="mt-3 text-2xl font-bold">{item.value_primary}{item.value_secondary !== null ? ` / ${item.value_secondary}` : ""} <small className="text-xs font-normal text-muted-foreground">{item.unit}</small></p><p className="mt-1 text-xs text-muted-foreground">{dateTime.format(new Date(item.measured_at))}</p></div>)}
              {!recentMeasurements.length ? <div className="sm:col-span-2 xl:col-span-3"><Empty icon={<Activity />} title="কোনো health log নেই" text="Blood pressure, sugar, pulse, temperature, weight বা oxygen লিখে রাখতে পারেন।" /></div> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="care" className="space-y-4">
          <DataSection title="Medicine schedule" description="Dosage, frequency, reminder times ও status" onAdd={() => { setRecordKind("medication"); setRecordForm(initialForm("medication")); }}>
            <Table><TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead>Dosage</TableHead><TableHead>Schedule</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {medications.map((item) => <TableRow key={item.id}><TableCell><b>{item.medicine_name}</b><p className="text-xs text-muted-foreground">{item.instructions || item.prescribing_doctor || ""}</p></TableCell><TableCell>{item.dosage}</TableCell><TableCell>{item.frequency}<p className="text-xs text-muted-foreground">{item.reminder_times.join(", ") || "No time"}</p></TableCell><TableCell>{item.start_date}{item.end_date ? ` → ${item.end_date}` : ""}</TableCell><TableCell><Status value={item.status} /></TableCell><TableCell><StatusMenu disabled={saving} values={["active", "paused", "completed"]} onSelect={(status) => void updateStatus("medication", item.id, status).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Update হয়নি।"))} /></TableCell></TableRow>)}
              {!medications.length ? <EmptyRows columns={6} /> : null}
            </TableBody></Table>
          </DataSection>
          <DataSection title="Appointments" description="Doctor, facility, date, reminder ও visit status" onAdd={() => { setRecordKind("appointment"); setRecordForm(initialForm("appointment")); }}>
            <Table><TableHeader><TableRow><TableHead>Appointment</TableHead><TableHead>Doctor</TableHead><TableHead>Schedule</TableHead><TableHead>Facility</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {appointments.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.title}</TableCell><TableCell>{item.doctor_name || "—"}</TableCell><TableCell>{dateTime.format(new Date(item.scheduled_at))}</TableCell><TableCell>{item.facility || "—"}</TableCell><TableCell><Status value={item.status} /></TableCell><TableCell><StatusMenu disabled={saving} values={["scheduled", "completed", "cancelled"]} onSelect={(status) => void updateStatus("appointment", item.id, status).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Update হয়নি।"))} /></TableCell></TableRow>)}
              {!appointments.length ? <EmptyRows columns={6} /> : null}
            </TableBody></Table>
          </DataSection>
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
          <DataSection title="Health measurements" description="Private chronological log" onAdd={() => { setRecordKind("measurement"); setRecordForm(initialForm("measurement")); }}>
            <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Reading</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader><TableBody>
              {measurements.map((item) => <TableRow key={item.id}><TableCell>{dateTime.format(new Date(item.measured_at))}</TableCell><TableCell>{typeLabels[item.measurement_type]}</TableCell><TableCell className="font-bold">{item.value_primary}{item.value_secondary !== null ? ` / ${item.value_secondary}` : ""} {item.unit}</TableCell><TableCell>{item.notes || "—"}</TableCell></TableRow>)}
              {!measurements.length ? <EmptyRows columns={4} /> : null}
            </TableBody></Table>
          </DataSection>
          <DataSection title="Private medical vault" description="Prescription, report, imaging, vaccine ও insurance documents" onAdd={() => setUploadOpen(true)} addLabel="Upload">
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {documents.map((item) => <a key={item.id} href={`/api/health-document/${item.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border p-4 transition hover:border-primary/30 hover:bg-muted/40"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></span><span className="min-w-0 flex-1"><b className="block truncate">{item.title}</b><small className="block truncate text-muted-foreground">{item.category.replaceAll("_", " ")} · {fileSize(item.file_size)}</small></span><Download className="size-4 text-muted-foreground" /></a>)}
              {!documents.length ? <div className="sm:col-span-2 xl:col-span-3"><Empty icon={<FileHeart />} title="Medical vault খালি" text="নিজের prescription বা report private storage-এ upload করুন।" /></div> : null}
            </div>
          </DataSection>
        </TabsContent>

        <TabsContent value="emergency" className="space-y-4">
          <Card className="rounded-3xl shadow-none"><CardHeader><CardTitle>Active & recent SOS alerts</CardTitle><p className="text-sm text-muted-foreground">Family coordination only—প্রয়োজনে স্থানীয় emergency service-এ সরাসরি call করুন</p></CardHeader><CardContent className="space-y-3">{alerts.map((alert) => <SosCard key={alert.id} alert={alert} responses={responses.filter((item) => item.alert_id === alert.id)} onRespond={() => setResponseTarget(alert)} onClose={(status) => void closeSos(alert, status).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "SOS update হয়নি।"))} canClose={alert.is_reporter || canManageSos} />)}{!alerts.length ? <Empty icon={<Ambulance />} title="কোনো SOS history নেই" text="জরুরি অবস্থায় SOS button ব্যবহার করলে alert এখানে দেখা যাবে।" /> : null}</CardContent></Card>
          <Card className="rounded-3xl shadow-none"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Blood & emergency directory</CardTitle><p className="mt-1 text-sm text-muted-foreground">Members নিজের ইচ্ছায় share করা information</p></div><Badge variant="secondary">{donors.length} donors</Badge></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{directory.map((item) => <EmergencyCard key={`${item.member_name}-${item.blood_group}`} item={item} />)}{!directory.length ? <div className="md:col-span-2 xl:col-span-3"><Empty icon={<Droplets />} title="Directory খালি" text="Health profile-এ emergency বা family visibility চালু করলে তথ্য এখানে আসবে।" /></div> : null}</CardContent></Card>
        </TabsContent>
      </Tabs>

      <p className="pb-3 text-center text-xs text-muted-foreground">এই module record ও reminder-এর জন্য; এটি medical diagnosis, treatment advice বা emergency service-এর বিকল্প নয়।</p>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-3xl"><DialogHeader><DialogTitle>Private health profile</DialogTitle><DialogDescription>Default private। Share setting আপনি নিজে নিয়ন্ত্রণ করবেন।</DialogDescription></DialogHeader><ProfileForm form={profileForm} setForm={setProfileForm} donorAvailable={donorAvailable} setDonorAvailable={setDonorAvailable} /><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setProfileOpen(false)}>বাতিল</Button><Button className="rounded-xl" disabled={saving} onClick={() => void saveProfile().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Save হয়নি।"))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Save</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(recordKind)} onOpenChange={(open) => !open && setRecordKind(null)}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-2xl"><DialogHeader><DialogTitle>{recordKind === "medication" ? "Medicine" : recordKind === "appointment" ? "Appointment" : "Health measurement"} যোগ করুন</DialogTitle><DialogDescription>এই তথ্য আপনার private health workspace-এ থাকবে।</DialogDescription></DialogHeader>{recordKind ? <RecordForm kind={recordKind} form={recordForm} setForm={setRecordForm} /> : null}<DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setRecordKind(null)}>বাতিল</Button><Button className="rounded-xl" disabled={saving} onClick={() => void saveRecord().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Save হয়নি।"))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Save</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}><DialogContent className="rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>Medical document upload</DialogTitle><DialogDescription>শুধু আপনি এই private file দেখতে পারবেন। সর্বোচ্চ ১২ MB।</DialogDescription></DialogHeader><div className="space-y-4"><Field label="Title" id="health-doc-title"><Input id="health-doc-title" value={uploadForm.title ?? ""} onChange={(event) => setUploadForm({ ...uploadForm, title: event.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Category" id="health-doc-category"><Select value={uploadForm.category} onValueChange={(value) => setUploadForm({ ...uploadForm, category: value })}><SelectTrigger id="health-doc-category"><SelectValue /></SelectTrigger><SelectContent>{[["prescription", "Prescription"], ["lab_report", "Lab report"], ["imaging", "Imaging"], ["vaccine", "Vaccine"], ["insurance", "Insurance"], ["other", "Other"]].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Document date" id="health-doc-date"><Input id="health-doc-date" type="date" value={uploadForm.documentDate ?? ""} onChange={(event) => setUploadForm({ ...uploadForm, documentDate: event.target.value })} /></Field></div><Field label="File" id="health-doc-file"><Input ref={fileInputRef} id="health-doc-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></Field><Field label="Notes" id="health-doc-notes"><Textarea id="health-doc-notes" value={uploadForm.notes ?? ""} onChange={(event) => setUploadForm({ ...uploadForm, notes: event.target.value })} /></Field></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setUploadOpen(false)}>বাতিল</Button><Button className="rounded-xl" disabled={saving || !uploadFile} onClick={() => void uploadDocument().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Upload হয়নি।"))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={sosOpen} onOpenChange={setSosOpen}><DialogContent className="rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle className="flex items-center gap-2 text-rose-600"><Siren /> জরুরি SOS পাঠান</DialogTitle><DialogDescription>এটি family alert। জীবন-ঝুঁকির জরুরিতে স্থানীয় emergency service-এ সরাসরি call করুন।</DialogDescription></DialogHeader><div className="space-y-4"><Field label="Emergency type" id="sos-type"><Select value={sosForm.alertType} onValueChange={(value) => setSosForm({ ...sosForm, alertType: value })}><SelectTrigger id="sos-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(sosLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="কী হয়েছে?" id="sos-message"><Textarea id="sos-message" rows={4} value={sosForm.message ?? ""} onChange={(event) => setSosForm({ ...sosForm, message: event.target.value })} placeholder="পরিবার যেন দ্রুত বুঝতে পারে এমন সংক্ষিপ্ত তথ্য" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="যোগাযোগ নম্বর" id="sos-contact"><Input id="sos-contact" value={sosForm.preferredContact ?? ""} onChange={(event) => setSosForm({ ...sosForm, preferredContact: event.target.value })} /></Field><Field label="Location label" id="sos-location-label"><Input id="sos-location-label" value={sosForm.locationLabel ?? ""} onChange={(event) => setSosForm({ ...sosForm, locationLabel: event.target.value })} placeholder="যেমন: বাসা, ৩য় তলা" /></Field></div><div className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Current location (optional)</p><p className="text-xs text-muted-foreground">শুধু এই SOS-এর সাথে approved family members দেখবে।</p></div><Button variant="outline" className="rounded-xl" onClick={requestLocation} disabled={locating}>{locating ? <LoaderCircle className="size-4 animate-spin" /> : <Navigation className="size-4" />} {location ? "Update" : "Add location"}</Button></div>{location ? <p className="mt-3 flex items-center gap-2 text-xs text-emerald-600"><CheckCircle2 className="size-4" /> Location ready · accuracy প্রায় {Math.round(location.accuracy)}m <button type="button" className="underline" onClick={() => setLocation(null)}>Remove</button></p> : null}</div></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setSosOpen(false)}>বাতিল</Button><Button className="rounded-xl bg-rose-600 text-white hover:bg-rose-700" disabled={saving || (sosForm.message?.trim().length ?? 0) < 3} onClick={() => void createSos().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "SOS পাঠানো যায়নি।"))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Siren className="size-4" />} Family SOS পাঠান</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(responseTarget)} onOpenChange={(open) => !open && setResponseTarget(null)}><DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle>SOS response</DialogTitle><DialogDescription>{responseTarget?.reporter_name} · {responseTarget?.message}</DialogDescription></DialogHeader><div className="space-y-4"><Field label="Response" id="sos-response-type"><Select value={responseType} onValueChange={setResponseType}><SelectTrigger id="sos-response-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="acknowledged">দেখেছি / যোগাযোগ করছি</SelectItem><SelectItem value="on_the_way">আমি আসছি</SelectItem><SelectItem value="called_emergency">Emergency service call করেছি</SelectItem><SelectItem value="update">Update দিচ্ছি</SelectItem></SelectContent></Select></Field><Field label="Note" id="sos-response-note"><Textarea id="sos-response-note" value={responseNote} onChange={(event) => setResponseNote(event.target.value)} placeholder="ঐচ্ছিক update" /></Field></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setResponseTarget(null)}>বাতিল</Button><Button className="rounded-xl" disabled={saving} onClick={() => void respondToSos().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Response হয়নি।"))}>Response পাঠান</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) { return <Card className="rounded-2xl py-0 shadow-none"><CardContent className="p-5"><span className="mb-4 grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card>; }
function Info({ label, value, icon }: { label: string; value: string; icon: ReactNode }) { return <div className="flex gap-3 rounded-2xl border p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div></div>; }
function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="rounded-2xl border border-dashed p-7 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>; }
function EmptyRows({ columns }: { columns: number }) { return <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">এখনও কোনো record নেই। Add দিয়ে শুরু করুন।</TableCell></TableRow>; }
function StateCard({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) { return <Card className="rounded-3xl"><CardContent className="flex min-h-96 flex-col items-center justify-center p-8 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><h2 className="mt-5 text-2xl font-bold">{title}</h2><p className="mt-2 max-w-xl text-muted-foreground">{text}</p>{action ? <div className="mt-6">{action}</div> : null}</CardContent></Card>; }
function DataSection({ title, description, onAdd, addLabel = "Add", children }: { title: string; description: string; onAdd: () => void; addLabel?: string; children: ReactNode }) { return <Card className="gap-0 overflow-hidden rounded-3xl py-0 shadow-none"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div><Button size="sm" className="self-start rounded-xl" onClick={onAdd}>{addLabel === "Upload" ? <Upload className="size-4" /> : <Plus className="size-4" />} {addLabel}</Button></div><div className="overflow-x-auto">{children}</div></Card>; }
function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>; }
function Status({ value }: { value: string }) { const style = ["active", "scheduled", "completed", "resolved"].includes(value) ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : ["paused", "acknowledged"].includes(value) ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : ["cancelled"].includes(value) ? "bg-rose-500/12 text-rose-700 dark:text-rose-300" : "bg-muted text-muted-foreground"; return <Badge variant="secondary" className={style}>{value.replaceAll("_", " ")}</Badge>; }
function StatusMenu({ values, onSelect, disabled }: { values: string[]; onSelect: (value: string) => void; disabled: boolean }) { return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={disabled}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{values.map((value) => <DropdownMenuItem key={value} onClick={() => onSelect(value)}>{value.replaceAll("_", " ")}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>; }

function SosBanner({ alert, onRespond, onClose, canClose }: { alert: HealthSosAlert; onRespond: () => void; onClose: (status: "resolved" | "cancelled") => void; canClose: boolean }) { return <div className="flex flex-col gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-950 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-100 sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-600 text-white"><Siren className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b>{sosLabels[alert.alert_type]}</b><Status value={alert.status} /><span className="text-xs opacity-70">{dateTime.format(new Date(alert.created_at))}</span></div><p className="mt-1 text-sm">{alert.reporter_name}: {alert.message}</p></div><div className="flex gap-2"><Button size="sm" className="rounded-xl" onClick={onRespond}>Respond</Button>{canClose ? <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="outline"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onClose("resolved")}>Mark resolved</DropdownMenuItem><DropdownMenuItem onClick={() => onClose("cancelled")}>Cancel alert</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</div></div>; }

function SosCard({ alert, responses, onRespond, onClose, canClose }: { alert: HealthSosAlert; responses: HealthSosResponse[]; onRespond: () => void; onClose: (status: "resolved" | "cancelled") => void; canClose: boolean }) { const active = ["active", "acknowledged"].includes(alert.status); return <div className={cn("rounded-2xl border p-4", active && "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20")}><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", active ? "bg-rose-600 text-white" : "bg-muted text-muted-foreground")}><Siren className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b>{sosLabels[alert.alert_type]}</b><Status value={alert.status} /><span className="text-xs text-muted-foreground">{dateTime.format(new Date(alert.created_at))}</span></div><p className="mt-1 text-sm"><b>{alert.reporter_name}:</b> {alert.message}</p>{alert.preferred_contact ? <p className="mt-1 text-xs text-muted-foreground">Contact: {alert.preferred_contact}</p> : null}{alert.latitude ? <a href={`https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"><MapPin className="size-3.5" /> {alert.location_label || "Map location"}</a> : alert.location_label ? <p className="mt-2 flex items-center gap-1 text-xs"><MapPin className="size-3.5" /> {alert.location_label}</p> : null}</div>{active ? <div className="flex gap-2"><Button size="sm" className="rounded-xl" onClick={onRespond}>Respond</Button>{canClose ? <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onClose("resolved")}>Resolve</Button> : null}</div> : null}</div>{responses.length ? <div className="mt-3 space-y-2 border-t pt-3">{responses.map((item) => <div key={item.id} className="flex gap-2 text-xs"><CheckCircle2 className="mt-0.5 size-3.5 text-emerald-600" /><span><b>{item.responder_name}</b> · {item.response_type.replaceAll("_", " ")}{item.note ? ` — ${item.note}` : ""}</span></div>)}</div> : null}</div>; }

function EmergencyCard({ item }: { item: EmergencyHealthProfile }) { return <div className="rounded-2xl border p-4"><div className="flex items-center gap-3"><Avatar className="size-10"><AvatarFallback className="text-xs font-bold">{initials(item.member_name)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.member_name}</p><div className="mt-1 flex gap-2"><Badge variant="outline">{item.blood_group || "Blood unknown"}</Badge>{item.donor_available ? <Badge className="bg-rose-600 text-white">Donor</Badge> : null}</div></div></div>{item.allergies || item.conditions || item.emergency_notes ? <div className="mt-3 space-y-1 rounded-xl bg-muted/60 p-3 text-xs"><p>{item.allergies ? `Allergy: ${item.allergies}` : ""}</p><p>{item.conditions ? `Condition: ${item.conditions}` : ""}</p><p>{item.emergency_notes || ""}</p></div> : null}{item.emergency_contact_name ? <p className="mt-3 text-xs text-muted-foreground">Emergency: {item.emergency_contact_name} · {item.emergency_contact_phone}</p> : null}</div>; }

function ProfileForm({ form, setForm, donorAvailable, setDonorAvailable }: { form: FormState; setForm: (value: FormState) => void; donorAvailable: boolean; setDonorAvailable: (value: boolean) => void }) { const set = (key: string, value: string) => setForm({ ...form, [key]: value }); return <div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="Blood group" id="health-blood"><Select value={form.bloodGroup} onValueChange={(value) => set("bloodGroup", value)}><SelectTrigger id="health-blood"><SelectValue /></SelectTrigger><SelectContent>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field><Field label="Date of birth" id="health-dob"><Input id="health-dob" type="date" value={form.dateOfBirth} onChange={(event) => set("dateOfBirth", event.target.value)} /></Field><Field label="Height (cm)" id="health-height"><Input id="health-height" type="number" value={form.heightCm} onChange={(event) => set("heightCm", event.target.value)} /></Field><Field label="Weight (kg)" id="health-weight"><Input id="health-weight" type="number" value={form.weightKg} onChange={(event) => set("weightKg", event.target.value)} /></Field><Field label="Conditions" id="health-conditions"><Textarea id="health-conditions" value={form.conditions} onChange={(event) => set("conditions", event.target.value)} /></Field><Field label="Allergies" id="health-allergies"><Textarea id="health-allergies" value={form.allergies} onChange={(event) => set("allergies", event.target.value)} /></Field><Field label="Primary doctor" id="health-doctor"><Input id="health-doctor" value={form.doctorName} onChange={(event) => set("doctorName", event.target.value)} /></Field><Field label="Doctor phone" id="health-doctor-phone"><Input id="health-doctor-phone" value={form.doctorPhone} onChange={(event) => set("doctorPhone", event.target.value)} /></Field><Field label="Emergency contact" id="health-emergency-name"><Input id="health-emergency-name" value={form.emergencyContactName} onChange={(event) => set("emergencyContactName", event.target.value)} /></Field><Field label="Emergency phone" id="health-emergency-phone"><Input id="health-emergency-phone" value={form.emergencyContactPhone} onChange={(event) => set("emergencyContactPhone", event.target.value)} /></Field><div className="sm:col-span-2"><Field label="Emergency notes" id="health-emergency-notes"><Textarea id="health-emergency-notes" value={form.emergencyNotes} onChange={(event) => set("emergencyNotes", event.target.value)} /></Field></div><div className="rounded-2xl border p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Blood donor available</p><p className="text-xs text-muted-foreground">Family directory-তে নাম ও blood group দেখাবে</p></div><Switch checked={donorAvailable} onCheckedChange={setDonorAvailable} /></div>{donorAvailable ? <Input className="mt-3" type="date" value={form.lastDonationDate} onChange={(event) => set("lastDonationDate", event.target.value)} /> : null}</div><div className="space-y-2 rounded-2xl border p-4"><Label>Privacy & sharing</Label><Select value={form.visibility} onValueChange={(value) => set("visibility", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Private — শুধু আমি</SelectItem><SelectItem value="emergency">Emergency details family-visible</SelectItem><SelectItem value="family">Selected health summary family-visible</SelectItem></SelectContent></Select></div></div>; }

function RecordForm({ kind, form, setForm }: { kind: RecordKind; form: FormState; setForm: (value: FormState) => void }) { const set = (key: string, value: string) => setForm({ ...form, [key]: value }); if (kind === "medication") return <div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="Medicine" id="med-name"><Input id="med-name" value={form.medicineName ?? ""} onChange={(event) => set("medicineName", event.target.value)} /></Field><Field label="Dosage" id="med-dose"><Input id="med-dose" value={form.dosage ?? ""} onChange={(event) => set("dosage", event.target.value)} placeholder="যেমন: ১ tablet" /></Field><Field label="Frequency" id="med-frequency"><Input id="med-frequency" value={form.frequency ?? ""} onChange={(event) => set("frequency", event.target.value)} /></Field><Field label="Reminder times (comma separated)" id="med-times"><Input id="med-times" value={form.reminderTimes ?? ""} onChange={(event) => set("reminderTimes", event.target.value)} /></Field><Field label="Start date" id="med-start"><Input id="med-start" type="date" value={form.startDate ?? ""} onChange={(event) => set("startDate", event.target.value)} /></Field><Field label="End date" id="med-end"><Input id="med-end" type="date" value={form.endDate ?? ""} onChange={(event) => set("endDate", event.target.value)} /></Field><Field label="Prescribing doctor" id="med-doctor"><Input id="med-doctor" value={form.prescribingDoctor ?? ""} onChange={(event) => set("prescribingDoctor", event.target.value)} /></Field><Field label="Instructions" id="med-instructions"><Textarea id="med-instructions" value={form.instructions ?? ""} onChange={(event) => set("instructions", event.target.value)} /></Field></div>; if (kind === "appointment") return <div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="Appointment title" id="appt-title"><Input id="appt-title" value={form.title ?? ""} onChange={(event) => set("title", event.target.value)} /></Field><Field label="Doctor" id="appt-doctor"><Input id="appt-doctor" value={form.doctorName ?? ""} onChange={(event) => set("doctorName", event.target.value)} /></Field><Field label="Facility" id="appt-facility"><Input id="appt-facility" value={form.facility ?? ""} onChange={(event) => set("facility", event.target.value)} /></Field><Field label="Schedule" id="appt-time"><Input id="appt-time" type="datetime-local" value={form.scheduledAt ?? ""} onChange={(event) => set("scheduledAt", event.target.value)} /></Field><Field label="Reminder minutes before" id="appt-reminder"><Input id="appt-reminder" type="number" value={form.reminderMinutes ?? "60"} onChange={(event) => set("reminderMinutes", event.target.value)} /></Field><Field label="Notes" id="appt-notes"><Textarea id="appt-notes" value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} /></Field></div>; const measurementType = (form.measurementType || "blood_pressure") as HealthMeasurement["measurement_type"]; return <div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="Measurement" id="log-type"><Select value={measurementType} onValueChange={(value) => setForm({ ...form, measurementType: value, unit: typeUnits[value as HealthMeasurement["measurement_type"]], valueSecondary: "" })}><SelectTrigger id="log-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Primary value" id="log-primary"><Input id="log-primary" type="number" step="0.01" value={form.valuePrimary ?? ""} onChange={(event) => set("valuePrimary", event.target.value)} /></Field>{measurementType === "blood_pressure" ? <Field label="Secondary / diastolic" id="log-secondary"><Input id="log-secondary" type="number" value={form.valueSecondary ?? ""} onChange={(event) => set("valueSecondary", event.target.value)} /></Field> : null}<Field label="Unit" id="log-unit"><Input id="log-unit" value={form.unit ?? ""} onChange={(event) => set("unit", event.target.value)} /></Field><Field label="Measured at" id="log-time"><Input id="log-time" type="datetime-local" value={form.measuredAt ?? ""} onChange={(event) => set("measuredAt", event.target.value)} /></Field><Field label="Notes" id="log-notes"><Textarea id="log-notes" value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} /></Field></div>; }
