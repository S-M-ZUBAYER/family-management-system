"use client";

import { useActionFeedback } from "@/components/action-modal-provider";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  Plus,
  ReceiptText,
  Scale,
  ShieldAlert,
  Truck,
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

type FormState = Record<string, string>;
type SectionKey =
  | "overview"
  | "participants"
  | "animals"
  | "ledger"
  | "vendors"
  | "schedule"
  | "tasks"
  | "distribution";

const campaignStatusLabels: Record<QurbaniCampaignStatus, string> = {
  planning: "পরিকল্পনা",
  registration: "রেজিস্ট্রেশন",
  procurement: "পশু ক্রয়",
  slaughter: "কোরবানির দিন",
  distribution: "বণ্টন",
  settled: "হিসাব নিষ্পত্তি",
  closed: "বন্ধ",
};

const workflow: QurbaniCampaignStatus[] = [
  "planning",
  "registration",
  "procurement",
  "slaughter",
  "distribution",
  "settled",
  "closed",
];

const kindLabels: Record<QurbaniRecordKind, string> = {
  participant: "অংশগ্রহণকারী ও শেয়ার",
  animal: "পশু",
  transaction: "লেনদেন",
  vendor: "Vendor",
  schedule: "কোরবানির সময়সূচি",
  task: "Task / Volunteer duty",
  distribution: "মাংস বণ্টন",
};

const tabToKind: Partial<Record<SectionKey, QurbaniRecordKind>> = {
  participants: "participant",
  animals: "animal",
  ledger: "transaction",
  vendors: "vendor",
  schedule: "schedule",
  tasks: "task",
  distribution: "distribution",
};

const moneyFormatter = new Intl.NumberFormat("bn-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("bn-BD", {
  dateStyle: "medium",
  timeStyle: "short",
});

