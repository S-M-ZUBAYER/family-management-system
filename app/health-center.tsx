"use client";
import { healthWorksheet, type HealthExportSheet } from "@/lib/health-export";

import { useActionFeedback } from "@/components/action-modal-provider";
import { useLocale, type AppLocale } from "@/components/locale-provider";
import { useCurrentTime } from "@/components/use-current-time";
import { healthLocalInputToIso } from "@/lib/health-validation";
import { healthErrorCopy } from "@/lib/health-action-copy";

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
  Pencil,
  Pill,
  Plus,
  ShieldCheck,
  Siren,
  Trash2,
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
type EditableHealthRecord = HealthMedication | HealthAppointment | HealthMeasurement;
type LocationState = { latitude: number; longitude: number; accuracy: number } | null;

const dateFor = (locale: AppLocale) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { dateStyle: "medium" });
const dateTimeFor = (locale: AppLocale) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { dateStyle: "medium", timeStyle: "short" });
const timeFor = (locale: AppLocale) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { hour: "numeric", minute: "2-digit" });
const today = () => nowLocal().slice(0, 10);
const nowLocal = () => {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
};
const toLocalInput = (value: string) => {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const typeLabelsEn: Record<HealthMeasurement["measurement_type"], string> = {
  blood_pressure: "Blood pressure",
  blood_sugar: "Blood sugar",
  pulse: "Pulse",
  temperature: "Temperature",
  weight: "Weight",
  oxygen: "Oxygen saturation",
};
const typeLabelsBn: Record<HealthMeasurement["measurement_type"], string> = { blood_pressure: "রক্তচাপ", blood_sugar: "রক্তে শর্করা", pulse: "নাড়ির গতি", temperature: "তাপমাত্রা", weight: "ওজন", oxygen: "অক্সিজেন স্যাচুরেশন" };


const typeUnits: Record<HealthMeasurement["measurement_type"], string> = {
  blood_pressure: "mmHg",
  blood_sugar: "mg/dL",
  pulse: "bpm",
  temperature: "°C",
  weight: "kg",
  oxygen: "%",
};

const sosLabelsEn: Record<HealthSosAlert["alert_type"], string> = {
  medical: "Medical emergency",
  accident: "Accident",
  fire: "Fire",
  safety: "Safety concern",
  other: "Other emergency",
};
const sosLabelsBn: Record<HealthSosAlert["alert_type"], string> = { medical: "চিকিৎসা জরুরি", accident: "দুর্ঘটনা", fire: "আগুন", safety: "নিরাপত্তা উদ্বেগ", other: "অন্যান্য জরুরি" };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function fileSize(size: number) {
  return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function initialForm(kind: RecordKind, locale: AppLocale): FormState {
  if (kind === "medication") return { frequency: locale === "bn" ? "প্রতিদিন" : "Daily", reminderTimes: "08:00, 20:00", startDate: today(), endDate: "" };
  if (kind === "appointment") return { scheduledAt: nowLocal(), reminderMinutes: "60" };
  return { measurementType: "blood_pressure", valuePrimary: "", valueSecondary: "", unit: "mmHg", measuredAt: nowLocal() };
}

export function HealthCenter() {
  const { locale, pick } = useLocale();
  const date = useMemo(() => dateFor(locale), [locale]);
  const dateTime = useMemo(() => dateTimeFor(locale), [locale]);
  const time = useMemo(() => timeFor(locale), [locale]);
  const typeLabels = locale === "bn" ? typeLabelsBn : typeLabelsEn;
  const sosLabels = locale === "bn" ? sosLabelsBn : sosLabelsEn;
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
  const [loadError, setLoadError] = useState(false);
  const loadSequence = useRef(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<FormState>({});
  const [donorAvailable, setDonorAvailable] = useState(false);
  const [recordKind, setRecordKind] = useState<RecordKind | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ id: string; kind: RecordKind } | null>(null);
  const [recordForm, setRecordForm] = useState<FormState>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState<FormState>({ category: "prescription", documentDate: today() });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const now = useCurrentTime();
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
    const sequence = ++loadSequence.current;
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = (await response.json()) as HealthPayload;
      if (sequence !== loadSequence.current) return;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        setSetupRequired(true);
        setFamily(undefined);
        setProfile(null);
        setMedications([]);
        setAppointments([]);
        setMeasurements([]);
        setDocuments([]);
        setDirectory([]);
        setAlerts([]);
        setResponses([]);
        setCanManageSos(false);
        setLoadError(false);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? pick("স্বাস্থ্য কর্মক্ষেত্র পাওয়া যায়নি।", "Health workspace could not be loaded."));
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
      setLoadError(false);
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      setFamily(undefined);
      setProfile(null);
      setMedications([]);
      setAppointments([]);
      setMeasurements([]);
      setDocuments([]);
      setDirectory([]);
      setAlerts([]);
      setResponses([]);
      setCanManageSos(false);
      setLoadError(true);
      setFeedback(pick("স্বাস্থ্য কর্মক্ষেত্র লোড হয়নি।", "Health workspace could not be loaded.") + (error instanceof Error ? ` ${error.message}` : ""));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [pick, setFeedback]);

  useEffect(() => {
    queueMicrotask(() => {
      setNotificationPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
      void loadHealth();
    });
    const timer = window.setInterval(() => void loadHealth(), 30000);
    return () => { window.clearInterval(timer); loadSequence.current += 1; };
  }, [loadHealth]);

  const activeAlerts = useMemo(() => alerts.filter((alert) => ["active", "acknowledged"].includes(alert.status)), [alerts]);
  const activeMedications = useMemo(() => medications.filter((item) => item.status === "active"), [medications]);
  const upcomingAppointments = useMemo(() => appointments.filter((item) => now !== null && item.status === "scheduled" && new Date(item.scheduled_at).getTime() >= now), [appointments, now]);
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
  }, [activeMedications, dateTime, notificationPermission, upcomingAppointments]);

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
    if (response.status === 499) return null;
    const payload = (await response.json()) as { record?: unknown; error?: string; code?: string };
    if (!response.ok || !payload.record) throw new Error(healthErrorCopy(payload.code, locale) ?? payload.error ?? pick("স্বাস্থ্য রেকর্ড সংরক্ষণ হয়নি।", "Health record could not be saved."));
    return payload.record;
  }

  async function saveProfile() {
    setSaving(true);
    try {
      if (!(await postAction("save_profile", { ...profileForm, donorAvailable }))) return;
      setProfileOpen(false);
      await loadHealth();
    } finally {
      setSaving(false);
    }
  }

  async function saveRecord() {
    if (!recordKind) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = { ...recordForm };
      if (recordKind === "appointment") data.scheduledAt = healthLocalInputToIso(recordForm.scheduledAt ?? "");
      if (recordKind === "measurement") data.measuredAt = healthLocalInputToIso(recordForm.measuredAt ?? "");
      if (recordKind === "medication") data.reminderTimes = recordForm.reminderTimes?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
      if (editingRecord) {
        const response = await fetch("/api/health/records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: recordKind, recordId: editingRecord.id, data }) });
        if (response.status === 499) return;
        const payload = await response.json() as { record?: unknown; error?: string; code?: string };
        if (!response.ok || !payload.record) throw new Error(healthErrorCopy(payload.code, locale) ?? payload.error ?? pick("স্বাস্থ্য রেকর্ড হালনাগাদ হয়নি।", "Health record could not be updated."));
      } else {
        const action = recordKind === "medication" ? "create_medication" : recordKind === "appointment" ? "create_appointment" : "create_measurement";
        if (!(await postAction(action, data))) return;
      }
      setRecordKind(null);
      setEditingRecord(null);
      await loadHealth();
    } finally {
      setSaving(false);
    }
  }

  function openRecord(kind: RecordKind) {
    setEditingRecord(null);
    setRecordForm(initialForm(kind, locale));
    setRecordKind(kind);
  }

  function openEditRecord(kind: RecordKind, item: EditableHealthRecord) {
    if (kind === "medication") {
      const value = item as HealthMedication;
      setRecordForm({ medicineName: value.medicine_name, dosage: value.dosage, frequency: value.frequency, reminderTimes: value.reminder_times.join(", "), startDate: value.start_date, endDate: value.end_date ?? "", instructions: value.instructions ?? "", prescribingDoctor: value.prescribing_doctor ?? "" });
    } else if (kind === "appointment") {
      const value = item as HealthAppointment;
      setRecordForm({ title: value.title, doctorName: value.doctor_name ?? "", facility: value.facility ?? "", scheduledAt: toLocalInput(value.scheduled_at), reminderMinutes: String(value.reminder_minutes), notes: value.notes ?? "" });
    } else {
      const value = item as HealthMeasurement;
      setRecordForm({ measurementType: value.measurement_type, valuePrimary: String(value.value_primary), valueSecondary: value.value_secondary === null ? "" : String(value.value_secondary), unit: value.unit, measuredAt: toLocalInput(value.measured_at), notes: value.notes ?? "" });
    }
    setEditingRecord({ id: item.id, kind });
    setRecordKind(kind);
  }

  async function deleteRecord(kind: RecordKind, recordId: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/health/records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, recordId }) });
      if (response.status === 499) return;
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? pick("স্বাস্থ্য রেকর্ড মোছা যায়নি।", "Health record could not be deleted."));
      await loadHealth();
    } finally { setSaving(false); }
  }

  async function deleteDocument(id: string) {
    setSaving(true);
    try {
      const response = await fetch(`/api/health-document/${id}`, { method: "DELETE" });
      if (response.status === 499) return;
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? pick("নথি মোছা যায়নি।", "Document could not be deleted."));
      await loadHealth();
    } finally { setSaving(false); }
  }

  async function updateStatus(entity: "medication" | "appointment", id: string, status: string) {
    setSaving(true);
    try {
      if (!(await postAction("update_status", { entity, id, status }))) return;
      await loadHealth();
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
      if (response.status === 499) return;
      const payload = (await response.json()) as { document?: HealthDocument; error?: string };
      if (!response.ok || !payload.document) throw new Error(payload.error ?? pick("নথি আপলোড হয়নি।", "Document could not be uploaded."));
      setUploadOpen(false);
      setUploadFile(null);
      setUploadForm({ category: "prescription", documentDate: today() });
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadHealth();
    } finally {
      setSaving(false);
    }
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setFeedback(pick("এই ব্রাউজারে অবস্থান পাওয়া যাচ্ছে না। অবস্থান ছাড়াও SOS পাঠাতে পারবেন।", "Location is unavailable in this browser. You can send SOS without it."));
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
        setFeedback(pick("অবস্থানের অনুমতি পাওয়া যায়নি। অবস্থান ছাড়া SOS পাঠানো যাবে।", "Location permission was not granted. SOS can be sent without it."));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  async function createSos() {
    setSaving(true);
    try {
      if (!(await postAction("create_sos", {
        ...sosForm,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        locationAccuracyM: location?.accuracy ?? null,
      }))) return;
      setSosOpen(false);
      setSosForm({ alertType: "medical" });
      setLocation(null);
      await loadHealth();
    } finally {
      setSaving(false);
    }
  }

  async function respondToSos() {
    if (!responseTarget) return;
    setSaving(true);
    try {
      if (!(await postAction("respond_sos", { alertId: responseTarget.id, responseType, note: responseNote }))) return;
      setResponseTarget(null);
      setResponseNote("");
      await loadHealth();
    } finally {
      setSaving(false);
    }
  }

  async function closeSos(alert: HealthSosAlert, status: "resolved" | "cancelled") {
    setSaving(true);
    try {
      if (!(await postAction("update_sos", { alertId: alert.id, status, note: status === "resolved" ? "পরিবারের পক্ষ থেকে সমাধান হয়েছে" : "Reporter alert বাতিল করেছেন" }))) return;
      await loadHealth();
    } finally {
      setSaving(false);
    }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      setFeedback(pick("এই ব্রাউজার নোটিফিকেশন সমর্থন করে না।", "This browser does not support notifications."));
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    setFeedback(permission === "granted" ? pick("ওষুধ ও অ্যাপয়েন্টমেন্টের ব্রাউজার রিমাইন্ডার চালু হয়েছে।", "Medicine and appointment browser reminders are enabled.") : pick("নোটিফিকেশনের অনুমতি দেওয়া হয়নি।", "Notification permission was not granted."));
  }

  async function exportXlsx() {
    if (loading || loadError || migrationRequired) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const names: Record<HealthExportSheet, string> = { Profile: pick("আমার প্রোফাইল", "My Profile"), Medications: pick("ওষুধ", "Medications"), Appointments: pick("অ্যাপয়েন্টমেন্ট", "Appointments"), Measurements: pick("পরিমাপ", "Measurements"), Documents: pick("নথি", "Documents"), Directory: pick("রক্ত নির্দেশিকা", "Blood Directory"), Alerts: pick("SOS ইতিহাস", "SOS History"), Responses: pick("SOS সাড়া", "SOS Responses") };
      const add = (sheet: HealthExportSheet, rows: Array<Record<string, unknown>>) => XLSX.utils.book_append_sheet(workbook, healthWorksheet(XLSX, rows, sheet, locale, timeZone), names[sheet]);
      add("Profile", profile ? [{ [pick("নাম", "Name")]: profile.member_name, [pick("রক্তের গ্রুপ", "Blood group")]: profile.blood_group, [pick("জন্মতারিখ", "Birth date")]: profile.date_of_birth ?? "", [pick("উচ্চতা সেমি", "Height cm")]: profile.height_cm === null ? "" : Number(profile.height_cm), [pick("ওজন কেজি", "Weight kg")]: profile.weight_kg === null ? "" : Number(profile.weight_kg), [pick("সর্বশেষ দান", "Last donation")]: profile.last_donation_date ?? "", [pick("রোগাবস্থা", "Conditions")]: profile.conditions, [pick("অ্যালার্জি", "Allergies")]: profile.allergies, [pick("জরুরি নোট", "Emergency notes")]: profile.emergency_notes, [pick("চিকিৎসক", "Doctor")]: profile.doctor_name, [pick("চিকিৎসকের ফোন", "Doctor phone")]: profile.doctor_phone, [pick("জরুরি যোগাযোগ", "Emergency contact")]: profile.emergency_contact_name, [pick("জরুরি ফোন", "Emergency phone")]: profile.emergency_contact_phone, [pick("রক্তদাতা উপলভ্য", "Donor available")]: profile.donor_available ? pick("হ্যাঁ", "Yes") : pick("না", "No"), [pick("দৃশ্যমানতা", "Visibility")]: profile.visibility === "private" ? pick("শুধু আমি", "Only me") : profile.visibility === "emergency" ? pick("জরুরি", "Emergency") : pick("পরিবার", "Family") }] : []);
      add("Medications", medications.map((item) => ({ [pick("ওষুধ", "Medicine")]: item.medicine_name, [pick("মাত্রা", "Dosage")]: item.dosage, [pick("ব্যবধান", "Frequency")]: item.frequency, [pick("সময়", "Times")]: item.reminder_times.join(", "), [pick("শুরু", "Start")]: item.start_date, [pick("শেষ", "End")]: item.end_date ?? "", [pick("চিকিৎসক", "Doctor")]: item.prescribing_doctor ?? "", [pick("স্ট্যাটাস", "Status")]: healthStatusLabel(item.status, locale), [pick("নির্দেশনা", "Instructions")]: item.instructions ?? "" })));
      add("Appointments", appointments.map((item) => ({ [pick("অ্যাপয়েন্টমেন্ট", "Appointment")]: item.title, [pick("চিকিৎসক", "Doctor")]: item.doctor_name ?? "", [pick("প্রতিষ্ঠান", "Facility")]: item.facility ?? "", [pick("সময়সূচি", "Schedule")]: item.scheduled_at, [pick("রিমাইন্ডার মিনিট", "Reminder minutes")]: Number(item.reminder_minutes), [pick("স্ট্যাটাস", "Status")]: healthStatusLabel(item.status, locale), [pick("নোট", "Notes")]: item.notes ?? "" })));
      add("Measurements", measurements.map((item) => ({ [pick("ধরন", "Type")]: typeLabels[item.measurement_type], [pick("প্রাথমিক মান", "Primary")]: Number(item.value_primary), [pick("দ্বিতীয় মান", "Secondary")]: item.value_secondary === null ? "" : Number(item.value_secondary), [pick("একক", "Unit")]: item.unit, [pick("সময়", "Time")]: item.measured_at, [pick("নোট", "Notes")]: item.notes ?? "" })));
      add("Documents", documents.map((item) => ({ [pick("শিরোনাম", "Title")]: item.title, [pick("ক্যাটাগরি", "Category")]: healthDocumentCategoryLabel(item.category, locale), [pick("তারিখ", "Date")]: item.document_date ?? "", [pick("ফাইল", "File")]: item.file_name, [pick("আকার", "Size")]: item.file_size, [pick("নোট", "Notes")]: item.notes ?? "" })));
      add("Directory", directory.map((item) => ({ [pick("সদস্য", "Member")]: item.member_name, [pick("রক্তের গ্রুপ", "Blood group")]: item.blood_group ?? "", [pick("রক্তদাতা", "Donor")]: item.donor_available ? pick("হ্যাঁ", "Yes") : pick("না", "No"), [pick("সর্বশেষ দান", "Last donation")]: item.last_donation_date ?? "", [pick("অ্যালার্জি", "Allergies")]: item.allergies ?? "", [pick("রোগাবস্থা", "Conditions")]: item.conditions ?? "", [pick("জরুরি যোগাযোগ", "Emergency contact")]: item.emergency_contact_name ?? "", [pick("ফোন", "Phone")]: item.emergency_contact_phone ?? "" })));
      add("Alerts", alerts.map((item) => ({ [pick("SOS পরিচয়", "SOS ID")]: item.id, [pick("পছন্দের যোগাযোগ", "Preferred contact")]: item.preferred_contact ?? "", [pick("স্বীকৃতির সময়", "Acknowledged at")]: item.acknowledged_at ?? "", [pick("সমাধানের নোট", "Resolution note")]: item.resolution_note ?? "", [pick("সময়", "Time")]: item.created_at, [pick("প্রতিবেদক", "Reporter")]: item.reporter_name, [pick("ধরন", "Type")]: sosLabels[item.alert_type], [pick("বার্তা", "Message")]: item.message, [pick("স্ট্যাটাস", "Status")]: healthStatusLabel(item.status, locale), [pick("স্থান", "Location")]: item.location_label ?? (item.latitude !== null && item.longitude !== null ? `${item.latitude}, ${item.longitude}` : ""), [pick("স্বীকৃতি", "Acknowledged")]: item.acknowledged_by_name ?? "", [pick("সমাধান", "Resolved")]: item.resolved_at ?? "" })));
      add("Responses", responses.map((item) => ({ [pick("SOS পরিচয়", "SOS ID")]: item.alert_id, [pick("সাড়াদাতা", "Responder")]: item.responder_name, [pick("ধরন", "Type")]: healthStatusLabel(item.response_type, locale), [pick("নোট", "Notes")]: item.note ?? "", [pick("সময়", "Time")]: item.created_at })));
      XLSX.writeFile(workbook, `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-health-sos.xlsx`);
      setFeedback(pick("স্বাস্থ্য তথ্যের XLSX তৈরি হয়েছে।", "Health XLSX was created."));
    } catch (error) {
      setFeedback(pick("স্বাস্থ্য তথ্যের XLSX তৈরি হয়নি।", "Health XLSX could not be created.") + (error instanceof Error ? ` ${error.message}` : ""));
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

  if (loading) return <main className="grid min-h-[calc(100vh-4rem)] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">{pick("স্বাস্থ্য কর্মক্ষেত্র প্রস্তুত হচ্ছে…", "Preparing health workspace…")}</p></div></main>;
  if (loadError) return <main className="mx-auto max-w-3xl p-6 md:p-10"><StateCard icon={<ShieldCheck />} title={pick("স্বাস্থ্য তথ্য লোড হয়নি", "Health data could not be loaded")} text={pick("অসম্পূর্ণ বা শূন্য স্বাস্থ্য তথ্য দেখানো বা রপ্তানি করা হয়নি। আবার চেষ্টা করুন।", "No incomplete or empty health data was shown or exported. Please retry.")} action={<Button className="rounded-xl" onClick={() => { setLoading(true); void loadHealth(); }}>{pick("আবার চেষ্টা করুন", "Retry")}</Button>} /></main>;
  if (setupRequired) return <main className="mx-auto max-w-3xl p-6 md:p-10"><StateCard icon={<Users />} title={pick("ফ্যামিলি অ্যাক্সেস সক্রিয় নয়", "Family access is not active")} text={pick("জয়েন কোড দিয়ে আবেদন করুন। অ্যাডমিন অনুমোদনের পর ব্যক্তিগত স্বাস্থ্য কর্মক্ষেত্র ব্যবহার করা যাবে।", "Apply with a join code. You can use the private health workspace after admin approval.")} action={<Button asChild className="rounded-xl"><a href="/setup">{pick("ফ্যামিলিতে যোগ দিন", "Family onboarding")}</a></Button>} /></main>;

  return (
    <main className="mx-auto w-full max-w-[1550px] space-y-5 px-4 py-5 md:px-7 md:py-7">
      <section className="overflow-hidden rounded-3xl bg-[linear-gradient(130deg,#0f3d3a_0%,#155e75_58%,#1e3a5f_100%)] p-5 text-white shadow-xl md:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-sm text-emerald-200"><ShieldCheck className="size-4" /> {pick("ব্যক্তিগত চিকিৎসা কর্মক্ষেত্র", "Private medical workspace")}</div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-4xl">{pick("স্বাস্থ্য ও জরুরি SOS", "Health & Emergency SOS")}</h1>
            <p className="mt-2 text-sm leading-6 text-white/70">{pick("ওষুধ, অ্যাপয়েন্টমেন্ট, স্বাস্থ্য লগ ও চিকিৎসা নথি নিরাপদে রাখুন। জরুরিতে পরিবারের সবাইকে দ্রুত সতর্ক করুন।", "Keep medicines, appointments, health logs, and medical documents secure. Alert the family quickly during an emergency.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => void enableNotifications()}><Bell className="size-4" /> {pick("রিমাইন্ডার চালু", "Enable reminders")}</Button>
            <Button variant="secondary" className="rounded-xl" onClick={() => void exportXlsx()} disabled={exporting}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} {pick("XLSX রপ্তানি", "Export XLSX")}</Button>
            <Button className="rounded-xl bg-rose-500 text-white hover:bg-rose-600" onClick={() => setSosOpen(true)} disabled={migrationRequired}><Siren className="size-4" /> {pick("জরুরি SOS", "Emergency SOS")}</Button>
          </div>
        </div>
      </section>

      {migrationRequired ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">{pick("Supabase SQL Editor-এ ", "Run ")}<b>supabase/migrations/20260927_health_sos.sql</b>{pick(" চালালে স্বাস্থ্য ও SOS তথ্য সক্রিয় হবে।", " in the Supabase SQL Editor to enable Health and SOS data.")}</div> : null}
      {feedback ? <div className="flex items-start justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm"><span>{feedback}</span><Button size="icon-xs" variant="ghost" onClick={() => setFeedback(null)}><X /></Button></div> : null}
      {activeAlerts.length ? <div className="space-y-2">{activeAlerts.map((alert) => <SosBanner key={alert.id} alert={alert} onRespond={() => setResponseTarget(alert)} onClose={(status) => void closeSos(alert, status).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("SOS হালনাগাদ হয়নি।", "SOS could not be updated.")))} canClose={alert.is_reporter || canManageSos} />)}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Pill />} label={pick("সক্রিয় ওষুধ", "Active medicines")} value={String(activeMedications.length)} note={activeMedications.length ? pick(`${activeMedications.reduce((sum, item) => sum + item.reminder_times.length, 0)}টি দৈনিক রিমাইন্ডার সময়`, `${activeMedications.reduce((sum, item) => sum + item.reminder_times.length, 0)} daily reminder times`) : pick("ওষুধ যোগ করুন", "Add medicine")} />
        <Metric icon={<CalendarClock />} label={pick("পরবর্তী অ্যাপয়েন্টমেন্ট", "Next appointment")} value={nextAppointment ? date.format(new Date(nextAppointment.scheduled_at)) : pick("নেই", "None")} note={nextAppointment ? time.format(new Date(nextAppointment.scheduled_at)) : pick("সময়সূচি খালি", "Schedule clear")} />
        <Metric icon={<Droplets />} label={pick("উপলভ্য রক্তদাতা", "Available blood donors")} value={String(donors.length)} note={pick(`${directory.length}টি শেয়ার করা জরুরি প্রোফাইল`, `${directory.length} shared emergency profiles`)} />
        <Metric icon={<Activity />} label={pick("স্বাস্থ্য লগ", "Health logs")} value={String(measurements.length)} note={measurements[0] ? `${pick("সর্বশেষ", "Last")}: ${date.format(new Date(measurements[0].measured_at))}` : pick("এখনও কোনো পরিমাপ নেই", "No measurement yet")} />
      </section>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-muted p-1">
          <TabsTrigger value="overview" className="rounded-xl">{pick("সারসংক্ষেপ", "Overview")}</TabsTrigger>
          <TabsTrigger value="care" className="rounded-xl">{pick("ওষুধ ও অ্যাপয়েন্টমেন্ট", "Medicines & Appointments")}</TabsTrigger>
          <TabsTrigger value="records" className="rounded-xl">{pick("লগ ও নথি", "Logs & Documents")}</TabsTrigger>
          <TabsTrigger value="emergency" className="rounded-xl">{pick("SOS ও রক্ত নির্দেশিকা", "SOS & Blood Directory")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
          <Card className="rounded-3xl shadow-none">
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>{pick("আমার স্বাস্থ্য প্রোফাইল", "My health profile")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{pick("আপনার ব্যক্তিগত ও জরুরি শেয়ারিং সেটিংস", "Your private and emergency-sharing settings")}</p></div><Button variant="outline" className="rounded-xl" onClick={openProfile}>{profile ? pick("হালনাগাদ", "Update") : pick("তৈরি করুন", "Create")}</Button></CardHeader>
            <CardContent>
              {profile ? <div className="grid gap-3 sm:grid-cols-2"><Info label="Blood group" value={profile.blood_group || pick("নির্ধারিত নয়", "Not set")} icon={<Droplets />} /><Info label="Allergies" value={profile.allergies || pick("কিছু যোগ করা হয়নি", "None added")} icon={<ShieldCheck />} /><Info label="Emergency contact" value={profile.emergency_contact_name ? `${profile.emergency_contact_name} · ${profile.emergency_contact_phone || pick("ফোন নেই", "No phone")}` : pick("নির্ধারিত নয়", "Not set")} icon={<HeartHandshake />} /><Info label="Visibility" value={profile.visibility === "private" ? pick("শুধু আমি", "Only me") : profile.visibility === "emergency" ? pick("জরুরি তথ্য পরিবার দেখতে পারবে", "Emergency info visible to family") : pick("পরিবারের সাথে শেয়ার করা", "Shared with family")} icon={<LockKeyhole />} /></div> : <Empty icon={<FileHeart />} title={pick("স্বাস্থ্য প্রোফাইল তৈরি করুন", "Create a health profile")} text={pick("রক্তের গ্রুপ, অ্যালার্জি, জরুরি যোগাযোগ ও গোপনীয়তার পছন্দ যোগ করুন।", "Add your blood group, allergies, emergency contact, and privacy preference.")} />}
            </CardContent>
          </Card>
          <Card className="rounded-3xl shadow-none">
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>{pick("আজকের পরিচর্যা পরিকল্পনা", "Today's care plan")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{pick("সক্রিয় ওষুধ ও আসন্ন সময়সূচি", "Active medicines and upcoming schedule")}</p></div><Button size="sm" className="rounded-xl" onClick={() => openRecord("medication")}><Plus className="size-4" /> {pick("ওষুধ", "Medicine")}</Button></CardHeader>
            <CardContent className="space-y-3">
              {activeMedications.slice(0, 4).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border p-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Pill className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.medicine_name} · {item.dosage}</p><p className="text-xs text-muted-foreground">{item.frequency} · {item.reminder_times.join(", ") || pick("ব্রাউজার সময় নেই", "No browser time")}</p></div><Badge variant="secondary">{pick("সক্রিয়", "Active")}</Badge></div>)}
              {nextAppointment ? <div className="flex items-center gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100"><CalendarClock className="size-5" /><div><p className="font-semibold">{nextAppointment.title}</p><p className="text-xs opacity-75">{dateTime.format(new Date(nextAppointment.scheduled_at))} · {nextAppointment.facility || pick("স্থান নির্ধারিত নয়", "Location not set")}</p></div></div> : null}
              {!activeMedications.length && !nextAppointment ? <Empty icon={<AlarmClockCheck />} title={pick("আজ কোনো রিমাইন্ডার নেই", "No reminders today")} text={pick("ওষুধ বা অ্যাপয়েন্টমেন্ট যোগ করলে এখানে দেখা যাবে।", "Medicines or appointments will appear here after you add them.")} /> : null}
            </CardContent>
          </Card>
          <Card className="rounded-3xl shadow-none xl:col-span-2">
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>{pick("সাম্প্রতিক পরিমাপ", "Recent measurements")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{pick("শুধু ব্যক্তিগত ট্র্যাকিং—চিকিৎসা নির্ণয় নয়", "Personal tracking only—not a clinical diagnosis")}</p></div><Button variant="outline" size="sm" className="rounded-xl" onClick={() => openRecord("measurement")}><Plus className="size-4" /> {pick("লগ যোগ করুন", "Add log")}</Button></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recentMeasurements.map((item) => <div key={item.id} className="rounded-2xl border p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold">{typeLabels[item.measurement_type]}</span><Activity className="size-4 text-primary" /></div><p className="mt-3 text-2xl font-bold">{item.value_primary}{item.value_secondary !== null ? ` / ${item.value_secondary}` : ""} <small className="text-xs font-normal text-muted-foreground">{item.unit}</small></p><p className="mt-1 text-xs text-muted-foreground">{dateTime.format(new Date(item.measured_at))}</p></div>)}
              {!recentMeasurements.length ? <div className="sm:col-span-2 xl:col-span-3"><Empty icon={<Activity />} title={pick("কোনো স্বাস্থ্য পরিমাপ নেই", "No health measurements yet")} text={pick("রক্তচাপ, শর্করা, নাড়ির গতি, তাপমাত্রা, ওজন বা অক্সিজেন লিখে রাখতে পারেন।", "You can record blood pressure, glucose, pulse, temperature, weight, or oxygen saturation.")} /></div> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="care" className="space-y-4">
          <DataSection title={pick("ওষুধের সময়সূচি", "Medicine schedule")} description={pick("মাত্রা, ব্যবধান, রিমাইন্ডারের সময় ও স্ট্যাটাস", "Dosage, frequency, reminder times, and status")} onAdd={() => openRecord("medication")}>
            <Table><TableHeader><TableRow><TableHead>{pick("ওষুধ", "Medicine")}</TableHead><TableHead>{pick("মাত্রা", "Dosage")}</TableHead><TableHead>{pick("সময়সূচি", "Schedule")}</TableHead><TableHead>{pick("তারিখ", "Dates")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {medications.map((item) => <TableRow key={item.id}><TableCell><b>{item.medicine_name}</b><p className="text-xs text-muted-foreground">{item.instructions || item.prescribing_doctor || ""}</p></TableCell><TableCell>{item.dosage}</TableCell><TableCell>{item.frequency}<p className="text-xs text-muted-foreground">{item.reminder_times.join(", ") || pick("সময় নির্ধারিত নয়", "No time set")}</p></TableCell><TableCell>{item.start_date}{item.end_date ? ` → ${item.end_date}` : ""}</TableCell><TableCell><Status value={item.status} /></TableCell><TableCell><div className="flex"><StatusMenu disabled={saving} values={["active", "paused", "completed"]} onSelect={(status) => void updateStatus("medication", item.id, status).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("হালনাগাদ হয়নি।", "Update failed.")))} /><RecordActions disabled={saving} onEdit={() => openEditRecord("medication", item)} onDelete={() => void deleteRecord("medication", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))} /></div></TableCell></TableRow>)}
              {!medications.length ? <EmptyRows columns={6} /> : null}
            </TableBody></Table>
          </DataSection>
          <DataSection title={pick("অ্যাপয়েন্টমেন্ট", "Appointments")} description={pick("চিকিৎসক, প্রতিষ্ঠান, তারিখ, রিমাইন্ডার ও ভিজিট স্ট্যাটাস", "Doctor, facility, date, reminder, and visit status")} onAdd={() => openRecord("appointment")}>
            <Table><TableHeader><TableRow><TableHead>{pick("অ্যাপয়েন্টমেন্ট", "Appointment")}</TableHead><TableHead>{pick("চিকিৎসক", "Doctor")}</TableHead><TableHead>{pick("সময়সূচি", "Schedule")}</TableHead><TableHead>{pick("প্রতিষ্ঠান", "Facility")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {appointments.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.title}</TableCell><TableCell>{item.doctor_name || "—"}</TableCell><TableCell>{dateTime.format(new Date(item.scheduled_at))}</TableCell><TableCell>{item.facility || "—"}</TableCell><TableCell><Status value={item.status} /></TableCell><TableCell><div className="flex"><StatusMenu disabled={saving} values={["scheduled", "completed", "cancelled"]} onSelect={(status) => void updateStatus("appointment", item.id, status).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("হালনাগাদ হয়নি।", "Update failed.")))} /><RecordActions disabled={saving} onEdit={() => openEditRecord("appointment", item)} onDelete={() => void deleteRecord("appointment", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))} /></div></TableCell></TableRow>)}
              {!appointments.length ? <EmptyRows columns={6} /> : null}
            </TableBody></Table>
          </DataSection>
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
          <DataSection title={pick("স্বাস্থ্য পরিমাপ", "Health measurements")} description={pick("ব্যক্তিগত সময়ক্রমিক লগ", "Private chronological log")} onAdd={() => openRecord("measurement")}>
            <Table><TableHeader><TableRow><TableHead>{pick("সময়", "Time")}</TableHead><TableHead>{pick("ধরন", "Type")}</TableHead><TableHead>{pick("মান", "Reading")}</TableHead><TableHead>{pick("নোট", "Notes")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {measurements.map((item) => <TableRow key={item.id}><TableCell>{dateTime.format(new Date(item.measured_at))}</TableCell><TableCell>{typeLabels[item.measurement_type]}</TableCell><TableCell className="font-bold">{item.value_primary}{item.value_secondary !== null ? ` / ${item.value_secondary}` : ""} {item.unit}</TableCell><TableCell>{item.notes || "—"}</TableCell><TableCell><RecordActions disabled={saving} onEdit={() => openEditRecord("measurement", item)} onDelete={() => void deleteRecord("measurement", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))} /></TableCell></TableRow>)}
              {!measurements.length ? <EmptyRows columns={5} /> : null}
            </TableBody></Table>
          </DataSection>
          <DataSection title={pick("ব্যক্তিগত চিকিৎসা ভল্ট", "Private medical vault")} description={pick("প্রেসক্রিপশন, রিপোর্ট, ইমেজিং, টিকা ও বীমার নথি", "Prescription, report, imaging, vaccine, and insurance documents")} onAdd={() => setUploadOpen(true)} addLabel={pick("আপলোড", "Upload")}>
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {documents.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-2xl border p-3 transition hover:border-primary/30 hover:bg-muted/40"><a href={`/api/health-document/${item.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></span><span className="min-w-0 flex-1"><b className="block truncate">{item.title}</b><small className="block truncate text-muted-foreground">{healthDocumentCategoryLabel(item.category, locale)} · {fileSize(item.file_size)}</small></span><Download className="size-4 text-muted-foreground" /></a><Button size="icon-sm" variant="ghost" className="text-destructive" disabled={saving} onClick={() => void deleteDocument(item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))}><Trash2 /><span className="sr-only">{pick("নথি মুছুন", "Delete document")}</span></Button></div>)}
              {!documents.length ? <div className="sm:col-span-2 xl:col-span-3"><Empty icon={<FileHeart />} title={pick("চিকিৎসা ভল্ট খালি", "Medical vault is empty")} text={pick("নিজের প্রেসক্রিপশন বা রিপোর্ট ব্যক্তিগত সংরক্ষণে আপলোড করুন।", "Upload your prescriptions or reports to private storage.")} /></div> : null}
            </div>
          </DataSection>
        </TabsContent>

        <TabsContent value="emergency" className="space-y-4">
          <Card className="rounded-3xl shadow-none"><CardHeader><CardTitle>{pick("সক্রিয় ও সাম্প্রতিক SOS সতর্কতা", "Active & recent SOS alerts")}</CardTitle><p className="text-sm text-muted-foreground">{pick("এটি শুধু পারিবারিক সমন্বয়ের জন্য—প্রয়োজনে স্থানীয় জরুরি সেবায় সরাসরি কল করুন।", "For family coordination only—call local emergency services directly when needed.")}</p></CardHeader><CardContent className="space-y-3">{alerts.map((alert) => <SosCard key={alert.id} alert={alert} responses={responses.filter((item) => item.alert_id === alert.id)} onRespond={() => setResponseTarget(alert)} onClose={(status) => void closeSos(alert, status).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("SOS হালনাগাদ হয়নি।", "Could not update SOS.")))} canClose={alert.is_reporter || canManageSos} />)}{!alerts.length ? <Empty icon={<Ambulance />} title={pick("কোনো SOS ইতিহাস নেই", "No SOS history")} text={pick("জরুরি অবস্থায় SOS বোতাম ব্যবহার করলে সতর্কতা এখানে দেখা যাবে।", "Alerts will appear here when the SOS button is used.")} /> : null}</CardContent></Card>
          <Card className="rounded-3xl shadow-none"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>{pick("রক্ত ও জরুরি নির্দেশিকা", "Blood & emergency directory")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{pick("সদস্যের স্বাস্থ্য-শেয়ারিং ও Privacy পছন্দ মেনে দেখানো তথ্য", "Information shown according to each member's health sharing and privacy choices")}</p></div><Badge variant="secondary">{donors.length} {pick("রক্তদাতা", "donors")}</Badge></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{directory.map((item) => <EmergencyCard key={`${item.member_name}-${item.blood_group}`} item={item} />)}{!directory.length ? <div className="md:col-span-2 xl:col-span-3"><Empty icon={<Droplets />} title={pick("নির্দেশিকা খালি", "Directory is empty")} text={pick("স্বাস্থ্য প্রোফাইলে তথ্য শেয়ার এবং Privacy-তে জরুরি নির্দেশিকার অনুমতি দিলে এখানে দেখা যাবে।", "Profiles appear here when health sharing and emergency-directory access are enabled.")} /></div> : null}</CardContent></Card>
        </TabsContent>
      </Tabs>

      <p className="pb-3 text-center text-xs text-muted-foreground">{pick("এই মডিউল রেকর্ড ও রিমাইন্ডারের জন্য; এটি চিকিৎসা নির্ণয়, চিকিৎসা পরামর্শ বা জরুরি সেবার বিকল্প নয়।", "This module is for records and reminders; it is not a substitute for diagnosis, medical advice, or emergency services.")}</p>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-3xl"><DialogHeader><DialogTitle>{pick("ব্যক্তিগত স্বাস্থ্য প্রোফাইল", "Private health profile")}</DialogTitle><DialogDescription>{pick("ডিফল্টভাবে ব্যক্তিগত। শেয়ারিং সেটিংস আপনি নিজে নিয়ন্ত্রণ করবেন।", "Private by default. You control the sharing settings.")}</DialogDescription></DialogHeader><ProfileForm form={profileForm} setForm={setProfileForm} donorAvailable={donorAvailable} setDonorAvailable={setDonorAvailable} /><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setProfileOpen(false)}>{pick("বাতিল", "Cancel")}</Button><Button className="rounded-xl" disabled={saving} onClick={() => void saveProfile().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("সংরক্ষণ হয়নি।", "Could not save.")))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} {pick("সংরক্ষণ", "Save")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(recordKind)} onOpenChange={(open) => { if (!open) { setRecordKind(null); setEditingRecord(null); } }}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-2xl"><DialogHeader><DialogTitle>{recordKind === "medication" ? pick("ওষুধ", "Medicine") : recordKind === "appointment" ? pick("অ্যাপয়েন্টমেন্ট", "Appointment") : pick("স্বাস্থ্য পরিমাপ", "Health measurement")} {editingRecord ? pick("সম্পাদনা", "edit") : pick("যোগ করুন", "add")}</DialogTitle><DialogDescription>{pick("এই তথ্য আপনার ব্যক্তিগত স্বাস্থ্য কর্মক্ষেত্রে থাকবে।", "This information stays in your private health workspace.")}</DialogDescription></DialogHeader>{recordKind ? <RecordForm kind={recordKind} form={recordForm} setForm={setRecordForm} /> : null}<DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => { setRecordKind(null); setEditingRecord(null); }}>{pick("বাতিল", "Cancel")}</Button><Button className="rounded-xl" disabled={saving} onClick={() => void saveRecord().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("সংরক্ষণ হয়নি।", "Could not save.")))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : editingRecord ? <Pencil className="size-4" /> : <Plus className="size-4" />} {editingRecord ? pick("হালনাগাদ", "Update") : pick("সংরক্ষণ", "Save")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}><DialogContent className="rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>{pick("চিকিৎসা নথি আপলোড", "Medical document upload")}</DialogTitle><DialogDescription>{pick("শুধু আপনি এই ব্যক্তিগত ফাইল দেখতে পারবেন। সর্বোচ্চ ১২ MB।", "Only you can view this private file. Maximum 12 MB.")}</DialogDescription></DialogHeader><div className="space-y-4"><Field label="Title" id="health-doc-title"><Input id="health-doc-title" value={uploadForm.title ?? ""} onChange={(event) => setUploadForm({ ...uploadForm, title: event.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Category" id="health-doc-category"><Select value={uploadForm.category} onValueChange={(value) => setUploadForm({ ...uploadForm, category: value })}><SelectTrigger id="health-doc-category"><SelectValue /></SelectTrigger><SelectContent>{[["prescription", pick("প্রেসক্রিপশন", "Prescription")], ["lab_report", pick("ল্যাব রিপোর্ট", "Lab report")], ["imaging", pick("ইমেজিং", "Imaging")], ["vaccine", pick("টিকা", "Vaccine")], ["insurance", pick("বীমা", "Insurance")], ["other", pick("অন্যান্য", "Other")]].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Document date" id="health-doc-date"><Input id="health-doc-date" type="date" value={uploadForm.documentDate ?? ""} onChange={(event) => setUploadForm({ ...uploadForm, documentDate: event.target.value })} /></Field></div><Field label="File" id="health-doc-file"><Input ref={fileInputRef} id="health-doc-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></Field><Field label="Notes" id="health-doc-notes"><Textarea id="health-doc-notes" value={uploadForm.notes ?? ""} onChange={(event) => setUploadForm({ ...uploadForm, notes: event.target.value })} /></Field></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setUploadOpen(false)}>{pick("বাতিল", "Cancel")}</Button><Button className="rounded-xl" disabled={saving || !uploadFile} onClick={() => void uploadDocument().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("আপলোড হয়নি।", "Could not upload.")))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} {pick("আপলোড", "Upload")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={sosOpen} onOpenChange={setSosOpen}><DialogContent className="rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle className="flex items-center gap-2 text-rose-600"><Siren /> {pick("জরুরি SOS পাঠান", "Send emergency SOS")}</DialogTitle><DialogDescription>{pick("এটি পারিবারিক সতর্কতা। জীবন-ঝুঁকির জরুরিতে স্থানীয় জরুরি সেবায় সরাসরি কল করুন।", "This is a family alert. Call local emergency services directly for life-threatening emergencies.")}</DialogDescription></DialogHeader><div className="space-y-4"><Field label="Emergency type" id="sos-type"><Select value={sosForm.alertType} onValueChange={(value) => setSosForm({ ...sosForm, alertType: value })}><SelectTrigger id="sos-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(locale === "bn" ? sosLabelsBn : sosLabelsEn).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label={pick("কী হয়েছে?", "What happened?")} id="sos-message"><Textarea id="sos-message" rows={4} value={sosForm.message ?? ""} onChange={(event) => setSosForm({ ...sosForm, message: event.target.value })} placeholder={pick("পরিবার যেন দ্রুত বুঝতে পারে এমন সংক্ষিপ্ত তথ্য", "Brief information the family can understand quickly")} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label={pick("যোগাযোগ নম্বর", "Contact number")} id="sos-contact"><Input id="sos-contact" value={sosForm.preferredContact ?? ""} onChange={(event) => setSosForm({ ...sosForm, preferredContact: event.target.value })} /></Field><Field label="Location label" id="sos-location-label"><Input id="sos-location-label" value={sosForm.locationLabel ?? ""} onChange={(event) => setSosForm({ ...sosForm, locationLabel: event.target.value })} placeholder={pick("যেমন: বাসা, ৩য় তলা", "For example: home, third floor")} /></Field></div><div className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{pick("বর্তমান অবস্থান (ঐচ্ছিক)", "Current location (optional)")}</p><p className="text-xs text-muted-foreground">{pick("শুধু অনুমোদিত ফ্যামিলি সদস্যরা এই SOS-এর সাথে অবস্থানটি দেখবে।", "Only approved family members can see it with this SOS.")}</p></div><Button variant="outline" className="rounded-xl" onClick={requestLocation} disabled={locating}>{locating ? <LoaderCircle className="size-4 animate-spin" /> : <Navigation className="size-4" />} {location ? pick("হালনাগাদ", "Update") : pick("অবস্থান যোগ করুন", "Add location")}</Button></div>{location ? <p className="mt-3 flex items-center gap-2 text-xs text-emerald-600"><CheckCircle2 className="size-4" /> {pick("অবস্থান প্রস্তুত", "Location ready")} · {pick("নির্ভুলতা প্রায়", "accuracy about")} {Math.round(location.accuracy)}m <button type="button" className="underline" onClick={() => setLocation(null)}>{pick("সরান", "Remove")}</button></p> : null}</div></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setSosOpen(false)}>{pick("বাতিল", "Cancel")}</Button><Button className="rounded-xl bg-rose-600 text-white hover:bg-rose-700" disabled={saving || (sosForm.message?.trim().length ?? 0) < 3} onClick={() => void createSos().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("SOS পাঠানো যায়নি।", "Could not send SOS.")))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Siren className="size-4" />} {pick("ফ্যামিলি SOS পাঠান", "Send family SOS")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(responseTarget)} onOpenChange={(open) => !open && setResponseTarget(null)}><DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle>{pick("SOS সাড়া", "SOS response")}</DialogTitle><DialogDescription>{responseTarget?.reporter_name} · {responseTarget?.message}</DialogDescription></DialogHeader><div className="space-y-4"><Field label="Response" id="sos-response-type"><Select value={responseType} onValueChange={setResponseType}><SelectTrigger id="sos-response-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="acknowledged">{pick("দেখেছি / যোগাযোগ করছি", "Seen / contacting now")}</SelectItem><SelectItem value="on_the_way">{pick("আমি আসছি", "I'm on the way")}</SelectItem><SelectItem value="called_emergency">{pick("জরুরি সেবায় কল করেছি", "Called emergency services")}</SelectItem><SelectItem value="update">{pick("হালনাগাদ দিচ্ছি", "Providing an update")}</SelectItem></SelectContent></Select></Field><Field label="Note" id="sos-response-note"><Textarea id="sos-response-note" value={responseNote} onChange={(event) => setResponseNote(event.target.value)} placeholder={pick("ঐচ্ছিক হালনাগাদ", "Optional update")} /></Field></div><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setResponseTarget(null)}>{pick("বাতিল", "Cancel")}</Button><Button className="rounded-xl" disabled={saving} onClick={() => void respondToSos().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("সাড়া পাঠানো হয়নি।", "Could not send response.")))}>{pick("সাড়া পাঠান", "Send response")}</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) { return <Card className="rounded-2xl py-0 shadow-none"><CardContent className="p-5"><span className="mb-4 grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card>; }
