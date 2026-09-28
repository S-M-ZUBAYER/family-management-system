"use client";

import { useActionFeedback } from "@/components/action-modal-provider";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  PiggyBank,
  Plus,
  ReceiptText,
  ShieldCheck,
  Target,
  WalletCards,
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
  FinanceAccount,
  FinanceBill,
  FinanceBudget,
  FinanceDebt,
  FinanceGoal,
  FinancePayload,
  FinanceRecordKind,
  FinanceTransaction,
} from "@/lib/personal-finance-types";

type FormState = Record<string, string>;
type ProgressTarget = {
  entity: "debt" | "goal";
  id: string;
  title: string;
  amount: string;
  maximum: number;
} | null;

const money = new Intl.NumberFormat("bn-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 0,
});
const date = new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium" });
const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const valueOf = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

const categorySuggestions = [
  "Salary",
  "Business",
  "Food",
  "Transport",
  "Housing",
  "Utilities",
  "Medical",
  "Education",
  "Shopping",
  "Travel",
  "Charity",
  "Other",
];

const kindLabels: Record<FinanceRecordKind, string> = {
  account: "Account / Wallet",
  transaction: "Income or Expense",
  budget: "Monthly Budget",
  debt: "Debt / Lending",
  bill: "Bill Reminder",
  goal: "Savings Goal",
};

function initialForm(kind: FinanceRecordKind): FormState {
  if (kind === "account") return { accountType: "cash", openingBalance: "0" };
  if (kind === "transaction") return { accountId: "", direction: "expense", category: "Food", amount: "", transactionDate: today(), paymentMethod: "cash", isRecurring: "false" };
  if (kind === "budget") return { budgetMonth: currentMonth(), category: "Food", limitAmount: "", alertPercent: "80" };
  if (kind === "debt") return { debtType: "lent", principalAmount: "", settledAmount: "0", dueDate: "" };
  if (kind === "bill") return { category: "Utilities", amount: "", dueDate: today(), recurrence: "monthly" };
  return { targetAmount: "", currentAmount: "0", targetDate: "" };
}

