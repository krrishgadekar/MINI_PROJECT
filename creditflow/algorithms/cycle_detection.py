"""
cycle_detection.py — Circular Debt Detection

Concept Traceability:
  - Discrete Structures & Graph Theory : DFS-based cycle detection on a directed graph
    with back-edge identification.  A back edge u→v where v is an ancestor in the
    current DFS stack confirms a directed cycle (circular debt loop).

  - Data Structures : Uses the adjacency LIST (not matrix) — DFS is O(V+E) on a list,
    compared to O(V²) if we used the matrix. This is the justification documented in
    the concept-traceability matrix.

Purpose:
  Detect circular debt chains in the merchant network.  A cycle A→B→C→A means
  these merchants owe each other in a loop, which can potentially be *netted*
  instead of fully settled.
"""

from __future__ import annotations
from typing import Dict, List, Optional, Set, Tuple

from creditflow.graph import MerchantGraph


# ---------------------------------------------------------------------------
# DFS-based cycle detection
# ---------------------------------------------------------------------------

class _DFSState:
    """Internal state object for the iterative-friendly recursive DFS."""

    WHITE = 0  # not yet visited
    GRAY  = 1  # currently on the DFS stack (being explored)
    BLACK = 2  # fully explored


def find_all_cycles(graph: MerchantGraph) -> List[List[str]]:
    """
    Find all simple directed cycles in *graph* using DFS with back-edge detection.

    Returns
    -------
    cycles : List[List[str]]
        Each inner list is a cycle expressed as an ordered list of merchant IDs,
        e.g.  ['A', 'B', 'C']  represents  A→B→C→A.

    Algorithm
    ---------
    1. Run DFS from every unvisited node.
    2. When we traverse an edge u→v where v is GRAY (on the current stack),
       we have found a back edge, indicating a cycle.
    3. Reconstruct the cycle by reading back from the DFS stack from v to u.

    Time complexity  : O(V + E)  (standard DFS)
    Space complexity : O(V)      (colour map + recursion stack)
    """
    adj_list = graph.get_adjacency_list()
    merchants = graph.merchants
    colour: Dict[str, int] = {m: _DFSState.WHITE for m in merchants}
    parent: Dict[str, Optional[str]] = {m: None for m in merchants}
    stack: List[str] = []          # current DFS path (ordered)
    cycles: List[List[str]] = []
    seen_cycle_sets: List[frozenset] = []   # dedup

    def dfs(node: str) -> None:
        colour[node] = _DFSState.GRAY
        stack.append(node)

        for neighbour, _ in adj_list.get(node, []):
            if colour[neighbour] == _DFSState.GRAY:
                # Back edge found — reconstruct cycle
                cycle_start_idx = stack.index(neighbour)
                cycle = stack[cycle_start_idx:]
                fs = frozenset(cycle)
                if fs not in seen_cycle_sets:
                    seen_cycle_sets.append(fs)
                    cycles.append(list(cycle))
            elif colour[neighbour] == _DFSState.WHITE:
                parent[neighbour] = node
                dfs(neighbour)

        stack.pop()
        colour[node] = _DFSState.BLACK

    for merchant in merchants:
        if colour[merchant] == _DFSState.WHITE:
            dfs(merchant)

    return cycles


def has_cycle(graph: MerchantGraph) -> bool:
    """
    Fast check: does the graph contain at least one directed cycle?
    Stops as soon as the first cycle is detected.
    """
    adj_list = graph.get_adjacency_list()
    merchants = graph.merchants
    colour: Dict[str, int] = {m: _DFSState.WHITE for m in merchants}

    def dfs(node: str) -> bool:
        colour[node] = _DFSState.GRAY
        for neighbour, _ in adj_list.get(node, []):
            if colour[neighbour] == _DFSState.GRAY:
                return True
            if colour[neighbour] == _DFSState.WHITE:
                if dfs(neighbour):
                    return True
        colour[node] = _DFSState.BLACK
        return False

    return any(
        dfs(m) for m in merchants if colour[m] == _DFSState.WHITE
    )


# ---------------------------------------------------------------------------
# Cycle netting
# ---------------------------------------------------------------------------

def net_cycle(graph: MerchantGraph, cycle: List[str]) -> Dict[str, float]:
    """
    Given a directed cycle (list of merchants forming a loop), compute the
    *net* debts after cancelling the minimum common amount flowing around
    the cycle.

    Concept: If A owes B 100, B owes C 80, C owes A 60:
      - The 60 can circularly cancel out → reduced to:
          A owes B 40, B owes C 20, (C→A edge removed)

    Returns
    -------
    net_flows : Dict[str, float]
        Maps each edge "debtor→creditor" (as "debtor:creditor") to its
        *remaining* net amount after netting.  Edges cancelled to 0 are
        omitted.

    Raises
    ------
    ValueError : If the cycle is invalid (< 2 nodes or edges not in graph).
    """
    if len(cycle) < 2:
        raise ValueError("A cycle must contain at least 2 nodes.")

    # Build the list of (debtor, creditor, amount) for cycle edges
    # The cycle is [A, B, C] which represents A→B→C→A
    cycle_edges: List[Tuple[str, str, float]] = []
    for i in range(len(cycle)):
        debtor = cycle[i]
        creditor = cycle[(i + 1) % len(cycle)]
        amount = graph.get_debt(debtor, creditor)
        if amount == 0.0:
            raise ValueError(
                f"No debt edge from '{debtor}' to '{creditor}' — invalid cycle."
            )
        cycle_edges.append((debtor, creditor, amount))

    # The amount we can net = minimum flow around the cycle
    min_flow = min(a for _, _, a in cycle_edges)

    net_flows: Dict[str, float] = {}
    for debtor, creditor, amount in cycle_edges:
        remaining = amount - min_flow
        if remaining > 1e-9:   # float tolerance
            net_flows[f"{debtor}:{creditor}"] = round(remaining, 2)

    return net_flows
