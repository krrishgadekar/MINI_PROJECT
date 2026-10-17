"""
contagion.py — Systemic Default-Contagion Simulator

Concept Traceability:
  - Discrete Structures & Graph Theory (DSGT) & Statistical Methods (SMCS):
    Simulates how an initial merchant default cascades through the directed
    credit network using Breadth-First Search (BFS) and Warshall reachability.

  - Mechanism:
    When merchant X defaults:
    1. Direct Exposure (1st Order / Round 1):
       Every creditor C who is owed money by X suffers an immediate direct loss:
           DirectLoss(C) = weight(X → C)
    2. Indirect Exposure (2nd Order / Round 2):
       Each affected creditor C may suffer a liquidity shock, impairing their
       ability to settle their own obligations to downstream creditors D (edges C → D).
       The transmitted shortfall to D is modeled as:
           Transmitted(C → D) = DirectLoss(C) * (weight(C → D) / OutgoingDebt(C))
    3. Multi-round cascade continues along the reachable subgraph until
       attenuation or no further exposures exist.
"""

from __future__ import annotations
from typing import Dict, List, Set, Tuple
from collections import deque

from creditflow.graph import MerchantGraph
from creditflow.algorithms.warshall import warshall_transitive_closure


def simulate_default_contagion(
    graph: MerchantGraph,
    failed_merchant: str,
    loss_given_default: float = 1.0,
    max_rounds: int = 5,
) -> Dict:
    """
    Simulate systemic financial contagion triggered by `failed_merchant`.

    Parameters:
    -----------
    graph : MerchantGraph
        The merchant credit/debt network.
    failed_merchant : str
        The merchant ID initiating the default.
    loss_given_default : float
        Fraction of debt lost (default 1.0 = 100% loss).
    max_rounds : int
        Maximum cascade depth (default 5).

    Returns:
    --------
    Dict containing:
      - failed_merchant: str
      - direct_losses: Dict[str, float]
      - second_order_losses: Dict[str, float]
      - per_merchant_loss: Dict[str, float]
      - total_network_loss: float
      - affected_merchants: List[str]
      - cascade_rounds: List[Dict]
      - network_vulnerability_score: float
    """
    if not graph.has_merchant(failed_merchant):
        raise ValueError(f"Merchant '{failed_merchant}' does not exist in graph.")

    all_edges = graph.get_all_edges()
    total_network_debt = sum(w for _, _, w in all_edges)

    # Precompute outgoing debt sum for every merchant: Out(u) = sum(weight(u -> v))
    outgoing_debt: Dict[str, float] = {m: 0.0 for m in graph.merchants}
    for debtor, _, amount in all_edges:
        outgoing_debt[debtor] += amount

    # Direct losses (Round 1)
    direct_losses: Dict[str, float] = {}
    for debtor, creditor, amount in all_edges:
        if debtor == failed_merchant:
            loss = round(amount * loss_given_default, 2)
            direct_losses[creditor] = round(direct_losses.get(creditor, 0.0) + loss, 2)

    # Cascade rounds tracking
    cascade_rounds: List[Dict] = []
    per_merchant_loss: Dict[str, float] = dict(direct_losses)
    second_order_losses: Dict[str, float] = {}

    if direct_losses:
        cascade_rounds.append({
            "round": 1,
            "type": "direct_exposure",
            "losses": {m: l for m, l in direct_losses.items()},
            "round_loss": round(sum(direct_losses.values()), 2),
        })

    # BFS for multi-round contagion
    # current_shocks: dict of merchant -> liquidity loss suffered in previous round
    current_shocks = dict(direct_losses)
    visited_pairs: Set[Tuple[str, str]] = set()

    for r in range(2, max_rounds + 1):
        if not current_shocks:
            break

        next_shocks: Dict[str, float] = {}
        for source_m, shock in current_shocks.items():
            out_total = outgoing_debt.get(source_m, 0.0)
            if out_total <= 1e-9:
                continue

            # Check downstream creditors of source_m
            for debtor, creditor, amount in all_edges:
                if debtor == source_m and creditor != failed_merchant:
                    if (debtor, creditor) in visited_pairs:
                        continue
                    visited_pairs.add((debtor, creditor))

                    # Proportion of shock transmitted, capped by edge amount
                    transmission_ratio = amount / out_total
                    transmitted_loss = min(amount, round(shock * transmission_ratio, 2))

                    if transmitted_loss > 0.01:
                        next_shocks[creditor] = round(
                            next_shocks.get(creditor, 0.0) + transmitted_loss, 2
                        )
                        if r == 2:
                            second_order_losses[creditor] = round(
                                second_order_losses.get(creditor, 0.0) + transmitted_loss, 2
                            )
                        per_merchant_loss[creditor] = round(
                            per_merchant_loss.get(creditor, 0.0) + transmitted_loss, 2
                        )

        if next_shocks:
            cascade_rounds.append({
                "round": r,
                "type": f"order_{r}_indirect",
                "losses": next_shocks,
                "round_loss": round(sum(next_shocks.values()), 2),
            })
            current_shocks = next_shocks
        else:
            break

    total_loss = round(sum(per_merchant_loss.values()), 2)
    affected_merchants = [m for m, l in per_merchant_loss.items() if l > 0.0]

    vulnerability = (
        round(total_loss / total_network_debt, 4) if total_network_debt > 0 else 0.0
    )

    return {
        "failed_merchant": failed_merchant,
        "direct_losses": direct_losses,
        "second_order_losses": second_order_losses,
        "per_merchant_loss": per_merchant_loss,
        "total_network_loss": total_loss,
        "affected_merchants": affected_merchants,
        "cascade_rounds": cascade_rounds,
        "network_vulnerability_score": vulnerability,
    }
