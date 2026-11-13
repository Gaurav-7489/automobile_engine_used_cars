/** Finance and investor vocabulary shared by the server and the pages. No server code here. */
export const EXPENSE_CATEGORIES = ["Rent", "Salaries", "Utilities", "Marketing", "Workshop and reconditioning", "Transport", "Insurance", "Office and admin", "Loan interest", "Other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type Expense = { id: string; branchId: string; category: string; description: string; amount: number; spentOn: string; createdBy: string; createdAt: string };
export type MonthFinance = { month: string; carsSold: number; revenue: number; carCost: number; sellingCost: number; grossFromSales: number; expenses: number; byCategory: Record<string, number>; afterExpenses: number; unreconciledSales: number };

export const INVESTOR_KINDS = ["Investor", "Partner", "Lender"] as const;
export const ENTRY_KINDS = ["Contribution", "Repayment", "Payout"] as const;
export type InvestorEntry = { id: string; kind: (typeof ENTRY_KINDS)[number]; amount: number; on: string; note: string; by: string };
export type Investor = { id: string; name: string; kind: string; phone: string; email: string; agreement: string; notes: string; entries: InvestorEntry[]; archived: boolean; updatedAt: string };

/** Totals of what was recorded, by kind. A sum of entries, not a return or balance owed. */
export const recordedTotals = (inv: Investor) => Object.fromEntries(ENTRY_KINDS.map((k) => [k, inv.entries.filter((e) => e.kind === k).reduce((a, e) => a + e.amount, 0)])) as Record<(typeof ENTRY_KINDS)[number], number>;
