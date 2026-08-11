"""
graph.py — Merchant Debt Graph

Concept Traceability:
  - Data Structures   : Maintains BOTH adjacency-matrix (for Warshall's O(V³) DP)
                        AND adjacency-list (for DFS-based cycle detection — cheaper).
  - Discrete Structures & Graph Theory : Weighted directed graph modelling the
                        informal merchant debt network.

Each node = a merchant.
Each directed edge (u → v, weight w) = merchant u owes merchant v an amount w.
"""

from __future__ import annotations
from typing import Dict, List, Optional, Tuple
import math


class MerchantGraph:
    """
    Weighted directed graph representing the informal merchant debt network.

    Internally stores:
      - adjacency_list  : dict[str, list[(neighbour, weight)]]  — used for DFS / cycle detection
      - adjacency_matrix: 2-D dict[str][str] -> float            — used for Warshall's algorithm
    """

    INF = math.inf  # sentinel for "no direct edge"

    def __init__(self) -> None:
        self._merchants: List[str] = []          # ordered list of merchant IDs
        self._index: Dict[str, int] = {}         # merchant → matrix row/col index
        self._adj_list: Dict[str, List[Tuple[str, float]]] = {}    # adjacency list
        self._adj_matrix: Dict[str, Dict[str, float]] = {}         # adjacency matrix

    # ------------------------------------------------------------------
    # Merchant management
    # ------------------------------------------------------------------

    def add_merchant(self, merchant_id: str) -> None:
        """Register a new merchant node. No-op if already present."""
        if merchant_id in self._index:
            return
        idx = len(self._merchants)
        self._merchants.append(merchant_id)
        self._index[merchant_id] = idx
        self._adj_list[merchant_id] = []
        # Extend matrix: new row for this merchant, new column in every existing row
        for existing in self._merchants[:-1]:
            self._adj_matrix[existing][merchant_id] = self.INF
        self._adj_matrix[merchant_id] = {m: self.INF for m in self._merchants}
        self._adj_matrix[merchant_id][merchant_id] = 0.0  # self-distance = 0

    def has_merchant(self, merchant_id: str) -> bool:
        return merchant_id in self._index

    @property
    def merchants(self) -> List[str]:
        """Return an ordered copy of all merchant IDs."""
        return list(self._merchants)

    @property
    def merchant_count(self) -> int:
        return len(self._merchants)

    # ------------------------------------------------------------------
    # Edge management
    # ------------------------------------------------------------------

    def add_debt(self, debtor: str, creditor: str, amount: float) -> None:
        """
        Add (or accumulate) a debt edge: debtor → creditor with the given amount.

        If the edge already exists the amounts are ADDED (merchants can have
        multiple debts between each other; we aggregate into a net directed weight).

        Raises
        ------
        ValueError  : if amount <= 0 or if either merchant has not been registered.
        """
        if amount <= 0:
            raise ValueError(f"Debt amount must be positive; got {amount}")
        for m in (debtor, creditor):
            if not self.has_merchant(m):
                raise ValueError(f"Merchant '{m}' not registered. Call add_merchant() first.")

        # --- adjacency list update ---
        for entry in self._adj_list[debtor]:
            if entry[0] == creditor:
                # accumulate
                self._adj_list[debtor].remove(entry)
                break
        existing = self._adj_matrix[debtor][creditor]
        new_weight = (0.0 if existing == self.INF else existing) + amount
        self._adj_list[debtor].append((creditor, new_weight))

        # --- adjacency matrix update ---
        self._adj_matrix[debtor][creditor] = new_weight

    def get_debt(self, debtor: str, creditor: str) -> float:
        """Return net debt from debtor to creditor; 0.0 if no edge."""
        val = self._adj_matrix.get(debtor, {}).get(creditor, self.INF)
        return 0.0 if val == self.INF else val

    def get_all_edges(self) -> List[Tuple[str, str, float]]:
        """Return list of (debtor, creditor, amount) for every edge."""
        edges = []
        for debtor, neighbours in self._adj_list.items():
            for creditor, weight in neighbours:
                edges.append((debtor, creditor, weight))
        return edges

    # ------------------------------------------------------------------
    # Raw structure accessors (needed by algorithms)
    # ------------------------------------------------------------------

    def get_adjacency_list(self) -> Dict[str, List[Tuple[str, float]]]:
        """Return a copy of the adjacency list."""
        return {m: list(neighbours) for m, neighbours in self._adj_list.items()}

    def get_adjacency_matrix(self) -> Dict[str, Dict[str, float]]:
        """Return a copy of the adjacency matrix (INF where no direct edge)."""
        return {u: dict(row) for u, row in self._adj_matrix.items()}

    # ------------------------------------------------------------------
    # Serialisation helpers (for API responses)
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        """
        Serialise the graph to a JSON-friendly dict.
        INF is represented as null.
        """
        merchants = self._merchants
        edges = self.get_all_edges()
        matrix = {}
        for u in merchants:
            matrix[u] = {}
            for v in merchants:
                val = self._adj_matrix[u][v]
                matrix[u][v] = None if val == self.INF else val

        return {
            "merchants": merchants,
            "edges": [
                {"debtor": d, "creditor": c, "amount": a} for d, c, a in edges
            ],
            "adjacency_matrix": matrix,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "MerchantGraph":
        """
        Re-construct a MerchantGraph from the dict produced by to_dict().
        """
        g = cls()
        for m in data.get("merchants", []):
            g.add_merchant(m)
        for edge in data.get("edges", []):
            g.add_debt(edge["debtor"], edge["creditor"], edge["amount"])
        return g

    def __repr__(self) -> str:
        return f"MerchantGraph(merchants={self._merchants}, edges={self.get_all_edges()})"