export function PersonalFinanceCenter() {
  const [family, setFamily] = useState<FinancePayload["family"]>();
  const [viewer, setViewer] = useState<FinancePayload["viewer"]>();
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [budgets, setBudgets] = useState<FinanceBudget[]>([]);
  const [debts, setDebts] = useState<FinanceDebt[]>([]);
  const [bills, setBills] = useState<FinanceBill[]>([]);
  const [goals, setGoals] = useState<FinanceGoal[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [recordKind, setRecordKind] = useState<FinanceRecordKind | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [progressTarget, setProgressTarget] = useState<ProgressTarget>(null);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/finance", { cache: "no-store" });
      const payload = (await response.json()) as FinancePayload;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        setSetupRequired(true);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "ব্যক্তিগত হিসাব পাওয়া যায়নি।");
      setFamily(payload.family);
      setViewer(payload.viewer);
      setAccounts(payload.accounts ?? []);
      setTransactions(payload.transactions ?? []);
      setBudgets(payload.budgets ?? []);
      setDebts(payload.debts ?? []);
      setBills(payload.bills ?? []);
      setGoals(payload.goals ?? []);
      setMigrationRequired(Boolean(payload.migrationRequired));
      setSetupRequired(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "ব্যক্তিগত হিসাব load হয়নি।");
    } finally {
      setLoading(false);
    }
  }, [setFeedback]);

  useEffect(() => {
    queueMicrotask(() => void loadFinance());
  }, [loadFinance]);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === "active"),
    [accounts],
  );
  const monthTransactions = useMemo(
    () => transactions.filter((item) => item.transaction_date.startsWith(month)),
    [transactions, month],
  );
  const monthBudgets = useMemo(
    () => budgets.filter((item) => item.budget_month.startsWith(month)),
    [budgets, month],
  );

  const accountBalance = useCallback(
    (account: FinanceAccount) => {
      const activity = transactions
        .filter((item) => item.account_id === account.id)
        .reduce(
          (sum, item) =>
            sum + (item.direction === "income" ? valueOf(item.amount) : -valueOf(item.amount)),
          0,
        );
      return valueOf(account.opening_balance) + activity;
    },
    [transactions],
  );

  const totals = useMemo(() => {
    const income = monthTransactions
      .filter((item) => item.direction === "income")
      .reduce((sum, item) => sum + valueOf(item.amount), 0);
    const expense = monthTransactions
      .filter((item) => item.direction === "expense")
      .reduce((sum, item) => sum + valueOf(item.amount), 0);
    const balance = activeAccounts.reduce((sum, account) => sum + accountBalance(account), 0);
    const budgetLimit = monthBudgets.reduce((sum, item) => sum + valueOf(item.limit_amount), 0);
    const lentOutstanding = debts
      .filter((item) => item.debt_type === "lent" && item.status !== "settled")
      .reduce((sum, item) => sum + Math.max(0, valueOf(item.principal_amount) - valueOf(item.settled_amount)), 0);
    const borrowedOutstanding = debts
      .filter((item) => item.debt_type === "borrowed" && item.status !== "settled")
      .reduce((sum, item) => sum + Math.max(0, valueOf(item.principal_amount) - valueOf(item.settled_amount)), 0);
    const pendingBills = bills.filter((item) => item.status === "pending");
    return {
      income,
      expense,
      net: income - expense,
      balance,
      budgetLimit,
      budgetUsed: budgetLimit ? Math.min(100, (expense / budgetLimit) * 100) : 0,
      lentOutstanding,
      borrowedOutstanding,
      pendingBills: pendingBills.length,
      pendingBillAmount: pendingBills.reduce((sum, item) => sum + valueOf(item.amount), 0),
    };
  }, [monthTransactions, activeAccounts, accountBalance, monthBudgets, debts, bills]);

  const expenseCategories = useMemo(() => {
    const grouped = new Map<string, number>();
    monthTransactions
      .filter((item) => item.direction === "expense")
      .forEach((item) => grouped.set(item.category, (grouped.get(item.category) ?? 0) + valueOf(item.amount)));
    return [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthTransactions]);

  function openRecord(kind: FinanceRecordKind) {
    const defaults = initialForm(kind);
    if (kind === "transaction") defaults.accountId = activeAccounts[0]?.id ?? "";
    setForm(defaults);
    setRecordKind(kind);
  }

  async function saveRecord() {
    if (!recordKind) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/finance/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: recordKind, data: form }),
      });
      const payload = (await response.json()) as { record?: unknown; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error ?? "Record save হয়নি।");
      const label = kindLabels[recordKind];
      setRecordKind(null);
      await loadFinance();
      setFeedback(label + " save হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(entity: "account" | "bill", id: string, status: string) {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/finance/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, id, status }),
      });
      const payload = (await response.json()) as { record?: unknown; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error ?? "Update হয়নি।");
      await loadFinance();
      setFeedback("Record update হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  async function saveProgress() {
    if (!progressTarget) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/finance/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: progressTarget.entity,
          id: progressTarget.id,
          amount: progressTarget.amount,
        }),
      });
      const payload = (await response.json()) as { record?: unknown; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error ?? "Progress update হয়নি।");
      setProgressTarget(null);
      await loadFinance();
      setFeedback("Progress amount update হয়েছে।");
    } finally {
      setSaving(false);
    }
  }

  const summaryRows = [{
    Month: month,
    "Current balance": totals.balance,
    Income: totals.income,
    Expense: totals.expense,
    "Net cashflow": totals.net,
    "Budget limit": totals.budgetLimit,
    "Budget used percent": Math.round(totals.budgetUsed),
    "Lent outstanding": totals.lentOutstanding,
    "Borrowed outstanding": totals.borrowedOutstanding,
    "Pending bills": totals.pendingBills,
    "Pending bill amount": totals.pendingBillAmount,
  }];
  const accountRows = accounts.map((item) => ({
    Account: item.name,
    Type: item.account_type,
    "Opening balance": valueOf(item.opening_balance),
    "Current balance": accountBalance(item),
    Currency: item.currency,
    Status: item.status,
  }));
  const transactionRows = transactions.map((item) => ({
    Date: item.transaction_date,
    Direction: item.direction,
    Category: item.category,
    Account: accounts.find((account) => account.id === item.account_id)?.name ?? "",
    Amount: valueOf(item.amount),
    Method: item.payment_method,
    Recurring: item.is_recurring ? "Yes" : "No",
    Reference: item.reference ?? "",
    Notes: item.notes ?? "",
  }));
  const budgetRows = budgets.map((item) => {
    const spent = transactions
      .filter((transaction) => transaction.direction === "expense" && transaction.category === item.category && transaction.transaction_date.startsWith(item.budget_month.slice(0, 7)))
      .reduce((sum, transaction) => sum + valueOf(transaction.amount), 0);
    return {
      Month: item.budget_month.slice(0, 7),
      Category: item.category,
      Limit: valueOf(item.limit_amount),
      Spent: spent,
      Remaining: valueOf(item.limit_amount) - spent,
      "Alert percent": item.alert_percent,
      Notes: item.notes ?? "",
    };
  });
  const debtRows = debts.map((item) => ({
    Type: item.debt_type,
    Person: item.counterparty,
    Principal: valueOf(item.principal_amount),
    Settled: valueOf(item.settled_amount),
    Outstanding: Math.max(0, valueOf(item.principal_amount) - valueOf(item.settled_amount)),
    "Due date": item.due_date ?? "",
    Status: item.status,
    Notes: item.notes ?? "",
  }));
  const billRows = bills.map((item) => ({
    Bill: item.title,
    Category: item.category,
    Amount: valueOf(item.amount),
    "Due date": item.due_date,
    Recurrence: item.recurrence,
    Status: item.status,
    Notes: item.notes ?? "",
  }));
  const goalRows = goals.map((item) => ({
    Goal: item.title,
    Target: valueOf(item.target_amount),
    Saved: valueOf(item.current_amount),
    Remaining: Math.max(0, valueOf(item.target_amount) - valueOf(item.current_amount)),
    "Target date": item.target_date ?? "",
    Status: item.status,
    Notes: item.notes ?? "",
  }));

  async function exportWorkbook(single?: { name: string; rows: Array<Record<string, unknown>> }) {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const sheets = single
        ? [single]
        : [
            { name: "Summary", rows: summaryRows },
            { name: "Accounts", rows: accountRows },
            { name: "Transactions", rows: transactionRows },
            { name: "Budgets", rows: budgetRows },
            { name: "Debts", rows: debtRows },
            { name: "Bills", rows: billRows },
            { name: "Goals", rows: goalRows },
          ];
      sheets.forEach((sheet) => {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(sheet.rows.length ? sheet.rows : [{ Information: "No records yet" }]),
          sheet.name,
        );
      });
      const familyName = (family?.name_en || "family").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      XLSX.writeFile(
        workbook,
        familyName + "-private-finance-" + month + (single ? "-" + single.name.toLowerCase() : "-complete") + ".xlsx",
      );
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
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: "get_my_private_finance_summary",
          title: "Get my private finance summary",
          description:
            "Read the signed-in member's selected-month private balance, income, expense, budget, bills and debt summary.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Array.isArray(input) ||
              Object.keys(input).length > 0
            ) {
              throw new Error("This summary tool does not accept input.");
            }
            return {
              month,
              balance: totals.balance,
              income: totals.income,
              expense: totals.expense,
              netCashflow: totals.net,
              budget: { limit: totals.budgetLimit, usedPercent: Math.round(totals.budgetUsed) },
              pendingBills: totals.pendingBills,
              debts: {
                lentOutstanding: totals.lentOutstanding,
                borrowedOutstanding: totals.borrowedOutstanding,
              },
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [month, totals]);

  if (setupRequired) {
    return <StateCard icon={<ShieldCheck />} title="Family setup প্রয়োজন" text="ব্যক্তিগত finance workspace ব্যবহার করতে active family membership প্রয়োজন।" action={<Button asChild className="rounded-xl"><a href="/setup">Setup খুলুন</a></Button>} />;
  }

  return (
    <main className="mx-auto w-full max-w-[1550px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <LockKeyhole className="size-4" /> Private to you
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">ব্যক্তিগত হিসাব-নিকাশ</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Income, expense, budget, দেনা-পাওনা, bills ও savings goals—আপনার নিজের নিরাপদ workspace।
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Report month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-[175px] rounded-xl bg-card" />
          <Button variant="outline" className="gap-2 rounded-xl" disabled={exporting} onClick={() => void exportWorkbook()}>
            {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Complete XLSX
          </Button>
          <Button className="gap-2 rounded-xl" disabled={!activeAccounts.length || migrationRequired} onClick={() => openRecord("transaction")}>
            <Plus className="size-4" /> আয়/ব্যয় যোগ করুন
          </Button>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-semibold">সম্পূর্ণ ব্যক্তিগত</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {viewer?.displayName ? viewer.displayName + "-এর " : ""}এই হিসাব অন্য সদস্য বা Family Admin দেখতে পারবেন না। প্রতিটি request family ও account owner দিয়ে server-side যাচাই করা হয়।
          </p>
        </div>
      </div>

      {feedback ? <div className="flex items-start justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm"><span>{feedback}</span><button type="button" className="text-muted-foreground" onClick={() => setFeedback(null)}>বন্ধ</button></div> : null}

      {migrationRequired ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="font-bold">Personal Finance database migration প্রয়োজন</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Supabase SQL Editor-এ supabase/migrations/20260927_personal_finance.sql একবার চালান।
          </p>
        </div>
      ) : null}

      {loading ? (
        <Card className="rounded-3xl py-0 shadow-none"><CardContent className="flex min-h-80 items-center justify-center p-8"><LoaderCircle className="size-8 animate-spin text-primary" /></CardContent></Card>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <Metric icon={<WalletCards />} label="বর্তমান balance" value={money.format(totals.balance)} note={activeAccounts.length + " active accounts"} />
            <Metric icon={<ArrowUpRight />} label="এই মাসের আয়" value={money.format(totals.income)} note={monthTransactions.filter((item) => item.direction === "income").length + " entries"} />
            <Metric icon={<ArrowDownRight />} label="এই মাসের ব্যয়" value={money.format(totals.expense)} note={monthTransactions.filter((item) => item.direction === "expense").length + " entries"} />
            <Metric icon={<CircleDollarSign />} label="Net cashflow" value={money.format(totals.net)} note={totals.net >= 0 ? "Positive" : "Expense বেশি"} />
            <Metric icon={<ReceiptText />} label="Pending bills" value={money.format(totals.pendingBillAmount)} note={totals.pendingBills + " bills"} />
            <Metric icon={<Landmark />} label="Net দেনা-পাওনা" value={money.format(totals.lentOutstanding - totals.borrowedOutstanding)} note={money.format(totals.borrowedOutstanding) + " borrowed"} />
          </section>

          {!accounts.length && !migrationRequired ? (
            <StateCard icon={<WalletCards />} title="প্রথম account বা wallet যোগ করুন" text="Cash, bank, mobile banking, savings বা credit account দিয়ে ব্যক্তিগত হিসাব শুরু করুন।" action={<Button className="gap-2 rounded-xl" onClick={() => openRecord("account")}><Plus className="size-4" /> Account যোগ করুন</Button>} compact />
          ) : (
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-muted/70 p-1.5">
                <TabsTrigger value="overview" className="rounded-xl px-4 py-2.5">Overview</TabsTrigger>
                <TabsTrigger value="transactions" className="rounded-xl px-4 py-2.5">Transactions ({transactions.length})</TabsTrigger>
                <TabsTrigger value="budgets" className="rounded-xl px-4 py-2.5">Budgets ({monthBudgets.length})</TabsTrigger>
                <TabsTrigger value="debts" className="rounded-xl px-4 py-2.5">দেনা-পাওনা ({debts.length})</TabsTrigger>
                <TabsTrigger value="bills" className="rounded-xl px-4 py-2.5">Bills ({bills.length})</TabsTrigger>
                <TabsTrigger value="goals" className="rounded-xl px-4 py-2.5">Goals ({goals.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
                  <Card className="rounded-3xl py-0 shadow-none">
                    <CardHeader className="flex-row items-start justify-between p-5 pb-3 md:p-6 md:pb-3">
                      <div><CardTitle>Monthly cashflow</CardTitle><p className="mt-1 text-sm text-muted-foreground">Budget ও spending health</p></div>
                      <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => void exportWorkbook({ name: "Summary", rows: summaryRows })}><Download className="size-4" /> XLSX</Button>
                    </CardHeader>
                    <CardContent className="space-y-5 p-5 pt-2 md:p-6 md:pt-2">
                      <div className="grid grid-cols-3 gap-3">
                        <CashflowStat label="Income" value={totals.income} tone="good" />
                        <CashflowStat label="Expense" value={totals.expense} tone="bad" />
                        <CashflowStat label="Net" value={totals.net} tone="neutral" />
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>Monthly budget used</span><strong>{Math.round(totals.budgetUsed)}%</strong></div>
                        <Progress value={totals.budgetUsed} className="h-2.5" />
                        <p className="mt-2 text-xs text-muted-foreground">{money.format(totals.expense)} of {money.format(totals.budgetLimit || 0)}</p>
                      </div>
                      <div className="space-y-3">
                        <p className="font-semibold">Top expense categories</p>
                        {expenseCategories.slice(0, 5).map(([category, amount]) => <CategoryBar key={category} category={category} amount={amount} total={totals.expense} />)}
                        {!expenseCategories.length ? <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">এই মাসে কোনো expense নেই।</p> : null}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-3xl bg-primary py-0 text-primary-foreground shadow-none">
                    <CardContent className="p-6">
                      <PiggyBank className="size-8" />
                      <p className="mt-5 text-sm text-primary-foreground/70">Financial breathing room</p>
                      <p className="mt-1 text-3xl font-bold">{money.format(totals.balance - totals.pendingBillAmount)}</p>
                      <p className="mt-2 text-sm text-primary-foreground/70">Current balance থেকে pending bills বাদ দিয়ে</p>
                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <DarkStat label="Receivable" value={money.format(totals.lentOutstanding)} />
                        <DarkStat label="Payable" value={money.format(totals.borrowedOutstanding)} />
                        <DarkStat label="Goals" value={String(goals.filter((item) => item.status === "active").length)} />
                        <DarkStat label="Recurring" value={String(transactions.filter((item) => item.is_recurring).length)} />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <DataSection title="Accounts & wallets" description="Opening balance এবং transaction থেকে live balance" onAdd={() => openRecord("account")} onExport={() => void exportWorkbook({ name: "Accounts", rows: accountRows })}>
                  <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
                    {accounts.map((account) => <div key={account.id} className="rounded-2xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><WalletCards className="size-5" /></span><Badge variant="outline">{account.account_type}</Badge></div><p className="mt-4 font-semibold">{account.name}</p><p className="mt-1 text-2xl font-bold">{money.format(accountBalance(account))}</p><div className="mt-3 flex items-center justify-between"><StatusBadge value={account.status} />{account.status === "active" ? <Button variant="ghost" size="sm" disabled={saving} onClick={() => void updateStatus("account", account.id, "archived").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Update হয়নি।"))}>Archive</Button> : null}</div></div>)}
                  </div>
                </DataSection>
              </TabsContent>

              <TabsContent value="transactions">
                <DataSection title="Income & expense ledger" description="Date, account, category, method ও recurring reference" onAdd={() => openRecord("transaction")} onExport={() => void exportWorkbook({ name: "Transactions", rows: transactionRows })}>
                  <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Category</TableHead><TableHead>Account</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader><TableBody>
                    {transactions.map((item) => <TableRow key={item.id}><TableCell>{date.format(new Date(item.transaction_date + "T00:00:00"))}</TableCell><TableCell><StatusBadge value={item.direction} /></TableCell><TableCell>{item.category}{item.is_recurring ? <Badge variant="outline" className="ml-2">Recurring</Badge> : null}</TableCell><TableCell>{accounts.find((account) => account.id === item.account_id)?.name || "Archived"}</TableCell><TableCell className={item.direction === "income" ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>{item.direction === "income" ? "+" : "-"}{money.format(valueOf(item.amount))}</TableCell><TableCell>{item.payment_method}</TableCell><TableCell className="max-w-64 truncate">{item.notes || item.reference || "—"}</TableCell></TableRow>)}
                    <EmptyRows show={!transactions.length} columns={7} />
                  </TableBody></Table>
                </DataSection>
              </TabsContent>

              <TabsContent value="budgets">
                <DataSection title="Monthly category budgets" description={month + " মাসের limit, spending ও alert threshold"} onAdd={() => openRecord("budget")} onExport={() => void exportWorkbook({ name: "Budgets", rows: budgetRows })}>
                  <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                    {monthBudgets.map((item) => {
                      const spent = monthTransactions.filter((transaction) => transaction.direction === "expense" && transaction.category === item.category).reduce((sum, transaction) => sum + valueOf(transaction.amount), 0);
                      const percent = Math.min(100, (spent / valueOf(item.limit_amount)) * 100);
                      return <div key={item.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between"><div><p className="font-semibold">{item.category}</p><p className="text-sm text-muted-foreground">{money.format(spent)} / {money.format(valueOf(item.limit_amount))}</p></div><StatusBadge value={percent >= item.alert_percent ? "alert" : "healthy"} /></div><Progress value={percent} className="mt-4 h-2.5" /><p className="mt-2 text-xs text-muted-foreground">Alert at {item.alert_percent}% · {money.format(Math.max(0, valueOf(item.limit_amount) - spent))} remaining</p></div>;
                    })}
                    {!monthBudgets.length ? <EmptyCard text="এই মাসের কোনো budget নেই।" /> : null}
                  </div>
                </DataSection>
              </TabsContent>

              <TabsContent value="debts">
                <DataSection title="দেনা-পাওনা tracker" description="কাকে দিয়েছেন, কার কাছ থেকে নিয়েছেন, due date ও settlement" onAdd={() => openRecord("debt")} onExport={() => void exportWorkbook({ name: "Debts", rows: debtRows })}>
                  <Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Type</TableHead><TableHead>Principal</TableHead><TableHead>Settled</TableHead><TableHead>Outstanding</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>
                    {debts.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.counterparty}</TableCell><TableCell><StatusBadge value={item.debt_type} /></TableCell><TableCell>{money.format(valueOf(item.principal_amount))}</TableCell><TableCell>{money.format(valueOf(item.settled_amount))}</TableCell><TableCell className="font-bold">{money.format(Math.max(0, valueOf(item.principal_amount) - valueOf(item.settled_amount)))}</TableCell><TableCell>{item.due_date ? date.format(new Date(item.due_date + "T00:00:00")) : "No date"}</TableCell><TableCell><StatusBadge value={item.status} /></TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => setProgressTarget({ entity: "debt", id: item.id, title: item.counterparty, amount: String(item.settled_amount), maximum: valueOf(item.principal_amount) })}>Update</Button></TableCell></TableRow>)}
                    <EmptyRows show={!debts.length} columns={8} />
                  </TableBody></Table>
                </DataSection>
              </TabsContent>

              <TabsContent value="bills">
                <DataSection title="Bills & payment reminders" description="Utility, rent, subscription, tax এবং recurring dues" onAdd={() => openRecord("bill")} onExport={() => void exportWorkbook({ name: "Bills", rows: billRows })}>
                  <Table><TableHeader><TableRow><TableHead>Bill</TableHead><TableHead>Category</TableHead><TableHead>Amount</TableHead><TableHead>Due date</TableHead><TableHead>Recurrence</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>
                    {bills.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.title}</TableCell><TableCell>{item.category}</TableCell><TableCell>{money.format(valueOf(item.amount))}</TableCell><TableCell>{date.format(new Date(item.due_date + "T00:00:00"))}</TableCell><TableCell>{item.recurrence}</TableCell><TableCell><StatusBadge value={item.status} /></TableCell><TableCell><StatusMenu values={["pending", "paid", "skipped"]} disabled={saving} onSelect={(status) => void updateStatus("bill", item.id, status).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Update হয়নি।"))} /></TableCell></TableRow>)}
                    <EmptyRows show={!bills.length} columns={7} />
                  </TableBody></Table>
                </DataSection>
              </TabsContent>

              <TabsContent value="goals">
                <DataSection title="Savings goals" description="Target, saved amount, deadline ও completion progress" onAdd={() => openRecord("goal")} onExport={() => void exportWorkbook({ name: "Goals", rows: goalRows })}>
                  <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                    {goals.map((item) => {
                      const progress = Math.min(100, (valueOf(item.current_amount) / valueOf(item.target_amount)) * 100);
                      return <div key={item.id} className="rounded-2xl border p-5"><div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Target className="size-5" /></span><StatusBadge value={item.status} /></div><h3 className="mt-4 font-bold">{item.title}</h3><p className="mt-1 text-2xl font-bold">{money.format(valueOf(item.current_amount))}</p><p className="text-sm text-muted-foreground">of {money.format(valueOf(item.target_amount))}</p><Progress value={progress} className="mt-4 h-2.5" /><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{Math.round(progress)}%</span><span>{item.target_date ? date.format(new Date(item.target_date + "T00:00:00")) : "No deadline"}</span></div><Button variant="outline" size="sm" className="mt-4 w-full rounded-xl" onClick={() => setProgressTarget({ entity: "goal", id: item.id, title: item.title, amount: String(item.current_amount), maximum: valueOf(item.target_amount) })}>Saved amount update</Button></div>;
                    })}
                    {!goals.length ? <EmptyCard text="এখনও কোনো savings goal নেই।" /> : null}
                  </div>
                </DataSection>
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

      <Dialog open={Boolean(recordKind)} onOpenChange={(open) => !open && setRecordKind(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
          <DialogHeader><DialogTitle>{recordKind ? kindLabels[recordKind] : "Finance record"} যোগ করুন</DialogTitle><DialogDescription>এই তথ্য শুধু আপনার private finance workspace-এ থাকবে।</DialogDescription></DialogHeader>
          {recordKind ? <FinanceForm kind={recordKind} form={form} setForm={setForm} accounts={activeAccounts} /> : null}
          <DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setRecordKind(null)}>বাতিল</Button><Button className="gap-2 rounded-xl" disabled={saving} onClick={() => void saveRecord().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Save হয়নি।"))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Save করুন</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(progressTarget)} onOpenChange={(open) => !open && setProgressTarget(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader><DialogTitle>Progress update</DialogTitle><DialogDescription>{progressTarget?.title} · সর্বোচ্চ {money.format(progressTarget?.maximum ?? 0)}</DialogDescription></DialogHeader>
          <FormField label={progressTarget?.entity === "debt" ? "মোট settled amount" : "মোট saved amount"} id="progress-amount"><Input id="progress-amount" type="number" min="0" max={progressTarget?.maximum} value={progressTarget?.amount ?? ""} onChange={(event) => setProgressTarget((current) => current ? { ...current, amount: event.target.value } : current)} /></FormField>
          <DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setProgressTarget(null)}>বাতিল</Button><Button className="rounded-xl" disabled={saving} onClick={() => void saveProgress().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Update হয়নি।"))}>Update করুন</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <Card className="rounded-2xl py-0 shadow-none"><CardContent className="p-5"><span className="mb-4 grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card>;
}

function CashflowStat({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" | "neutral" }) {
  const style = tone === "good" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : tone === "bad" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-primary/10 text-primary";
  return <div className={"rounded-2xl p-3 " + style}><p className="text-xs opacity-75">{label}</p><p className="mt-1 font-bold">{money.format(value)}</p></div>;
}

function DarkStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-primary-foreground/65">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}

function CategoryBar({ category, amount, total }: { category: string; amount: number; total: number }) {
  const percent = total ? (amount / total) * 100 : 0;
  return <div><div className="mb-1.5 flex items-center justify-between text-sm"><span>{category}</span><strong>{money.format(amount)}</strong></div><Progress value={percent} className="h-2" /></div>;
}

function DataSection({ title, description, onAdd, onExport, children }: { title: string; description: string; onAdd: () => void; onExport: () => void; children: ReactNode }) {
  return <Card className="gap-0 overflow-hidden rounded-3xl py-0 shadow-none"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={onExport}><Download className="size-4" /> XLSX</Button><Button size="sm" className="gap-2 rounded-xl" onClick={onAdd}><Plus className="size-4" /> Add</Button></div></div><div className="overflow-x-auto">{children}</div></Card>;
}

function EmptyRows({ show, columns }: { show: boolean; columns: number }) {
  return show ? <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">এখনও কোনো record নেই। Add দিয়ে শুরু করুন।</TableCell></TableRow> : null;
}

function EmptyCard({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function StateCard({ icon, title, text, action, compact = false }: { icon: ReactNode; title: string; text: string; action?: ReactNode; compact?: boolean }) {
  return <Card className="rounded-3xl py-0 shadow-none"><CardContent className={"flex flex-col items-center justify-center p-8 text-center " + (compact ? "min-h-72" : "min-h-96")}><span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><h2 className="mt-5 text-2xl font-bold">{title}</h2><p className="mt-2 max-w-xl text-muted-foreground">{text}</p>{action ? <div className="mt-6">{action}</div> : null}</CardContent></Card>;
}

function StatusBadge({ value }: { value: string }) {
  const positive = ["active", "paid", "settled", "completed", "income", "healthy", "lent"];
  const warning = ["pending", "partial", "open", "alert", "borrowed"];
  const bad = ["overdue", "expense", "skipped"];
  const className = positive.includes(value)
    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
    : warning.includes(value)
      ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
      : bad.includes(value)
        ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
        : "bg-muted text-muted-foreground";
  return <Badge variant="secondary" className={className}>{value.replaceAll("_", " ")}</Badge>;
}

function StatusMenu({ values, onSelect, disabled }: { values: string[]; onSelect: (value: string) => void; disabled: boolean }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-xl" disabled={disabled}><MoreHorizontal className="size-4" /><span className="sr-only">Status actions</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{values.map((value) => <DropdownMenuItem key={value} onClick={() => onSelect(value)}>{value}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function FormField({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function ValueSelect({ id, value, onChange, items }: { id: string; value: string; onChange: (value: string) => void; items: Array<[string, string]> }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger id={id} className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{items.map(([itemValue, label]) => <SelectItem key={itemValue} value={itemValue}>{label}</SelectItem>)}</SelectContent></Select>;
}

function FinanceForm({ kind, form, setForm, accounts }: { kind: FinanceRecordKind; form: FormState; setForm: (value: FormState) => void; accounts: FinanceAccount[] }) {
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });
  const input = (key: string, label: string, type = "text", options?: { min?: string; max?: string; step?: string; list?: string }) => <FormField label={label} id={"finance-" + key}><Input id={"finance-" + key} type={type} min={options?.min} max={options?.max} step={options?.step} list={options?.list} value={form[key] ?? ""} onChange={(event) => set(key, event.target.value)} /></FormField>;
  const select = (key: string, label: string, items: Array<[string, string]>) => <FormField label={label} id={"finance-" + key}><ValueSelect id={"finance-" + key} value={form[key] ?? items[0]?.[0] ?? ""} onChange={(value) => set(key, value)} items={items} /></FormField>;
  const notes = <div className="sm:col-span-2"><FormField label="Notes" id="finance-notes"><Textarea id="finance-notes" rows={3} value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} /></FormField></div>;
  const category = input("category", "Category", "text", { list: "finance-categories" });
  const suggestions = <datalist id="finance-categories">{categorySuggestions.map((item) => <option key={item} value={item} />)}</datalist>;

  if (kind === "account") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("name", "Account / wallet name")}{select("accountType", "Account type", [["cash", "Cash"], ["bank", "Bank"], ["mobile", "Mobile banking"], ["savings", "Savings"], ["credit", "Credit"]])}{input("openingBalance", "Opening balance", "number", { step: "0.01" })}{notes}</div>;
  if (kind === "transaction") return <div className="grid gap-4 py-2 sm:grid-cols-2">{select("accountId", "Account", accounts.map((item) => [item.id, item.name]))}{select("direction", "Type", [["expense", "Expense"], ["income", "Income"]])}{category}{suggestions}{input("amount", "Amount", "number", { min: "0.01", step: "0.01" })}{input("transactionDate", "Date", "date")}{select("paymentMethod", "Payment method", [["cash", "Cash"], ["bank", "Bank"], ["mobile", "Mobile banking"], ["card", "Card"], ["other", "Other"]])}{select("isRecurring", "Recurring entry", [["false", "No"], ["true", "Yes"]])}{input("reference", "Reference")}{notes}</div>;
  if (kind === "budget") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("budgetMonth", "Budget month", "month")}{category}{suggestions}{input("limitAmount", "Limit amount", "number", { min: "0.01" })}{input("alertPercent", "Alert at %", "number", { min: "1", max: "100" })}{notes}</div>;
  if (kind === "debt") return <div className="grid gap-4 py-2 sm:grid-cols-2">{select("debtType", "Type", [["lent", "আমি ধার দিয়েছি"], ["borrowed", "আমি ধার নিয়েছি"]])}{input("counterparty", "Person / organization")}{input("principalAmount", "Principal amount", "number", { min: "0.01" })}{input("settledAmount", "Already settled", "number", { min: "0" })}{input("dueDate", "Due date", "date")}{notes}</div>;
  if (kind === "bill") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("title", "Bill name")}{category}{suggestions}{input("amount", "Amount", "number", { min: "0.01" })}{input("dueDate", "Due date", "date")}{select("recurrence", "Recurrence", [["none", "One time"], ["monthly", "Monthly"], ["yearly", "Yearly"]])}{notes}</div>;
  return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("title", "Goal title")}{input("targetAmount", "Target amount", "number", { min: "0.01" })}{input("currentAmount", "Already saved", "number", { min: "0" })}{input("targetDate", "Target date", "date")}{notes}</div>;
}
