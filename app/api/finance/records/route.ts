import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import type { FinanceRecordKind } from "@/lib/personal-finance-types";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

const kinds: FinanceRecordKind[] = ["account", "transaction", "budget", "debt", "bill", "goal"];
const tableByKind: Record<FinanceRecordKind, string> = {
  account: "personal_finance_accounts",
  transaction: "personal_finance_transactions",
  budget: "personal_finance_budgets",
  debt: "personal_finance_debts",
  bill: "personal_finance_bills",
  goal: "personal_finance_goals",
};

const textValue = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const numberValue = (value: unknown, fallback?: number) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T) {
  const candidate = textValue(value, 40);
  return candidate && values.includes(candidate as T) ? (candidate as T) : fallback;
}

function monthDate(value: unknown) {
  const month = textValue(value, 10);
  return month && /^\d{4}-\d{2}$/.test(month) ? month + "-01" : null;
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) {
      return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    }

    const body = (await request.json()) as {
      kind?: FinanceRecordKind;
      data?: Record<string, unknown>;
    };
    const kind = body.kind;
    const data = body.data ?? {};
    if (!kind || !kinds.includes(kind)) {
      return Response.json({ error: "Valid finance record type প্রয়োজন।" }, { status: 400 });
    }

    const base = {
      family_id: membership.family_id,
      auth_user_id: user.userId,
    };
    let table = "";
    let record: Record<string, unknown>;

    if (kind === "account") {
      const name = textValue(data.name, 120);
      const openingBalance = numberValue(data.openingBalance, 0);
      if (!name || openingBalance === undefined) {
        return Response.json({ error: "Account name ও opening balance সঠিকভাবে দিন।" }, { status: 400 });
      }
      table = "personal_finance_accounts";
      record = {
        ...base,
        name,
        account_type: enumValue(data.accountType, ["cash", "bank", "mobile", "savings", "credit"] as const, "cash"),
        opening_balance: openingBalance,
        currency: "BDT",
        status: "active",
      };
    } else if (kind === "transaction") {
      const accountId = textValue(data.accountId, 80);
      const category = textValue(data.category, 100);
      const amount = numberValue(data.amount);
      if (!accountId || !category || amount === undefined || amount <= 0) {
        return Response.json({ error: "Account, category ও positive amount প্রয়োজন।" }, { status: 400 });
      }
      const accountQuery = new URLSearchParams({
        select: "id",
        id: `eq.${accountId}`,
        family_id: `eq.${membership.family_id}`,
        auth_user_id: `eq.${user.userId}`,
        status: "eq.active",
        limit: "1",
      });
      const account = (
        await supabaseRest<Array<{ id: string }>>(`personal_finance_accounts?${accountQuery}`)
      )[0];
      if (!account) return Response.json({ error: "নিজের active account নির্বাচন করুন।" }, { status: 400 });
      table = "personal_finance_transactions";
      record = {
        ...base,
        account_id: accountId,
        direction: enumValue(data.direction, ["income", "expense"] as const, "expense"),
        category,
        amount,
        transaction_date: textValue(data.transactionDate, 20) ?? new Date().toISOString().slice(0, 10),
        payment_method: enumValue(data.paymentMethod, ["cash", "bank", "mobile", "card", "other"] as const, "cash"),
        reference: textValue(data.reference, 180),
        notes: textValue(data.notes, 2000),
        is_recurring: data.isRecurring === true || data.isRecurring === "true",
      };
    } else if (kind === "budget") {
      const budgetMonth = monthDate(data.budgetMonth);
      const category = textValue(data.category, 100);
      const limitAmount = numberValue(data.limitAmount);
      const alertPercent = numberValue(data.alertPercent, 80);
      if (
        !budgetMonth ||
        !category ||
        limitAmount === undefined ||
        limitAmount <= 0 ||
        alertPercent === undefined ||
        alertPercent < 1 ||
        alertPercent > 100
      ) {
        return Response.json({ error: "Budget month, category, limit ও alert সঠিকভাবে দিন।" }, { status: 400 });
      }
      table = "personal_finance_budgets";
      record = {
        ...base,
        budget_month: budgetMonth,
        category,
        limit_amount: limitAmount,
        alert_percent: Math.round(alertPercent),
        notes: textValue(data.notes, 2000),
      };
    } else if (kind === "debt") {
      const counterparty = textValue(data.counterparty, 180);
      const principal = numberValue(data.principalAmount);
      const settled = numberValue(data.settledAmount, 0);
      if (
        !counterparty ||
        principal === undefined ||
        principal <= 0 ||
        settled === undefined ||
        settled < 0 ||
        settled > principal
      ) {
        return Response.json({ error: "ব্যক্তির নাম, principal ও settled amount সঠিকভাবে দিন।" }, { status: 400 });
      }
      const status = settled >= principal ? "settled" : settled > 0 ? "partial" : "open";
      table = "personal_finance_debts";
      record = {
        ...base,
        debt_type: enumValue(data.debtType, ["lent", "borrowed"] as const, "lent"),
        counterparty,
        principal_amount: principal,
        settled_amount: settled,
        due_date: textValue(data.dueDate, 20),
        status,
        notes: textValue(data.notes, 2000),
      };
    } else if (kind === "bill") {
      const title = textValue(data.title, 180);
      const category = textValue(data.category, 100);
      const amount = numberValue(data.amount);
      const dueDate = textValue(data.dueDate, 20);
      if (!title || !category || amount === undefined || amount <= 0 || !dueDate) {
        return Response.json({ error: "Bill title, category, amount ও due date প্রয়োজন।" }, { status: 400 });
      }
      table = "personal_finance_bills";
      record = {
        ...base,
        title,
        category,
        amount,
        due_date: dueDate,
        recurrence: enumValue(data.recurrence, ["none", "monthly", "yearly"] as const, "none"),
        status: "pending",
        notes: textValue(data.notes, 2000),
      };
    } else {
      const title = textValue(data.title, 180);
      const targetAmount = numberValue(data.targetAmount);
      const currentAmount = numberValue(data.currentAmount, 0);
      if (
        !title ||
        targetAmount === undefined ||
        targetAmount <= 0 ||
        currentAmount === undefined ||
        currentAmount < 0
      ) {
        return Response.json({ error: "Goal title, target ও saved amount সঠিকভাবে দিন।" }, { status: 400 });
      }
      table = "personal_finance_goals";
      record = {
        ...base,
        title,
        target_amount: targetAmount,
        current_amount: currentAmount,
        target_date: textValue(data.targetDate, 20),
        status: currentAmount >= targetAmount ? "completed" : "active",
        notes: textValue(data.notes, 2000),
      };
    }

    const [created] = await supabaseRest<Array<Record<string, unknown>>>(table, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(record),
    });
    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: `personal_finance_${kind}_created`,
        entity_type: `personal_finance_${kind}`,
        entity_id: String(created.id),
        metadata: { private: true },
      }),
    });
    return Response.json({ record: created }, { status: 201 });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to save private finance record", error.status, error.message);
      return Response.json({ error: "Finance record save হয়নি।" }, { status: 502 });
    }
    console.error("Unable to save private finance record", error);
    return Response.json({ error: "Finance record save হয়নি।" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });

    const body = (await request.json()) as { kind?: FinanceRecordKind; recordId?: unknown; data?: Record<string, unknown> };
    const kind = body.kind;
    const recordId = textValue(body.recordId, 80);
    if (!kind || !kinds.includes(kind) || !recordId) return Response.json({ error: "Valid finance record ও ID প্রয়োজন।" }, { status: 400 });
    const table = tableByKind[kind];
    const filter = new URLSearchParams({ id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, auth_user_id: `eq.${user.userId}` });
    const existing = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${new URLSearchParams({ select: "*", ...Object.fromEntries(filter) as Record<string, string>, limit: "1" })}`))[0];
    if (!existing) return Response.json({ error: "নিজের finance record পাওয়া যায়নি।" }, { status: 404 });
    const changes = await financeChanges(kind, body.data ?? {}, membership.family_id, user.userId);
    if (changes instanceof Response) return changes;
    if (kind !== "transaction") changes.updated_at = new Date().toISOString();
    const [updated] = await supabaseRest<Array<Record<string, unknown>>>(`${table}?${filter}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(changes),
    });
    await audit(membership.family_id, user.userId, `personal_finance_${kind}_updated`, `personal_finance_${kind}`, recordId);
    return Response.json({ record: updated, message: `${kind} record update হয়েছে।` });
  } catch (error) {
    return financeError(error, "Unable to update private finance record", "Finance record update হয়নি।");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const body = (await request.json()) as { kind?: FinanceRecordKind; recordId?: unknown };
    const kind = body.kind;
    const recordId = textValue(body.recordId, 80);
    if (!kind || !kinds.includes(kind) || !recordId) return Response.json({ error: "Valid finance record ও ID প্রয়োজন।" }, { status: 400 });
    const table = tableByKind[kind];
    const filter = new URLSearchParams({ id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, auth_user_id: `eq.${user.userId}` });
    const existing = (await supabaseRest<Array<{ id: string }>>(`${table}?${new URLSearchParams({ select: "id", id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, auth_user_id: `eq.${user.userId}`, limit: "1" })}`))[0];
    if (!existing) return Response.json({ error: "নিজের finance record পাওয়া যায়নি।" }, { status: 404 });
    if (kind === "account") {
      const linked = (await supabaseRest<Array<{ id: string }>>(`personal_finance_transactions?${new URLSearchParams({ select: "id", account_id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, auth_user_id: `eq.${user.userId}`, limit: "1" })}`))[0];
      if (linked) return Response.json({ error: "এই account-এ transaction আছে। Delete না করে Archive করুন।" }, { status: 409 });
    }
    await supabaseRest(`${table}?${filter}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await audit(membership.family_id, user.userId, `personal_finance_${kind}_deleted`, `personal_finance_${kind}`, recordId);
    return Response.json({ message: `${kind} record স্থায়ীভাবে delete হয়েছে।` });
  } catch (error) {
    return financeError(error, "Unable to delete private finance record", "Finance record delete হয়নি।");
  }
}

async function financeChanges(kind: FinanceRecordKind, data: Record<string, unknown>, familyId: string, userId: string): Promise<Record<string, unknown> | Response> {
  if (kind === "account") {
    const name = textValue(data.name, 120), openingBalance = numberValue(data.openingBalance, 0);
    if (!name || openingBalance === undefined) return Response.json({ error: "Account name ও opening balance সঠিকভাবে দিন।" }, { status: 400 });
    return { name, account_type: enumValue(data.accountType, ["cash", "bank", "mobile", "savings", "credit"] as const, "cash"), opening_balance: openingBalance };
  }
  if (kind === "transaction") {
    const accountId = textValue(data.accountId, 80), category = textValue(data.category, 100), amount = numberValue(data.amount);
    if (!accountId || !category || amount === undefined || amount <= 0) return Response.json({ error: "Account, category ও positive amount প্রয়োজন।" }, { status: 400 });
    const account = (await supabaseRest<Array<{ id: string }>>(`personal_finance_accounts?${new URLSearchParams({ select: "id", id: `eq.${accountId}`, family_id: `eq.${familyId}`, auth_user_id: `eq.${userId}`, status: "eq.active", limit: "1" })}`))[0];
    if (!account) return Response.json({ error: "নিজের active account নির্বাচন করুন।" }, { status: 400 });
    return { account_id: accountId, direction: enumValue(data.direction, ["income", "expense"] as const, "expense"), category, amount, transaction_date: textValue(data.transactionDate, 20) ?? new Date().toISOString().slice(0, 10), payment_method: enumValue(data.paymentMethod, ["cash", "bank", "mobile", "card", "other"] as const, "cash"), reference: textValue(data.reference, 180), notes: textValue(data.notes, 2000), is_recurring: data.isRecurring === true || data.isRecurring === "true" };
  }
  if (kind === "budget") {
    const budgetMonth = monthDate(data.budgetMonth), category = textValue(data.category, 100), limitAmount = numberValue(data.limitAmount), alertPercent = numberValue(data.alertPercent, 80);
    if (!budgetMonth || !category || limitAmount === undefined || limitAmount <= 0 || alertPercent === undefined || alertPercent < 1 || alertPercent > 100) return Response.json({ error: "Budget month, category, limit ও alert সঠিকভাবে দিন।" }, { status: 400 });
    return { budget_month: budgetMonth, category, limit_amount: limitAmount, alert_percent: Math.round(alertPercent), notes: textValue(data.notes, 2000) };
  }
  if (kind === "debt") {
    const counterparty = textValue(data.counterparty, 180), principal = numberValue(data.principalAmount), settled = numberValue(data.settledAmount, 0);
    if (!counterparty || principal === undefined || principal <= 0 || settled === undefined || settled < 0 || settled > principal) return Response.json({ error: "ব্যক্তির নাম, principal ও settled amount সঠিকভাবে দিন।" }, { status: 400 });
    return { debt_type: enumValue(data.debtType, ["lent", "borrowed"] as const, "lent"), counterparty, principal_amount: principal, settled_amount: settled, due_date: textValue(data.dueDate, 20), status: settled >= principal ? "settled" : settled > 0 ? "partial" : "open", notes: textValue(data.notes, 2000) };
  }
  if (kind === "bill") {
    const title = textValue(data.title, 180), category = textValue(data.category, 100), amount = numberValue(data.amount), dueDate = textValue(data.dueDate, 20);
    if (!title || !category || amount === undefined || amount <= 0 || !dueDate) return Response.json({ error: "Bill title, category, amount ও due date প্রয়োজন।" }, { status: 400 });
    return { title, category, amount, due_date: dueDate, recurrence: enumValue(data.recurrence, ["none", "monthly", "yearly"] as const, "none"), notes: textValue(data.notes, 2000) };
  }
  const title = textValue(data.title, 180), targetAmount = numberValue(data.targetAmount), currentAmount = numberValue(data.currentAmount, 0);
  if (!title || targetAmount === undefined || targetAmount <= 0 || currentAmount === undefined || currentAmount < 0) return Response.json({ error: "Goal title, target ও saved amount সঠিকভাবে দিন।" }, { status: 400 });
  return { title, target_amount: targetAmount, current_amount: currentAmount, target_date: textValue(data.targetDate, 20), status: currentAmount >= targetAmount ? "completed" : "active", notes: textValue(data.notes, 2000) };
}

async function audit(familyId: string, userId: string, action: string, entityType: string, entityId: string) {
  await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: entityType, entity_id: entityId, metadata: { private: true } }) });
}

function financeError(error: unknown, log: string, message: string) {
  if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
  if (error instanceof SupabaseRequestError) { console.error(log, error.status, error.message); return Response.json({ error: message }, { status: 502 }); }
  console.error(log, error); return Response.json({ error: message }, { status: 500 });
}
