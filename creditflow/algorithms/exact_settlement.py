"""
exact_settlement.py — Exact Minimum-Transaction Debt Settlement

Concept Traceability:
  - Design & Analysis of Algorithms (DAA):
    Optimal debt settlement (minimum number of transactions) is NP-hard,
    reducible to the Subset Sum / Bin Packing problem.
    While greedy heuristic runs in O(N log N), this exact solver uses dynamic
    programming / backtracking over subset sums to find the true global minimum
    transaction count.

  - Invariant / Mathematical Principle:
    A set of net balances S with sum(S) = 0 can be settled in at most |S| - 1
    transactions. If S can be partitioned into M disjoint non-empty zero-sum
    subsets S_1, S_2, ..., S_M, then the minimum number of transactions is:
        T_min = |S| - M
    Maximizing M (the number of disjoint zero-sum subsets) minimizes T.

  - Computational Constraint:
    Because subset-partitioning is O(2^N) or O(3^N), we impose a hard cap of
    N <= 12 non-zero merchant balances. For N > 12, the solver falls back to
    the greedy O(N log N) heuristic with a documented warning.
"""

from __future__ import annotations
from typing import Dict, List, Optional, Tuple
import heapq

from creditflow.graph import MerchantGraph
from creditflow.algorithms.settlement import compute_net_balances, greedy_minimum_settlement


MAX_EXACT_BALANCES = 12


def exact_minimum_settlement(
    graph: MerchantGraph,
    max_balances: int = MAX_EXACT_BALANCES,
) -> Dict:
    """
    Compute the globally minimal transaction plan to settle all net balances.

    Algorithm:
    1. Compute net balances for all merchants.
    2. Filter out merchants with balance == 0.
    3. If count <= max_balances (default 12):
       - Scale balances to integer cents to prevent floating point inaccuracies.
       - Use bitmask dynamic programming to find the maximum number of disjoint
         zero-sum subsets.
       - Within each zero-sum subset, settle using greedy extraction (|S_i| - 1 txns).
       - Total transactions = N - M (strictly optimal).
    4. If count > max_balances:
       - Fall back to the greedy heuristic and report capped=True.

    Returns:
    --------
    dict containing:
      - net_balances: Dict[str, float]
      - transactions: List[Dict] ({"payer", "payee", "amount"})
      - transaction_count: int
      - total_amount_settled: float
      - greedy_transaction_count: int
      - optimality_gap: int (greedy_count - exact_count)
      - algorithm: str
      - capped: bool
      - message: Optional[str]
    """
    balances = compute_net_balances(graph)
    greedy_txns = greedy_minimum_settlement(graph)
    greedy_count = len(greedy_txns)

    # Filter non-zero balances (tolerance 1e-6)
    active_items: List[Tuple[str, float]] = [
        (m, b) for m, b in balances.items() if abs(b) > 1e-6
    ]
    n = len(active_items)

    # Trivial case: all balances already zero
    if n == 0:
        return {
            "net_balances": balances,
            "transactions": [],
            "transaction_count": 0,
            "total_amount_settled": 0.0,
            "greedy_transaction_count": 0,
            "optimality_gap": 0,
            "algorithm": "Exact Backtracking (Optimal)",
            "capped": False,
            "message": "All merchants are balanced; 0 transactions required.",
        }

    # Fallback if too large for exact solver
    if n > max_balances:
        total_amt = sum(t["amount"] for t in greedy_txns)
        return {
            "net_balances": balances,
            "transactions": greedy_txns,
            "transaction_count": greedy_count,
            "total_amount_settled": round(total_amt, 2),
            "greedy_transaction_count": greedy_count,
            "optimality_gap": 0,
            "algorithm": f"Greedy Heuristic (Fallback: {n} > {max_balances} balances)",
            "capped": True,
            "message": (
                f"Number of non-zero balances ({n}) exceeds exact solver cap of "
                f"{max_balances}. Executed greedy O(N log N) heuristic."
            ),
        }

    # Exact bitmask DP solver
    # Scale to integer cents
    cents = [int(round(b * 100)) for _, b in active_items]

    # Precompute subset sums
    subset_sum = [0] * (1 << n)
    for mask in range(1 << n):
        s = 0
        for i in range(n):
            if mask & (1 << i):
                s += cents[i]
        subset_sum[mask] = s

    # dp[mask] = max number of disjoint zero-sum subsets partitioning `mask`
    # -1 means mask cannot be partitioned into zero-sum subsets
    dp = [-1] * (1 << n)
    choice = [0] * (1 << n)

    for mask in range(1, 1 << n):
        if subset_sum[mask] == 0:
            dp[mask] = 1  # Base case: this subset alone sums to 0

    for mask in range(1, 1 << n):
        if subset_sum[mask] != 0:
            continue
        # Iterate over non-empty proper submasks
        sub = (mask - 1) & mask
        while sub > 0:
            if subset_sum[sub] == 0:
                other = mask ^ sub
                if subset_sum[other] == 0 and dp[sub] != -1 and dp[other] != -1:
                    cand = dp[sub] + dp[other]
                    if cand > dp[mask]:
                        dp[mask] = cand
                        choice[mask] = sub
            sub = (sub - 1) & mask

    # Decompose full mask into irreducible zero-sum subsets
    def _extract_components(mask: int) -> List[int]:
        if choice[mask] == 0:
            return [mask]
        return _extract_components(choice[mask]) + _extract_components(mask ^ choice[mask])

    full_mask = (1 << n) - 1
    components = _extract_components(full_mask)

    # Settle each component independently
    exact_txns: List[Dict] = []
    for comp in components:
        comp_merchants = [
            (active_items[i][0], active_items[i][1])
            for i in range(n)
            if comp & (1 << i)
        ]
        creditors: List[Tuple[float, str]] = []
        debtors: List[Tuple[float, str]] = []

        for m, b in comp_merchants:
            if b > 1e-6:
                heapq.heappush(creditors, (-b, m))
            elif b < -1e-6:
                heapq.heappush(debtors, (b, m))

        while creditors and debtors:
            neg_c, c_id = heapq.heappop(creditors)
            pos_d, d_id = heapq.heappop(debtors)
            credit = -neg_c
            debt = -pos_d
            amt = min(credit, debt)

            exact_txns.append({
                "payer": d_id,
                "payee": c_id,
                "amount": round(amt, 2),
            })

            rem_c = round(credit - amt, 2)
            rem_d = round(debt - amt, 2)
            if rem_c > 1e-6:
                heapq.heappush(creditors, (-rem_c, c_id))
            if rem_d > 1e-6:
                heapq.heappush(debtors, (-rem_d, d_id))

    exact_count = len(exact_txns)
    optimality_gap = max(0, greedy_count - exact_count)
    total_amt = sum(t["amount"] for t in exact_txns)

    return {
        "net_balances": balances,
        "transactions": exact_txns,
        "transaction_count": exact_count,
        "total_amount_settled": round(total_amt, 2),
        "greedy_transaction_count": greedy_count,
        "optimality_gap": optimality_gap,
        "algorithm": "Exact Backtracking (Optimal)",
        "capped": False,
        "message": (
            f"Exact solution computed optimal {exact_count} transactions "
            f"(optimality gap vs greedy: {optimality_gap} saved)."
        ),
    }
