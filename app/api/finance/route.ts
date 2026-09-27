import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import type {
  FinanceAccount,
  FinanceBill,
  FinanceBudget,
  FinanceDebt,
  FinanceGoal,
  FinanceTransaction,
} from "@/lib/personal-finance-types";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) {
      return Response.json(
        { code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" },
        { status: 409 },
      );
    }

    const familyQuery = new URLSearchParams({
      select: "id,name_bn,name_en",
      id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const family = (
      await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(
        `families?${familyQuery}`,
      )
    )[0];

    let accounts: FinanceAccount[] = [];
    let transactions: FinanceTransaction[] = [];
    let budgets: FinanceBudget[] = [];
    let debts: FinanceDebt[] = [];
    let bills: FinanceBill[] = [];
    let goals: FinanceGoal[] = [];
    let migrationRequired = false;

    try {
      const owner = {
        family_id: `eq.${membership.family_id}`,
        auth_user_id: `eq.${user.userId}`,
      };
      const queries = {
        accounts: new URLSearchParams({
          select: "id,name,account_type,opening_balance,currency,status,created_at,updated_at",
          ...owner,
          order: "status.asc,created_at.asc",
        }),
        transactions: new URLSearchParams({
          select: "id,account_id,direction,category,amount,transaction_date,payment_method,reference,notes,is_recurring,created_at",
          ...owner,
          order: "transaction_date.desc,created_at.desc",
        }),
        budgets: new URLSearchParams({
          select: "id,budget_month,category,limit_amount,alert_percent,notes,created_at,updated_at",
          ...owner,
          order: "budget_month.desc,category.asc",
        }),
        debts: new URLSearchParams({
          select: "id,debt_type,counterparty,principal_amount,settled_amount,due_date,status,notes,created_at,updated_at",
          ...owner,
          order: "status.asc,due_date.asc.nullslast,created_at.desc",
        }),
        bills: new URLSearchParams({
          select: "id,title,category,amount,due_date,recurrence,status,notes,created_at,updated_at",
          ...owner,
          order: "due_date.asc,created_at.desc",
        }),
        goals: new URLSearchParams({
          select: "id,title,target_amount,current_amount,target_date,status,notes,created_at,updated_at",
          ...owner,
          order: "status.asc,target_date.asc.nullslast,created_at.desc",
        }),
      };
      [accounts, transactions, budgets, debts, bills, goals] = await Promise.all([
        supabaseRest<FinanceAccount[]>(`personal_finance_accounts?${queries.accounts}`),
        supabaseRest<FinanceTransaction[]>(`personal_finance_transactions?${queries.transactions}`),
        supabaseRest<FinanceBudget[]>(`personal_finance_budgets?${queries.budgets}`),
        supabaseRest<FinanceDebt[]>(`personal_finance_debts?${queries.debts}`),
        supabaseRest<FinanceBill[]>(`personal_finance_bills?${queries.bills}`),
        supabaseRest<FinanceGoal[]>(`personal_finance_goals?${queries.goals}`),
      ]);
    } catch (error) {
      if (error instanceof SupabaseRequestError) migrationRequired = true;
      else throw error;
    }

    return Response.json({
      family,
      viewer: { displayName: user.displayName, email: user.email },
      accounts,
      transactions,
      budgets,
      debts,
      bills,
      goals,
      migrationRequired,
    });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return Response.json({ error: "PostgreSQL connection has not been configured yet." }, { status: 503 });
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to load private finance data", error.status, error.message);
      return Response.json({ error: "ব্যক্তিগত হিসাব সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 });
    }
    console.error("Unable to load private finance data", error);
    return Response.json({ error: "Finance request সম্পন্ন হয়নি।" }, { status: 500 });
  }
}
