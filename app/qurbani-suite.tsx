"use client";

import { useActionFeedback } from "@/components/action-modal-provider";
import { useLocale, type AppLocale } from "@/components/locale-provider";
import { qurbaniIsoToLocalDateTime, qurbaniLocalDateTimeToIso } from "@/lib/qurbani-validation";
import { qurbaniMoneyOutstanding, qurbaniMoneyTotal } from "@/lib/qurbani-money-total";
import { qurbaniDistributionTotals } from "@/lib/qurbani-distribution-totals";
import { qurbaniPaymentReconciliation } from "@/lib/qurbani-payment-reconciliation";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  HandCoins,
  LoaderCircle,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Plus,
  ReceiptText,
  Scale,
  ShieldAlert,
  Truck,
  Trash2,
  Users,
} from "lucide-react";

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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  QurbaniAnimal,
  QurbaniCampaign,
  QurbaniCampaignStatus,
  QurbaniDistribution,
  QurbaniParticipant,
  QurbaniPayload,
  QurbaniRecordKind,
  QurbaniSchedule,
  QurbaniTask,
  QurbaniTransaction,
  QurbaniVendor,
} from "@/lib/qurbani-types";
import { canDeleteQurbaniCampaign, isFinalizedQurbaniCampaign } from "@/lib/qurbani-policy";

type FormState = Record<string, string>;
type QurbaniRecord = QurbaniParticipant | QurbaniAnimal | QurbaniTransaction | QurbaniVendor | QurbaniSchedule | QurbaniTask | QurbaniDistribution;
type SectionKey =
  | "overview"
  | "participants"
  | "animals"
  | "ledger"
  | "vendors"
  | "schedule"
  | "tasks"
  | "distribution";

const campaignStatusLabelsBn: Record<QurbaniCampaignStatus, string> = {
  planning: "পরিকল্পনা",
  registration: "রেজিস্ট্রেশন",
  procurement: "পশু ক্রয়",
  slaughter: "কোরবানির দিন",
  distribution: "বণ্টন",
  settled: "হিসাব নিষ্পত্তি",
  closed: "বন্ধ",
};
const campaignStatusLabelsEn: Record<QurbaniCampaignStatus, string> = { planning: "Planning", registration: "Registration", procurement: "Procurement", slaughter: "Qurbani day", distribution: "Distribution", settled: "Settled", closed: "Closed" };
const campaignLabelsFor = (locale: AppLocale) => locale === "bn" ? campaignStatusLabelsBn : campaignStatusLabelsEn;

const workflow: QurbaniCampaignStatus[] = [
  "planning",
  "registration",
  "procurement",
  "slaughter",
  "distribution",
  "settled",
  "closed",
];

const kindLabelsBn: Record<QurbaniRecordKind, string> = {
  participant: "অংশগ্রহণকারী ও শেয়ার",
  animal: "পশু",
  transaction: "লেনদেন",
  vendor: "Vendor",
  schedule: "কোরবানির সময়সূচি",
  task: "Task / Volunteer duty",
  distribution: "মাংস বণ্টন",
};
const kindLabelsEn: Record<QurbaniRecordKind, string> = { participant: "Participants & shares", animal: "Animals", transaction: "Transactions", vendor: "Vendors", schedule: "Qurbani schedule", task: "Tasks / volunteer duties", distribution: "Meat distribution" };
const kindLabelsFor = (locale: AppLocale) => locale === "bn" ? kindLabelsBn : kindLabelsEn;

const today = () => new Date().toISOString().slice(0, 10);
const numberOf = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

function defaultCampaignForm(): FormState {
  return {
    title: "কোরবানি " + (new Date().getFullYear() + 1),
    year: String(new Date().getFullYear() + 1),
    hijriYear: "",
    status: "planning",
    sharePrice: "0",
    targetShares: "7",
    registrationDeadline: "",
    slaughterDate: "",
    location: "",
    notes: "",
  };
}

function defaultRecordForm(kind: QurbaniRecordKind): FormState {
  if (kind === "participant") return { shareCount: "1", amountDue: "", amountPaid: "0", status: "pending", animalId: "none" };
  if (kind === "animal") return { animalType: "cow", liveWeightKg: "0", estimatedMeatKg: "0", purchasePrice: "0", transportCost: "0", feedCost: "0", healthStatus: "pending", status: "shortlisted", purchaseDate: today() };
  if (kind === "transaction") return { transactionType: "collection", category: "share_payment", amount: "", paymentMethod: "cash", transactionDate: today(), participantId: "none", animalId: "none" };
  if (kind === "vendor") return { vendorType: "animal_seller", agreedAmount: "0", paidAmount: "0", status: "planned" };
  if (kind === "schedule") return { animalId: "none", sequenceNo: "1", status: "scheduled" };
  if (kind === "task") return { category: "logistics", priority: "normal", status: "todo" };
  return { recipientType: "participant", weightKg: "0", packageCount: "1" };
}

