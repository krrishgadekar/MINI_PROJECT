"""
settlement_router.py — Settlement API endpoints

Routes:
  POST /settlement               — Compute greedy minimum settlement
  POST /settlement/cycles        — Detect all circular debt cycles
  POST /settlement/net-cycle     — Net (cancel out) a specific cycle
"""

from fastapi import APIRouter, HTTPException
from creditflow.api.schemas import (
    SettlementRequest,
    SettlementResponse,
    TransactionItem,
    CycleCheckResponse,
    CycleNettingRequest,
    CycleNettingResponse,
)
from creditflow.graph import MerchantGraph
from creditflow.algorithms.settlement import settlement_summary
from creditflow.algorithms.cycle_detection import find_all_cycles, has_cycle, net_cycle

router = APIRouter(prefix="/settlement", tags=["Settlement"])


def _build_graph_from_request(req) -> MerchantGraph:
    g = MerchantGraph()
    for m in req.merchants:
        g.add_merchant(m)
    for debt in req.debts:
        try:
            g.add_debt(debt.debtor, debt.creditor, debt.amount)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
    return g


@router.post("", response_model=SettlementResponse, summary="Compute greedy minimum settlement")
def compute_settlement(req: SettlementRequest) -> SettlementResponse:
    """
    Given a merchant debt graph, compute a greedy minimum settlement plan.

    The algorithm:
    1. Computes net balances for each merchant.
    2. Uses a greedy max-heap approach to match the largest creditor with the
       largest debtor at each step — O(N log N).
    3. Returns an ordered list of transactions that clears all debts.

    Note: Greedy is NOT globally optimal (optimal is NP-hard), but produces
    a near-minimal number of transactions in practice. This trade-off is
    explicitly documented in the concept-traceability report.
    """
    g = _build_graph_from_request(req)
    summary = settlement_summary(g)
    return SettlementResponse(
        net_balances=summary["net_balances"],
        transactions=[TransactionItem(**t) for t in summary["transactions"]],
        transaction_count=summary["transaction_count"],
        total_amount_settled=summary["total_amount_settled"],
        algorithm=summary["algorithm"],
    )


@router.post("/cycles", response_model=CycleCheckResponse, summary="Detect circular debt cycles")
def detect_cycles(req: SettlementRequest) -> CycleCheckResponse:
    """
    Detect all circular debt cycles using DFS with back-edge identification.

    A cycle A→B→C→A indicates merchants owe each other in a loop — these can
    potentially be netted before settlement to reduce total transactions.

    Time complexity: O(V + E)  (DFS on adjacency list)
    """
    g = _build_graph_from_request(req)
    cycles = find_all_cycles(g)
    return CycleCheckResponse(has_cycle=len(cycles) > 0, cycles=cycles)


@router.post("/net-cycle", response_model=CycleNettingResponse, summary="Net a circular debt cycle")
def net_cycle_endpoint(req: CycleNettingRequest) -> CycleNettingResponse:
    """
    Cancel out the minimum common flow around a specified cycle.

    Example: If A→B=100, B→C=80, C→A=60, netting removes 60 from each edge:
      Result: A→B=40, B→C=20 (C→A edge is eliminated entirely).

    The *cycle* field must be an ordered list matching actual edges in the graph.
    """
    g = _build_graph_from_request(req)
    try:
        net_flows = net_cycle(g, req.cycle)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Amount netted = min edge in cycle (the flow that was cancelled)
    # Re-derive it for the response
    min_flow = min(
        g.get_debt(req.cycle[i], req.cycle[(i + 1) % len(req.cycle)])
        for i in range(len(req.cycle))
    )

    return CycleNettingResponse(
        cycle=req.cycle,
        net_flows=net_flows,
        amount_netted=round(min_flow, 2),
    )
