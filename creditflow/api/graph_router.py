"""
graph_router.py — Graph API endpoints

Routes:
  POST /graph/build              — Build/replace the merchant debt graph
  GET  /graph                    — Retrieve the current graph
  POST /graph/transitive-closure — Warshall's transitive closure + cyclic risk pairs
  GET  /graph/{merchant_id}/reachable — Merchants reachable from a given source
"""

from fastapi import APIRouter, HTTPException
from creditflow.api.schemas import (
    GraphBuildRequest,
    GraphResponse,
    TransitiveClosureResponse,
    ReachableResponse,
)
from creditflow.graph import MerchantGraph
from creditflow.algorithms.warshall import (
    warshall_transitive_closure,
    get_reachable_merchants,
    get_cyclic_risk_pairs,
    closure_to_dict,
)

router = APIRouter(prefix="/graph", tags=["Graph"])

# In-memory graph store (replaced by a DB-backed store in production)
_graph_store: MerchantGraph = MerchantGraph()


def _build_graph(req: GraphBuildRequest) -> MerchantGraph:
    g = MerchantGraph()
    for m in req.merchants:
        g.add_merchant(m)
    for debt in req.debts:
        try:
            g.add_debt(debt.debtor, debt.creditor, debt.amount)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
    return g


@router.post("/build", response_model=GraphResponse, summary="Build merchant debt graph")
def build_graph(req: GraphBuildRequest) -> GraphResponse:
    """
    Build (or replace) the in-memory merchant debt graph.

    Send a list of merchant IDs and debt edges.
    The graph is stored server-side for subsequent algorithm calls.
    """
    global _graph_store
    _graph_store = _build_graph(req)
    data = _graph_store.to_dict()
    return GraphResponse(**data)


@router.get("", response_model=GraphResponse, summary="Get current graph")
def get_graph() -> GraphResponse:
    """Return the current state of the merchant debt graph."""
    if not _graph_store.merchants:
        raise HTTPException(status_code=404, detail="No graph loaded. Call POST /graph/build first.")
    data = _graph_store.to_dict()
    return GraphResponse(**data)


@router.post(
    "/transitive-closure",
    response_model=TransitiveClosureResponse,
    summary="Compute Warshall's transitive closure",
)
def transitive_closure(req: GraphBuildRequest) -> TransitiveClosureResponse:
    """
    Compute the transitive closure of the given graph using Warshall's O(V³) algorithm.

    Returns:
    - closure: reachability matrix (True iff a directed path exists)
    - cyclic_risk_pairs: pairs of merchants in mutual-reachability (circular debt risk)
    """
    g = _build_graph(req)
    reach = warshall_transitive_closure(g)
    pairs = get_cyclic_risk_pairs(g)
    return TransitiveClosureResponse(
        closure=closure_to_dict(reach),
        cyclic_risk_pairs=[[u, v] for u, v in pairs],
    )


@router.get(
    "/{merchant_id}/reachable",
    response_model=ReachableResponse,
    summary="Get merchants reachable from a given merchant",
)
def reachable_from(merchant_id: str) -> ReachableResponse:
    """
    Return all merchants reachable (via any debt chain) from the given merchant.
    Uses the stored graph and Warshall's transitive closure internally.
    """
    if not _graph_store.has_merchant(merchant_id):
        raise HTTPException(
            status_code=404,
            detail=f"Merchant '{merchant_id}' not found in the current graph.",
        )
    reachable = get_reachable_merchants(_graph_store, merchant_id)
    return ReachableResponse(source=merchant_id, reachable=reachable)
