"""
settlement.py — Greedy Minimum Settlement Algorithm

Concept Traceability:
  - Design & Analysis of Algorithms : Greedy algorithm — at each step we greedily
    select the pair (max creditor, max debtor) and settle as much as possible.
    We explicitly document where greedy diverges from optimal (NP-hard in general).

  - Data Structures : Uses a max-heap (via Python's heapq with negation) for O(log N)
    extraction of the largest creditor/debtor at each step.

Problem
-------
Given N merchants with net balances (positive = they are owed money, negative = they
owe money), find the MINIMUM number of transactions to settle all debts.

Note: This is a variant of the "Minimum Number of Transactions to Settle Debt" problem.
The greedy heuristic runs in O(N log N) and produces a good-enough settlement, though
the true optimum (minimum transactions) is NP-hard in the general case.

We make this trade-off explicit in the report as part of the DAA deliverable.
"""

from __future__ import annotations
from typing import Dict, List, Tuple
import heapq

from creditflow.graph import MerchantGraph


# ---------------------------------------------------------------------------
# Net balance computation
# ---------------------------------------------------------------------------

def compute_net_balances(graph: MerchantGraph) -> Dict[str, float]:
    """
    Compute the net balance of each merchant.

      net_balance[m] = (total money owed TO m) - (total money m owes TO others)

    Positive net balance → m is a net creditor (others owe them money).
    Negative net balance → m is a net debtor (they owe others money).
    Zero                 → m is balanced.
    """
    balances: Dict[str, float] = {m: 0.0 for m in graph.merchants}
    for debtor, creditor, amount in graph.get_all_edges():
        balances[debtor] -= amount      # debtor owes → negative
        balances[creditor] += amount    # creditor is owed → positive
    return {m: round(b, 2) for m, b in balances.items()}


# ---------------------------------------------------------------------------
# Greedy settlement
# ---------------------------------------------------------------------------

def greedy_minimum_settlement(
    graph: MerchantGraph,
) -> List[Dict]:
    """
    Use a greedy approach to produce a set of settlement transactions that
    clears all net debts with (approximately) the fewest transactions.

    Algorithm
    ---------
    1. Compute net balances for all merchants.
    2. Build two max-heaps:
         - creditors  heap  (keyed by positive balance)
         - debtors    heap  (keyed by negative balance / absolute debt)
    3. Greedily match the largest creditor with the largest debtor:
         - settlement amount = min(creditor_balance, debtor_balance)
         - Debtor pays creditor that amount.
         - Update both balances; re-insert into heaps if non-zero.
    4. Repeat until all balances are 0.

    Time complexity  : O(N log N)  — each merchant is inserted/extracted ≤ twice.
    Optimality gap   : The greedy solution minimises transactions in many practical
                       cases but is NOT guaranteed to be globally optimal.
                       The optimal solution is NP-hard (reducing to bin-packing).

    Returns
    -------
    transactions : List[Dict]
        Each dict has keys: {"payer", "payee", "amount"}.
    """
    balances = compute_net_balances(graph)

    # heapq is a min-heap; negate values for max-heap behaviour
    # creditors : (-balance, merchant_id)
    # debtors   : (-abs_debt, merchant_id)
    creditors: List[Tuple[float, str]] = []
    debtors: List[Tuple[float, str]] = []

    for merchant, balance in balances.items():
        if balance > 1e-9:
            heapq.heappush(creditors, (-balance, merchant))
        elif balance < -1e-9:
            heapq.heappush(debtors, (balance, merchant))  # already negative

    transactions: List[Dict] = []

    while creditors and debtors:
        neg_credit, creditor = heapq.heappop(creditors)
        debt_amount, debtor  = heapq.heappop(debtors)

        credit = -neg_credit        # convert back to positive
        debt   = -debt_amount       # absolute debt (positive number)

        settle = min(credit, debt)
        transactions.append({
            "payer":  debtor,
            "payee":  creditor,
            "amount": round(settle, 2),
        })

        remaining_credit = credit - settle
        remaining_debt   = debt   - settle

        if remaining_credit > 1e-9:
            heapq.heappush(creditors, (-remaining_credit, creditor))
        if remaining_debt > 1e-9:
            heapq.heappush(debtors, (-remaining_debt, debtor))

    return transactions


# ---------------------------------------------------------------------------
# Settlement summary
# ---------------------------------------------------------------------------

def settlement_summary(graph: MerchantGraph) -> Dict:
    """
    Return a complete settlement report including:
      - net balances per merchant
      - list of settlement transactions
      - total transactions count
      - total amount settled
    """
    balances = compute_net_balances(graph)
    transactions = greedy_minimum_settlement(graph)
    total_amount = sum(t["amount"] for t in transactions)

    return {
        "net_balances": balances,
        "transactions": transactions,
        "transaction_count": len(transactions),
        "total_amount_settled": round(total_amount, 2),
        "algorithm": "Greedy (O(N log N) — not guaranteed globally optimal)",
    }