const today = () => new Date().toISOString().slice(0, 10);
const numberOf = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [recordKind, setRecordKind] = useState<QurbaniRecordKind | null>(null);
  const [recordForm, setRecordForm] = useState<FormState>({});
  const [campaignForm, setCampaignForm] = useState<FormState>({
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
  });

  const loadQurbani = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/qurbani", { cache: "no-store" });
      const payload = (await response.json()) as QurbaniPayload;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        setSetupRequired(true);
        setCampaigns([]);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "কোরবানি operations পাওয়া যায়নি।");
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
      setSelectedCampaignId((current) => {
        if (current && payload.campaigns?.some((item) => item.id === current)) return current;
        return payload.campaigns?.[0]?.id ?? "";
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "কোরবানি operations load হয়নি।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQurbani();
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

  const totals = useMemo(() => {
    const activeParticipants = campaignParticipants.filter((item) => item.status !== "cancelled");
    const shares = activeParticipants.reduce((sum, item) => sum + numberOf(item.share_count), 0);
    const due = activeParticipants.reduce((sum, item) => sum + numberOf(item.amount_due), 0);
    const paid = activeParticipants.reduce((sum, item) => sum + numberOf(item.amount_paid), 0);
    const collected = campaignTransactions
      .filter((item) => item.transaction_type === "collection")
      .reduce((sum, item) => sum + numberOf(item.amount), 0);
    const expenses = campaignTransactions
      .filter((item) => item.transaction_type === "expense")
      .reduce((sum, item) => sum + numberOf(item.amount), 0);
    const refunds = campaignTransactions
      .filter((item) => item.transaction_type === "refund")
      .reduce((sum, item) => sum + numberOf(item.amount), 0);
    const animalBudget = campaignAnimals.reduce(
      (sum, item) =>
        sum +
        numberOf(item.purchase_price) +
        numberOf(item.transport_cost) +
        numberOf(item.feed_cost),
      0,
    );
    const meatEstimate = campaignAnimals.reduce(
      (sum, item) => sum + numberOf(item.estimated_meat_kg),
      0,
    );
    const distributed = campaignDistributions.reduce(
      (sum, item) => sum + numberOf(item.weight_kg),
      0,
    );
    const packages = campaignDistributions.reduce((sum, item) => sum + item.package_count, 0);
    const openTasks = campaignTasks.filter(
      (item) => item.status !== "completed" && item.status !== "cancelled",
    ).length;
    return {
      shares,
      due,
      paid,
      outstanding: Math.max(0, due - paid),
      collected,
      expenses,
      refunds,
      balance: collected - expenses - refunds,
      animalBudget,
      meatEstimate,
      distributed,
      packages,
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
      const response = await fetch("/api/qurbani/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignForm),
      });
      const payload = (await response.json()) as { campaign?: QurbaniCampaign; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error ?? "Campaign save হয়নি।");
      setCampaignOpen(false);
      await loadQurbani();
      setSelectedCampaignId(payload.campaign.id);
      setFeedback("নতুন কোরবানি campaign তৈরি হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  function openRecord(kind: QurbaniRecordKind) {
    setRecordForm(defaultRecordForm(kind));
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
      const response = await fetch("/api/qurbani/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: recordKind, campaignId: campaign.id, data: cleanData }),
      });
      const payload = (await response.json()) as { record?: unknown; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error ?? "Record save হয়নি।");
      const label = kindLabels[recordKind];
      setRecordKind(null);
      await loadQurbani();
      setFeedback(label + " record যোগ হয়েছে।");
    } finally {
      setSaving(false);
    }
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
      const payload = (await response.json()) as { record?: unknown; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error ?? "Status update হয়নি।");
      await loadQurbani();
      setFeedback("Status update হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  const summaryRows = campaign
    ? [
        {
          Campaign: campaign.title,
          Year: campaign.year,
          "Hijri year": campaign.hijri_year ?? "",
          Status: campaignStatusLabels[campaign.status],
          Location: campaign.location ?? "",
          "Slaughter date": campaign.slaughter_date ?? "",
          "Share price": numberOf(campaign.share_price),
          "Target shares": numberOf(campaign.target_shares),
          "Registered shares": totals.shares,
          "Participant dues": totals.due,
          "Participant paid": totals.paid,
          Outstanding: totals.outstanding,
          "Ledger collection": totals.collected,
          Expenses: totals.expenses,
          Refunds: totals.refunds,
          Balance: totals.balance,
          "Animals count": campaignAnimals.length,
          "Estimated meat kg": totals.meatEstimate,
          "Distributed kg": totals.distributed,
          Packages: totals.packages,
          "Open tasks": totals.openTasks,
        },
      ]
    : [];

  const participantRows = campaignParticipants.map((item, index) => ({
    SL: index + 1,
    Participant: item.member_name,
    Phone: item.phone ?? "",
    Animal: campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code ?? "",
    Shares: numberOf(item.share_count),
    Due: numberOf(item.amount_due),
    Paid: numberOf(item.amount_paid),
    Outstanding: Math.max(0, numberOf(item.amount_due) - numberOf(item.amount_paid)),
    Status: item.status,
    Notes: item.notes ?? "",
  }));
  const animalRows = campaignAnimals.map((item) => ({
    Tag: item.tag_code,
    Type: item.animal_type,
    Breed: item.breed ?? "",
    Color: item.color ?? "",
    "Live weight kg": numberOf(item.live_weight_kg),
    "Estimated meat kg": numberOf(item.estimated_meat_kg),
    "Purchase price": numberOf(item.purchase_price),
    Transport: numberOf(item.transport_cost),
    Feed: numberOf(item.feed_cost),
    Vendor: item.vendor_name ?? "",
    "Purchase date": item.purchase_date ?? "",
    Health: item.health_status,
    Status: item.status,
    "Vet notes": item.vet_notes ?? "",
  }));
  const ledgerRows = campaignTransactions.map((item) => ({
    Date: item.transaction_date,
    Type: item.transaction_type,
    Category: item.category,
    Amount: numberOf(item.amount),
    Method: item.payment_method,
    Participant:
      campaignParticipants.find((participant) => participant.id === item.participant_id)?.member_name ?? "",
    Animal: campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code ?? "",
    Reference: item.reference ?? "",
    Notes: item.notes ?? "",
  }));
  const vendorRows = campaignVendors.map((item) => ({
    Vendor: item.name,
    Type: item.vendor_type,
    Phone: item.phone ?? "",
    Address: item.address ?? "",
    Agreed: numberOf(item.agreed_amount),
    Paid: numberOf(item.paid_amount),
    Due: Math.max(0, numberOf(item.agreed_amount) - numberOf(item.paid_amount)),
    Status: item.status,
    Notes: item.notes ?? "",
  }));
  const scheduleRows = campaignSchedules.map((item) => ({
    Sequence: item.sequence_no,
    Animal: campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code ?? "",
    "Scheduled at": dateTimeFormatter.format(new Date(item.scheduled_at)),
    Location: item.location ?? "",
    Team: item.butcher_team ?? "",
    Status: item.status,
    Notes: item.notes ?? "",
  }));
  const taskRows = campaignTasks.map((item) => ({
    Task: item.title,
    Category: item.category,
    "Assigned to": item.assigned_to ?? "",
    Due: item.due_at ? dateTimeFormatter.format(new Date(item.due_at)) : "",
    Priority: item.priority,
    Status: item.status,
    Notes: item.notes ?? "",
  }));
  const distributionRows = campaignDistributions.map((item) => ({
    Recipient: item.recipient_name,
    Type: item.recipient_type,
    "Weight kg": numberOf(item.weight_kg),
    Packages: item.package_count,
    Collected: item.collected_at ? dateTimeFormatter.format(new Date(item.collected_at)) : "",
    Notes: item.notes ?? "",
  }));

  async function exportWorkbook(single?: { name: string; rows: Array<Record<string, unknown>> }) {
    if (!campaign) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const sheets = single
        ? [single]
        : [
            { name: "Campaign Summary", rows: summaryRows },
            { name: "Participants", rows: participantRows },
            { name: "Animals", rows: animalRows },
            { name: "Ledger", rows: ledgerRows },
            { name: "Vendors", rows: vendorRows },
            { name: "Schedule", rows: scheduleRows },
            { name: "Tasks", rows: taskRows },
            { name: "Distribution", rows: distributionRows },
          ];
      sheets.forEach((sheet) => {
        const data = sheet.rows.length ? sheet.rows : [{ Information: "No records yet" }];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), sheet.name.slice(0, 31));
      });
      const baseName =
        (family?.name_en || "family").replace(/[^a-z0-9]+/gi, "-").toLowerCase() +
        "-qurbani-" +
        campaign.year;
      XLSX.writeFile(workbook, baseName + (single ? "-" + single.name.toLowerCase() : "-complete") + ".xlsx");
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
              ledgerCollection: totals.collected,
              expense: totals.expenses,
              balance: totals.balance,
            },
            animals: campaignAnimals.length,
            meat: { estimatedKg: totals.meatEstimate, distributedKg: totals.distributed },
            openTasks: totals.openTasks,
          }),
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [campaign, campaignAnimals.length, totals]);

  if (setupRequired) {
    return (
      <StateCard
        icon={<ShieldAlert />}
        title="প্রথমে family workspace তৈরি করুন"
        text="কোরবানি operations family-wise আলাদা রাখতে setup সম্পন্ন করা প্রয়োজন।"
        action={<Button asChild className="rounded-xl"><a href="/setup">Family setup খুলুন</a></Button>}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1550px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <CalendarDays className="size-4" /> Qurbani A–Z Operations
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">কোরবানি ম্যানেজমেন্ট সিস্টেম</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Campaign, shares, পশু, health, collection, expense, vendor, schedule, volunteer duty, বণ্টন ও final settlement।
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {campaigns.length ? (
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="w-[220px] rounded-xl bg-card">
                <SelectValue placeholder="Campaign নির্বাচন" />
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
            disabled={!campaign || exporting}
            onClick={() => void exportWorkbook()}
          >
            {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            Complete XLSX
          </Button>
          {canManage && !migrationRequired ? (
            <Button className="gap-2 rounded-xl" onClick={() => setCampaignOpen(true)}>
              <Plus className="size-4" /> নতুন Campaign
            </Button>
          ) : null}
        </div>
      </section>

      {feedback ? (
        <div className="flex items-start justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
          <span>{feedback}</span>
          <button type="button" className="text-muted-foreground" onClick={() => setFeedback(null)}>বন্ধ</button>
        </div>
      ) : null}

      {migrationRequired ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <p className="font-bold">Qurbani database migration প্রয়োজন</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Supabase SQL Editor-এ supabase/migrations/20260926_qurbani_a_to_z.sql একবার চালান। UI প্রস্তুত আছে; migration শেষ হলেই live records সক্রিয় হবে।
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
      ) : !campaign ? (
        <StateCard
          icon={<CircleDollarSign />}
          title="প্রথম Qurbani campaign তৈরি করুন"
          text="Year, share price, target, registration deadline ও location দিয়ে শুরু করুন।"
          action={
            canManage && !migrationRequired ? (
              <Button className="gap-2 rounded-xl" onClick={() => setCampaignOpen(true)}>
                <Plus className="size-4" /> Campaign তৈরি করুন
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <Metric icon={<Users />} label="নিবন্ধিত শেয়ার" value={numberFormatter.format(totals.shares) + " / " + numberFormatter.format(numberOf(campaign.target_shares))} note={Math.round(shareProgress) + "% পূর্ণ"} />
            <Metric icon={<HandCoins />} label="পরিশোধ" value={moneyFormatter.format(totals.paid)} note={moneyFormatter.format(totals.outstanding) + " বকেয়া"} />
            <Metric icon={<CircleDollarSign />} label="Ledger balance" value={moneyFormatter.format(totals.balance)} note={moneyFormatter.format(totals.expenses) + " expense"} />
            <Metric icon={<Truck />} label="মোট পশু" value={numberFormatter.format(campaignAnimals.length)} note={moneyFormatter.format(totals.animalBudget) + " procurement"} />
            <Metric icon={<Scale />} label="Meat progress" value={numberFormatter.format(totals.distributed) + " kg"} note={numberFormatter.format(totals.meatEstimate) + " kg estimated"} />
            <Metric icon={<ClipboardCheck />} label="বাকি কাজ" value={numberFormatter.format(totals.openTasks)} note={numberFormatter.format(campaignTasks.length) + " total tasks"} />
          </section>

          <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
            <CardContent className="p-0">
              <div className="flex flex-col gap-5 border-b p-5 md:flex-row md:items-center md:justify-between md:p-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">{campaign.title}</h2>
                    <StatusBadge value={campaign.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[campaign.hijri_year, campaign.location, campaign.slaughter_date ? dateFormatter.format(new Date(campaign.slaughter_date + "T00:00:00")) : null].filter(Boolean).join(" · ") || "Campaign details"}
                  </p>
                </div>
                {canManage ? (
                  <CampaignStatusMenu
                    disabled={saving}
                    onSelect={(status) => void updateStatus("campaign", campaign.id, status)}
                  />
                ) : null}
              </div>
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
              <TabsTrigger value="overview" className="rounded-xl px-4 py-2.5">Overview</TabsTrigger>
              <TabsTrigger value="participants" className="rounded-xl px-4 py-2.5">Shares ({campaignParticipants.length})</TabsTrigger>
              <TabsTrigger value="animals" className="rounded-xl px-4 py-2.5">Animals ({campaignAnimals.length})</TabsTrigger>
              <TabsTrigger value="ledger" className="rounded-xl px-4 py-2.5">Ledger ({campaignTransactions.length})</TabsTrigger>
              <TabsTrigger value="vendors" className="rounded-xl px-4 py-2.5">Vendors ({campaignVendors.length})</TabsTrigger>
              <TabsTrigger value="schedule" className="rounded-xl px-4 py-2.5">Schedule ({campaignSchedules.length})</TabsTrigger>
              <TabsTrigger value="tasks" className="rounded-xl px-4 py-2.5">Tasks ({campaignTasks.length})</TabsTrigger>
              <TabsTrigger value="distribution" className="rounded-xl px-4 py-2.5">Distribution ({campaignDistributions.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
                <Card className="rounded-3xl py-0 shadow-none">
                  <CardHeader className="p-5 pb-2 md:p-6 md:pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>Operational progress</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">Registration থেকে distribution পর্যন্ত readiness</p>
                      </div>
                      <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => void exportWorkbook({ name: "Campaign Summary", rows: summaryRows })}>
                        <Download className="size-4" /> XLSX
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 p-5 pt-4 md:p-6 md:pt-4">
                    <ProgressLine label="শেয়ার registration" value={shareProgress} detail={numberFormatter.format(totals.shares) + " shares"} />
                    <ProgressLine label="Participant payment" value={paymentProgress} detail={moneyFormatter.format(totals.paid)} />
                    <ProgressLine label="Meat distribution" value={distributionProgress} detail={numberFormatter.format(totals.distributed) + " kg"} />
                    <ProgressLine label="Task completion" value={campaignTasks.length ? ((campaignTasks.length - totals.openTasks) / campaignTasks.length) * 100 : 0} detail={numberFormatter.format(campaignTasks.length - totals.openTasks) + " completed"} />
                  </CardContent>
                </Card>
                <Card className="rounded-3xl bg-primary py-0 text-primary-foreground shadow-none">
                  <CardContent className="p-6">
                    <ReceiptText className="size-7" />
                    <p className="mt-5 text-sm text-primary-foreground/70">Final settlement position</p>
                    <p className="mt-1 text-3xl font-bold">{moneyFormatter.format(totals.balance)}</p>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <MiniStat label="Collection" value={moneyFormatter.format(totals.collected)} />
                      <MiniStat label="Expenses" value={moneyFormatter.format(totals.expenses)} />
                      <MiniStat label="Refunds" value={moneyFormatter.format(totals.refunds)} />
                      <MiniStat label="Participant due" value={moneyFormatter.format(totals.outstanding)} />
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <QuickCard icon={<Truck />} title="Procurement control" text={campaignAnimals.filter((item) => item.health_status === "fit").length + " fit · " + campaignAnimals.filter((item) => item.health_status === "observation").length + " under observation"} />
                <QuickCard icon={<ClipboardCheck />} title="Volunteer control" text={totals.openTasks + " pending · " + campaignTasks.filter((item) => item.priority === "urgent" && item.status !== "completed").length + " urgent"} />
                <QuickCard icon={<PackageCheck />} title="Distribution control" text={numberFormatter.format(totals.packages) + " packages · " + numberFormatter.format(totals.distributed) + " kg"} />
              </div>
            </TabsContent>

            <TabsContent value="participants">
              <DataSection title="অংশগ্রহণকারী, শেয়ার ও পাওনা" description="Family member-wise allocation, due এবং payment status" canAdd={canManage} onAdd={() => openRecord("participant")} onExport={() => void exportWorkbook({ name: "Participants", rows: participantRows })}>
                <Table><TableHeader><TableRow><TableHead>অংশগ্রহণকারী</TableHead><TableHead>Animal</TableHead><TableHead>Shares</TableHead><TableHead>Due</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignParticipants.map((item) => <TableRow key={item.id}><TableCell><p className="font-semibold">{item.member_name}</p><p className="text-xs text-muted-foreground">{item.phone || "Phone private"}</p></TableCell><TableCell>{campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code || "Unassigned"}</TableCell><TableCell>{numberFormatter.format(numberOf(item.share_count))}</TableCell><TableCell>{moneyFormatter.format(numberOf(item.amount_due))}</TableCell><TableCell>{moneyFormatter.format(numberOf(item.amount_paid))}</TableCell><TableCell><StatusBadge value={item.status} /></TableCell>{canManage ? <TableCell><StatusMenu disabled={saving} values={["pending", "confirmed", "cancelled"]} onSelect={(status) => void updateStatus("participant", item.id, status)} /></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignParticipants.length} columns={canManage ? 7 : 6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="animals">
              <DataSection title="পশু ক্রয়, health ও costing" description="Tag, vendor, weight, veterinary check এবং lifecycle" canAdd={canManage} onAdd={() => openRecord("animal")} onExport={() => void exportWorkbook({ name: "Animals", rows: animalRows })}>
                <Table><TableHeader><TableRow><TableHead>Tag / Type</TableHead><TableHead>Weight</TableHead><TableHead>Price + logistics</TableHead><TableHead>Vendor</TableHead><TableHead>Health</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignAnimals.map((item) => <TableRow key={item.id}><TableCell><p className="font-bold">{item.tag_code}</p><p className="text-xs text-muted-foreground">{item.animal_type} · {item.breed || "Breed not set"}</p></TableCell><TableCell>{numberFormatter.format(numberOf(item.live_weight_kg))} kg<p className="text-xs text-muted-foreground">{numberFormatter.format(numberOf(item.estimated_meat_kg))} kg yield</p></TableCell><TableCell>{moneyFormatter.format(numberOf(item.purchase_price))}<p className="text-xs text-muted-foreground">+ {moneyFormatter.format(numberOf(item.transport_cost) + numberOf(item.feed_cost))}</p></TableCell><TableCell>{item.vendor_name || "Not set"}</TableCell><TableCell><StatusBadge value={item.health_status} /></TableCell><TableCell><StatusBadge value={item.status} /></TableCell>{canManage ? <TableCell><StatusMenu disabled={saving} values={["shortlisted", "purchased", "received", "slaughtered", "cancelled"]} onSelect={(status) => void updateStatus("animal", item.id, status)} /></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignAnimals.length} columns={canManage ? 7 : 6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="ledger">
              <DataSection title="Collection, expense ও refund ledger" description="Immutable financial entries with category, method ও reference" canAdd={canManage} onAdd={() => openRecord("transaction")} onExport={() => void exportWorkbook({ name: "Ledger", rows: ledgerRows })}>
                <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Category</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Linked record</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader><TableBody>
                  {campaignTransactions.map((item) => <TableRow key={item.id}><TableCell>{dateFormatter.format(new Date(item.transaction_date + "T00:00:00"))}</TableCell><TableCell><StatusBadge value={item.transaction_type} /></TableCell><TableCell>{item.category.replaceAll("_", " ")}</TableCell><TableCell className="font-bold">{moneyFormatter.format(numberOf(item.amount))}</TableCell><TableCell>{item.payment_method}</TableCell><TableCell>{campaignParticipants.find((participant) => participant.id === item.participant_id)?.member_name || campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code || "General"}</TableCell><TableCell>{item.reference || "—"}</TableCell></TableRow>)}
                  <EmptyRows show={!campaignTransactions.length} columns={7} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="vendors">
              <DataSection title="Vendor ও service provider control" description="Animal seller, butcher, transport, feed ও equipment providers" canAdd={canManage} onAdd={() => openRecord("vendor")} onExport={() => void exportWorkbook({ name: "Vendors", rows: vendorRows })}>
                <Table><TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Type</TableHead><TableHead>Contact</TableHead><TableHead>Agreed</TableHead><TableHead>Paid / Due</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignVendors.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.name}</TableCell><TableCell>{item.vendor_type.replaceAll("_", " ")}</TableCell><TableCell>{item.phone || "Private"}<p className="max-w-52 truncate text-xs text-muted-foreground">{item.address}</p></TableCell><TableCell>{moneyFormatter.format(numberOf(item.agreed_amount))}</TableCell><TableCell>{moneyFormatter.format(numberOf(item.paid_amount))}<p className="text-xs text-muted-foreground">{moneyFormatter.format(Math.max(0, numberOf(item.agreed_amount) - numberOf(item.paid_amount)))} due</p></TableCell><TableCell><StatusBadge value={item.status} /></TableCell>{canManage ? <TableCell><StatusMenu disabled={saving} values={["planned", "confirmed", "completed", "cancelled"]} onSelect={(status) => void updateStatus("vendor", item.id, status)} /></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignVendors.length} columns={canManage ? 7 : 6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="schedule">
              <DataSection title="কোরবানির day schedule" description="Animal sequence, slot, location এবং butcher team" canAdd={canManage} onAdd={() => openRecord("schedule")} onExport={() => void exportWorkbook({ name: "Schedule", rows: scheduleRows })}>
                <Table><TableHeader><TableRow><TableHead>Sequence</TableHead><TableHead>Animal</TableHead><TableHead>Time</TableHead><TableHead>Location</TableHead><TableHead>Team</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignSchedules.map((item) => <TableRow key={item.id}><TableCell className="font-bold">#{item.sequence_no}</TableCell><TableCell>{campaignAnimals.find((animal) => animal.id === item.animal_id)?.tag_code || "General slot"}</TableCell><TableCell>{dateTimeFormatter.format(new Date(item.scheduled_at))}</TableCell><TableCell>{item.location || campaign.location || "Not set"}</TableCell><TableCell>{item.butcher_team || "Unassigned"}</TableCell><TableCell><StatusBadge value={item.status} /></TableCell>{canManage ? <TableCell><StatusMenu disabled={saving} values={["scheduled", "in_progress", "completed", "delayed"]} onSelect={(status) => void updateStatus("schedule", item.id, status)} /></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignSchedules.length} columns={canManage ? 7 : 6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="tasks">
              <DataSection title="Task ও volunteer duty board" description="Procurement, finance, logistics, slaughter, distribution ও cleanup" canAdd={canManage} onAdd={() => openRecord("task")} onExport={() => void exportWorkbook({ name: "Tasks", rows: taskRows })}>
                <Table><TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Category</TableHead><TableHead>Assigned</TableHead><TableHead>Due</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader><TableBody>
                  {campaignTasks.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.title}</TableCell><TableCell>{item.category}</TableCell><TableCell>{item.assigned_to || "Unassigned"}</TableCell><TableCell>{item.due_at ? dateTimeFormatter.format(new Date(item.due_at)) : "No deadline"}</TableCell><TableCell><StatusBadge value={item.priority} /></TableCell><TableCell><StatusBadge value={item.status} /></TableCell>{canManage ? <TableCell><StatusMenu disabled={saving} values={["todo", "in_progress", "completed", "cancelled"]} onSelect={(status) => void updateStatus("task", item.id, status)} /></TableCell> : null}</TableRow>)}
                  <EmptyRows show={!campaignTasks.length} columns={canManage ? 7 : 6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>

            <TabsContent value="distribution">
              <DataSection title="মাংস ও package distribution" description="Participant, আত্মীয়, দরিদ্র, worker ও family allocation" canAdd={canManage} onAdd={() => openRecord("distribution")} onExport={() => void exportWorkbook({ name: "Distribution", rows: distributionRows })}>
                <Table><TableHeader><TableRow><TableHead>Recipient</TableHead><TableHead>Type</TableHead><TableHead>Weight</TableHead><TableHead>Packages</TableHead><TableHead>Collected</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader><TableBody>
                  {campaignDistributions.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.recipient_name}</TableCell><TableCell><StatusBadge value={item.recipient_type} /></TableCell><TableCell>{numberFormatter.format(numberOf(item.weight_kg))} kg</TableCell><TableCell>{numberFormatter.format(item.package_count)}</TableCell><TableCell>{item.collected_at ? dateTimeFormatter.format(new Date(item.collected_at)) : "Pending"}</TableCell><TableCell className="max-w-72 truncate">{item.notes || "—"}</TableCell></TableRow>)}
                  <EmptyRows show={!campaignDistributions.length} columns={6} />
                </TableBody></Table>
              </DataSection>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>নতুন Qurbani campaign</DialogTitle>
            <DialogDescription>বছরভিত্তিক সম্পূর্ণ operation-এর master setup তৈরি করুন।</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <FormField label="Campaign name" id="campaign-title"><Input id="campaign-title" value={campaignForm.title} onChange={(event) => setCampaignForm({ ...campaignForm, title: event.target.value })} /></FormField>
            <FormField label="Year" id="campaign-year"><Input id="campaign-year" type="number" min="2000" max="2200" value={campaignForm.year} onChange={(event) => setCampaignForm({ ...campaignForm, year: event.target.value })} /></FormField>
            <FormField label="Hijri year" id="campaign-hijri"><Input id="campaign-hijri" value={campaignForm.hijriYear} onChange={(event) => setCampaignForm({ ...campaignForm, hijriYear: event.target.value })} /></FormField>
            <FormField label="Initial status" id="campaign-status"><ValueSelect id="campaign-status" value={campaignForm.status} onChange={(value) => setCampaignForm({ ...campaignForm, status: value })} items={[["planning", "পরিকল্পনা"], ["registration", "Registration open"]]} /></FormField>
            <FormField label="Share price" id="campaign-share-price"><Input id="campaign-share-price" type="number" min="0" value={campaignForm.sharePrice} onChange={(event) => setCampaignForm({ ...campaignForm, sharePrice: event.target.value })} /></FormField>
            <FormField label="Target shares" id="campaign-target"><Input id="campaign-target" type="number" min="1" step="0.01" value={campaignForm.targetShares} onChange={(event) => setCampaignForm({ ...campaignForm, targetShares: event.target.value })} /></FormField>
            <FormField label="Registration deadline" id="campaign-deadline"><Input id="campaign-deadline" type="datetime-local" value={campaignForm.registrationDeadline} onChange={(event) => setCampaignForm({ ...campaignForm, registrationDeadline: event.target.value })} /></FormField>
            <FormField label="Slaughter date" id="campaign-slaughter-date"><Input id="campaign-slaughter-date" type="date" value={campaignForm.slaughterDate} onChange={(event) => setCampaignForm({ ...campaignForm, slaughterDate: event.target.value })} /></FormField>
            <div className="sm:col-span-2"><FormField label="Location" id="campaign-location"><Input id="campaign-location" value={campaignForm.location} onChange={(event) => setCampaignForm({ ...campaignForm, location: event.target.value })} /></FormField></div>
            <div className="sm:col-span-2"><FormField label="Notes" id="campaign-notes"><Textarea id="campaign-notes" rows={4} value={campaignForm.notes} onChange={(event) => setCampaignForm({ ...campaignForm, notes: event.target.value })} /></FormField></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setCampaignOpen(false)}>বাতিল</Button>
            <Button className="gap-2 rounded-xl" disabled={saving || campaignForm.title.trim().length < 3 || !campaignForm.year || !campaignForm.targetShares} onClick={() => void createCampaign().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Campaign save হয়নি।"))}>
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Campaign তৈরি করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(recordKind)} onOpenChange={(open) => !open && setRecordKind(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{recordKind ? kindLabels[recordKind] : "নতুন record"} যোগ করুন</DialogTitle>
            <DialogDescription>{campaign?.title} campaign-এর verified operational record।</DialogDescription>
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
            <Button variant="outline" className="rounded-xl" onClick={() => setRecordKind(null)}>বাতিল</Button>
            <Button className="gap-2 rounded-xl" disabled={saving} onClick={() => void createRecord().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Record save হয়নি।"))}>
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Record save করুন
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
  return <Card className="gap-0 overflow-hidden rounded-3xl py-0 shadow-none"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={onExport}><Download className="size-4" /> XLSX</Button>{canAdd ? <Button size="sm" className="gap-2 rounded-xl" onClick={onAdd}><Plus className="size-4" /> Add</Button> : null}</div></div><div className="overflow-x-auto">{children}</div></Card>;
}

function EmptyRows({ show, columns }: { show: boolean; columns: number }) {
  return show ? <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">এখনও কোনো record নেই। Add বাটন দিয়ে শুরু করুন।</TableCell></TableRow> : null;
}

function StateCard({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <main className="mx-auto w-full max-w-[1500px] px-4 py-10 md:px-7"><Card className="rounded-3xl py-0 shadow-none"><CardContent className="flex min-h-96 flex-col items-center justify-center p-8 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><h1 className="mt-5 text-2xl font-bold">{title}</h1><p className="mt-2 max-w-xl text-muted-foreground">{text}</p>{action ? <div className="mt-6">{action}</div> : null}</CardContent></Card></main>;
}

function StatusBadge({ value }: { value: string }) {
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
  return <Badge variant="secondary" className={className}>{campaignStatusLabels[value as QurbaniCampaignStatus] ?? value.replaceAll("_", " ")}</Badge>;
}

function StatusMenu({ values, onSelect, disabled }: { values: string[]; onSelect: (value: string) => void; disabled: boolean }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-xl" disabled={disabled}><MoreHorizontal className="size-4" /><span className="sr-only">Status actions</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{values.map((value) => <DropdownMenuItem key={value} onClick={() => onSelect(value)}>{value.replaceAll("_", " ")}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function CampaignStatusMenu({ onSelect, disabled }: { onSelect: (value: string) => void; disabled: boolean }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="gap-2 rounded-xl" disabled={disabled}><MoreHorizontal className="size-4" /> Workflow status</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{workflow.map((value) => <DropdownMenuItem key={value} onClick={() => onSelect(value)}>{campaignStatusLabels[value]}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function FormField({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function ValueSelect({ id, value, onChange, items }: { id: string; value: string; onChange: (value: string) => void; items: Array<[string, string]> }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger id={id} className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{items.map(([itemValue, label]) => <SelectItem key={itemValue} value={itemValue}>{label}</SelectItem>)}</SelectContent></Select>;
}

function RecordFields({ kind, form, setForm, animals, participants }: { kind: QurbaniRecordKind; form: FormState; setForm: (value: FormState) => void; animals: QurbaniAnimal[]; participants: QurbaniParticipant[] }) {
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });
  const input = (key: string, label: string, type = "text", options?: { min?: string; step?: string }) => <FormField label={label} id={"record-" + key}><Input id={"record-" + key} type={type} min={options?.min} step={options?.step} value={form[key] ?? ""} onChange={(event) => set(key, event.target.value)} /></FormField>;
  const select = (key: string, label: string, items: Array<[string, string]>) => <FormField label={label} id={"record-" + key}><ValueSelect id={"record-" + key} value={form[key] ?? items[0]?.[0] ?? ""} onChange={(value) => set(key, value)} items={items} /></FormField>;
  const notes = <div className="sm:col-span-2"><FormField label="Notes" id="record-notes"><Textarea id="record-notes" rows={3} value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} /></FormField></div>;
  const animalItems: Array<[string, string]> = [["none", "Unassigned"], ...animals.map((item) => [item.id, item.tag_code] as [string, string])];
  const participantItems: Array<[string, string]> = [["none", "General / none"], ...participants.map((item) => [item.id, item.member_name] as [string, string])];

  if (kind === "participant") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("memberName", "Participant name")}{input("phone", "Phone")}{input("shareCount", "Share count", "number", { min: "0.01", step: "0.01" })}{select("animalId", "Animal assignment", animalItems)}{input("amountDue", "Amount due (blank = auto)", "number", { min: "0" })}{input("amountPaid", "Amount paid", "number", { min: "0" })}{select("status", "Status", [["pending", "Pending"], ["confirmed", "Confirmed"], ["cancelled", "Cancelled"]])}{notes}</div>;
  if (kind === "animal") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("tagCode", "Tag code")}{select("animalType", "Animal type", [["cow", "Cow"], ["goat", "Goat"], ["sheep", "Sheep"], ["buffalo", "Buffalo"]])}{input("breed", "Breed")}{input("color", "Color")}{input("liveWeightKg", "Live weight kg", "number", { min: "0", step: "0.01" })}{input("estimatedMeatKg", "Estimated meat kg", "number", { min: "0", step: "0.01" })}{input("purchasePrice", "Purchase price", "number", { min: "0" })}{input("vendorName", "Vendor name")}{input("transportCost", "Transport cost", "number", { min: "0" })}{input("feedCost", "Feed cost", "number", { min: "0" })}{input("purchaseDate", "Purchase date", "date")}{select("healthStatus", "Health status", [["pending", "Pending check"], ["fit", "Fit"], ["observation", "Observation"], ["rejected", "Rejected"]])}{select("status", "Procurement status", [["shortlisted", "Shortlisted"], ["purchased", "Purchased"], ["received", "Received"], ["slaughtered", "Slaughtered"], ["cancelled", "Cancelled"]])}{input("vetNotes", "Veterinary notes")}{notes}</div>;
  if (kind === "transaction") return <div className="grid gap-4 py-2 sm:grid-cols-2">{select("transactionType", "Transaction type", [["collection", "Collection"], ["expense", "Expense"], ["refund", "Refund"]])}{select("category", "Category", [["share_payment", "Share payment"], ["animal_purchase", "Animal purchase"], ["transport", "Transport"], ["feed", "Feed"], ["butcher", "Butcher"], ["logistics", "Logistics"], ["equipment", "Equipment"], ["distribution", "Distribution"], ["misc", "Miscellaneous"]])}{input("amount", "Amount", "number", { min: "0.01" })}{select("paymentMethod", "Payment method", [["cash", "Cash"], ["bank", "Bank"], ["mobile", "Mobile banking"], ["other", "Other"]])}{input("transactionDate", "Transaction date", "date")}{input("reference", "Reference")}{select("participantId", "Participant", participantItems)}{select("animalId", "Animal", animalItems)}{notes}</div>;
  if (kind === "vendor") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("name", "Vendor / provider name")}{select("vendorType", "Provider type", [["animal_seller", "Animal seller"], ["butcher", "Butcher"], ["transport", "Transport"], ["feed", "Feed"], ["equipment", "Equipment"], ["other", "Other"]])}{input("phone", "Phone")}{input("address", "Address")}{input("agreedAmount", "Agreed amount", "number", { min: "0" })}{input("paidAmount", "Paid amount", "number", { min: "0" })}{select("status", "Status", [["planned", "Planned"], ["confirmed", "Confirmed"], ["completed", "Completed"], ["cancelled", "Cancelled"]])}{notes}</div>;
  if (kind === "schedule") return <div className="grid gap-4 py-2 sm:grid-cols-2">{select("animalId", "Animal", animalItems)}{input("sequenceNo", "Sequence", "number", { min: "1" })}{input("scheduledAt", "Scheduled time", "datetime-local")}{input("location", "Location")}{input("butcherTeam", "Butcher / team")}{select("status", "Status", [["scheduled", "Scheduled"], ["in_progress", "In progress"], ["completed", "Completed"], ["delayed", "Delayed"]])}{notes}</div>;
  if (kind === "task") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("title", "Task title")}{select("category", "Category", [["procurement", "Procurement"], ["finance", "Finance"], ["logistics", "Logistics"], ["slaughter", "Slaughter"], ["distribution", "Distribution"], ["cleanup", "Cleanup"]])}{input("assignedTo", "Assigned volunteer")}{input("dueAt", "Deadline", "datetime-local")}{select("priority", "Priority", [["normal", "Normal"], ["high", "High"], ["urgent", "Urgent"]])}{select("status", "Status", [["todo", "To do"], ["in_progress", "In progress"], ["completed", "Completed"], ["cancelled", "Cancelled"]])}{notes}</div>;
  return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("recipientName", "Recipient name")}{select("recipientType", "Recipient type", [["participant", "Participant"], ["family", "Family"], ["relative", "Relative"], ["needy", "Needy"], ["worker", "Worker"], ["other", "Other"]])}{input("weightKg", "Weight kg", "number", { min: "0", step: "0.01" })}{input("packageCount", "Package count", "number", { min: "1" })}{input("collectedAt", "Collected at", "datetime-local")}{notes}</div>;
}