function Info({ label, value, icon }: { label: string; value: string; icon: ReactNode }) { const { locale } = useLocale(); return <div className="flex gap-3 rounded-2xl border p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span><div><p className="text-xs text-muted-foreground">{locale === "bn" ? healthLabelBn[label] ?? label : label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div></div>; }
function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="rounded-2xl border border-dashed p-7 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>; }
function EmptyRows({ columns }: { columns: number }) { const { pick } = useLocale(); return <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">{pick("এখনও কোনো রেকর্ড নেই। যোগ করুন দিয়ে শুরু করুন।", "No records yet. Use Add to begin.")}</TableCell></TableRow>; }
function StateCard({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) { return <Card className="rounded-3xl"><CardContent className="flex min-h-96 flex-col items-center justify-center p-8 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><h2 className="mt-5 text-2xl font-bold">{title}</h2><p className="mt-2 max-w-xl text-muted-foreground">{text}</p>{action ? <div className="mt-6">{action}</div> : null}</CardContent></Card>; }
function DataSection({ title, description, onAdd, addLabel, children }: { title: string; description: string; onAdd: () => void; addLabel?: string; children: ReactNode }) { const { pick } = useLocale(); const label = addLabel ?? pick("যোগ করুন", "Add"); return <Card className="gap-0 overflow-hidden rounded-3xl py-0 shadow-none"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div><Button size="sm" className="self-start rounded-xl" onClick={onAdd}>{addLabel === "Upload" || addLabel === "আপলোড" ? <Upload className="size-4" /> : <Plus className="size-4" />} {label}</Button></div><div className="overflow-x-auto">{children}</div></Card>; }
const healthLabelBn: Record<string, string> = { "Blood group": "রক্তের গ্রুপ", Allergies: "অ্যালার্জি", "Emergency contact": "জরুরি যোগাযোগ", Visibility: "দৃশ্যমানতা", "Date of birth": "জন্মতারিখ", "Height (cm)": "উচ্চতা (সেমি)", "Weight (kg)": "ওজন (কেজি)", Conditions: "শারীরিক অবস্থা", "Primary doctor": "প্রধান চিকিৎসক", "Doctor phone": "চিকিৎসকের ফোন", "Emergency phone": "জরুরি ফোন", "Emergency notes": "জরুরি নোট", Medicine: "ওষুধ", Dosage: "মাত্রা", Frequency: "পুনরাবৃত্তি", "Reminder times (comma separated)": "রিমাইন্ডারের সময় (কমা দিয়ে আলাদা)", "Start date": "শুরুর তারিখ", "End date": "শেষ তারিখ", "Prescribing doctor": "প্রেসক্রাইবকারী চিকিৎসক", Instructions: "নির্দেশনা", "Appointment title": "অ্যাপয়েন্টমেন্টের শিরোনাম", Doctor: "চিকিৎসক", Facility: "প্রতিষ্ঠান", Schedule: "সময়সূচি", "Reminder minutes before": "কত মিনিট আগে রিমাইন্ডার", Notes: "নোট", Measurement: "পরিমাপ", "Primary value": "প্রধান মান", "Secondary / diastolic": "দ্বিতীয় / ডায়াস্টোলিক মান", Unit: "একক", "Measured at": "পরিমাপের সময়", Title: "শিরোনাম", Category: "শ্রেণি", "Document date": "নথির তারিখ", File: "ফাইল", "Emergency type": "জরুরির ধরন", "Location label": "স্থানের নাম", Response: "সাড়া", Note: "নোট" };
function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) { const { locale } = useLocale(); return <div className="space-y-2"><Label htmlFor={id}>{locale === "bn" ? healthLabelBn[label] ?? label : label}</Label>{children}</div>; }
const healthStatusBn: Record<string, string> = { active: "সক্রিয়", scheduled: "নির্ধারিত", completed: "সম্পন্ন", resolved: "সমাধান", paused: "বিরত", acknowledged: "দেখা হয়েছে", cancelled: "বাতিল", on_the_way: "পথে আছি", called_emergency: "জরুরি সেবায় কল করা হয়েছে", update: "হালনাগাদ" };
function healthStatusLabel(value: string, locale: AppLocale) { return (locale === "bn" ? healthStatusBn[value] : undefined) ?? value.replaceAll("_", " "); }
const healthDocumentCategoryBn: Record<string, string> = { prescription: "প্রেসক্রিপশন", lab_report: "ল্যাব রিপোর্ট", imaging: "ইমেজিং", vaccine: "টিকা", insurance: "বীমা", other: "অন্যান্য" };
function healthDocumentCategoryLabel(value: string, locale: AppLocale) { return (locale === "bn" ? healthDocumentCategoryBn[value] : undefined) ?? value.replaceAll("_", " "); }
function Status({ value }: { value: string }) { const { locale } = useLocale(); const style = ["active", "scheduled", "completed", "resolved"].includes(value) ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : ["paused", "acknowledged"].includes(value) ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : ["cancelled"].includes(value) ? "bg-rose-500/12 text-rose-700 dark:text-rose-300" : "bg-muted text-muted-foreground"; return <Badge variant="secondary" className={style}>{healthStatusLabel(value, locale)}</Badge>; }
function StatusMenu({ values, onSelect, disabled }: { values: string[]; onSelect: (value: string) => void; disabled: boolean }) { const { locale } = useLocale(); return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={disabled}><MoreHorizontal className="size-4" /><span className="sr-only">{locale === "bn" ? "স্ট্যাটাস পরিবর্তন" : "Change status"}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{values.map((value) => <DropdownMenuItem key={value} onClick={() => onSelect(value)}>{healthStatusLabel(value, locale)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>; }
function RecordActions({ onEdit, onDelete, disabled }: { onEdit: () => void; onDelete: () => void; disabled: boolean }) { const { pick } = useLocale(); return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={disabled}><MoreHorizontal className="size-4" /><span className="sr-only">{pick("রেকর্ডের কাজ", "Record actions")}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onEdit}><Pencil /> {pick("বিস্তারিত সম্পাদনা", "Edit details")}</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 /> {pick("স্থায়ীভাবে মুছুন", "Delete permanently")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>; }

function SosBanner({ alert, onRespond, onClose, canClose }: { alert: HealthSosAlert; onRespond: () => void; onClose: (status: "resolved" | "cancelled") => void; canClose: boolean }) { const { locale, pick } = useLocale(); const labels = locale === "bn" ? sosLabelsBn : sosLabelsEn; const dateTime = dateTimeFor(locale); return <div className="flex flex-col gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-950 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-100 sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-600 text-white"><Siren className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b>{labels[alert.alert_type]}</b><Status value={alert.status} /><span className="text-xs opacity-70">{dateTime.format(new Date(alert.created_at))}</span></div><p className="mt-1 text-sm">{alert.reporter_name}: {alert.message}</p></div><div className="flex gap-2"><Button size="sm" className="rounded-xl" onClick={onRespond}>{pick("সাড়া দিন", "Respond")}</Button>{canClose ? <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="outline"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onClose("resolved")}>{pick("সমাধান হয়েছে", "Mark resolved")}</DropdownMenuItem><DropdownMenuItem onClick={() => onClose("cancelled")}>{pick("সতর্কতা বাতিল", "Cancel alert")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</div></div>; }

function SosCard({ alert, responses, onRespond, onClose, canClose }: { alert: HealthSosAlert; responses: HealthSosResponse[]; onRespond: () => void; onClose: (status: "resolved" | "cancelled") => void; canClose: boolean }) { const { locale, pick } = useLocale(); const labels = locale === "bn" ? sosLabelsBn : sosLabelsEn; const dateTime = dateTimeFor(locale); const active = ["active", "acknowledged"].includes(alert.status); return <div className={cn("rounded-2xl border p-4", active && "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20")}><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", active ? "bg-rose-600 text-white" : "bg-muted text-muted-foreground")}><Siren className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b>{labels[alert.alert_type]}</b><Status value={alert.status} /><span className="text-xs text-muted-foreground">{dateTime.format(new Date(alert.created_at))}</span></div><p className="mt-1 text-sm"><b>{alert.reporter_name}:</b> {alert.message}</p>{alert.preferred_contact ? <p className="mt-1 text-xs text-muted-foreground">{pick("যোগাযোগ", "Contact")}: {alert.preferred_contact}</p> : null}{alert.latitude ? <a href={`https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"><MapPin className="size-3.5" /> {alert.location_label || pick("মানচিত্রের স্থান", "Map location")}</a> : alert.location_label ? <p className="mt-2 flex items-center gap-1 text-xs"><MapPin className="size-3.5" /> {alert.location_label}</p> : null}</div>{active ? <div className="flex gap-2"><Button size="sm" className="rounded-xl" onClick={onRespond}>{pick("সাড়া দিন", "Respond")}</Button>{canClose ? <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onClose("resolved")}>{pick("সমাধান", "Resolve")}</Button> : null}</div> : null}</div>{responses.length ? <div className="mt-3 space-y-2 border-t pt-3">{responses.map((item) => <div key={item.id} className="flex gap-2 text-xs"><CheckCircle2 className="mt-0.5 size-3.5 text-emerald-600" /><span><b>{item.responder_name}</b> · {healthStatusLabel(item.response_type, locale)}{item.note ? ` — ${item.note}` : ""}</span></div>)}</div> : null}</div>; }

function EmergencyCard({ item }: { item: EmergencyHealthProfile }) { const { pick } = useLocale(); return <div className="rounded-2xl border p-4"><div className="flex items-center gap-3"><Avatar className="size-10"><AvatarFallback className="text-xs font-bold">{initials(item.member_name)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.member_name}</p><div className="mt-1 flex gap-2"><Badge variant="outline">{item.blood_group || pick("রক্তের গ্রুপ অজানা", "Blood unknown")}</Badge>{item.donor_available ? <Badge className="bg-rose-600 text-white">{pick("রক্তদাতা", "Donor")}</Badge> : null}</div></div></div>{item.allergies || item.conditions || item.emergency_notes ? <div className="mt-3 space-y-1 rounded-xl bg-muted/60 p-3 text-xs"><p>{item.allergies ? `${pick("অ্যালার্জি", "Allergy")}: ${item.allergies}` : ""}</p><p>{item.conditions ? `${pick("অবস্থা", "Condition")}: ${item.conditions}` : ""}</p><p>{item.emergency_notes || ""}</p></div> : null}{item.emergency_contact_name ? <p className="mt-3 text-xs text-muted-foreground">{pick("জরুরি যোগাযোগ", "Emergency")}: {item.emergency_contact_name} · {item.emergency_contact_phone}</p> : null}</div>; }

function ProfileForm({ form, setForm, donorAvailable, setDonorAvailable }: { form: FormState; setForm: (value: FormState) => void; donorAvailable: boolean; setDonorAvailable: (value: boolean) => void }) { const { pick } = useLocale(); const set = (key: string, value: string) => setForm({ ...form, [key]: value }); return <div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="Blood group" id="health-blood"><Select value={form.bloodGroup} onValueChange={(value) => set("bloodGroup", value)}><SelectTrigger id="health-blood"><SelectValue /></SelectTrigger><SelectContent>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"].map((value) => <SelectItem key={value} value={value}>{value === "Unknown" ? pick("অজানা", "Unknown") : value}</SelectItem>)}</SelectContent></Select></Field><Field label="Date of birth" id="health-dob"><Input id="health-dob" type="date" value={form.dateOfBirth} onChange={(event) => set("dateOfBirth", event.target.value)} /></Field><Field label="Height (cm)" id="health-height"><Input id="health-height" type="number" value={form.heightCm} onChange={(event) => set("heightCm", event.target.value)} /></Field><Field label="Weight (kg)" id="health-weight"><Input id="health-weight" type="number" value={form.weightKg} onChange={(event) => set("weightKg", event.target.value)} /></Field><Field label="Conditions" id="health-conditions"><Textarea id="health-conditions" value={form.conditions} onChange={(event) => set("conditions", event.target.value)} /></Field><Field label="Allergies" id="health-allergies"><Textarea id="health-allergies" value={form.allergies} onChange={(event) => set("allergies", event.target.value)} /></Field><Field label="Primary doctor" id="health-doctor"><Input id="health-doctor" value={form.doctorName} onChange={(event) => set("doctorName", event.target.value)} /></Field><Field label="Doctor phone" id="health-doctor-phone"><Input id="health-doctor-phone" value={form.doctorPhone} onChange={(event) => set("doctorPhone", event.target.value)} /></Field><Field label="Emergency contact" id="health-emergency-name"><Input id="health-emergency-name" value={form.emergencyContactName} onChange={(event) => set("emergencyContactName", event.target.value)} /></Field><Field label="Emergency phone" id="health-emergency-phone"><Input id="health-emergency-phone" value={form.emergencyContactPhone} onChange={(event) => set("emergencyContactPhone", event.target.value)} /></Field><div className="sm:col-span-2"><Field label="Emergency notes" id="health-emergency-notes"><Textarea id="health-emergency-notes" value={form.emergencyNotes} onChange={(event) => set("emergencyNotes", event.target.value)} /></Field></div><div className="rounded-2xl border p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">{pick("রক্তদানে উপলভ্য", "Blood donor available")}</p><p className="text-xs text-muted-foreground">{pick("Privacy-তে জরুরি নির্দেশিকার অনুমতি থাকলে নাম ও রক্তের গ্রুপ দেখাবে", "Shows your name and blood group when emergency-directory access is allowed in Privacy")}</p></div><Switch checked={donorAvailable} onCheckedChange={setDonorAvailable} /></div>{donorAvailable ? <Input className="mt-3" type="date" value={form.lastDonationDate} onChange={(event) => set("lastDonationDate", event.target.value)} /> : null}</div><div className="space-y-2 rounded-2xl border p-4"><Label>{pick("গোপনীয়তা ও শেয়ারিং", "Privacy & sharing")}</Label><Select value={form.visibility} onValueChange={(value) => set("visibility", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">{pick("ব্যক্তিগত — শুধু আমি", "Private — only me")}</SelectItem><SelectItem value="emergency">{pick("জরুরি তথ্য পরিবার দেখতে পারবে", "Emergency details visible to family")}</SelectItem><SelectItem value="family">{pick("নির্বাচিত স্বাস্থ্য সারাংশ পরিবার দেখতে পারবে", "Selected health summary visible to family")}</SelectItem></SelectContent></Select></div></div>; }

function RecordForm({ kind, form, setForm }: { kind: RecordKind; form: FormState; setForm: (value: FormState) => void }) { const { locale, pick } = useLocale(); const typeLabels = locale === "bn" ? typeLabelsBn : typeLabelsEn; const set = (key: string, value: string) => setForm({ ...form, [key]: value }); if (kind === "medication") return <div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="Medicine" id="med-name"><Input id="med-name" value={form.medicineName ?? ""} onChange={(event) => set("medicineName", event.target.value)} /></Field><Field label="Dosage" id="med-dose"><Input id="med-dose" value={form.dosage ?? ""} onChange={(event) => set("dosage", event.target.value)} placeholder={pick("যেমন: ১ tablet", "Example: 1 tablet")} /></Field><Field label="Frequency" id="med-frequency"><Input id="med-frequency" value={form.frequency ?? ""} onChange={(event) => set("frequency", event.target.value)} /></Field><Field label="Reminder times (comma separated)" id="med-times"><Input id="med-times" value={form.reminderTimes ?? ""} onChange={(event) => set("reminderTimes", event.target.value)} /></Field><Field label="Start date" id="med-start"><Input id="med-start" type="date" value={form.startDate ?? ""} onChange={(event) => set("startDate", event.target.value)} /></Field><Field label="End date" id="med-end"><Input id="med-end" type="date" value={form.endDate ?? ""} onChange={(event) => set("endDate", event.target.value)} /></Field><Field label="Prescribing doctor" id="med-doctor"><Input id="med-doctor" value={form.prescribingDoctor ?? ""} onChange={(event) => set("prescribingDoctor", event.target.value)} /></Field><Field label="Instructions" id="med-instructions"><Textarea id="med-instructions" value={form.instructions ?? ""} onChange={(event) => set("instructions", event.target.value)} /></Field></div>; if (kind === "appointment") return <div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="Appointment title" id="appt-title"><Input id="appt-title" value={form.title ?? ""} onChange={(event) => set("title", event.target.value)} /></Field><Field label="Doctor" id="appt-doctor"><Input id="appt-doctor" value={form.doctorName ?? ""} onChange={(event) => set("doctorName", event.target.value)} /></Field><Field label="Facility" id="appt-facility"><Input id="appt-facility" value={form.facility ?? ""} onChange={(event) => set("facility", event.target.value)} /></Field><Field label="Schedule" id="appt-time"><Input id="appt-time" type="datetime-local" value={form.scheduledAt ?? ""} onChange={(event) => set("scheduledAt", event.target.value)} /></Field><Field label="Reminder minutes before" id="appt-reminder"><Input id="appt-reminder" type="number" value={form.reminderMinutes ?? "60"} onChange={(event) => set("reminderMinutes", event.target.value)} /></Field><Field label="Notes" id="appt-notes"><Textarea id="appt-notes" value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} /></Field></div>; const measurementType = (form.measurementType || "blood_pressure") as HealthMeasurement["measurement_type"]; return <div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="Measurement" id="log-type"><Select value={measurementType} onValueChange={(value) => setForm({ ...form, measurementType: value, unit: typeUnits[value as HealthMeasurement["measurement_type"]], valueSecondary: "" })}><SelectTrigger id="log-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Primary value" id="log-primary"><Input id="log-primary" type="number" step="0.01" value={form.valuePrimary ?? ""} onChange={(event) => set("valuePrimary", event.target.value)} /></Field>{measurementType === "blood_pressure" ? <Field label="Secondary / diastolic" id="log-secondary"><Input id="log-secondary" type="number" step="0.01" value={form.valueSecondary ?? ""} onChange={(event) => set("valueSecondary", event.target.value)} /></Field> : null}<Field label="Unit" id="log-unit"><Input id="log-unit" value={form.unit ?? ""} onChange={(event) => set("unit", event.target.value)} /></Field><Field label="Measured at" id="log-time"><Input id="log-time" type="datetime-local" value={form.measuredAt ?? ""} onChange={(event) => set("measuredAt", event.target.value)} /></Field><Field label="Notes" id="log-notes"><Textarea id="log-notes" value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} /></Field></div>; }
