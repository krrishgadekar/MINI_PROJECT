/**
 * data/seedData.ts — Typed import of seed_data.json for mock mode.
 *
 * This is the "Crawford Market Vendors" dataset with 8 merchants,
 * 9 debts, and 3 risk histories. Used until Chetan's Node.js
 * backend is ready.
 */

import type { SeedData, DebtEdge, MerchantHistory } from "../types";

export const seedData: SeedData = {
  scenario_name: "Crawford Market Vendors",
  description:
    "A realistic dataset of 8 merchants forming a complex web of informal debts, including cycles and isolated chains.",
  merchants: [
    "Wholesale_A",
    "Retailer_B",
    "Supplier_C",
    "Vendor_D",
    "Logistics_E",
    "Farmer_F",
    "Stall_G",
    "Buyer_H",
  ],
  debts: [
    { debtor: "Retailer_B", creditor: "Wholesale_A", amount: 50000 },
    { debtor: "Vendor_D", creditor: "Retailer_B", amount: 25000 },
    { debtor: "Wholesale_A", creditor: "Vendor_D", amount: 20000 },

    { debtor: "Supplier_C", creditor: "Wholesale_A", amount: 10000 },
    { debtor: "Logistics_E", creditor: "Supplier_C", amount: 15000 },
    { debtor: "Supplier_C", creditor: "Logistics_E", amount: 15000 },

    { debtor: "Stall_G", creditor: "Farmer_F", amount: 5000 },
    { debtor: "Buyer_H", creditor: "Stall_G", amount: 4000 },
    { debtor: "Farmer_F", creditor: "Buyer_H", amount: 4500 },
  ],
  risk_histories: [
    {
      merchant_id: "Wholesale_A",
      history: [
        { late: false, default: false },
        { late: false, default: false },
        { late: false, default: false },
        { late: false, default: false },
        { late: false, default: false },
        { late: false, default: false },
        { late: false, default: false },
        { late: false, default: false },
        { late: false, default: false },
        { late: false, default: false },
        { late: false, default: false },
        { late: false, default: false },
      ],
    },
    {
      merchant_id: "Vendor_D",
      history: [
        { late: true, default: false },
        { late: true, default: false },
        { late: false, default: false },
        { late: false, default: false },
        { late: true, default: false },
        { late: false, default: false },
      ],
    },
    {
      merchant_id: "Supplier_C",
      history: [
        { late: true, default: true },
        { late: true, default: false },
        { late: true, default: false },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Derived helper data for mocking API responses
// ---------------------------------------------------------------------------

/**
 * Compute mock risk scores using the same Poisson model as the Python engine.
 * P(X >= 1) = 1 - e^(-λ) where λ = adverse_events / months_observed
 * Cold-start prior: λ = 0.05 for < 3 months of data.
 */
export function computeMockRiskScores() {
  const MIN_MONTHS = 3;
  const COLD_START_RATE = 0.05;

  return seedData.risk_histories.map((merchant) => {
    const monthsObserved = merchant.history.length;
    let lateEvents = 0;
    let defaultEvents = 0;

    merchant.history.forEach((m) => {
      if (m.late || m.default) lateEvents++;
      if (m.default) defaultEvents++;
    });

    const lambdaRate =
      monthsObserved < MIN_MONTHS
        ? COLD_START_RATE
        : lateEvents / monthsObserved;

    const riskScore = Math.round((1 - Math.exp(-lambdaRate)) * 10000) / 10000;

    let riskCategory: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    if (riskScore < 0.1) riskCategory = "LOW";
    else if (riskScore < 0.3) riskCategory = "MEDIUM";
    else if (riskScore < 0.6) riskCategory = "HIGH";
    else riskCategory = "CRITICAL";

    return {
      merchant_id: merchant.merchant_id,
      months_observed: monthsObserved,
      late_payment_events: lateEvents,
      default_events: defaultEvents,
      lambda_rate: Math.round(lambdaRate * 10000) / 10000,
      risk_score: riskScore,
      risk_category: riskCategory,
      model: "Poisson(λ), P(X≥1) = 1 - e^(-λ)",
      cold_start: monthsObserved < MIN_MONTHS,
    };
  });
}

/**
 * Compute mock settlement using a simplified greedy approach
 * (matches the Python engine's algorithm).
 */
export function computeMockSettlement() {
  // Compute net balances
  const balances: Record<string, number> = {};
  seedData.merchants.forEach((m) => (balances[m] = 0));
  seedData.debts.forEach((d) => {
    balances[d.debtor] -= d.amount;
    balances[d.creditor] += d.amount;
  });

  // Greedy settlement
  const creditors: { merchant: string; balance: number }[] = [];
  const debtors: { merchant: string; balance: number }[] = [];

  Object.entries(balances).forEach(([merchant, balance]) => {
    if (balance > 0.01) creditors.push({ merchant, balance });
    else if (balance < -0.01) debtors.push({ merchant, balance: -balance });
  });

  creditors.sort((a, b) => b.balance - a.balance);
  debtors.sort((a, b) => b.balance - a.balance);

  const transactions: { payer: string; payee: string; amount: number }[] = [];
  let ci = 0,
    di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const settle = Math.min(creditors[ci].balance, debtors[di].balance);
    transactions.push({
      payer: debtors[di].merchant,
      payee: creditors[ci].merchant,
      amount: Math.round(settle * 100) / 100,
    });
    creditors[ci].balance -= settle;
    debtors[di].balance -= settle;
    if (creditors[ci].balance < 0.01) ci++;
    if (debtors[di].balance < 0.01) di++;
  }

  const totalSettled = transactions.reduce((sum, t) => sum + t.amount, 0);

  return {
    net_balances: balances,
    transactions,
    transaction_count: transactions.length,
    total_amount_settled: Math.round(totalSettled * 100) / 100,
    algorithm: "Greedy (O(N log N) — not guaranteed globally optimal)",
  };
}

/**
 * Detect cycles in the debt graph (simplified DFS).
 */
export function detectMockCycles(): { has_cycle: boolean; cycles: string[][] } {
  const adj: Record<string, string[]> = {};
  seedData.merchants.forEach((m) => (adj[m] = []));
  seedData.debts.forEach((d) => {
    adj[d.debtor].push(d.creditor);
  });

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color: Record<string, number> = {};
  seedData.merchants.forEach((m) => (color[m] = WHITE));
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seenSets: Set<string>[] = [];

  function dfs(node: string) {
    color[node] = GRAY;
    stack.push(node);

    for (const neighbor of adj[node]) {
      if (color[neighbor] === GRAY) {
        const cycleStart = stack.indexOf(neighbor);
        const cycle = stack.slice(cycleStart);
        const key = new Set(cycle);
        const isDupe = seenSets.some(
          (s) => s.size === key.size && [...key].every((v) => s.has(v))
        );
        if (!isDupe) {
          seenSets.push(key);
          cycles.push([...cycle]);
        }
      } else if (color[neighbor] === WHITE) {
        dfs(neighbor);
      }
    }

    stack.pop();
    color[node] = BLACK;
  }

  seedData.merchants.forEach((m) => {
    if (color[m] === WHITE) dfs(m);
  });

  return { has_cycle: cycles.length > 0, cycles };
}

/** Total debt volume across all edges */
export const totalDebtVolume = seedData.debts.reduce(
  (sum, d) => sum + d.amount,
  0
);
