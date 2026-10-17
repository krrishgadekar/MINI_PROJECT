"""
scc.py — Strongly Connected Components (Tarjan's Algorithm)

Concept Traceability:
  - Discrete Structures & Graph Theory (DSGT):
    In a directed debt network G = (V, E), a Strongly Connected Component (SCC)
    is a maximal subgraph where every vertex is reachable from every other vertex.
    This groups merchants who have cyclic mutual indebtedness with each other.

  - Data Structures & Algorithms (DAA):
    Implemented using Tarjan's algorithm with a single Depth-First Search (DFS)
    traversal, maintaining discovery index and low-link values.
    Complexity: O(V + E) time and O(V) auxiliary space.

  - Contrast with Warshall:
    While Warshall's Transitive Closure requires O(V³) dynamic programming to find
    all-pairs reachability, Tarjan's algorithm partitions the vertices into mutual
    reachability equivalence classes in linear O(V + E) time.
"""

from __future__ import annotations
from typing import Dict, List, Set

from creditflow.graph import MerchantGraph


def tarjan_scc(graph: MerchantGraph) -> List[List[str]]:
    """
    Compute all Strongly Connected Components (SCCs) of `graph` using Tarjan's algorithm.

    Parameters:
    -----------
    graph : MerchantGraph
        The merchant debt graph.

    Returns:
    --------
    components : List[List[str]]
        A list of SCCs. Each component is an ordered list of merchant IDs.
        Components with len > 1 represent circular debt clusters.
        Singletons with no self-loop are also included per standard definition.
    """
    merchants = graph.merchants
    adj = graph.get_adjacency_list()

    index = 0
    indices: Dict[str, int] = {}
    lowlink: Dict[str, int] = {}
    stack: List[str] = []
    on_stack: Set[str] = set()
    components: List[List[str]] = []

    def strongconnect(v: str) -> None:
        nonlocal index
        indices[v] = index
        lowlink[v] = index
        index += 1
        stack.append(v)
        on_stack.add(v)

        for w, _ in adj.get(v, []):
            if w not in indices:
                # Successor w has not yet been visited; recurse on it
                strongconnect(w)
                lowlink[v] = min(lowlink[v], lowlink[w])
            elif w in on_stack:
                # Successor w is in stack and hence in the current SCC
                lowlink[v] = min(lowlink[v], indices[w])

        # If v is a root node, pop the stack and generate an SCC
        if lowlink[v] == indices[v]:
            component: List[str] = []
            while True:
                w = stack.pop()
                on_stack.remove(w)
                component.append(w)
                if w == v:
                    break
            # Reverse to maintain discovery order
            component.reverse()
            components.append(component)

    for merchant in merchants:
        if merchant not in indices:
            strongconnect(merchant)

    return components


def scc_summary(graph: MerchantGraph) -> Dict:
    """
    Compute strongly connected components and return formatted summary.
    """
    components = tarjan_scc(graph)
    cyclic_components = [c for c in components if len(c) > 1]

    return {
        "components": components,
        "component_count": len(components),
        "cyclic_components": cyclic_components,
        "cyclic_component_count": len(cyclic_components),
    }
