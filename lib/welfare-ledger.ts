import { financeMoneyTotal } from "./finance-money.ts";
import type { WelfareContribution, WelfareExpense, WelfareFund, WelfarePledge } from "./welfare-types";

export function welfareLedger(funds: WelfareFund[], contributions: WelfareContribution[], expenses: WelfareExpense[], pledges: WelfarePledge[] = []) {
  const approvedIncome = financeMoneyTotal(contributions.filter(r => r.status === "approved").map(r => r.amount));
  const paidExpense = financeMoneyTotal(expenses.filter(r => r.status === "paid").map(r => r.amount));
  const openingBalance = financeMoneyTotal(funds.map(r => r.opening_balance));
  return {
    approvedIncome, paidExpense, openingBalance,
    balance: financeMoneyTotal([openingBalance, approvedIncome, -paidExpense]),
    myPledge: financeMoneyTotal(pledges.filter(r => r.is_mine && r.status === "active").map(r => r.amount)),
  };
}
