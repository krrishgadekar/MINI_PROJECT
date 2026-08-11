"""
warshall.py — Warshall's Transitive Closure Algorithm

Concept Traceability:
  - Design & Analysis of Algorithms : O(V³) dynamic-programming algorithm.
    The recurrence is:
        reach[i][k][j] = reach[i][k-1][j]  OR  (reach[i][k-1][k] AND reach[k][k-1][j])
    We implement this in-place using the standard Warshall formulation.

  - Data Structures : Operates on the adjacency matrix of MerchantGraph.

Purpose:
  Computes the *reachability* (transitive closure) of the merchant debt graph.
  reach[u][v] == True  ⟺  there is a directed path u →…→ v through any chain
  of intermediaries.

  This is used upstream to:
    1. Identify which pairs of merchants are indirectly connected (hidden debt exposure).
    2. Detect cyclic-risk groups (pairs where both reach[u][v] and reach[v][u] are True).

  Note: Warshall's gives boolean reachability, NOT shortest-path weights.
  For weighted shortest paths, use Floyd-Warshall (a separate concern).
"""

from __future__ import annotations
from typing import Dict, List, Tuple
import math

from creditflow.graph import MerchantGraph


# ---------------------------------------------------------------------------
# Core algorithm
# ---------------------------------------------------------------------------

def warshall_transitive_closure(graph: MerchantGraph) -> Dict[str, Dict[str, bool]]:
    """
    Compute the transitive closure of *graph* using Warshall's algorithm.

    Parameters
    ----------
    graph : MerchantGraph
        The merchant debt network.

    Returns
    -------
    reach : Dict[str, Dict[str, bool]]
        reach[u][v] is True iff there is a directed path from u to v
        (including trivially u→u which is always True).

    Time complexity  : O(V³)
    Space complexity : O(V²)  — the reach matrix
    """
    merchants = graph.merchants
    n = len(merchants)

    # Step 1 — Initialise reach from the adjacency matrix.
    #          reach[u][v] = True  if  there is a *direct* edge u→v  OR  u == v.
    adj_matrix = graph.get_adjacency_matrix()
    reach: Dict[str, Dict[str, bool]] = {}
    for u in merchants:
        reach[u] = {}
        for v in merchants:
            if u == v:
                reach[u][v] = True                          # every node reaches itself
            else:
                reach[u][v] = adj_matrix[u][v] != math.inf  # direct edge exists?

    # Step 2 — Warshall relaxation.
    #          For each intermediate node k, check if going through k opens new paths.
    for k in merchants:          # intermediate node
        for u in merchants:      # source
            for v in merchants:  # destination
                # If u can reach k AND k can reach v, then u can reach v
                if reach[u][k] and reach[k][v]:
                    reach[u][v] = True

    return reach


# ---------------------------------------------------------------------------
# Derived queries
# ---------------------------------------------------------------------------

def get_reachable_merchants(
    graph: MerchantGraph, source: str
) -> List[str]:
    """
    Return the list of merchants reachable from *source* (excluding source itself).

    Uses the transitive closure internally.
    """
    reach = warshall_transitive_closure(graph)
    if source not in reach:
        raise ValueError(f"Merchant '{source}' not in graph.")
    return [v for v in graph.merchants if v != source and reach[source][v]]


def get_cyclic_risk_pairs(graph: MerchantGraph) -> List[Tuple[str, str]]:
    """
    Return all unordered pairs (u, v) where u can reach v AND v can reach u.

    Cyclic-risk pairs represent revolving credit loops — u owes v through some
    chain while v owes u through another, creating circular debt exposure.

    Note: each unordered pair is returned once, i.e. (u,v) but not also (v,u).
    """
    reach = warshall_transitive_closure(graph)
    merchants = graph.merchants
    pairs: List[Tuple[str, str]] = []
    for i, u in enumerate(merchants):
        for v in merchants[i + 1 :]:   # avoid duplicates
            if reach[u][v] and reach[v][u]:
                pairs.append((u, v))
    return pairs


def closure_to_dict(reach: Dict[str, Dict[str, bool]]) -> dict:
    """
    Serialise a transitive-closure result to a plain JSON-friendly dict.
    Useful for the Graph API response.
    """
    return {u: {v: bool(val) for v, val in row.items()} for u, row in reach.items()}
