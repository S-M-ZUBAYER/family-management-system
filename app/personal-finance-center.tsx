"use client";

import { useActionFeedback } from "@/components/action-modal-provider";
import { useLocale, type AppLocale } from "@/components/locale-provider";
import { financeWorksheet, type FinanceExportSheet } from "@/lib/finance-export";
import { financeMoneyTotal, financeOutstanding } from "@/lib/finance-money";
import { financeErrorCopy, financeRecordActionCopy, financeStatusActionCopy } from "@/lib/finance-action-copy";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  Pencil,
  PiggyBank,
  Plus,
  ReceiptText,
  ShieldCheck,
  Target,
  Trash2,
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
type FinanceEditableRecord = FinanceAccount | FinanceTransaction | FinanceBudget | FinanceDebt | FinanceBill | FinanceGoal;
type ProgressTarget = {
  entity: "debt" | "goal";
  id: string;
  title: string;
  amount: string;
  maximum: number;
} | null;

const moneyFor = (locale: AppLocale) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateFor = (locale: AppLocale) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { dateStyle: "medium" });
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

const kindLabelsEn: Record<FinanceRecordKind, string> = {
  account: "Account / Wallet",
  transaction: "Income or Expense",
  budget: "Monthly Budget",
  debt: "Debt / Lending",
  bill: "Bill Reminder",
  goal: "Savings Goal",
};
const kindLabelsBn: Record<FinanceRecordKind, string> = {
  account: "অ্যাকাউন্ট / ওয়ালেট", transaction: "আয় বা ব্যয়", budget: "মাসিক বাজেট", debt: "দেনা / পাওনা", bill: "বিল রিমাইন্ডার", goal: "সঞ্চয়ের লক্ষ্য",
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
  const { locale, pick } = useLocale();
  const money = moneyFor(locale);
  const date = dateFor(locale);
  const kindLabels = locale === "bn" ? kindLabelsBn : kindLabelsEn;
  const [family, setFamily] = useState<FinancePayload["family"]>();
  const [viewer, setViewer] = useState<FinancePayload["viewer"]>();
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [budgets, setBudgets] = useState<FinanceBudget[]>([]);
  const [debts, setDebts] = useState<FinanceDebt[]>([]);
  const [bills, setBills] = useState<FinanceBill[]>([]);
  const [goals, setGoals] = useState<FinanceGoal[]>([]);
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadSequence = useRef(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [recordKind, setRecordKind] = useState<FinanceRecordKind | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ id: string; kind: FinanceRecordKind } | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [progressTarget, setProgressTarget] = useState<ProgressTarget>(null);

  useEffect(() => {
    queueMicrotask(() => setMonth((current) => current || currentMonth()));
  }, []);

  const loadFinance = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const clearLoadedFinance = () => {
      setFamily(undefined);
      setViewer(undefined);
      setAccounts([]);
      setTransactions([]);
      setBudgets([]);
      setDebts([]);
      setBills([]);
      setGoals([]);
      setMigrationRequired(false);
    };
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/finance", { cache: "no-store" });
      const payload = (await response.json()) as FinancePayload;
      if (sequence !== loadSequence.current) return false;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        clearLoadedFinance();
        setSetupRequired(true);
        setLoadError(false);
        return false;
      }
      if (payload.code === "FINANCE_ROW_LIMIT") {
        throw new Error(pick("ব্যক্তিগত হিসাবের একটি বিভাগে ২০,০০০-এর বেশি রেকর্ড আছে। অসম্পূর্ণ তথ্য দেখানো হয়নি; পৃষ্ঠা-ভিত্তিক এক্সপোর্টের জন্য সাপোর্টে যোগাযোগ করুন।", "A private finance section has more than 20,000 records. No partial data was shown; contact support for a paged export."));
      }
      if (!response.ok) throw new Error(payload.error ?? pick("ব্যক্তিগত হিসাব পাওয়া যায়নি।", "Personal finance could not be loaded."));
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
      setLoadError(false);
      return true;
    } catch (error) {
      if (sequence !== loadSequence.current) return false;
      clearLoadedFinance();
      setSetupRequired(false);
      setLoadError(true);
      setFeedback(pick("ব্যক্তিগত হিসাব লোড হয়নি।", "Personal finance could not be loaded.") + (error instanceof Error ? ` ${error.message}` : ""));
      return false;
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [pick, setFeedback]);

  useEffect(() => {
    queueMicrotask(() => void loadFinance());
    return () => { loadSequence.current += 1; };
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
      return financeMoneyTotal([account.opening_balance, ...transactions
        .filter((item) => item.account_id === account.id)
        .map((item) => item.direction === "income" ? item.amount : -valueOf(item.amount))]);
    },
    [transactions],
  );

  const totals = useMemo(() => {
    const income = financeMoneyTotal(monthTransactions.filter((item) => item.direction === "income").map((item) => item.amount));
    const expense = financeMoneyTotal(monthTransactions.filter((item) => item.direction === "expense").map((item) => item.amount));
    const balance = financeMoneyTotal(activeAccounts.map(accountBalance));
    const budgetLimit = financeMoneyTotal(monthBudgets.map((item) => item.limit_amount));
    const lentOutstanding = financeMoneyTotal(debts.filter((item) => item.debt_type === "lent" && item.status !== "settled").map((item) => financeOutstanding(item.principal_amount, item.settled_amount)));
    const borrowedOutstanding = financeMoneyTotal(debts.filter((item) => item.debt_type === "borrowed" && item.status !== "settled").map((item) => financeOutstanding(item.principal_amount, item.settled_amount)));
    const pendingBills = bills.filter((item) => item.status === "pending");
    return {
      income,
      expense,
      net: financeMoneyTotal([income, -expense]),
      balance,
      budgetLimit,
      budgetUsed: budgetLimit ? (expense / budgetLimit) * 100 : 0,
      lentOutstanding,
      borrowedOutstanding,
      pendingBills: pendingBills.length,
      pendingBillAmount: financeMoneyTotal(pendingBills.map((item) => item.amount)),
    };
  }, [monthTransactions, activeAccounts, accountBalance, monthBudgets, debts, bills]);

  const expenseCategories = useMemo(() => {
    const grouped = new Map<string, number>();
    monthTransactions
      .filter((item) => item.direction === "expense")
      .forEach((item) => grouped.set(item.category, financeMoneyTotal([grouped.get(item.category), item.amount])));
    return [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthTransactions]);

  function openRecord(kind: FinanceRecordKind) {
    const defaults = initialForm(kind);
    if (kind === "transaction") defaults.accountId = activeAccounts[0]?.id ?? "";
    setForm(defaults);
    setEditingRecord(null);
    setRecordKind(kind);
  }

  function openEditRecord(kind: FinanceRecordKind, item: FinanceEditableRecord) {
    const data = item as unknown as Record<string, unknown>;
    const formByKind: Record<FinanceRecordKind, FormState> = {
      account: { name: String(data.name ?? ""), accountType: String(data.account_type ?? "cash"), openingBalance: String(data.opening_balance ?? 0) },
      transaction: { accountId: String(data.account_id ?? ""), direction: String(data.direction ?? "expense"), category: String(data.category ?? "Food"), amount: String(data.amount ?? ""), transactionDate: String(data.transaction_date ?? today()), paymentMethod: String(data.payment_method ?? "cash"), reference: String(data.reference ?? ""), notes: String(data.notes ?? ""), isRecurring: String(Boolean(data.is_recurring)) },
      budget: { budgetMonth: String(data.budget_month ?? "").slice(0, 7), category: String(data.category ?? "Food"), limitAmount: String(data.limit_amount ?? ""), alertPercent: String(data.alert_percent ?? 80), notes: String(data.notes ?? "") },
      debt: { debtType: String(data.debt_type ?? "lent"), counterparty: String(data.counterparty ?? ""), principalAmount: String(data.principal_amount ?? ""), settledAmount: String(data.settled_amount ?? 0), dueDate: String(data.due_date ?? ""), notes: String(data.notes ?? "") },
      bill: { title: String(data.title ?? ""), category: String(data.category ?? "Utilities"), amount: String(data.amount ?? ""), dueDate: String(data.due_date ?? today()), recurrence: String(data.recurrence ?? "monthly"), notes: String(data.notes ?? "") },
      goal: { title: String(data.title ?? ""), targetAmount: String(data.target_amount ?? ""), currentAmount: String(data.current_amount ?? 0), targetDate: String(data.target_date ?? ""), notes: String(data.notes ?? "") },
    };
    setForm(formByKind[kind]);
    setEditingRecord({ id: item.id, kind });
    setRecordKind(kind);
  }

  async function saveRecord() {
    if (!recordKind) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/finance/records", {
        method: editingRecord ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: recordKind, recordId: editingRecord?.id, data: form }),
      });
      if (response.status === 499) return;
      const payload = (await response.json()) as { record?: unknown; error?: string; code?: string };
      if (!response.ok || !payload.record) throw new Error(financeErrorCopy(payload.code, locale) ?? payload.error ?? pick("রেকর্ড সেভ হয়নি।", "The record could not be saved."));
      const success = financeRecordActionCopy(recordKind, editingRecord ? "PATCH" : "POST", locale)?.successMessage;
      setRecordKind(null);
      setEditingRecord(null);
      if (!(await loadFinance())) return;
      setFeedback(success ?? pick("রেকর্ড সংরক্ষণ হয়েছে।", "Record saved."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(kind: FinanceRecordKind, recordId: string) {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/finance/records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, recordId }) });
      if (response.status === 499) return;
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? pick("রেকর্ড মোছা যায়নি।", "The record could not be deleted."));
      if (!(await loadFinance())) return;
      setFeedback(financeRecordActionCopy(kind, "DELETE", locale)?.successMessage ?? pick("রেকর্ড মুছে ফেলা হয়েছে।", "Record deleted."));
    } finally { setSaving(false); }
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
      if (response.status === 499) return;
      const payload = (await response.json()) as { record?: unknown; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error ?? pick("আপডেট হয়নি।", "The record could not be updated."));
      if (!(await loadFinance())) return;
      setFeedback(financeStatusActionCopy({ entity, status }, "PATCH", locale)?.successMessage ?? pick("রেকর্ড আপডেট হয়েছে।", "Record updated."));
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
      if (response.status === 499) return;
      const payload = (await response.json()) as { record?: unknown; error?: string };
      if (!response.ok || !payload.record) throw new Error(financeErrorCopy((payload as { code?: string }).code, locale) ?? payload.error ?? pick("অগ্রগতি আপডেট হয়নি।", "Progress could not be updated."));
      setProgressTarget(null);
      if (!(await loadFinance())) return;
      setFeedback(financeStatusActionCopy({ entity: progressTarget.entity }, "PATCH", locale)?.successMessage ?? pick("অগ্রগতির পরিমাণ আপডেট হয়েছে।", "Progress amount updated."));
    } finally {
      setSaving(false);
    }
  }

  const summaryRows = [{
    [pick("মাস", "Month")]: month,
    [pick("বর্তমান ব্যালান্স", "Current balance")]: totals.balance,
    [pick("আয়", "Income")]: totals.income,
    [pick("ব্যয়", "Expense")]: totals.expense,
    [pick("নিট নগদ প্রবাহ", "Net cashflow")]: totals.net,
    [pick("বাজেট সীমা", "Budget limit")]: totals.budgetLimit,
    [pick("বাজেট ব্যবহারের শতাংশ", "Budget used percent")]: Math.round(totals.budgetUsed),
    [pick("বকেয়া পাওনা", "Lent outstanding")]: totals.lentOutstanding,
    [pick("বকেয়া দেনা", "Borrowed outstanding")]: totals.borrowedOutstanding,
    [pick("অপেক্ষমাণ বিল", "Pending bills")]: totals.pendingBills,
    [pick("অপেক্ষমাণ বিলের পরিমাণ", "Pending bill amount")]: totals.pendingBillAmount,
  }];
  const accountRows = accounts.map((item) => ({
    [pick("অ্যাকাউন্ট", "Account")]: item.name,
    [pick("ধরন", "Type")]: financeStatusLabel(item.account_type, locale),
    [pick("প্রারম্ভিক ব্যালান্স", "Opening balance")]: valueOf(item.opening_balance),
    [pick("বর্তমান ব্যালান্স", "Current balance")]: accountBalance(item),
    [pick("মুদ্রা", "Currency")]: item.currency,
    [pick("স্ট্যাটাস", "Status")]: financeStatusLabel(item.status, locale),
  }));
  const transactionRows = transactions.map((item) => ({
    [pick("তারিখ", "Date")]: item.transaction_date,
    [pick("দিক", "Direction")]: financeStatusLabel(item.direction, locale),
    [pick("ক্যাটাগরি", "Category")]: item.category,
    [pick("অ্যাকাউন্ট", "Account")]: accounts.find((account) => account.id === item.account_id)?.name ?? "",
    [pick("পরিমাণ", "Amount")]: valueOf(item.amount),
    [pick("পদ্ধতি", "Method")]: financeStatusLabel(item.payment_method, locale),
    [pick("পুনরাবৃত্ত", "Recurring")]: item.is_recurring ? pick("হ্যাঁ", "Yes") : pick("না", "No"),
    [pick("রেফারেন্স", "Reference")]: item.reference ?? "",
    [pick("নোট", "Notes")]: item.notes ?? "",
  }));
  const budgetRows = budgets.map((item) => {
    const spent = financeMoneyTotal(transactions
      .filter((transaction) => transaction.direction === "expense" && transaction.category === item.category && transaction.transaction_date.startsWith(item.budget_month.slice(0, 7)))
      .map((transaction) => transaction.amount));
    return {
      [pick("মাস", "Month")]: item.budget_month.slice(0, 7),
      [pick("ক্যাটাগরি", "Category")]: item.category,
      [pick("সীমা", "Limit")]: valueOf(item.limit_amount),
      [pick("ব্যয়", "Spent")]: spent,
      [pick("অবশিষ্ট", "Remaining")]: financeMoneyTotal([item.limit_amount, -spent]),
      [pick("সতর্কতার শতাংশ", "Alert percent")]: item.alert_percent,
      [pick("নোট", "Notes")]: item.notes ?? "",
    };
  });
  const debtRows = debts.map((item) => ({
    [pick("ধরন", "Type")]: financeStatusLabel(item.debt_type, locale),
    [pick("ব্যক্তি", "Person")]: item.counterparty,
    [pick("মূল পরিমাণ", "Principal")]: valueOf(item.principal_amount),
    [pick("নিষ্পত্তি", "Settled")]: valueOf(item.settled_amount),
    [pick("বাকি", "Outstanding")]: financeOutstanding(item.principal_amount, item.settled_amount),
    [pick("নির্ধারিত তারিখ", "Due date")]: item.due_date ?? "",
    [pick("স্ট্যাটাস", "Status")]: financeStatusLabel(item.status, locale),
    [pick("নোট", "Notes")]: item.notes ?? "",
  }));
  const billRows = bills.map((item) => ({
    [pick("বিল", "Bill")]: item.title,
    [pick("ক্যাটাগরি", "Category")]: item.category,
    [pick("পরিমাণ", "Amount")]: valueOf(item.amount),
    [pick("নির্ধারিত তারিখ", "Due date")]: item.due_date,
    [pick("পুনরাবৃত্তি", "Recurrence")]: financeStatusLabel(item.recurrence, locale),
    [pick("স্ট্যাটাস", "Status")]: financeStatusLabel(item.status, locale),
    [pick("নোট", "Notes")]: item.notes ?? "",
  }));
  const goalRows = goals.map((item) => ({
    [pick("লক্ষ্য", "Goal")]: item.title,
    [pick("লক্ষ্যমাত্রা", "Target")]: valueOf(item.target_amount),
    [pick("সঞ্চিত", "Saved")]: valueOf(item.current_amount),
    [pick("অবশিষ্ট", "Remaining")]: financeOutstanding(item.target_amount, item.current_amount),
    [pick("লক্ষ্যের তারিখ", "Target date")]: item.target_date ?? "",
    [pick("স্ট্যাটাস", "Status")]: financeStatusLabel(item.status, locale),
    [pick("নোট", "Notes")]: item.notes ?? "",
  }));

  async function exportWorkbook(single?: { name: string; rows: Array<Record<string, unknown>> }) {
    if (loading || loadError || migrationRequired) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const sheets = single
        ? [single]
        : [
            { name: pick("সারসংক্ষেপ", "Summary"), rows: summaryRows },
            { name: pick("অ্যাকাউন্ট", "Accounts"), rows: accountRows },
            { name: pick("লেনদেন", "Transactions"), rows: transactionRows },
            { name: pick("বাজেট", "Budgets"), rows: budgetRows },
            { name: pick("দেনা-পাওনা", "Debts"), rows: debtRows },
            { name: pick("বিল", "Bills"), rows: billRows },
            { name: pick("লক্ষ্য", "Goals"), rows: goalRows },
          ];
      const sheetNames = new Map<string, FinanceExportSheet>([
        [pick("সারসংক্ষেপ", "Summary"), "Summary"], [pick("অ্যাকাউন্ট", "Accounts"), "Accounts"],
        [pick("লেনদেন", "Transactions"), "Transactions"], [pick("বাজেট", "Budgets"), "Budgets"],
        [pick("দেনা-পাওনা", "Debts"), "Debts"], [pick("বিল", "Bills"), "Bills"], [pick("লক্ষ্য", "Goals"), "Goals"],
      ]);
      sheets.forEach((sheet) => {
        XLSX.utils.book_append_sheet(
          workbook,
          financeWorksheet(XLSX, sheet.rows, sheetNames.get(sheet.name)!, locale),
          sheet.name,
        );
      });
      const familyName = (family?.name_en || "family").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      XLSX.writeFile(
        workbook,
        familyName + "-private-finance-" + month + (single ? "-" + single.name.toLowerCase() : "-complete") + ".xlsx",
      );
      setFeedback(pick("ব্যক্তিগত হিসাবের XLSX তৈরি হয়েছে।", "Personal finance XLSX was created."));
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      setFeedback(pick("ব্যক্তিগত হিসাবের XLSX তৈরি হয়নি।", "Personal finance XLSX could not be created.") + detail);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!month) return;
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
    return <StateCard icon={<ShieldCheck />} title={pick("পরিবার সেটআপ প্রয়োজন", "Family setup required")} text={pick("ব্যক্তিগত হিসাবের জায়গা ব্যবহার করতে সক্রিয় পরিবার সদস্যপদ প্রয়োজন।", "An active family membership is required to use your personal finance workspace.")} action={<Button asChild className="rounded-xl"><a href="/setup">{pick("সেটআপ খুলুন", "Open setup")}</a></Button>} />;
  }

  return (
    <main className="mx-auto w-full max-w-[1550px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
             <LockKeyhole className="size-4" /> {pick("শুধু আপনার জন্য", "Private to you")}
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{pick("ব্যক্তিগত হিসাব-নিকাশ", "Personal finance")}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            {pick("আয়, ব্যয়, বাজেট, দেনা-পাওনা, বিল ও সঞ্চয়ের লক্ষ্য—আপনার নিজের নিরাপদ কর্মক্ষেত্র।", "Income, expenses, budgets, debts, bills and savings goals—your own secure workspace.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input aria-label={pick("রিপোর্টের মাস", "Report month")} type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-[175px] rounded-xl bg-card" />
          <Button variant="outline" className="gap-2 rounded-xl" disabled={exporting || loading || loadError || migrationRequired} onClick={() => void exportWorkbook()}>
            {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} {pick("সম্পূর্ণ XLSX", "Complete XLSX")}
          </Button>
          <Button className="gap-2 rounded-xl" disabled={loading || loadError || !activeAccounts.length || migrationRequired} onClick={() => openRecord("transaction")}>
            <Plus className="size-4" /> {pick("আয়/ব্যয় যোগ করুন", "Add income/expense")}
          </Button>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-semibold">{pick("সম্পূর্ণ ব্যক্তিগত", "Completely private")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pick(`${viewer?.displayName ? viewer.displayName + "-এর " : ""}এই হিসাব অন্য সদস্য বা পরিবার অ্যাডমিন দেখতে পারবেন না। প্রতিটি অনুরোধ পরিবার ও অ্যাকাউন্ট মালিক দিয়ে সার্ভারে যাচাই করা হয়।`, `${viewer?.displayName ? viewer.displayName + "'s " : ""}finance data cannot be viewed by other members or Family Admins. Every request is checked server-side against the family and account owner.`)}
          </p>
        </div>
      </div>

      {feedback ? <div className="flex items-start justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm"><span>{feedback}</span><button type="button" className="text-muted-foreground" onClick={() => setFeedback(null)}>{pick("বন্ধ", "Close")}</button></div> : null}

      {migrationRequired ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="font-bold">{pick("ব্যক্তিগত হিসাবের ডাটাবেস মাইগ্রেশন প্রয়োজন", "Personal Finance database migration required")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pick("Supabase SQL Editor-এ supabase/migrations/20260927_personal_finance.sql একবার চালান।", "Run supabase/migrations/20260927_personal_finance.sql once in the Supabase SQL Editor.")}
          </p>
        </div>
      ) : null}

      {loading ? (
        <Card className="rounded-3xl py-0 shadow-none"><CardContent className="flex min-h-80 items-center justify-center p-8"><LoaderCircle className="size-8 animate-spin text-primary" /></CardContent></Card>
      ) : loadError ? (
        <StateCard icon={<ShieldCheck />} title={pick("ব্যক্তিগত হিসাব লোড হয়নি", "Personal finance could not be loaded")} text={pick("সংযোগ পরীক্ষা করে আবার চেষ্টা করুন। অসম্পূর্ণ বা শূন্য হিসাব রপ্তানি করা হয়নি।", "Check your connection and retry. No incomplete or empty report was exported.")} action={<Button className="rounded-xl" onClick={() => void loadFinance()}>{pick("আবার চেষ্টা করুন", "Retry")}</Button>} />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <Metric icon={<WalletCards />} label={pick("বর্তমান ব্যালান্স", "Current balance")} value={money.format(totals.balance)} note={pick(activeAccounts.length + "টি সক্রিয় অ্যাকাউন্ট", activeAccounts.length + " active accounts")} />
            <Metric icon={<ArrowUpRight />} label={pick("এই মাসের আয়", "Income this month")} value={money.format(totals.income)} note={pick(monthTransactions.filter((item) => item.direction === "income").length + "টি এন্ট্রি", monthTransactions.filter((item) => item.direction === "income").length + " entries")} />
            <Metric icon={<ArrowDownRight />} label={pick("এই মাসের ব্যয়", "Expenses this month")} value={money.format(totals.expense)} note={pick(monthTransactions.filter((item) => item.direction === "expense").length + "টি এন্ট্রি", monthTransactions.filter((item) => item.direction === "expense").length + " entries")} />
            <Metric icon={<CircleDollarSign />} label={pick("নিট নগদ প্রবাহ", "Net cashflow")} value={money.format(totals.net)} note={totals.net >= 0 ? pick("ইতিবাচক", "Positive") : pick("ব্যয় বেশি", "Expenses are higher")} />
            <Metric icon={<ReceiptText />} label={pick("অপেক্ষমাণ বিল", "Pending bills")} value={money.format(totals.pendingBillAmount)} note={pick(totals.pendingBills + "টি বিল", totals.pendingBills + " bills")} />
            <Metric icon={<Landmark />} label={pick("নিট দেনা-পাওনা", "Net debts")} value={money.format(totals.lentOutstanding - totals.borrowedOutstanding)} note={pick(money.format(totals.borrowedOutstanding) + " ধার নেওয়া", money.format(totals.borrowedOutstanding) + " borrowed")} />
          </section>

          {!accounts.length && !transactions.length && !budgets.length && !debts.length && !bills.length && !goals.length && !migrationRequired ? (
            <StateCard icon={<WalletCards />} title={pick("প্রথম অ্যাকাউন্ট বা ওয়ালেট যোগ করুন", "Add your first account or wallet")} text={pick("নগদ, ব্যাংক, মোবাইল ব্যাংকিং, সঞ্চয় বা ক্রেডিট অ্যাকাউন্ট দিয়ে ব্যক্তিগত হিসাব শুরু করুন।", "Start personal finance with a cash, bank, mobile banking, savings or credit account.")} action={<Button className="gap-2 rounded-xl" onClick={() => openRecord("account")}><Plus className="size-4" /> {pick("অ্যাকাউন্ট যোগ করুন", "Add account")}</Button>} compact />
          ) : (
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-muted/70 p-1.5">
                <TabsTrigger value="overview" className="rounded-xl px-4 py-2.5">{pick("সারসংক্ষেপ", "Overview")}</TabsTrigger>
                <TabsTrigger value="transactions" className="rounded-xl px-4 py-2.5">{pick("লেনদেন", "Transactions")} ({transactions.length})</TabsTrigger>
                <TabsTrigger value="budgets" className="rounded-xl px-4 py-2.5">{pick("বাজেট", "Budgets")} ({monthBudgets.length})</TabsTrigger>
                <TabsTrigger value="debts" className="rounded-xl px-4 py-2.5">{pick("দেনা-পাওনা", "Debts")} ({debts.length})</TabsTrigger>
                <TabsTrigger value="bills" className="rounded-xl px-4 py-2.5">{pick("বিল", "Bills")} ({bills.length})</TabsTrigger>
                <TabsTrigger value="goals" className="rounded-xl px-4 py-2.5">{pick("লক্ষ্য", "Goals")} ({goals.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
                  <Card className="rounded-3xl py-0 shadow-none">
                    <CardHeader className="flex-row items-start justify-between p-5 pb-3 md:p-6 md:pb-3">
                      <div><CardTitle>{pick("মাসিক নগদ প্রবাহ", "Monthly cashflow")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{pick("বাজেট ও ব্যয়ের স্বাস্থ্য", "Budget and spending health")}</p></div>
                      <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => void exportWorkbook({ name: pick("সারসংক্ষেপ", "Summary"), rows: summaryRows })}><Download className="size-4" /> {pick("XLSX রপ্তানি", "Export XLSX")}</Button>
                    </CardHeader>
                    <CardContent className="space-y-5 p-5 pt-2 md:p-6 md:pt-2">
                      <div className="grid grid-cols-3 gap-3">
                        <CashflowStat label={pick("আয়", "Income")} value={totals.income} tone="good" />
                        <CashflowStat label={pick("ব্যয়", "Expense")} value={totals.expense} tone="bad" />
                        <CashflowStat label={pick("নিট", "Net")} value={totals.net} tone="neutral" />
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{pick("মাসিক বাজেট ব্যবহার", "Monthly budget used")}</span><strong>{Math.round(totals.budgetUsed)}%</strong></div>
                        <Progress value={Math.min(100, totals.budgetUsed)} className="h-2.5" />
                        <p className="mt-2 text-xs text-muted-foreground">{money.format(totals.expense)} {pick("এর মধ্যে", "of")} {money.format(totals.budgetLimit || 0)}</p>
                      </div>
                      <div className="space-y-3">
                        <p className="font-semibold">{pick("শীর্ষ ব্যয়ের ক্যাটাগরি", "Top expense categories")}</p>
                        {expenseCategories.slice(0, 5).map(([category, amount]) => <CategoryBar key={category} category={category} amount={amount} total={totals.expense} />)}
                        {!expenseCategories.length ? <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{pick("এই মাসে কোনো ব্যয় নেই।", "There are no expenses this month.")}</p> : null}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-3xl bg-primary py-0 text-primary-foreground shadow-none">
                    <CardContent className="p-6">
                      <PiggyBank className="size-8" />
                      <p className="mt-5 text-sm text-primary-foreground/70">{pick("ব্যবহারযোগ্য আর্থিক অবস্থা", "Financial breathing room")}</p>
                      <p className="mt-1 text-3xl font-bold">{money.format(totals.balance - totals.pendingBillAmount)}</p>
                      <p className="mt-2 text-sm text-primary-foreground/70">{pick("বর্তমান ব্যালান্স থেকে অপেক্ষমাণ বিল বাদ দিয়ে", "Current balance after pending bills")}</p>
                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <DarkStat label={pick("পাওনা", "Receivable")} value={money.format(totals.lentOutstanding)} />
                        <DarkStat label={pick("দেনা", "Payable")} value={money.format(totals.borrowedOutstanding)} />
                        <DarkStat label={pick("লক্ষ্য", "Goals")} value={String(goals.filter((item) => item.status === "active").length)} />
                        <DarkStat label={pick("পুনরাবৃত্ত", "Recurring")} value={String(transactions.filter((item) => item.is_recurring).length)} />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <DataSection title={pick("অ্যাকাউন্ট ও ওয়ালেট", "Accounts and wallets")} description={pick("প্রারম্ভিক ব্যালান্স ও লেনদেন থেকে বর্তমান ব্যালান্স", "Live balance from opening balance and transactions")} onAdd={() => openRecord("account")} onExport={() => void exportWorkbook({ name: pick("অ্যাকাউন্ট", "Accounts"), rows: accountRows })}>
                  <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
                    {accounts.map((account) => <div key={account.id} className="rounded-2xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><WalletCards className="size-5" /></span><div className="flex items-center"><Badge variant="outline">{financeStatusLabel(account.account_type, locale)}</Badge><RecordActions disabled={saving} onEdit={() => openEditRecord("account", account)} onDelete={() => void deleteRecord("account", account.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Could not delete.")))} /></div></div><p className="mt-4 font-semibold">{account.name}</p><p className="mt-1 text-2xl font-bold">{money.format(accountBalance(account))}</p><div className="mt-3 flex items-center justify-between"><StatusBadge value={account.status} /><Button variant="ghost" size="sm" disabled={saving} onClick={() => void updateStatus("account", account.id, account.status === "active" ? "archived" : "active").catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("আপডেট হয়নি।", "Could not update.")))}>{account.status === "active" ? pick("আর্কাইভ", "Archive") : pick("আবার সক্রিয় করুন", "Reactivate")}</Button></div></div>)}
                  </div>
                </DataSection>
              </TabsContent>

              <TabsContent value="transactions">
                <DataSection title={pick("আয় ও ব্যয়ের খতিয়ান", "Income and expense ledger")} description={pick("তারিখ, অ্যাকাউন্ট, ক্যাটাগরি, পদ্ধতি ও পুনরাবৃত্ত রেফারেন্স", "Date, account, category, method and recurring reference")} onAdd={() => openRecord("transaction")} onExport={() => void exportWorkbook({ name: pick("লেনদেন", "Transactions"), rows: transactionRows })}>
                  <Table><TableHeader><TableRow><TableHead>{pick("তারিখ", "Date")}</TableHead><TableHead>{pick("ধরন", "Type")}</TableHead><TableHead>{pick("ক্যাটাগরি", "Category")}</TableHead><TableHead>{pick("অ্যাকাউন্ট", "Account")}</TableHead><TableHead>{pick("পরিমাণ", "Amount")}</TableHead><TableHead>{pick("পদ্ধতি", "Method")}</TableHead><TableHead>{pick("নোট", "Notes")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
                    {transactions.map((item) => <TableRow key={item.id}><TableCell>{date.format(new Date(item.transaction_date + "T00:00:00"))}</TableCell><TableCell><StatusBadge value={item.direction} /></TableCell><TableCell>{item.category}{item.is_recurring ? <Badge variant="outline" className="ml-2">{pick("পুনরাবৃত্ত", "Recurring")}</Badge> : null}</TableCell><TableCell>{accounts.find((account) => account.id === item.account_id)?.name || pick("আর্কাইভ", "Archived")}</TableCell><TableCell className={item.direction === "income" ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>{item.direction === "income" ? "+" : "-"}{money.format(valueOf(item.amount))}</TableCell><TableCell>{financeStatusLabel(item.payment_method, locale)}</TableCell><TableCell className="max-w-64 truncate">{item.notes || item.reference || "—"}</TableCell><TableCell><RecordActions disabled={saving} onEdit={() => openEditRecord("transaction", item)} onDelete={() => void deleteRecord("transaction", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Could not delete.")))} /></TableCell></TableRow>)}
                    <EmptyRows show={!transactions.length} columns={8} />
                  </TableBody></Table>
                </DataSection>
              </TabsContent>

              <TabsContent value="budgets">
                <DataSection title={pick("মাসিক ক্যাটাগরি বাজেট", "Monthly category budgets")} description={pick(month + " মাসের সীমা, ব্যয় ও সতর্কতার মাত্রা", "Limits, spending and alert threshold for " + month)} onAdd={() => openRecord("budget")} onExport={() => void exportWorkbook({ name: pick("বাজেট", "Budgets"), rows: budgetRows })}>
                  <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                    {monthBudgets.map((item) => {
                      const spent = financeMoneyTotal(monthTransactions.filter((transaction) => transaction.direction === "expense" && transaction.category === item.category).map((transaction) => transaction.amount));
                      const percent = Math.min(100, (spent / valueOf(item.limit_amount)) * 100);
                      return <div key={item.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between"><div><p className="font-semibold">{item.category}</p><p className="text-sm text-muted-foreground">{money.format(spent)} / {money.format(valueOf(item.limit_amount))}</p></div><div className="flex items-center"><StatusBadge value={percent >= item.alert_percent ? "alert" : "healthy"} /><RecordActions disabled={saving} onEdit={() => openEditRecord("budget", item)} onDelete={() => void deleteRecord("budget", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Could not delete.")))} /></div></div><Progress value={percent} className="mt-4 h-2.5" /><p className="mt-2 text-xs text-muted-foreground">{pick(`${item.alert_percent}% এ সতর্কতা`, `Alert at ${item.alert_percent}%`)} · {pick(`${money.format(Math.max(0, valueOf(item.limit_amount) - spent))} বাকি`, `${money.format(Math.max(0, valueOf(item.limit_amount) - spent))} remaining`)}</p></div>;
                    })}
                    {!monthBudgets.length ? <EmptyCard text={pick("এই মাসের কোনো বাজেট নেই।", "There are no budgets for this month.")} /> : null}
                  </div>
                </DataSection>
              </TabsContent>

              <TabsContent value="debts">
                <DataSection title={pick("দেনা-পাওনা ট্র্যাকার", "Debt and lending tracker")} description={pick("কাকে দিয়েছেন, কার কাছ থেকে নিয়েছেন, নির্ধারিত তারিখ ও নিষ্পত্তি", "Who you lent to or borrowed from, due dates and settlement")} onAdd={() => openRecord("debt")} onExport={() => void exportWorkbook({ name: pick("দেনা-পাওনা", "Debts"), rows: debtRows })}>
                  <Table><TableHeader><TableRow><TableHead>{pick("ব্যক্তি", "Person")}</TableHead><TableHead>{pick("ধরন", "Type")}</TableHead><TableHead>{pick("মূল পরিমাণ", "Principal")}</TableHead><TableHead>{pick("নিষ্পত্তি", "Settled")}</TableHead><TableHead>{pick("বাকি", "Outstanding")}</TableHead><TableHead>{pick("নির্ধারিত", "Due")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
                    {debts.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.counterparty}</TableCell><TableCell><StatusBadge value={item.debt_type} /></TableCell><TableCell>{money.format(valueOf(item.principal_amount))}</TableCell><TableCell>{money.format(valueOf(item.settled_amount))}</TableCell><TableCell className="font-bold">{money.format(Math.max(0, valueOf(item.principal_amount) - valueOf(item.settled_amount)))}</TableCell><TableCell>{item.due_date ? date.format(new Date(item.due_date + "T00:00:00")) : pick("তারিখ নেই", "No date")}</TableCell><TableCell><StatusBadge value={item.status} /></TableCell><TableCell><div className="flex"><Button variant="ghost" size="sm" onClick={() => setProgressTarget({ entity: "debt", id: item.id, title: item.counterparty, amount: String(item.settled_amount), maximum: valueOf(item.principal_amount) })}>{pick("অগ্রগতি", "Progress")}</Button><RecordActions disabled={saving} onEdit={() => openEditRecord("debt", item)} onDelete={() => void deleteRecord("debt", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Could not delete.")))} /></div></TableCell></TableRow>)}
                    <EmptyRows show={!debts.length} columns={8} />
                  </TableBody></Table>
                </DataSection>
              </TabsContent>

              <TabsContent value="bills">
                <DataSection title={pick("বিল ও পরিশোধের রিমাইন্ডার", "Bills and payment reminders")} description={pick("ইউটিলিটি, ভাড়া, সাবস্ক্রিপশন, কর ও পুনরাবৃত্ত পাওনা", "Utilities, rent, subscriptions, tax and recurring dues")} onAdd={() => openRecord("bill")} onExport={() => void exportWorkbook({ name: pick("বিল", "Bills"), rows: billRows })}>
                  <Table><TableHeader><TableRow><TableHead>{pick("বিল", "Bill")}</TableHead><TableHead>{pick("ক্যাটাগরি", "Category")}</TableHead><TableHead>{pick("পরিমাণ", "Amount")}</TableHead><TableHead>{pick("নির্ধারিত তারিখ", "Due date")}</TableHead><TableHead>{pick("পুনরাবৃত্তি", "Recurrence")}</TableHead><TableHead>{pick("স্ট্যাটাস", "Status")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
                    {bills.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.title}</TableCell><TableCell>{item.category}</TableCell><TableCell>{money.format(valueOf(item.amount))}</TableCell><TableCell>{date.format(new Date(item.due_date + "T00:00:00"))}</TableCell><TableCell>{financeStatusLabel(item.recurrence, locale)}</TableCell><TableCell><StatusBadge value={item.status} /></TableCell><TableCell><div className="flex"><StatusMenu values={["pending", "paid", "skipped"]} disabled={saving} onSelect={(status) => void updateStatus("bill", item.id, status).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("আপডেট হয়নি।", "Could not update.")))} /><RecordActions disabled={saving} onEdit={() => openEditRecord("bill", item)} onDelete={() => void deleteRecord("bill", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Could not delete.")))} /></div></TableCell></TableRow>)}
                    <EmptyRows show={!bills.length} columns={7} />
                  </TableBody></Table>
                </DataSection>
              </TabsContent>

              <TabsContent value="goals">
                <DataSection title={pick("সঞ্চয়ের লক্ষ্য", "Savings goals")} description={pick("লক্ষ্য, সঞ্চিত পরিমাণ, সময়সীমা ও সম্পন্নের অগ্রগতি", "Target, saved amount, deadline and completion progress")} onAdd={() => openRecord("goal")} onExport={() => void exportWorkbook({ name: pick("লক্ষ্য", "Goals"), rows: goalRows })}>
                  <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                    {goals.map((item) => {
                      const progress = Math.min(100, (valueOf(item.current_amount) / valueOf(item.target_amount)) * 100);
                      return <div key={item.id} className="rounded-2xl border p-5"><div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Target className="size-5" /></span><div className="flex items-center"><StatusBadge value={item.status} /><RecordActions disabled={saving} onEdit={() => openEditRecord("goal", item)} onDelete={() => void deleteRecord("goal", item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("মোছা যায়নি।", "Could not delete.")))} /></div></div><h3 className="mt-4 font-bold">{item.title}</h3><p className="mt-1 text-2xl font-bold">{money.format(valueOf(item.current_amount))}</p><p className="text-sm text-muted-foreground">{pick("লক্ষ্যমাত্রা", "of")} {money.format(valueOf(item.target_amount))}</p><Progress value={progress} className="mt-4 h-2.5" /><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{Math.round(progress)}%</span><span>{item.target_date ? date.format(new Date(item.target_date + "T00:00:00")) : pick("সময়সীমা নেই", "No deadline")}</span></div><Button variant="outline" size="sm" className="mt-4 w-full rounded-xl" onClick={() => setProgressTarget({ entity: "goal", id: item.id, title: item.title, amount: String(item.current_amount), maximum: valueOf(item.target_amount) })}>{pick("সঞ্চিত পরিমাণ আপডেট", "Update saved amount")}</Button></div>;
                    })}
                    {!goals.length ? <EmptyCard text={pick("এখনও কোনো সঞ্চয়ের লক্ষ্য নেই।", "There are no savings goals yet.")} /> : null}
                  </div>
                </DataSection>
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

      <Dialog open={Boolean(recordKind)} onOpenChange={(open) => { if (!open) { setRecordKind(null); setEditingRecord(null); } }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
          <DialogHeader><DialogTitle>{recordKind ? kindLabels[recordKind] : pick("হিসাবের রেকর্ড", "Finance record")} {editingRecord ? pick("সম্পাদনা করুন", "edit") : pick("যোগ করুন", "add")}</DialogTitle><DialogDescription>{pick("এই তথ্য শুধু আপনার ব্যক্তিগত হিসাবের জায়গায় থাকবে।", "This information stays only in your private finance workspace.")}</DialogDescription></DialogHeader>
          {recordKind ? <FinanceForm kind={recordKind} form={form} setForm={setForm} accounts={activeAccounts} /> : null}
          <DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => { setRecordKind(null); setEditingRecord(null); }}>{pick("বাতিল", "Cancel")}</Button><Button className="gap-2 rounded-xl" disabled={saving} onClick={() => void saveRecord().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("সংরক্ষণ হয়নি।", "Could not save.")))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : editingRecord ? <Pencil className="size-4" /> : <Plus className="size-4" />} {editingRecord ? pick("হালনাগাদ করুন", "Update") : pick("সংরক্ষণ করুন", "Save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(progressTarget)} onOpenChange={(open) => !open && setProgressTarget(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader><DialogTitle>{pick("অগ্রগতি হালনাগাদ", "Update progress")}</DialogTitle><DialogDescription>{progressTarget?.title} · {progressTarget?.entity === "debt" ? pick("সর্বোচ্চ", "maximum") : pick("লক্ষ্যমাত্রা", "target")} {money.format(progressTarget?.maximum ?? 0)}</DialogDescription></DialogHeader>
          <FormField label={progressTarget?.entity === "debt" ? pick("মোট নিষ্পত্তির পরিমাণ", "Total settled amount") : pick("মোট সঞ্চিত পরিমাণ", "Total saved amount")} id="progress-amount"><Input id="progress-amount" type="number" min="0" max={progressTarget?.entity === "debt" ? progressTarget.maximum : undefined} step="0.01" value={progressTarget?.amount ?? ""} onChange={(event) => setProgressTarget((current) => current ? { ...current, amount: event.target.value } : current)} /></FormField>
          <DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setProgressTarget(null)}>{pick("বাতিল", "Cancel")}</Button><Button className="rounded-xl" disabled={saving} onClick={() => void saveProgress().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("হালনাগাদ হয়নি।", "Could not update.")))}>{pick("হালনাগাদ করুন", "Update")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <Card className="rounded-2xl py-0 shadow-none"><CardContent className="p-5"><span className="mb-4 grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card>;
}

function CashflowStat({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" | "neutral" }) {
  const { locale } = useLocale();
  const money = moneyFor(locale);
  const style = tone === "good" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : tone === "bad" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-primary/10 text-primary";
  return <div className={"rounded-2xl p-3 " + style}><p className="text-xs opacity-75">{label}</p><p className="mt-1 font-bold">{money.format(value)}</p></div>;
}

function DarkStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-primary-foreground/65">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}

function CategoryBar({ category, amount, total }: { category: string; amount: number; total: number }) {
  const { locale } = useLocale();
  const money = moneyFor(locale);
  const percent = total ? (amount / total) * 100 : 0;
  return <div><div className="mb-1.5 flex items-center justify-between text-sm"><span>{category}</span><strong>{money.format(amount)}</strong></div><Progress value={percent} className="h-2" /></div>;
}

function DataSection({ title, description, onAdd, onExport, children }: { title: string; description: string; onAdd: () => void; onExport: () => void; children: ReactNode }) {
  const { pick } = useLocale();
  return <Card className="gap-0 overflow-hidden rounded-3xl py-0 shadow-none"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={onExport}><Download className="size-4" /> {pick("XLSX রপ্তানি", "Export XLSX")}</Button><Button size="sm" className="gap-2 rounded-xl" onClick={onAdd}><Plus className="size-4" /> {pick("যোগ করুন", "Add")}</Button></div></div><div className="overflow-x-auto">{children}</div></Card>;
}

function EmptyRows({ show, columns }: { show: boolean; columns: number }) {
  const { pick } = useLocale();
  return show ? <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">{pick("এখনও কোনো রেকর্ড নেই। যোগ করুন দিয়ে শুরু করুন।", "No records yet. Use Add to begin.")}</TableCell></TableRow> : null;
}

function EmptyCard({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function StateCard({ icon, title, text, action, compact = false }: { icon: ReactNode; title: string; text: string; action?: ReactNode; compact?: boolean }) {
  return <Card className="rounded-3xl py-0 shadow-none"><CardContent className={"flex flex-col items-center justify-center p-8 text-center " + (compact ? "min-h-72" : "min-h-96")}><span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><h2 className="mt-5 text-2xl font-bold">{title}</h2><p className="mt-2 max-w-xl text-muted-foreground">{text}</p>{action ? <div className="mt-6">{action}</div> : null}</CardContent></Card>;
}

function StatusBadge({ value }: { value: string }) {
  const { locale } = useLocale();
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
  return <Badge variant="secondary" className={className}>{financeStatusLabel(value, locale)}</Badge>;
}

function StatusMenu({ values, onSelect, disabled }: { values: string[]; onSelect: (value: string) => void; disabled: boolean }) {
  const { locale, pick } = useLocale();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-xl" disabled={disabled}><MoreHorizontal className="size-4" /><span className="sr-only">{pick("স্ট্যাটাস পরিবর্তন", "Status actions")}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{values.map((value) => <DropdownMenuItem key={value} onClick={() => onSelect(value)}>{financeStatusLabel(value, locale)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function RecordActions({ onEdit, onDelete, disabled }: { onEdit: () => void; onDelete: () => void; disabled: boolean }) {
  const { pick } = useLocale();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-xl" disabled={disabled}><MoreHorizontal className="size-4" /><span className="sr-only">{pick("রেকর্ডের কাজ", "Record actions")}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onEdit}><Pencil /> {pick("বিস্তারিত সম্পাদনা", "Edit details")}</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 /> {pick("স্থায়ীভাবে মুছুন", "Delete permanently")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

const financeStatusBn: Record<string, string> = { active: "সক্রিয়", archived: "আর্কাইভ", paid: "পরিশোধিত", settled: "নিষ্পত্তি", completed: "সম্পন্ন", income: "আয়", healthy: "স্বাভাবিক", lent: "ধার দিয়েছি", pending: "অপেক্ষমাণ", partial: "আংশিক", open: "খোলা", alert: "সতর্কতা", borrowed: "ধার নিয়েছি", overdue: "সময়োত্তীর্ণ", expense: "ব্যয়", skipped: "বাদ দেওয়া", cash: "নগদ", bank: "ব্যাংক", mobile_banking: "মোবাইল ব্যাংকিং", card: "কার্ড", savings: "সঞ্চয়", bank_transfer: "ব্যাংক ট্রান্সফার", mobile_wallet: "মোবাইল ওয়ালেট", cheque: "চেক", monthly: "মাসিক", weekly: "সাপ্তাহিক", quarterly: "ত্রৈমাসিক", yearly: "বার্ষিক", one_time: "এককালীন", none: "পুনরাবৃত্তি নেই" };
function financeStatusLabel(value: string, locale: AppLocale) {
  const extraBn: Record<string, string> = { mobile: "মোবাইল ব্যাংকিং", credit: "ক্রেডিট", other: "অন্যান্য" };
  return (locale === "bn" ? financeStatusBn[value] ?? extraBn[value] : undefined) ?? value.replaceAll("_", " ");
}

function FormField({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function ValueSelect({ id, value, onChange, items }: { id: string; value: string; onChange: (value: string) => void; items: Array<[string, string]> }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger id={id} className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{items.map(([itemValue, label]) => <SelectItem key={itemValue} value={itemValue}>{label}</SelectItem>)}</SelectContent></Select>;
}

function FinanceForm({ kind, form, setForm, accounts }: { kind: FinanceRecordKind; form: FormState; setForm: (value: FormState) => void; accounts: FinanceAccount[] }) {
  const { pick } = useLocale();
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });
  const input = (key: string, label: string, type = "text", options?: { min?: string; max?: string; step?: string; list?: string }) => <FormField label={label} id={"finance-" + key}><Input id={"finance-" + key} type={type} min={options?.min} max={options?.max} step={options?.step} list={options?.list} value={form[key] ?? ""} onChange={(event) => set(key, event.target.value)} /></FormField>;
  const select = (key: string, label: string, items: Array<[string, string]>) => <FormField label={label} id={"finance-" + key}><ValueSelect id={"finance-" + key} value={form[key] ?? items[0]?.[0] ?? ""} onChange={(value) => set(key, value)} items={items} /></FormField>;
  const notes = <div className="sm:col-span-2"><FormField label={pick("নোট", "Notes")} id="finance-notes"><Textarea id="finance-notes" rows={3} value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} /></FormField></div>;
  const category = input("category", pick("ক্যাটাগরি", "Category"), "text", { list: "finance-categories" });
  const suggestions = <datalist id="finance-categories">{categorySuggestions.map((item) => <option key={item} value={item} />)}</datalist>;

  if (kind === "account") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("name", pick("অ্যাকাউন্ট / ওয়ালেটের নাম", "Account / wallet name"))}{select("accountType", pick("অ্যাকাউন্টের ধরন", "Account type"), [["cash", pick("নগদ", "Cash")], ["bank", pick("ব্যাংক", "Bank")], ["mobile", pick("মোবাইল ব্যাংকিং", "Mobile banking")], ["savings", pick("সঞ্চয়", "Savings")], ["credit", pick("ক্রেডিট", "Credit")]])}{input("openingBalance", pick("প্রারম্ভিক ব্যালান্স", "Opening balance"), "number", { step: "0.01" })}{notes}</div>;
  if (kind === "transaction") return <div className="grid gap-4 py-2 sm:grid-cols-2">{select("accountId", pick("অ্যাকাউন্ট", "Account"), accounts.map((item) => [item.id, item.name]))}{select("direction", pick("ধরন", "Type"), [["expense", pick("ব্যয়", "Expense")], ["income", pick("আয়", "Income")]])}{category}{suggestions}{input("amount", pick("পরিমাণ", "Amount"), "number", { min: "0.01", step: "0.01" })}{input("transactionDate", pick("তারিখ", "Date"), "date")}{select("paymentMethod", pick("পরিশোধ পদ্ধতি", "Payment method"), [["cash", pick("নগদ", "Cash")], ["bank", pick("ব্যাংক", "Bank")], ["mobile", pick("মোবাইল ব্যাংকিং", "Mobile banking")], ["card", pick("কার্ড", "Card")], ["other", pick("অন্যান্য", "Other")]])}{select("isRecurring", pick("পুনরাবৃত্ত এন্ট্রি", "Recurring entry"), [["false", pick("না", "No")], ["true", pick("হ্যাঁ", "Yes")]])}{input("reference", pick("রেফারেন্স", "Reference"))}{notes}</div>;
  if (kind === "budget") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("budgetMonth", pick("বাজেটের মাস", "Budget month"), "month")}{category}{suggestions}{input("limitAmount", pick("সীমার পরিমাণ", "Limit amount"), "number", { min: "0.01", step: "0.01" })}{input("alertPercent", pick("সতর্কতা %", "Alert at %"), "number", { min: "1", max: "100", step: "1" })}{notes}</div>;
  if (kind === "debt") return <div className="grid gap-4 py-2 sm:grid-cols-2">{select("debtType", pick("ধরন", "Type"), [["lent", pick("আমি ধার দিয়েছি", "I lent money")], ["borrowed", pick("আমি ধার নিয়েছি", "I borrowed money")]])}{input("counterparty", pick("ব্যক্তি / প্রতিষ্ঠান", "Person / organization"))}{input("principalAmount", pick("মূল পরিমাণ", "Principal amount"), "number", { min: "0.01", step: "0.01" })}{input("settledAmount", pick("ইতিমধ্যে নিষ্পত্তি", "Already settled"), "number", { min: "0", step: "0.01" })}{input("dueDate", pick("নির্ধারিত তারিখ", "Due date"), "date")}{notes}</div>;
  if (kind === "bill") return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("title", pick("বিলের নাম", "Bill name"))}{category}{suggestions}{input("amount", pick("পরিমাণ", "Amount"), "number", { min: "0.01", step: "0.01" })}{input("dueDate", pick("নির্ধারিত তারিখ", "Due date"), "date")}{select("recurrence", pick("পুনরাবৃত্তি", "Recurrence"), [["none", pick("একবার", "One time")], ["monthly", pick("মাসিক", "Monthly")], ["yearly", pick("বার্ষিক", "Yearly")]])}{notes}</div>;
  return <div className="grid gap-4 py-2 sm:grid-cols-2">{input("title", pick("লক্ষ্যের শিরোনাম", "Goal title"))}{input("targetAmount", pick("লক্ষ্যের পরিমাণ", "Target amount"), "number", { min: "0.01", step: "0.01" })}{input("currentAmount", pick("ইতিমধ্যে সঞ্চিত", "Already saved"), "number", { min: "0", step: "0.01" })}{input("targetDate", pick("লক্ষ্যের তারিখ", "Target date"), "date")}{notes}</div>;
}