export function QurbaniSuite() {
  const { locale, pick } = useLocale();
  const campaignStatusLabels = campaignLabelsFor(locale);
  const kindLabels = kindLabelsFor(locale);
  const moneyFormatter = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const numberFormatter = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", { maximumFractionDigits: 2 });
  const dateFormatter = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium" });
  const dateTimeFormatter = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const [campaigns, setCampaigns] = useState<QurbaniCampaign[]>([]);
  const [participants, setParticipants] = useState<QurbaniParticipant[]>([]);
  const [animals, setAnimals] = useState<QurbaniAnimal[]>([]);
  const [transactions, setTransactions] = useState<QurbaniTransaction[]>([]);
  const [vendors, setVendors] = useState<QurbaniVendor[]>([]);
  const [schedules, setSchedules] = useState<QurbaniSchedule[]>([]);
  const [tasks, setTasks] = useState<QurbaniTask[]>([]);
  const [distributions, setDistributions] = useState<QurbaniDistribution[]>([]);
  const [family, setFamily] = useState<QurbaniPayload["family"]>();
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [activeTab, setActiveTab] = useState<SectionKey>("overview");
  const [canManage, setCanManage] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(false);
  const [recordKind, setRecordKind] = useState<QurbaniRecordKind | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ id: string; kind: QurbaniRecordKind } | null>(null);
  const [recordForm, setRecordForm] = useState<FormState>({});
  const [campaignForm, setCampaignForm] = useState<FormState>(defaultCampaignForm);
  const loadSequence = useRef(0);

  const clearQurbaniData = useCallback(() => {
    setFamily(undefined);
    setCampaigns([]);
    setParticipants([]);
    setAnimals([]);
    setTransactions([]);
    setVendors([]);
    setSchedules([]);
    setTasks([]);
    setDistributions([]);
    setSelectedCampaignId("");
    setCanManage(false);
    setMigrationRequired(false);
    setCampaignOpen(false);
    setEditingCampaign(false);
    setRecordKind(null);
    setEditingRecord(null);
  }, [setCampaignOpen, setEditingCampaign, setRecordKind, setEditingRecord]);

  const loadQurbani = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/qurbani", { cache: "no-store" });
      const payload = (await response.json()) as QurbaniPayload;
      if (sequence !== loadSequence.current) return false;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        clearQurbaniData();
        setSetupRequired(true);
        setLoadError(false);
        setFeedback(pick("Family access সক্রিয় নয়।", "Family access is not active."));
        return false;
      }
      if (!response.ok) throw new Error(
        payload.code === "QURBANI_ROW_LIMIT"
          ? pick("কোরবানি রেকর্ডের সীমা ছাড়িয়েছে। অসম্পূর্ণ তথ্য দেখানো বা XLSX রপ্তানি করা হয়নি; পেজভিত্তিক রপ্তানির জন্য সাপোর্টে যোগাযোগ করুন।", "Qurbani records exceed the safe limit. No partial data was shown or exported; contact support for a paged export.")
          : payload.error ?? pick("কোরবানি কার্যক্রম পাওয়া যায়নি।", "Qurbani operations could not be loaded."),
      );
      setFamily(payload.family);
      setCampaigns(payload.campaigns ?? []);
      setParticipants(payload.participants ?? []);
      setAnimals(payload.animals ?? []);
      setTransactions(payload.transactions ?? []);
      setVendors(payload.vendors ?? []);
      setSchedules(payload.schedules ?? []);
      setTasks(payload.tasks ?? []);
      setDistributions(payload.distributions ?? []);
      setCanManage(Boolean(payload.permissions?.canManage));
      setMigrationRequired(Boolean(payload.migrationRequired));
      setSetupRequired(false);
      setLoadError(false);
      setSelectedCampaignId((current) => {
        if (current && payload.campaigns?.some((item) => item.id === current)) return current;
        return payload.campaigns?.[0]?.id ?? "";
      });
      return true;
    } catch (error) {
      if (sequence !== loadSequence.current) return false;
      clearQurbaniData();
      setSetupRequired(false);
      setLoadError(true);
      setFeedback(error instanceof Error ? error.message : pick("কোরবানি কার্যক্রম লোড হয়নি।", "Qurbani operations could not be loaded."));
      return false;
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [clearQurbaniData, pick, setFeedback]);

  useEffect(() => {
    queueMicrotask(() => void loadQurbani());
    return () => { loadSequence.current += 1; };
  }, [loadQurbani]);

  const campaign = useMemo(
    () => campaigns.find((item) => item.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );
  const campaignParticipants = useMemo(
    () => participants.filter((item) => item.campaign_id === selectedCampaignId),
    [participants, selectedCampaignId],
  );
  const campaignAnimals = useMemo(
    () => animals.filter((item) => item.campaign_id === selectedCampaignId),
    [animals, selectedCampaignId],
  );
  const campaignTransactions = useMemo(
    () => transactions.filter((item) => item.campaign_id === selectedCampaignId),
    [transactions, selectedCampaignId],
  );
  const paymentReconciliation = useMemo(
    () => qurbaniPaymentReconciliation(campaignParticipants, campaignTransactions),
    [campaignParticipants, campaignTransactions],
  );
  const campaignVendors = useMemo(
    () => vendors.filter((item) => item.campaign_id === selectedCampaignId),
    [vendors, selectedCampaignId],
  );
  const campaignSchedules = useMemo(
    () => schedules.filter((item) => item.campaign_id === selectedCampaignId),
    [schedules, selectedCampaignId],
  );
  const campaignTasks = useMemo(
    () => tasks.filter((item) => item.campaign_id === selectedCampaignId),
    [tasks, selectedCampaignId],
  );
  const campaignDistributions = useMemo(
    () => distributions.filter((item) => item.campaign_id === selectedCampaignId),
    [distributions, selectedCampaignId],
  );
  const finalized = campaign ? isFinalizedQurbaniCampaign(campaign.status) : false;
  const canManageRecords = canManage && !finalized;
  const hasCampaignRecords = campaignParticipants.length + campaignAnimals.length + campaignTransactions.length + campaignVendors.length + campaignSchedules.length + campaignTasks.length + campaignDistributions.length > 0;
  const canDeleteCampaign = canManage && campaign ? canDeleteQurbaniCampaign(campaign.status, hasCampaignRecords) : false;

  const totals = useMemo(() => {
    const activeParticipants = campaignParticipants.filter((item) => item.status !== "cancelled");
    const shares = activeParticipants.reduce((sum, item) => sum + numberOf(item.share_count), 0);
    const due = qurbaniMoneyTotal(activeParticipants.map((item) => item.amount_due));
    const paid = qurbaniMoneyTotal(activeParticipants.map((item) => item.amount_paid));
    const collected = qurbaniMoneyTotal(campaignTransactions.filter((item) => item.transaction_type === "collection").map((item) => item.amount));
    const expenses = qurbaniMoneyTotal(campaignTransactions.filter((item) => item.transaction_type === "expense").map((item) => item.amount));
    const refunds = qurbaniMoneyTotal(campaignTransactions.filter((item) => item.transaction_type === "refund").map((item) => item.amount));
    const animalBudget = qurbaniMoneyTotal(campaignAnimals.flatMap((item) => [item.purchase_price, item.transport_cost, item.feed_cost]));
    const meatEstimate = campaignAnimals.reduce(
      (sum, item) => sum + numberOf(item.estimated_meat_kg),
      0,
    );
    const distribution = qurbaniDistributionTotals(campaignDistributions);
    const openTasks = campaignTasks.filter(
      (item) => item.status !== "completed" && item.status !== "cancelled",
    ).length;
    return {
      shares,
      due,
      paid,
      outstanding: qurbaniMoneyOutstanding(due, paid),
      collected,
      expenses,
      refunds,
      balance: qurbaniMoneyTotal([collected, -expenses, -refunds]),
      animalBudget,
      meatEstimate,
      distributed: distribution.collectedKg,
      packages: distribution.collectedPackages,
      allocatedKg: distribution.allocatedKg,
      pendingKg: distribution.pendingKg,
      allocatedPackages: distribution.allocatedPackages,
      pendingPackages: distribution.pendingPackages,
      openTasks,
    };
  }, [
    campaignParticipants,
    campaignTransactions,
    campaignAnimals,
    campaignDistributions,
    campaignTasks,
  ]);

  const shareProgress = campaign
    ? Math.min(100, (totals.shares / Math.max(1, numberOf(campaign.target_shares))) * 100)
    : 0;
  const paymentProgress = totals.due ? Math.min(100, (totals.paid / totals.due) * 100) : 0;
  const distributionProgress = totals.meatEstimate
    ? Math.min(100, (totals.distributed / totals.meatEstimate) * 100)
    : 0;

  async function createCampaign() {
    setSaving(true);
    setFeedback(null);
    try {
      const registrationDeadline = qurbaniLocalDateTimeToIso(campaignForm.registrationDeadline);
      if (registrationDeadline === undefined) {
        setFeedback(pick("নিবন্ধনের সময়সীমা সঠিকভাবে দিন।", "Enter a valid registration deadline."));
        return;
      }
      const campaignData = { ...campaignForm, registrationDeadline };
      const response = await fetch("/api/qurbani/campaigns", {
        method: editingCampaign ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingCampaign ? { ...campaignData, campaignId: campaign?.id } : campaignData),
      });
      if (response.status === 499) return;
      const payload = (await response.json()) as { campaign?: QurbaniCampaign; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error ?? pick("ক্যাম্পেইন সংরক্ষণ হয়নি।", "Campaign could not be saved."));
      setCampaignOpen(false);
      setEditingCampaign(false);
      setCampaignForm(defaultCampaignForm());
      if (!(await loadQurbani())) return;
      setSelectedCampaignId(payload.campaign.id);
      setFeedback(editingCampaign ? pick("কোরবানি ক্যাম্পেইন হালনাগাদ হয়েছে।", "Qurbani campaign updated.") : pick("নতুন কোরবানি ক্যাম্পেইন তৈরি হয়েছে।", "New Qurbani campaign created."));
    } finally {
      setSaving(false);
    }
  }

  function openCreateCampaign() {
    setEditingCampaign(false);
    setCampaignForm(defaultCampaignForm());
    setCampaignOpen(true);
  }

  function openEditCampaign() {
    if (!campaign) return;
    setEditingCampaign(true);
    setCampaignForm({ title: campaign.title, year: String(campaign.year), hijriYear: campaign.hijri_year ?? "", status: campaign.status, sharePrice: String(campaign.share_price), targetShares: String(campaign.target_shares), registrationDeadline: qurbaniIsoToLocalDateTime(campaign.registration_deadline), slaughterDate: campaign.slaughter_date ?? "", location: campaign.location ?? "", notes: campaign.notes ?? "" });
    setCampaignOpen(true);
  }

  async function deleteCampaign() {
    if (!campaign) return;
    setSaving(true);
    try {
      const response = await fetch("/api/qurbani/campaigns", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: campaign.id }) });
      if (response.status === 499) return;
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? pick("ক্যাম্পেইন মোছা যায়নি।", "Campaign could not be deleted."));
      if (!(await loadQurbani())) return;
      setFeedback(payload.message ?? pick("ক্যাম্পেইন মোছা হয়েছে।", "Campaign deleted."));
    } finally { setSaving(false); }
  }

  function openRecord(kind: QurbaniRecordKind) {
    setEditingRecord(null);
    setRecordForm(defaultRecordForm(kind));
    setRecordKind(kind);
  }

  function openEditRecord(kind: QurbaniRecordKind, item: QurbaniRecord) {
    let form: FormState;
    if (kind === "participant") { const value = item as QurbaniParticipant; form = { memberName: value.member_name, phone: value.phone ?? "", shareCount: String(value.share_count), animalId: value.animal_id ?? "none", amountDue: String(value.amount_due), amountPaid: String(value.amount_paid), status: value.status, notes: value.notes ?? "" }; }
    else if (kind === "animal") { const value = item as QurbaniAnimal; form = { tagCode: value.tag_code, animalType: value.animal_type, breed: value.breed ?? "", color: value.color ?? "", liveWeightKg: String(value.live_weight_kg), estimatedMeatKg: String(value.estimated_meat_kg), purchasePrice: String(value.purchase_price), vendorName: value.vendor_name ?? "", purchaseDate: value.purchase_date ?? "", healthStatus: value.health_status, vetNotes: value.vet_notes ?? "", transportCost: String(value.transport_cost), feedCost: String(value.feed_cost), status: value.status, notes: "" }; }
    else if (kind === "transaction") { const value = item as QurbaniTransaction; form = { transactionType: value.transaction_type, category: value.category, amount: String(value.amount), paymentMethod: value.payment_method, transactionDate: value.transaction_date, reference: value.reference ?? "", participantId: value.participant_id ?? "none", animalId: value.animal_id ?? "none", notes: value.notes ?? "" }; }
    else if (kind === "vendor") { const value = item as QurbaniVendor; form = { name: value.name, vendorType: value.vendor_type, phone: value.phone ?? "", address: value.address ?? "", agreedAmount: String(value.agreed_amount), paidAmount: String(value.paid_amount), status: value.status, notes: value.notes ?? "" }; }
    else if (kind === "schedule") { const value = item as QurbaniSchedule; form = { animalId: value.animal_id ?? "none", sequenceNo: String(value.sequence_no), scheduledAt: qurbaniIsoToLocalDateTime(value.scheduled_at), location: value.location ?? "", butcherTeam: value.butcher_team ?? "", status: value.status, notes: value.notes ?? "" }; }
    else if (kind === "task") { const value = item as QurbaniTask; form = { title: value.title, category: value.category, assignedTo: value.assigned_to ?? "", dueAt: qurbaniIsoToLocalDateTime(value.due_at), priority: value.priority, status: value.status, notes: value.notes ?? "" }; }
    else { const value = item as QurbaniDistribution; form = { recipientName: value.recipient_name, recipientType: value.recipient_type, weightKg: String(value.weight_kg), packageCount: String(value.package_count), collectedAt: qurbaniIsoToLocalDateTime(value.collected_at), notes: value.notes ?? "" }; }
    setEditingRecord({ id: item.id, kind });
    setRecordForm(form);
    setRecordKind(kind);
  }

  async function createRecord() {
    if (!recordKind || !campaign) return;
    setSaving(true);
    setFeedback(null);
    try {
      const cleanData = Object.fromEntries(
        Object.entries(recordForm).map(([key, value]) => [key, value === "none" ? "" : value]),
      );
      const timeKey = recordKind === "schedule" ? "scheduledAt" : recordKind === "task" ? "dueAt" : recordKind === "distribution" ? "collectedAt" : null;
      if (timeKey) {
        const time = qurbaniLocalDateTimeToIso(cleanData[timeKey] ?? "");
        if (time === undefined || (recordKind === "schedule" && time === null)) {
          setFeedback(pick("তারিখ ও সময় সঠিকভাবে দিন।", "Enter a valid date and time."));
          return;
        }
        cleanData[timeKey] = time ?? "";
      }
      const response = await fetch("/api/qurbani/records", {
        method: editingRecord ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: recordKind, campaignId: campaign.id, recordId: editingRecord?.id, data: cleanData }),
      });
      if (response.status === 499) return;
      const payload = (await response.json()) as { record?: unknown; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error ?? pick("রেকর্ড সংরক্ষণ হয়নি।", "Record could not be saved."));
      const label = kindLabels[recordKind];
      setRecordKind(null);
      setEditingRecord(null);
      if (!(await loadQurbani())) return;
      setFeedback(editingRecord ? pick(`${label} রেকর্ড হালনাগাদ হয়েছে।`, `${label} record updated.`) : pick(`${label} রেকর্ড যোগ হয়েছে।`, `${label} record added.`));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(kind: QurbaniRecordKind, id: string) {
    if (!campaign) return;
    setSaving(true);
    try {
      const response = await fetch("/api/qurbani/records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, campaignId: campaign.id, recordId: id }) });
      if (response.status === 499) return;
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? pick("রেকর্ড মোছা যায়নি।", "Record could not be deleted."));
      if (!(await loadQurbani())) return;
      setFeedback(payload.message ?? pick("রেকর্ড মোছা হয়েছে।", "Record deleted."));
    } finally { setSaving(false); }
  }

  async function updateStatus(entity: string, id: string, status: string) {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/qurbani/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, id, status }),
      });
      if (response.status === 499) return;
      const payload = (await response.json()) as { record?: unknown; error?: string; code?: string };
      if (payload.code === "QURBANI_PAYMENT_RECONCILIATION_REQUIRED") throw new Error(pick("অংশগ্রহণকারীর নথিভুক্ত পরিশোধ ও সংযুক্ত খতিয়ান মিলছে না। আগে হিসাব মিলিয়ে নিন।", "Participant recorded payments do not match linked ledger entries. Reconcile them before settlement."));
      if (!response.ok || !payload.record) throw new Error(payload.error ?? pick("স্ট্যাটাস হালনাগাদ হয়নি।", "Status could not be updated."));
      if (!(await loadQurbani())) return;
      setFeedback(pick("স্ট্যাটাস হালনাগাদ হয়েছে।", "Status updated."));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : pick("স্ট্যাটাস হালনাগাদ হয়নি।", "Status could not be updated."));
    } finally {
      setSaving(false);
    }
  }

  const summaryRows = campaign
    ? [
        {
          [pick("ক্যাম্পেইন", "Campaign")]: campaign.title,
          [pick("বছর", "Year")]: campaign.year,
          [pick("হিজরি বছর", "Hijri year")]: campaign.hijri_year ?? "",
          [pick("স্ট্যাটাস", "Status")]: campaignStatusLabels[campaign.status],
          [pick("স্থান", "Location")]: campaign.location ?? "",
          [pick("কোরবানির তারিখ", "Slaughter date")]: campaign.slaughter_date ?? "",
          [pick("শেয়ার মূল্য", "Share price")]: numberOf(campaign.share_price),
          [pick("লক্ষ্য শেয়ার", "Target shares")]: numberOf(campaign.target_shares),
          [pick("নিবন্ধিত শেয়ার", "Registered shares")]: totals.shares,
          [pick("অংশগ্রহণকারীর পাওনা", "Participant dues")]: totals.due,
          [pick("অংশগ্রহণকারীর নথিভুক্ত পরিশোধ", "Participant recorded paid")]: totals.paid,
          [pick("সংযুক্ত খতিয়ানে পরিশোধ", "Linked ledger paid")]: paymentReconciliation.ledgerPaidTotal,
          [pick("পরিশোধ অমিলের সংখ্যা", "Payment mismatch count")]: paymentReconciliation.mismatchCount,
          [pick("অসংযুক্ত শেয়ার এন্ট্রি", "Unmatched share entries")]: paymentReconciliation.unmatchedEntries,
          [pick("বকেয়া", "Outstanding")]: totals.outstanding,
          [pick("খতিয়ান সংগ্রহ", "Ledger collection")]: totals.collected,
          [pick("খরচ", "Expenses")]: totals.expenses,
          [pick("ফেরত", "Refunds")]: totals.refunds,
          [pick("ব্যালান্স", "Balance")]: totals.balance,
          [pick("পশুর সংখ্যা", "Animals count")]: campaignAnimals.length,
          [pick("আনুমানিক মাংস কেজি", "Estimated meat kg")]: totals.meatEstimate,
          [pick("বরাদ্দকৃত কেজি", "Allocated kg")]: totals.allocatedKg,
          [pick("বণ্টিত কেজি", "Distributed kg")]: totals.distributed,
          [pick("বরাদ্দকৃত প্যাকেট", "Allocated packages")]: totals.allocatedPackages,
          [pick("বিতরণকৃত প্যাকেট", "Delivered packages")]: totals.packages,
          [pick("অসম্পন্ন কাজ", "Open tasks")]: totals.openTasks,
        },
      ]
    : [];

  const participantRows = campaignParticipants.map((item, index) => ({
    [pick("ক্রম", "SL")]: index + 1,
    [pick("অংশগ্রহণকারী", "Participant")]: item.member_name,
    [pick("ফোন", "Phone")]: item.phone ?? "",
    [pick("পশু", "Animal")]: campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code ?? "",
    [pick("শেয়ার", "Shares")]: numberOf(item.share_count),
    [pick("পাওনা", "Due")]: numberOf(item.amount_due),
    [pick("নথিভুক্ত পরিশোধ", "Recorded paid")]: numberOf(item.amount_paid),
    [pick("খতিয়ানে পরিশোধ", "Ledger paid")]: paymentReconciliation.byParticipant.get(item.id)?.ledgerPaid ?? 0,
    [pick("পরিশোধ অমিল", "Payment difference")]: paymentReconciliation.byParticipant.get(item.id)?.difference ?? 0,
    [pick("বকেয়া", "Outstanding")]: qurbaniMoneyOutstanding(item.amount_due, item.amount_paid),
    [pick("স্ট্যাটাস", "Status")]: statusLabel(item.status, locale),
    [pick("নোট", "Notes")]: item.notes ?? "",
  }));
  const animalRows = campaignAnimals.map((item) => ({
    [pick("ট্যাগ", "Tag")]: item.tag_code,
    [pick("ধরন", "Type")]: item.animal_type,
    [pick("জাত", "Breed")]: item.breed ?? "",
    [pick("রং", "Color")]: item.color ?? "",
    [pick("জীবিত ওজন কেজি", "Live weight kg")]: numberOf(item.live_weight_kg),
    [pick("আনুমানিক মাংস কেজি", "Estimated meat kg")]: numberOf(item.estimated_meat_kg),
    [pick("ক্রয়মূল্য", "Purchase price")]: numberOf(item.purchase_price),
    [pick("পরিবহন", "Transport")]: numberOf(item.transport_cost),
    [pick("খাদ্য", "Feed")]: numberOf(item.feed_cost),
    [pick("বিক্রেতা", "Vendor")]: item.vendor_name ?? "",
    [pick("ক্রয়ের তারিখ", "Purchase date")]: item.purchase_date ?? "",
    [pick("স্বাস্থ্য", "Health")]: statusLabel(item.health_status, locale),
    [pick("স্ট্যাটাস", "Status")]: statusLabel(item.status, locale),
    [pick("পশু চিকিৎসকের নোট", "Vet notes")]: item.vet_notes ?? "",
  }));
  const ledgerRows = campaignTransactions.map((item) => ({
    [pick("তারিখ", "Date")]: item.transaction_date,
    [pick("ধরন", "Type")]: statusLabel(item.transaction_type, locale),
    [pick("ক্যাটাগরি", "Category")]: item.category,
    [pick("পরিমাণ", "Amount")]: numberOf(item.amount),
    [pick("পদ্ধতি", "Method")]: item.payment_method,
    [pick("অংশগ্রহণকারী", "Participant")]:
      campaignParticipants.find((participant) => participant.id === item.participant_id)?.member_name ?? "",
    [pick("পশু", "Animal")]: campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code ?? "",
    [pick("রেফারেন্স", "Reference")]: item.reference ?? "",
    [pick("নোট", "Notes")]: item.notes ?? "",
  }));
  const vendorRows = campaignVendors.map((item) => ({
    [pick("বিক্রেতা", "Vendor")]: item.name,
    [pick("ধরন", "Type")]: item.vendor_type,
    [pick("ফোন", "Phone")]: item.phone ?? "",
    [pick("ঠিকানা", "Address")]: item.address ?? "",
    [pick("চুক্তি", "Agreed")]: numberOf(item.agreed_amount),
    [pick("পরিশোধিত", "Paid")]: numberOf(item.paid_amount),
    [pick("বকেয়া", "Due")]: qurbaniMoneyOutstanding(item.agreed_amount, item.paid_amount),
    [pick("স্ট্যাটাস", "Status")]: statusLabel(item.status, locale),
    [pick("নোট", "Notes")]: item.notes ?? "",
  }));
  const scheduleRows = campaignSchedules.map((item) => ({
    [pick("ক্রম", "Sequence")]: item.sequence_no,
    [pick("পশু", "Animal")]: campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code ?? "",
    [pick("নির্ধারিত সময়", "Scheduled at")]: dateTimeFormatter.format(new Date(item.scheduled_at)),
    [pick("স্থান", "Location")]: item.location ?? "",
    [pick("দল", "Team")]: item.butcher_team ?? "",
    [pick("স্ট্যাটাস", "Status")]: statusLabel(item.status, locale),
    [pick("নোট", "Notes")]: item.notes ?? "",
  }));
  const taskRows = campaignTasks.map((item) => ({
    [pick("কাজ", "Task")]: item.title,
    [pick("ক্যাটাগরি", "Category")]: item.category,
    [pick("দায়িত্বপ্রাপ্ত", "Assigned to")]: item.assigned_to ?? "",
    [pick("সময়সীমা", "Due")]: item.due_at ? dateTimeFormatter.format(new Date(item.due_at)) : "",
    [pick("অগ্রাধিকার", "Priority")]: statusLabel(item.priority, locale),
    [pick("স্ট্যাটাস", "Status")]: statusLabel(item.status, locale),
    [pick("নোট", "Notes")]: item.notes ?? "",
  }));
  const distributionRows = campaignDistributions.map((item) => ({
    [pick("গ্রহীতা", "Recipient")]: item.recipient_name,
    [pick("ধরন", "Type")]: statusLabel(item.recipient_type, locale),
    [pick("ওজন কেজি", "Weight kg")]: numberOf(item.weight_kg),
    [pick("প্যাকেট", "Packages")]: item.package_count,
    [pick("সংগ্রহ", "Collected")]: item.collected_at ? dateTimeFormatter.format(new Date(item.collected_at)) : "",
    [pick("নোট", "Notes")]: item.notes ?? "",
  }));

  async function exportWorkbook(single?: { name: string; rows: Array<Record<string, unknown>> }, allYears = false) {
    if (!campaign) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const campaignById = new Map(campaigns.map((item) => [item.id, item]));
      const yearRows = <T extends { campaign_id: string }>(records: T[]) => records.map((record) => ({
        [pick("বছর", "Year")]: campaignById.get(record.campaign_id)?.year ?? "",
        [pick("ক্যাম্পেইন", "Campaign")]: campaignById.get(record.campaign_id)?.title ?? "",
        ...record,
      }));
      const allYearsSummary = allYears ? campaigns.map((item) => {
        const active = participants.filter((entry) => entry.campaign_id === item.id && entry.status !== "cancelled");
        const entries = transactions.filter((entry) => entry.campaign_id === item.id);
        const total = (type: QurbaniTransaction["transaction_type"]) => qurbaniMoneyTotal(entries.filter((entry) => entry.transaction_type === type).map((entry) => entry.amount));
        const collected = total("collection");
        const expenses = total("expense");
        const refunds = total("refund");
        const due = qurbaniMoneyTotal(active.map((entry) => entry.amount_due));
        const paid = qurbaniMoneyTotal(active.map((entry) => entry.amount_paid));
        const annualPayments = qurbaniPaymentReconciliation(participants.filter((entry) => entry.campaign_id === item.id), entries);
        const annualDistribution = qurbaniDistributionTotals(distributions.filter((entry) => entry.campaign_id === item.id));
        return {
          [pick("বছর", "Year")]: item.year,
          [pick("ক্যাম্পেইন", "Campaign")]: item.title,
          [pick("হিজরি বছর", "Hijri year")]: item.hijri_year ?? "",
          [pick("স্ট্যাটাস", "Status")]: campaignStatusLabels[item.status],
          [pick("শেয়ার", "Shares")]: active.reduce((sum, entry) => sum + numberOf(entry.share_count), 0),
          [pick("পাওনা", "Due")]: due,
          [pick("নথিভুক্ত পরিশোধ", "Recorded paid")]: paid,
          [pick("সংযুক্ত খতিয়ানে পরিশোধ", "Linked ledger paid")]: annualPayments.ledgerPaidTotal,
          [pick("পরিশোধ অমিলের সংখ্যা", "Payment mismatch count")]: annualPayments.mismatchCount,
          [pick("অসংযুক্ত শেয়ার এন্ট্রি", "Unmatched share entries")]: annualPayments.unmatchedEntries,
          [pick("বকেয়া", "Outstanding")]: qurbaniMoneyOutstanding(due, paid),
          [pick("সংগ্রহ", "Collections")]: collected,
          [pick("খরচ", "Expenses")]: expenses,
          [pick("ফেরত", "Refunds")]: refunds,
          [pick("ব্যালান্স", "Balance")]: qurbaniMoneyTotal([collected, -expenses, -refunds]),
          [pick("পশু", "Animals")]: animals.filter((entry) => entry.campaign_id === item.id).length,
          [pick("বরাদ্দকৃত কেজি", "Allocated kg")]: annualDistribution.allocatedKg,
          [pick("বণ্টিত কেজি", "Distributed kg")]: annualDistribution.collectedKg,
        };
      }) : [];
      const sheets = allYears
        ? [
            { name: pick("সব বছরের সারাংশ", "All Years Summary"), rows: allYearsSummary },
            { name: pick("ক্যাম্পেইন", "Campaigns"), rows: campaigns },
            { name: pick("অংশগ্রহণকারী", "Participants"), rows: yearRows(participants) },
            { name: pick("পশু", "Animals"), rows: yearRows(animals) },
            { name: pick("খতিয়ান", "Ledger"), rows: yearRows(transactions) },
            { name: pick("বিক্রেতা", "Vendors"), rows: yearRows(vendors) },
            { name: pick("সময়সূচি", "Schedule"), rows: yearRows(schedules) },
            { name: pick("কাজ", "Tasks"), rows: yearRows(tasks) },
            { name: pick("বণ্টন", "Distribution"), rows: yearRows(distributions) },
          ]
        : single
        ? [single]
        : [
            { name: pick("ক্যাম্পেইন সারাংশ", "Campaign Summary"), rows: summaryRows },
            { name: pick("অংশগ্রহণকারী", "Participants"), rows: participantRows },
            { name: pick("পশু", "Animals"), rows: animalRows },
            { name: pick("খতিয়ান", "Ledger"), rows: ledgerRows },
            { name: pick("বিক্রেতা", "Vendors"), rows: vendorRows },
            { name: pick("সময়সূচি", "Schedule"), rows: scheduleRows },
            { name: pick("কাজ", "Tasks"), rows: taskRows },
            { name: pick("বণ্টন", "Distribution"), rows: distributionRows },
          ];
      sheets.forEach((sheet) => {
        const data = sheet.rows.length ? sheet.rows : [{ [pick("তথ্য", "Information")]: pick("এখনও কোনো রেকর্ড নেই", "No records yet") }];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), sheet.name.slice(0, 31));
      });
      const baseName =
        (family?.name_en || "family").replace(/[^a-z0-9]+/gi, "-").toLowerCase() +
        "-qurbani-" +
        campaign.year;
      XLSX.writeFile(workbook, allYears
        ? (family?.name_en || "family").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-qurbani-all-years.xlsx"
        : baseName + (single ? "-" + single.name.toLowerCase() : "-complete") + ".xlsx");
      setFeedback(pick("কোরবানির XLSX সফলভাবে তৈরি হয়েছে।", "Qurbani XLSX was created successfully."));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : pick("কোরবানির XLSX তৈরি হয়নি।", "Qurbani XLSX could not be created."));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    const modelContext = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Record<string, unknown>,
            options?: { signal?: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!modelContext?.registerTool || !campaign) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: "get_qurbani_campaign_summary",
          title: "Get Qurbani campaign summary",
          description:
            "Read the selected family Qurbani campaign workflow, shares, finance, animals, tasks and distribution totals.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: () => ({
            campaign: { id: campaign.id, title: campaign.title, year: campaign.year, status: campaign.status },
            shares: { registered: totals.shares, target: numberOf(campaign.target_shares) },
            finance: {
              participantDue: totals.due,
              participantPaid: totals.paid,
              participantLedgerPaid: paymentReconciliation.ledgerPaidTotal,
              paymentMismatchCount: paymentReconciliation.mismatchCount,
              unmatchedShareEntries: paymentReconciliation.unmatchedEntries,
              ledgerCollection: totals.collected,
              expense: totals.expenses,
              balance: totals.balance,
            },
            animals: campaignAnimals.length,
            meat: { estimatedKg: totals.meatEstimate, allocatedKg: totals.allocatedKg, distributedKg: totals.distributed },
            openTasks: totals.openTasks,
          }),
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [campaign, campaignAnimals.length, paymentReconciliation, totals]);

  if (setupRequired) {
    return (
      <StateCard
        icon={<ShieldAlert />}
        title={pick("ফ্যামিলি access সক্রিয় নয়", "Family access is not active")}
        text={pick("Join code দিয়ে আবেদন করুন। Admin অনুমোদনের পর কোরবানি operations ব্যবহার করা যাবে।", "Apply with a join code. You can use Qurbani operations after admin approval.")}
        action={<Button asChild className="rounded-xl"><a href="/setup">{pick("Family onboarding খুলুন", "Open family onboarding")}</a></Button>}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1550px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <CalendarDays className="size-4" /> {pick("কোরবানি A–Z কার্যক্রম", "Qurbani A–Z Operations")}
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{pick("কোরবানি ম্যানেজমেন্ট সিস্টেম", "Qurbani Management System")}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            {pick("Campaign, share, পশু, health, collection, expense, vendor, schedule, volunteer duty, বণ্টন ও final settlement।", "Campaigns, shares, animals, health, collections, expenses, vendors, schedules, volunteer duties, distribution, and final settlement.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!loading && campaigns.length ? (
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="w-[220px] rounded-xl bg-card">
                <SelectValue placeholder={pick("Campaign নির্বাচন", "Select campaign")} />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title} · {item.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            variant="outline"
            className="gap-2 rounded-xl"
            disabled={loading || !campaign || exporting}
            onClick={() => void exportWorkbook()}
          >
            {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            {pick("সম্পূর্ণ XLSX", "Complete XLSX")}
          </Button>
          <Button
            variant="outline"
            className="gap-2 rounded-xl"
            disabled={loading || !campaigns.length || exporting}
            onClick={() => void exportWorkbook(undefined, true)}
          >
            {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
            {pick("সব বছরের XLSX", "All years XLSX")}
          </Button>
          {!loading && canManage && !migrationRequired ? (
            <Button className="gap-2 rounded-xl" onClick={openCreateCampaign}>
              <Plus className="size-4" /> {pick("নতুন Campaign", "New campaign")}
            </Button>
          ) : null}
        </div>
      </section>

      {feedback ? (
        <div className="flex items-start justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
          <span>{feedback}</span>
          <button type="button" className="text-muted-foreground" onClick={() => setFeedback(null)}>{pick("বন্ধ", "Close")}</button>
        </div>
      ) : null}

      {migrationRequired ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <p className="font-bold">{pick("Qurbani database migration প্রয়োজন", "Qurbani database migration required")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pick("Supabase SQL Editor-এ supabase/migrations/20260926_qurbani_a_to_z.sql একবার চালান। UI প্রস্তুত আছে; migration শেষ হলেই live records সক্রিয় হবে।", "Run supabase/migrations/20260926_qurbani_a_to_z.sql once in the Supabase SQL Editor. The interface is ready; live records activate after the migration.")}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <Card className="rounded-3xl py-0 shadow-none">
          <CardContent className="flex min-h-80 items-center justify-center p-8">
            <LoaderCircle className="size-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : loadError ? (
        <StateCard
          icon={<ShieldAlert />}
          title={pick("কোরবানি তথ্য লোড হয়নি", "Qurbani data could not be loaded")}
          text={pick("আগের তথ্য নিরাপত্তার জন্য সরানো হয়েছে। আবার চেষ্টা করুন।", "Previously loaded data was cleared for safety. Please try again.")}
          action={<Button className="rounded-xl" onClick={() => void loadQurbani()}>{pick("আবার চেষ্টা করুন", "Try again")}</Button>}
        />
      ) : !campaign ? (
        <StateCard
          icon={<CircleDollarSign />}
          title={pick("প্রথম Qurbani campaign তৈরি করুন", "Create the first Qurbani campaign")}
          text={pick("Year, share price, target, registration deadline ও location দিয়ে শুরু করুন।", "Start with the year, share price, target, registration deadline, and location.")}
          action={
            canManage && !migrationRequired ? (
              <Button className="gap-2 rounded-xl" onClick={openCreateCampaign}>
                <Plus className="size-4" /> {pick("Campaign তৈরি করুন", "Create campaign")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <Metric icon={<Users />} label={pick("নিবন্ধিত শেয়ার", "Registered shares")} value={numberFormatter.format(totals.shares) + " / " + numberFormatter.format(numberOf(campaign.target_shares))} note={pick(Math.round(shareProgress) + "% পূর্ণ", Math.round(shareProgress) + "% filled")} />
            <Metric icon={<HandCoins />} label={pick("নথিভুক্ত পরিশোধ", "Recorded payments")} value={moneyFormatter.format(totals.paid)} note={pick(moneyFormatter.format(paymentReconciliation.ledgerPaidTotal) + " সংযুক্ত খতিয়ান · " + moneyFormatter.format(totals.outstanding) + " বকেয়া", moneyFormatter.format(paymentReconciliation.ledgerPaidTotal) + " linked ledger · " + moneyFormatter.format(totals.outstanding) + " outstanding")} />
            <Metric icon={<CircleDollarSign />} label={pick("Ledger balance", "Ledger balance")} value={moneyFormatter.format(totals.balance)} note={pick(moneyFormatter.format(totals.expenses) + " খরচ", moneyFormatter.format(totals.expenses) + " expenses")} />
            <Metric icon={<Truck />} label={pick("মোট পশু", "Total animals")} value={numberFormatter.format(campaignAnimals.length)} note={pick(moneyFormatter.format(totals.animalBudget) + " ক্রয় বাজেট", moneyFormatter.format(totals.animalBudget) + " procurement")} />
            <Metric icon={<Scale />} label={pick("মাংস বণ্টনের অগ্রগতি", "Meat progress")} value={numberFormatter.format(totals.distributed) + " kg"} note={pick(numberFormatter.format(totals.pendingKg) + " kg সংগ্রহ বাকি · " + numberFormatter.format(totals.meatEstimate) + " kg আনুমানিক", numberFormatter.format(totals.pendingKg) + " kg pending collection · " + numberFormatter.format(totals.meatEstimate) + " kg estimated")} />
            <Metric icon={<ClipboardCheck />} label={pick("বাকি কাজ", "Open tasks")} value={numberFormatter.format(totals.openTasks)} note={pick(numberFormatter.format(campaignTasks.length) + "টি মোট কাজ", numberFormatter.format(campaignTasks.length) + " total tasks")} />
          </section>

          {!paymentReconciliation.isBalanced ? (
            <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-sm text-foreground">
              <p className="font-semibold">{pick("অংশগ্রহণকারীর পরিশোধ ও খতিয়ানে অমিল", "Participant payments and ledger do not match")}</p>
              <p className="mt-1 text-muted-foreground">{pick(`${numberFormatter.format(paymentReconciliation.mismatchCount)} জনের পরিশোধে অমিল, ${numberFormatter.format(paymentReconciliation.unmatchedEntries)}টি অসংযুক্ত শেয়ার এন্ট্রি। নথিভুক্ত পরিশোধ স্বয়ংক্রিয়ভাবে খতিয়ানের সঙ্গে বদলায় না। যাচাই করে মিল না হওয়া পর্যন্ত হিসাব নিষ্পত্তি করা যাবে না।`, `${numberFormatter.format(paymentReconciliation.mismatchCount)} participant payment mismatches and ${numberFormatter.format(paymentReconciliation.unmatchedEntries)} unmatched share entries. Recorded paid does not automatically sync with the ledger. Reconcile them before settlement.`)}</p>
              <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setActiveTab("participants")}>{pick("শেয়ার দেখুন", "View shares")}</Button><Button variant="outline" size="sm" onClick={() => setActiveTab("ledger")}>{pick("খতিয়ান দেখুন", "View ledger")}</Button></div>
            </div>
          ) : null}

          <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
            <CardContent className="p-0">
              <div className="flex flex-col gap-5 border-b p-5 md:flex-row md:items-center md:justify-between md:p-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">{campaign.title}</h2>
                    <StatusBadge value={campaign.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[campaign.hijri_year, campaign.location, campaign.slaughter_date ? dateFormatter.format(new Date(campaign.slaughter_date + "T00:00:00")) : null].filter(Boolean).join(" · ") || pick("Campaign বিস্তারিত", "Campaign details")}
                  </p>
                </div>
                {canManage && campaign.status !== "closed" ? <div className="flex flex-wrap gap-2">{canManageRecords ? <Button variant="outline" className="gap-2 rounded-xl" disabled={saving} onClick={openEditCampaign}><Pencil className="size-4" /> {pick("Campaign সম্পাদনা", "Edit campaign")}</Button> : null}<CampaignStatusMenu disabled={saving} values={campaign.status === "settled" ? ["closed"] : workflow.filter((value) => value !== campaign.status)} onSelect={(status) => void updateStatus("campaign", campaign.id, status)} />{canDeleteCampaign ? <Button variant="destructive" className="gap-2 rounded-xl" disabled={saving} onClick={() => void deleteCampaign().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("Campaign delete হয়নি।", "Campaign could not be deleted.")))}><Trash2 className="size-4" /> {pick("মুছুন", "Delete")}</Button> : null}</div> : null}
              </div>
              {finalized ? <p className="border-b bg-muted/50 px-5 py-3 text-sm text-muted-foreground md:px-6">{pick("এই campaign-এর রেকর্ড চূড়ান্ত ও read-only। দেখা ও XLSX export করা যাবে; settled campaign শুধু close করা যাবে।", "This campaign's records are finalized and read-only. You can view or export them; a settled campaign can only be closed.")}</p> : null}
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 lg:grid-cols-7">
                {workflow.map((status, index) => {
                  const currentIndex = workflow.indexOf(campaign.status);
                  const done = index <= currentIndex;
                  return (
                    <div key={status} className="bg-card px-3 py-4 text-center">
                      <span className={done ? "mx-auto grid size-7 place-items-center rounded-full bg-primary text-primary-foreground" : "mx-auto grid size-7 place-items-center rounded-full bg-muted text-muted-foreground"}>
                        {done ? <CheckCircle2 className="size-4" /> : index + 1}
                      </span>
                      <p className="mt-2 text-xs font-semibold">{campaignStatusLabels[status]}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SectionKey)} className="space-y-4">
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-muted/70 p-1.5">
              <TabsTrigger value="overview" className="rounded-xl px-4 py-2.5">{pick("সারসংক্ষেপ", "Overview")}</TabsTrigger>
              <TabsTrigger value="participants" className="rounded-xl px-4 py-2.5">{pick("শেয়ার", "Shares")} ({campaignParticipants.length})</TabsTrigger>
              <TabsTrigger value="animals" className="rounded-xl px-4 py-2.5">{pick("পশু", "Animals")} ({campaignAnimals.length})</TabsTrigger>
              <TabsTrigger value="ledger" className="rounded-xl px-4 py-2.5">{pick("হিসাব", "Ledger")} ({campaignTransactions.length})</TabsTrigger>
              <TabsTrigger value="vendors" className="rounded-xl px-4 py-2.5">{pick("Vendor", "Vendors")} ({campaignVendors.length})</TabsTrigger>
              <TabsTrigger value="schedule" className="rounded-xl px-4 py-2.5">{pick("সময়সূচি", "Schedule")} ({campaignSchedules.length})</TabsTrigger>
              <TabsTrigger value="tasks" className="rounded-xl px-4 py-2.5">{pick("কাজ", "Tasks")} ({campaignTasks.length})</TabsTrigger>
              <TabsTrigger value="distribution" className="rounded-xl px-4 py-2.5">{pick("বণ্টন", "Distribution")} ({campaignDistributions.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
                <Card className="rounded-3xl py-0 shadow-none">
                  <CardHeader className="p-5 pb-2 md:p-6 md:pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{pick("কার্যক্রমের অগ্রগতি", "Operational progress")}</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">{pick("Registration থেকে distribution পর্যন্ত readiness", "Readiness from registration through distribution")}</p>
                      </div>
                      <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => void exportWorkbook({ name: pick("ক্যাম্পেইন সারাংশ", "Campaign Summary"), rows: summaryRows })}>
                        <Download className="size-4" /> XLSX
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 p-5 pt-4 md:p-6 md:pt-4">
                    <ProgressLine label={pick("শেয়ার registration", "Share registration")} value={shareProgress} detail={numberFormatter.format(totals.shares) + " shares"} />
                    <ProgressLine label={pick("অংশগ্রহণকারীর পরিশোধ", "Participant payment")} value={paymentProgress} detail={moneyFormatter.format(totals.paid)} />
                    <ProgressLine label={pick("মাংস বণ্টন", "Meat distribution")} value={distributionProgress} detail={numberFormatter.format(totals.distributed) + " kg"} />
                    <ProgressLine label={pick("কাজ সম্পন্ন", "Task completion")} value={campaignTasks.length ? ((campaignTasks.length - totals.openTasks) / campaignTasks.length) * 100 : 0} detail={pick(numberFormatter.format(campaignTasks.length - totals.openTasks) + "টি সম্পন্ন", numberFormatter.format(campaignTasks.length - totals.openTasks) + " completed")} />
                  </CardContent>
                </Card>
                <Card className="rounded-3xl bg-primary py-0 text-primary-foreground shadow-none">
                  <CardContent className="p-6">
                    <ReceiptText className="size-7" />
                    <p className="mt-5 text-sm text-primary-foreground/70">{pick("চূড়ান্ত হিসাবের অবস্থা", "Final settlement position")}</p>
                    <p className="mt-1 text-3xl font-bold">{moneyFormatter.format(totals.balance)}</p>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <MiniStat label={pick("সংগ্রহ", "Collection")} value={moneyFormatter.format(totals.collected)} />
                      <MiniStat label={pick("খরচ", "Expenses")} value={moneyFormatter.format(totals.expenses)} />
                      <MiniStat label={pick("ফেরত", "Refunds")} value={moneyFormatter.format(totals.refunds)} />
                      <MiniStat label={pick("অংশগ্রহণকারীর বকেয়া", "Participant due")} value={moneyFormatter.format(totals.outstanding)} />
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <QuickCard icon={<Truck />} title={pick("ক্রয় নিয়ন্ত্রণ", "Procurement control")} text={pick(campaignAnimals.filter((item) => item.health_status === "fit").length + "টি উপযুক্ত · " + campaignAnimals.filter((item) => item.health_status === "observation").length + "টি পর্যবেক্ষণে", campaignAnimals.filter((item) => item.health_status === "fit").length + " fit · " + campaignAnimals.filter((item) => item.health_status === "observation").length + " under observation")} />
                <QuickCard icon={<ClipboardCheck />} title={pick("Volunteer নিয়ন্ত্রণ", "Volunteer control")} text={pick(totals.openTasks + "টি অপেক্ষমাণ · " + campaignTasks.filter((item) => item.priority === "urgent" && item.status !== "completed").length + "টি জরুরি", totals.openTasks + " pending · " + campaignTasks.filter((item) => item.priority === "urgent" && item.status !== "completed").length + " urgent")} />
                <QuickCard icon={<PackageCheck />} title={pick("বণ্টন নিয়ন্ত্রণ", "Distribution control")} text={pick(numberFormatter.format(totals.packages) + " প্যাকেট সংগ্রহ · " + numberFormatter.format(totals.pendingPackages) + " প্যাকেট বাকি", numberFormatter.format(totals.packages) + " packages collected · " + numberFormatter.format(totals.pendingPackages) + " pending")} />
              </div>
            </TabsContent>

            <TabsContent value="participants">
              <DataSection title={pick("অংশগ্রহণকারী, শেয়ার ও পাওনা", "Participants, shares and dues")} description={pick("সদস্যভিত্তিক বরাদ্দ, পাওনা ও পরিশোধের অবস্থা", "Member-wise allocation, dues and payment status")} canAdd={canManageRecords} onAdd={() => openRecord("participant")} onExport={() => void exportWorkbook({ name: pick("অংশগ্রহণকারী", "Participants"), rows: participantRows })}>
                <Table><TableHeader><TableRow><TableHead>{pick("অংশগ্রহণকারী", "Participant")}</TableHead><TableHead>{pick("পশু", "Animal")}</TableHead><TableHead>{pick("শেয়ার", "Shares")}</TableHead><TableHead>{pick("পাওনা", "Due")}</TableHead><TableHead>{pick("নথিভুক্ত", "Recorded")}</TableHead><TableHead>{pick("খতিয়ানে", "Ledger")}</TableHead><TableHead>{pick("অমিল", "Difference")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead>{canManageRecords ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignParticipants.map((item) => <TableRow key={item.id}><TableCell><p className="font-semibold">{item.member_name}</p><p className="text-xs text-muted-foreground">{item.phone || pick("ফোন ব্যক্তিগত", "Phone private")}</p></TableCell><TableCell>{campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code || pick("বরাদ্দ হয়নি", "Unassigned")}</TableCell><TableCell>{numberFormatter.format(numberOf(item.share_count))}</TableCell><TableCell>{moneyFormatter.format(numberOf(item.amount_due))}</TableCell><TableCell>{moneyFormatter.format(numberOf(item.amount_paid))}</TableCell><TableCell>{moneyFormatter.format(paymentReconciliation.byParticipant.get(item.id)?.ledgerPaid ?? 0)}</TableCell><TableCell className={paymentReconciliation.byParticipant.get(item.id)?.difference ? "font-semibold text-amber-700 dark:text-amber-300" : undefined}>{moneyFormatter.format(paymentReconciliation.byParticipant.get(item.id)?.difference ?? 0)}</TableCell><TableCell><StatusBadge value={item.status} /></TableCell>{canManageRecords ? <TableCell><div className="flex"><StatusMenu disabled={saving} values={["pending", "confirmed", "cancelled"]} onSelect={(status) => void updateStatus("participant", item.id, status)} /><RecordActions disabled={saving} onEdit={() => openEditRecord("participant", item)} onDelete={() => void deleteRecord("participant", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))} /></div></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignParticipants.length} columns={canManageRecords ? 9 : 8} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="animals">
              <DataSection title={pick("পশু ক্রয়, স্বাস্থ্য ও খরচ", "Animal procurement, health and costing")} description={pick("ট্যাগ, বিক্রেতা, ওজন, পশু চিকিৎসা পরীক্ষা ও জীবনচক্র", "Tag, vendor, weight, veterinary checks and lifecycle")} canAdd={canManageRecords} onAdd={() => openRecord("animal")} onExport={() => void exportWorkbook({ name: pick("পশু", "Animals"), rows: animalRows })}>
                <Table><TableHeader><TableRow><TableHead>{pick("ট্যাগ / ধরন", "Tag / Type")}</TableHead><TableHead>{pick("ওজন", "Weight")}</TableHead><TableHead>{pick("মূল্য + লজিস্টিকস", "Price + logistics")}</TableHead><TableHead>{pick("বিক্রেতা", "Vendor")}</TableHead><TableHead>{pick("স্বাস্থ্য", "Health")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead>{canManageRecords ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignAnimals.map((item) => <TableRow key={item.id}><TableCell><p className="font-bold">{item.tag_code}</p><p className="text-xs text-muted-foreground">{statusLabel(item.animal_type, locale)} · {item.breed || pick("জাত নির্ধারিত নয়", "Breed not set")}</p></TableCell><TableCell>{numberFormatter.format(numberOf(item.live_weight_kg))} {pick("কেজি", "kg")}<p className="text-xs text-muted-foreground">{numberFormatter.format(numberOf(item.estimated_meat_kg))} {pick("কেজি উৎপাদন", "kg yield")}</p></TableCell><TableCell>{moneyFormatter.format(numberOf(item.purchase_price))}<p className="text-xs text-muted-foreground">+ {moneyFormatter.format(qurbaniMoneyTotal([item.transport_cost, item.feed_cost]))}</p></TableCell><TableCell>{item.vendor_name || pick("নির্ধারিত নয়", "Not set")}</TableCell><TableCell><StatusBadge value={item.health_status} /></TableCell><TableCell><StatusBadge value={item.status} /></TableCell>{canManageRecords ? <TableCell><div className="flex"><StatusMenu disabled={saving} values={["shortlisted", "purchased", "received", "slaughtered", "cancelled"]} onSelect={(status) => void updateStatus("animal", item.id, status)} /><RecordActions disabled={saving} onEdit={() => openEditRecord("animal", item)} onDelete={() => void deleteRecord("animal", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))} /></div></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignAnimals.length} columns={canManageRecords ? 7 : 6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="ledger">
              <DataSection title={pick("সংগ্রহ, খরচ ও ফেরতের খতিয়ান", "Collection, expense and refund ledger")} description={pick("ক্যাটাগরি, পদ্ধতি ও রেফারেন্সসহ নির্ভরযোগ্য আর্থিক এন্ট্রি", "Reliable financial entries with category, method and reference")} canAdd={canManageRecords} onAdd={() => openRecord("transaction")} onExport={() => void exportWorkbook({ name: pick("খতিয়ান", "Ledger"), rows: ledgerRows })}>
                <Table><TableHeader><TableRow><TableHead>{pick("তারিখ", "Date")}</TableHead><TableHead>{pick("ধরন", "Type")}</TableHead><TableHead>{pick("ক্যাটাগরি", "Category")}</TableHead><TableHead>{pick("পরিমাণ", "Amount")}</TableHead><TableHead>{pick("পদ্ধতি", "Method")}</TableHead><TableHead>{pick("সংযুক্ত রেকর্ড", "Linked record")}</TableHead><TableHead>{pick("রেফারেন্স", "Reference")}</TableHead>{canManageRecords ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignTransactions.map((item) => <TableRow key={item.id}><TableCell>{dateFormatter.format(new Date(item.transaction_date + "T00:00:00"))}</TableCell><TableCell><StatusBadge value={item.transaction_type} /></TableCell><TableCell>{statusLabel(item.category, locale)}</TableCell><TableCell className="font-bold">{moneyFormatter.format(numberOf(item.amount))}</TableCell><TableCell>{statusLabel(item.payment_method, locale)}</TableCell><TableCell>{campaignParticipants.find((participant) => participant.id === item.participant_id)?.member_name || campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code || pick("সাধারণ", "General")}</TableCell><TableCell>{item.reference || "—"}</TableCell>{canManageRecords ? <TableCell><RecordActions disabled={saving} onEdit={() => openEditRecord("transaction", item)} onDelete={() => void deleteRecord("transaction", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))} /></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignTransactions.length} columns={canManageRecords ? 8 : 7} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="vendors">
              <DataSection title={pick("বিক্রেতা ও সেবাদাতা নিয়ন্ত্রণ", "Vendor and service provider control")} description={pick("পশু বিক্রেতা, কসাই, পরিবহন, খাদ্য ও সরঞ্জাম সেবাদাতা", "Animal sellers, butchers, transport, feed and equipment providers")} canAdd={canManageRecords} onAdd={() => openRecord("vendor")} onExport={() => void exportWorkbook({ name: pick("বিক্রেতা", "Vendors"), rows: vendorRows })}>
                <Table><TableHeader><TableRow><TableHead>{pick("বিক্রেতা", "Vendor")}</TableHead><TableHead>{pick("ধরন", "Type")}</TableHead><TableHead>{pick("যোগাযোগ", "Contact")}</TableHead><TableHead>{pick("চুক্তি", "Agreed")}</TableHead><TableHead>{pick("পরিশোধ / বকেয়া", "Paid / Due")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead>{canManageRecords ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignVendors.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.name}</TableCell><TableCell>{statusLabel(item.vendor_type, locale)}</TableCell><TableCell>{item.phone || pick("ব্যক্তিগত", "Private")}<p className="max-w-52 truncate text-xs text-muted-foreground">{item.address}</p></TableCell><TableCell>{moneyFormatter.format(numberOf(item.agreed_amount))}</TableCell><TableCell>{moneyFormatter.format(numberOf(item.paid_amount))}<p className="text-xs text-muted-foreground">{moneyFormatter.format(qurbaniMoneyOutstanding(item.agreed_amount, item.paid_amount))} {pick("বকেয়া", "due")}</p></TableCell><TableCell><StatusBadge value={item.status} /></TableCell>{canManageRecords ? <TableCell><div className="flex"><StatusMenu disabled={saving} values={["planned", "confirmed", "completed", "cancelled"]} onSelect={(status) => void updateStatus("vendor", item.id, status)} /><RecordActions disabled={saving} onEdit={() => openEditRecord("vendor", item)} onDelete={() => void deleteRecord("vendor", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))} /></div></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignVendors.length} columns={canManageRecords ? 7 : 6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="schedule">
              <DataSection title={pick("কোরবানির দিনের সময়সূচি", "Qurbani day schedule")} description={pick("পশুর ক্রম, স্লট, স্থান ও কসাই দল", "Animal sequence, slot, location and butcher team")} canAdd={canManageRecords} onAdd={() => openRecord("schedule")} onExport={() => void exportWorkbook({ name: pick("সময়সূচি", "Schedule"), rows: scheduleRows })}>
                <Table><TableHeader><TableRow><TableHead>{pick("ক্রম", "Sequence")}</TableHead><TableHead>{pick("পশু", "Animal")}</TableHead><TableHead>{pick("সময়", "Time")}</TableHead><TableHead>{pick("স্থান", "Location")}</TableHead><TableHead>{pick("দল", "Team")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead>{canManageRecords ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignSchedules.map((item) => <TableRow key={item.id}><TableCell className="font-bold">#{item.sequence_no}</TableCell><TableCell>{campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code || pick("সাধারণ স্লট", "General slot")}</TableCell><TableCell>{dateTimeFormatter.format(new Date(item.scheduled_at))}</TableCell><TableCell>{item.location || campaign.location || pick("নির্ধারিত নয়", "Not set")}</TableCell><TableCell>{item.butcher_team || pick("বরাদ্দ হয়নি", "Unassigned")}</TableCell><TableCell><StatusBadge value={item.status} /></TableCell>{canManageRecords ? <TableCell><div className="flex"><StatusMenu disabled={saving} values={["scheduled", "in_progress", "completed", "delayed"]} onSelect={(status) => void updateStatus("schedule", item.id, status)} /><RecordActions disabled={saving} onEdit={() => openEditRecord("schedule", item)} onDelete={() => void deleteRecord("schedule", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))} /></div></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignSchedules.length} columns={canManageRecords ? 7 : 6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="tasks">
              <DataSection title={pick("কাজ ও স্বেচ্ছাসেবক দায়িত্ব বোর্ড", "Task and volunteer duty board")} description={pick("ক্রয়, অর্থ, লজিস্টিকস, কোরবানি, বণ্টন ও পরিষ্কার", "Procurement, finance, logistics, slaughter, distribution and cleanup")} canAdd={canManageRecords} onAdd={() => openRecord("task")} onExport={() => void exportWorkbook({ name: pick("কাজ", "Tasks"), rows: taskRows })}>
                <Table><TableHeader><TableRow><TableHead>{pick("কাজ", "Task")}</TableHead><TableHead>{pick("ক্যাটাগরি", "Category")}</TableHead><TableHead>{pick("দায়িত্বপ্রাপ্ত", "Assigned")}</TableHead><TableHead>{pick("সময়সীমা", "Due")}</TableHead><TableHead>{pick("অগ্রাধিকার", "Priority")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead>{canManageRecords ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignTasks.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.title}</TableCell><TableCell>{statusLabel(item.category, locale)}</TableCell><TableCell>{item.assigned_to || pick("বরাদ্দ হয়নি", "Unassigned")}</TableCell><TableCell>{item.due_at ? dateTimeFormatter.format(new Date(item.due_at)) : pick("সময়সীমা নেই", "No deadline")}</TableCell><TableCell><StatusBadge value={item.priority} /></TableCell><TableCell><StatusBadge value={item.status} /></TableCell>{canManageRecords ? <TableCell><div className="flex"><StatusMenu disabled={saving} values={["todo", "in_progress", "completed", "cancelled"]} onSelect={(status) => void updateStatus("task", item.id, status)} /><RecordActions disabled={saving} onEdit={() => openEditRecord("task", item)} onDelete={() => void deleteRecord("task", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))} /></div></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignTasks.length} columns={canManageRecords ? 7 : 6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="distribution">
              <DataSection title={pick("মাংস ও প্যাকেট বণ্টন", "Meat and package distribution")} description={pick("অংশগ্রহণকারী, আত্মীয়, অসহায়, কর্মী ও পরিবারভিত্তিক বরাদ্দ", "Participant, relative, needy, worker and family allocation")} canAdd={canManageRecords} onAdd={() => openRecord("distribution")} onExport={() => void exportWorkbook({ name: pick("বণ্টন", "Distribution"), rows: distributionRows })}>
                <Table><TableHeader><TableRow><TableHead>{pick("গ্রহীতা", "Recipient")}</TableHead><TableHead>{pick("ধরন", "Type")}</TableHead><TableHead>{pick("ওজন", "Weight")}</TableHead><TableHead>{pick("প্যাকেট", "Packages")}</TableHead><TableHead>{pick("সংগ্রহ", "Collected")}</TableHead><TableHead>{pick("নোট", "Notes")}</TableHead>{canManageRecords ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignDistributions.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.recipient_name}</TableCell><TableCell><StatusBadge value={item.recipient_type} /></TableCell><TableCell>{numberFormatter.format(numberOf(item.weight_kg))} {pick("কেজি", "kg")}</TableCell><TableCell>{numberFormatter.format(item.package_count)}</TableCell><TableCell>{item.collected_at ? dateTimeFormatter.format(new Date(item.collected_at)) : pick("অপেক্ষমাণ", "Pending")}</TableCell><TableCell className="max-w-72 truncate">{item.notes || "—"}</TableCell>{canManageRecords ? <TableCell><RecordActions disabled={saving} onEdit={() => openEditRecord("distribution", item)} onDelete={() => void deleteRecord("distribution", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Delete failed.")))} /></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignDistributions.length} columns={canManageRecords ? 7 : 6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={campaignOpen} onOpenChange={(open) => { setCampaignOpen(open); if (!open) { setEditingCampaign(false); setCampaignForm(defaultCampaignForm()); } }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingCampaign ? pick("কোরবানি ক্যাম্পেইন সম্পাদনা", "Edit Qurbani campaign") : pick("নতুন কোরবানি ক্যাম্পেইন", "New Qurbani campaign")}</DialogTitle>
            <DialogDescription>{editingCampaign ? pick("মূল সেটআপ, বাজেট লক্ষ্য, তারিখ ও স্থান হালনাগাদ করুন।", "Update the master setup, budget target, dates and location.") : pick("বছরভিত্তিক সম্পূর্ণ কার্যক্রমের মূল সেটআপ তৈরি করুন।", "Create the master setup for the complete yearly operation.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
             <FormField label={pick("ক্যাম্পেইনের নাম", "Campaign name")} id="campaign-title"><Input id="campaign-title" value={campaignForm.title} onChange={(event) => setCampaignForm({ ...campaignForm, title: event.target.value })} /></FormField>
             <FormField label={pick("বছর", "Year")} id="campaign-year"><Input id="campaign-year" type="number" min="2000" max="2200" value={campaignForm.year} onChange={(event) => setCampaignForm({ ...campaignForm, year: event.target.value })} /></FormField>
             <FormField label={pick("হিজরি বছর", "Hijri year")} id="campaign-hijri"><Input id="campaign-hijri" value={campaignForm.hijriYear} onChange={(event) => setCampaignForm({ ...campaignForm, hijriYear: event.target.value })} /></FormField>
             <FormField label={pick("স্ট্যাটাস", "Status")} id="campaign-status"><ValueSelect id="campaign-status" value={campaignForm.status} onChange={(value) => setCampaignForm({ ...campaignForm, status: value })} items={editingCampaign ? workflow.map((value) => [value, campaignStatusLabels[value]] as [string, string]) : [["planning", campaignStatusLabels.planning], ["registration", campaignStatusLabels.registration]]} /></FormField>
             <FormField label={pick("প্রতি শেয়ারের মূল্য", "Share price")} id="campaign-share-price"><Input id="campaign-share-price" type="number" min="0" step="0.01" value={campaignForm.sharePrice} onChange={(event) => setCampaignForm({ ...campaignForm, sharePrice: event.target.value })} /></FormField>
             <FormField label={pick("লক্ষ্য শেয়ার", "Target shares")} id="campaign-target"><Input id="campaign-target" type="number" min="0.01" step="0.01" value={campaignForm.targetShares} onChange={(event) => setCampaignForm({ ...campaignForm, targetShares: event.target.value })} /></FormField>
             <FormField label={pick("নিবন্ধনের সময়সীমা", "Registration deadline")} id="campaign-deadline"><Input id="campaign-deadline" type="datetime-local" value={campaignForm.registrationDeadline} onChange={(event) => setCampaignForm({ ...campaignForm, registrationDeadline: event.target.value })} /></FormField>
             <FormField label={pick("কোরবানির তারিখ", "Slaughter date")} id="campaign-slaughter-date"><Input id="campaign-slaughter-date" type="date" value={campaignForm.slaughterDate} onChange={(event) => setCampaignForm({ ...campaignForm, slaughterDate: event.target.value })} /></FormField>
             <div className="sm:col-span-2"><FormField label={pick("স্থান", "Location")} id="campaign-location"><Input id="campaign-location" value={campaignForm.location} onChange={(event) => setCampaignForm({ ...campaignForm, location: event.target.value })} /></FormField></div>
             <div className="sm:col-span-2"><FormField label={pick("নোট", "Notes")} id="campaign-notes"><Textarea id="campaign-notes" rows={4} value={campaignForm.notes} onChange={(event) => setCampaignForm({ ...campaignForm, notes: event.target.value })} /></FormField></div>
          </div>
          <DialogFooter>
             <Button variant="outline" className="rounded-xl" onClick={() => setCampaignOpen(false)}>{pick("বাতিল", "Cancel")}</Button>
             <Button className="gap-2 rounded-xl" disabled={saving || campaignForm.title.trim().length < 3 || !campaignForm.year || !campaignForm.targetShares} onClick={() => void createCampaign().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("ক্যাম্পেইন সংরক্ষণ হয়নি।", "Campaign could not be saved.")))}>
               {saving ? <LoaderCircle className="size-4 animate-spin" /> : editingCampaign ? <Pencil className="size-4" /> : <Plus className="size-4" />} {editingCampaign ? pick("ক্যাম্পেইন হালনাগাদ", "Update campaign") : pick("ক্যাম্পেইন তৈরি করুন", "Create campaign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(recordKind)} onOpenChange={(open) => { if (!open) { setRecordKind(null); setEditingRecord(null); } }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editingRecord ? (locale === "bn" ? `${recordKind ? kindLabels[recordKind] : "রেকর্ড"} সম্পাদনা করুন` : `Edit ${recordKind ? kindLabels[recordKind] : "record"}`) : (locale === "bn" ? `নতুন ${recordKind ? kindLabels[recordKind] : "রেকর্ড"} যোগ করুন` : `Add ${recordKind ? kindLabels[recordKind] : "record"}`)}</DialogTitle>
            <DialogDescription>{pick(`${campaign?.title} ক্যাম্পেইনের যাচাইকৃত পরিচালন রেকর্ড ${editingRecord ? "হালনাগাদ" : "তৈরি"} করুন।`, `${editingRecord ? "Update" : "Create"} a verified operational record for the ${campaign?.title} campaign.`)}</DialogDescription>
          </DialogHeader>
          {recordKind ? (
            <RecordFields
              kind={recordKind}
              form={recordForm}
              setForm={setRecordForm}
              animals={campaignAnimals}
              participants={campaignParticipants}
            />
          ) : null}
          <DialogFooter>
             <Button variant="outline" className="rounded-xl" onClick={() => setRecordKind(null)}>{pick("বাতিল", "Cancel")}</Button>
             <Button className="gap-2 rounded-xl" disabled={saving} onClick={() => void createRecord().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("রেকর্ড সংরক্ষণ হয়নি।", "Record could not be saved.")))}>
               {saving ? <LoaderCircle className="size-4 animate-spin" /> : editingRecord ? <Pencil className="size-4" /> : <Plus className="size-4" />} {editingRecord ? pick("রেকর্ড হালনাগাদ", "Update record") : pick("রেকর্ড সংরক্ষণ করুন", "Save record")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <Card className="rounded-2xl py-0 shadow-none"><CardContent className="p-5"><span className="mb-4 grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-primary-foreground/65">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}

function ProgressLine({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{label}</span><span className="font-semibold">{detail} · {Math.round(value)}%</span></div><Progress value={value} className="h-2.5" /></div>;
}

function QuickCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <Card className="rounded-2xl py-0 shadow-none"><CardContent className="p-5"><span className="text-primary">{icon}</span><h3 className="mt-4 font-bold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></CardContent></Card>;
}

function DataSection({ title, description, canAdd, onAdd, onExport, children }: { title: string; description: string; canAdd: boolean; onAdd: () => void; onExport: () => void; children: ReactNode }) {
  const { pick } = useLocale();
  return <Card className="gap-0 overflow-hidden rounded-3xl py-0 shadow-none"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={onExport}><Download className="size-4" /> {pick("XLSX রপ্তানি", "Export XLSX")}</Button>{canAdd ? <Button size="sm" className="gap-2 rounded-xl" onClick={onAdd}><Plus className="size-4" /> {pick("যোগ করুন", "Add")}</Button> : null}</div></div><div className="overflow-x-auto">{children}</div></Card>;
}

function EmptyRows({ show, columns }: { show: boolean; columns: number }) {
  const { pick } = useLocale();
  return show ? <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">{pick("এখনও কোনো রেকর্ড নেই। যোগ করুন বাটন দিয়ে শুরু করুন।", "No records yet. Use the Add button to begin.")}</TableCell></TableRow> : null;
}

function StateCard({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <main className="mx-auto w-full max-w-[1500px] px-4 py-10 md:px-7"><Card className="rounded-3xl py-0 shadow-none"><CardContent className="flex min-h-96 flex-col items-center justify-center p-8 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><h1 className="mt-5 text-2xl font-bold">{title}</h1><p className="mt-2 max-w-xl text-muted-foreground">{text}</p>{action ? <div className="mt-6">{action}</div> : null}</CardContent></Card></main>;
}

function StatusBadge({ value }: { value: string }) {
  const { locale } = useLocale();
  const good = ["confirmed", "fit", "purchased", "received", "completed", "settled", "collection", "participant"];
  const warn = ["pending", "planning", "registration", "observation", "delayed", "in_progress", "high", "expense"];
  const bad = ["cancelled", "rejected", "urgent", "refund"];
  const className = good.includes(value)
    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
    : warn.includes(value)
      ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
      : bad.includes(value)
        ? "bg-red-500/12 text-red-700 dark:text-red-300"
        : "bg-primary/10 text-primary";
  return <Badge variant="secondary" className={className}>{statusLabel(value, locale)}</Badge>;
}

function StatusMenu({ values, onSelect, disabled }: { values: string[]; onSelect: (value: string) => void; disabled: boolean }) {
  const { locale, pick } = useLocale();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-xl" disabled={disabled}><MoreHorizontal className="size-4" /><span className="sr-only">{pick("স্ট্যাটাস পরিবর্তন", "Status actions")}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{values.map((value) => <DropdownMenuItem key={value} onClick={() => onSelect(value)}>{statusLabel(value, locale)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function RecordActions({ onEdit, onDelete, disabled }: { onEdit: () => void; onDelete: () => void; disabled: boolean }) {
  const { pick } = useLocale();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-xl" disabled={disabled}><MoreHorizontal className="size-4" /><span className="sr-only">{pick("রেকর্ডের কাজ", "Record actions")}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onEdit}><Pencil /> {pick("বিস্তারিত সম্পাদনা", "Edit details")}</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 /> {pick("স্থায়ীভাবে মুছুন", "Delete permanently")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

function CampaignStatusMenu({ onSelect, disabled, values }: { onSelect: (value: string) => void; disabled: boolean; values: QurbaniCampaignStatus[] }) {
  const { locale, pick } = useLocale();
  const labels = campaignLabelsFor(locale);
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="gap-2 rounded-xl" disabled={disabled}><MoreHorizontal className="size-4" /> {pick("ওয়ার্কফ্লো স্ট্যাটাস", "Workflow status")}</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{values.map((value) => <DropdownMenuItem key={value} onClick={() => onSelect(value)}>{labels[value]}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

const statusLabelsBn: Record<string, string> = {
  pending: "অপেক্ষমাণ", confirmed: "নিশ্চিত", cancelled: "বাতিল", fit: "উপযুক্ত", observation: "পর্যবেক্ষণে", rejected: "প্রত্যাখ্যাত",
  shortlisted: "বাছাইকৃত", purchased: "ক্রয় করা", received: "গ্রহণ করা", slaughtered: "কোরবানি সম্পন্ন", collection: "সংগ্রহ", expense: "খরচ", refund: "ফেরত",
  planned: "পরিকল্পিত", completed: "সম্পন্ন", scheduled: "নির্ধারিত", in_progress: "চলমান", delayed: "বিলম্বিত", todo: "করণীয়", normal: "সাধারণ", high: "উচ্চ", urgent: "জরুরি",
  participant: "অংশগ্রহণকারী", family: "পরিবার", relative: "আত্মীয়", needy: "অসহায়", worker: "কর্মী", other: "অন্যান্য",
  cow: "গরু", goat: "ছাগল", sheep: "ভেড়া", buffalo: "মহিষ", share_payment: "শেয়ার পরিশোধ", animal_purchase: "পশু ক্রয়",
  transport: "পরিবহন", feed: "খাদ্য", butcher: "কসাই", logistics: "লজিস্টিকস", equipment: "সরঞ্জাম", distribution: "বণ্টন", misc: "বিবিধ",
  cash: "নগদ", bank: "ব্যাংক", mobile: "মোবাইল ব্যাংকিং", animal_seller: "পশু বিক্রেতা", procurement: "ক্রয়", finance: "অর্থ", slaughter: "কোরবানি", cleanup: "পরিষ্কার",
};

function statusLabel(value: string, locale: AppLocale) {
  return campaignLabelsFor(locale)[value as QurbaniCampaignStatus] ?? (locale === "bn" ? statusLabelsBn[value] : undefined) ?? value.replaceAll("_", " ");
}

function FormField({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function ValueSelect({ id, value, onChange, items }: { id: string; value: string; onChange: (value: string) => void; items: Array<[string, string]> }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger id={id} className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{items.map(([itemValue, label]) => <SelectItem key={itemValue} value={itemValue}>{label}</SelectItem>)}</SelectContent></Select>;
}

function RecordFields({ kind, form, setForm, animals, participants }: { kind: QurbaniRecordKind; form: FormState; setForm: Dispatch<SetStateAction<FormState>>; animals: QurbaniAnimal[]; participants: QurbaniParticipant[] }) {
  const { pick } = useLocale();
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const input = (key: string, label: string, type = "text", options?: { min?: string; step?: string }) => <FormField label={label} id={"record-" + key}><Input id={"record-" + key} type={type} min={options?.min} step={options?.step} value={form[key] ?? ""} onChange={(event) => set(key, event.target.value)} onInput={type === "date" || type === "datetime-local" ? (event) => set(key, event.currentTarget.value) : undefined} /></FormField>;
  const select = (key: string, label: string, items: Array<[string, string]>) => <FormField label={label} id={"record-" + key}><ValueSelect id={"record-" + key} value={form[key] ?? items[0]?.[0] ?? ""} onChange={(value) => set(key, value)} items={items} /></FormField>;
  const notes = <div className="sm:col-span-2"><FormField label={pick("নোট", "Notes")} id="record-notes"><Textarea id="record-notes" rows={3} value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} /></FormField></div>;
  const animalItems: Array<[string, string]> = [["none", pick("বরাদ্দ হয়নি", "Unassigned")], ...animals.map((item) => [item.id, item.tag_code] as [string, string])];
  const participantItems: Array<[string, string]> = [["none", pick("সাধারণ / কেউ নয়", "General / none")], ...participants.map((item) => [item.id, item.member_name] as [string, string])];

  if (kind === "participant") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("memberName", pick("অংশগ্রহণকারীর নাম", "Participant name"))}{input("phone", pick("ফোন", "Phone"))}{input("shareCount", pick("শেয়ার সংখ্যা", "Share count"), "number", { min: "0.01", step: "0.01" })}{select("animalId", pick("পশু বরাদ্দ", "Animal assignment"), animalItems)}{input("amountDue", pick("প্রাপ্য টাকা (ফাঁকা রাখলে স্বয়ংক্রিয়)", "Amount due (blank = auto)"), "number", { min: "0", step: "0.01" })}<div className="rounded-xl border bg-muted/40 p-3 text-sm"><p className="font-semibold">{pick("নথিভুক্ত পরিশোধ", "Recorded paid")}: {form.amountPaid ?? "0"}</p><p className="mt-1 text-muted-foreground">{pick("নতুন পরিশোধ/ফেরত খতিয়ান ট্যাবে অংশগ্রহণকারীর সাথে যুক্ত করুন। পুরোনো অমিল থাকলে নিষ্পত্তির আগে প্রশাসককে হিসাব যাচাই করতে হবে।", "Record new collections/refunds against this participant in the ledger. An administrator must review any historical mismatch before settlement.")}</p></div>{select("status", pick("স্ট্যাটাস", "Status"), [["pending", pick("অপেক্ষমাণ", "Pending")], ["confirmed", pick("নিশ্চিত", "Confirmed")], ["cancelled", pick("বাতিল", "Cancelled")]])}{notes}</div>;
  if (kind === "animal") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("tagCode", pick("ট্যাগ কোড", "Tag code"))}{select("animalType", pick("পশুর ধরন", "Animal type"), [["cow", pick("গরু", "Cow")], ["goat", pick("ছাগল", "Goat")], ["sheep", pick("ভেড়া", "Sheep")], ["buffalo", pick("মহিষ", "Buffalo")]])}{input("breed", pick("জাত", "Breed"))}{input("color", pick("রং", "Color"))}{input("liveWeightKg", pick("জীবিত ওজন (কেজি)", "Live weight kg"), "number", { min: "0", step: "0.01" })}{input("estimatedMeatKg", pick("আনুমানিক মাংস (কেজি)", "Estimated meat kg"), "number", { min: "0", step: "0.01" })}{input("purchasePrice", pick("ক্রয়মূল্য", "Purchase price"), "number", { min: "0", step: "0.01" })}{input("vendorName", pick("বিক্রেতার নাম", "Vendor name"))}{input("transportCost", pick("পরিবহন খরচ", "Transport cost"), "number", { min: "0", step: "0.01" })}{input("feedCost", pick("খাদ্য খরচ", "Feed cost"), "number", { min: "0", step: "0.01" })}{input("purchaseDate", pick("ক্রয়ের তারিখ", "Purchase date"), "date")}{select("healthStatus", pick("স্বাস্থ্য অবস্থা", "Health status"), [["pending", pick("পরীক্ষা বাকি", "Pending check")], ["fit", pick("উপযুক্ত", "Fit")], ["observation", pick("পর্যবেক্ষণে", "Observation")], ["rejected", pick("প্রত্যাখ্যাত", "Rejected")]])}{select("status", pick("ক্রয় স্ট্যাটাস", "Procurement status"), [["shortlisted", pick("বাছাইকৃত", "Shortlisted")], ["purchased", pick("ক্রয় করা", "Purchased")], ["received", pick("গ্রহণ করা", "Received")], ["slaughtered", pick("কোরবানি সম্পন্ন", "Slaughtered")], ["cancelled", pick("বাতিল", "Cancelled")]])}{input("vetNotes", pick("পশু চিকিৎসকের নোট", "Veterinary notes"))}{notes}</div>;
  if (kind === "transaction") return <div className="grid gap-4 py-2 sm:grid-cols-2">{select("transactionType", pick("লেনদেনের ধরন", "Transaction type"), [["collection", pick("সংগ্রহ", "Collection")], ["expense", pick("খরচ", "Expense")], ["refund", pick("ফেরত", "Refund")]])}{select("category", pick("ক্যাটাগরি", "Category"), [["share_payment", pick("শেয়ার পরিশোধ", "Share payment")], ["animal_purchase", pick("পশু ক্রয়", "Animal purchase")], ["transport", pick("পরিবহন", "Transport")], ["feed", pick("খাদ্য", "Feed")], ["butcher", pick("কসাই", "Butcher")], ["logistics", pick("লজিস্টিকস", "Logistics")], ["equipment", pick("সরঞ্জাম", "Equipment")], ["distribution", pick("বণ্টন", "Distribution")], ["misc", pick("বিবিধ", "Miscellaneous")]])}{input("amount", pick("পরিমাণ", "Amount"), "number", { min: "0.01", step: "0.01" })}{select("paymentMethod", pick("পরিশোধ পদ্ধতি", "Payment method"), [["cash", pick("নগদ", "Cash")], ["bank", pick("ব্যাংক", "Bank")], ["mobile", pick("মোবাইল ব্যাংকিং", "Mobile banking")], ["other", pick("অন্যান্য", "Other")]])}{input("transactionDate", pick("লেনদেনের তারিখ", "Transaction date"), "date")}{input("reference", pick("রেফারেন্স", "Reference"))}{select("participantId", pick("অংশগ্রহণকারী", "Participant"), participantItems)}{select("animalId", pick("পশু", "Animal"), animalItems)}{notes}</div>;
  if (kind === "vendor") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("name", pick("বিক্রেতা / সেবাদাতার নাম", "Vendor / provider name"))}{select("vendorType", pick("সেবাদাতার ধরন", "Provider type"), [["animal_seller", pick("পশু বিক্রেতা", "Animal seller")], ["butcher", pick("কসাই", "Butcher")], ["transport", pick("পরিবহন", "Transport")], ["feed", pick("খাদ্য", "Feed")], ["equipment", pick("সরঞ্জাম", "Equipment")], ["other", pick("অন্যান্য", "Other")]])}{input("phone", pick("ফোন", "Phone"))}{input("address", pick("ঠিকানা", "Address"))}{input("agreedAmount", pick("চুক্তির পরিমাণ", "Agreed amount"), "number", { min: "0", step: "0.01" })}{input("paidAmount", pick("পরিশোধিত", "Paid amount"), "number", { min: "0", step: "0.01" })}{select("status", pick("স্ট্যাটাস", "Status"), [["planned", pick("পরিকল্পিত", "Planned")], ["confirmed", pick("নিশ্চিত", "Confirmed")], ["completed", pick("সম্পন্ন", "Completed")], ["cancelled", pick("বাতিল", "Cancelled")]])}{notes}</div>;
  if (kind === "schedule") return <div className="grid gap-4 py-2 sm:grid-cols-2">{select("animalId", pick("পশু", "Animal"), animalItems)}{input("sequenceNo", pick("ক্রম", "Sequence"), "number", { min: "1" })}{input("scheduledAt", pick("নির্ধারিত সময়", "Scheduled time"), "datetime-local")}{input("location", pick("স্থান", "Location"))}{input("butcherTeam", pick("কসাই / দল", "Butcher / team"))}{select("status", pick("স্ট্যাটাস", "Status"), [["scheduled", pick("নির্ধারিত", "Scheduled")], ["in_progress", pick("চলমান", "In progress")], ["completed", pick("সম্পন্ন", "Completed")], ["delayed", pick("বিলম্বিত", "Delayed")]])}{notes}</div>;
  if (kind === "task") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("title", pick("কাজের শিরোনাম", "Task title"))}{select("category", pick("ক্যাটাগরি", "Category"), [["procurement", pick("ক্রয়", "Procurement")], ["finance", pick("অর্থ", "Finance")], ["logistics", pick("লজিস্টিকস", "Logistics")], ["slaughter", pick("কোরবানি", "Slaughter")], ["distribution", pick("বণ্টন", "Distribution")], ["cleanup", pick("পরিষ্কার", "Cleanup")]])}{input("assignedTo", pick("দায়িত্বপ্রাপ্ত স্বেচ্ছাসেবক", "Assigned volunteer"))}{input("dueAt", pick("সময়সীমা", "Deadline"), "datetime-local")}{select("priority", pick("অগ্রাধিকার", "Priority"), [["normal", pick("সাধারণ", "Normal")], ["high", pick("উচ্চ", "High")], ["urgent", pick("জরুরি", "Urgent")]])}{select("status", pick("স্ট্যাটাস", "Status"), [["todo", pick("করণীয়", "To do")], ["in_progress", pick("চলমান", "In progress")], ["completed", pick("সম্পন্ন", "Completed")], ["cancelled", pick("বাতিল", "Cancelled")]])}{notes}</div>;
  return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("recipientName", pick("গ্রহীতার নাম", "Recipient name"))}{select("recipientType", pick("গ্রহীতার ধরন", "Recipient type"), [["participant", pick("অংশগ্রহণকারী", "Participant")], ["family", pick("পরিবার", "Family")], ["relative", pick("আত্মীয়", "Relative")], ["needy", pick("অসহায়", "Needy")], ["worker", pick("কর্মী", "Worker")], ["other", pick("অন্যান্য", "Other")]])}{input("weightKg", pick("ওজন (কেজি)", "Weight kg"), "number", { min: "0", step: "0.01" })}{input("packageCount", pick("প্যাকেট সংখ্যা", "Package count"), "number", { min: "1" })}{input("collectedAt", pick("সংগ্রহের সময়", "Collected at"), "datetime-local")}{notes}</div>;
}
