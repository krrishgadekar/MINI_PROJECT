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
    ExactSettlementResponse,
    NetAllCyclesResponse,
    SettlementOptimizeResponse,
    CycleNettingItem,
    DebtEdge,
)
from creditflow.graph import MerchantGraph
from creditflow.algorithms.settlement import settlement_summary
from creditflow.algorithms.cycle_detection import (
    find_all_cycles,
    has_cycle,
    net_cycle,
    net_all_cycles,
)
from creditflow.algorithms.exact_settlement import exact_minimum_settlement

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


@router.post(
    "/exact",
    response_model=ExactSettlementResponse,
    summary="Compute exact minimum settlement (backtracking, ≤12 balances)",
)
def compute_exact_settlement(req: SettlementRequest) -> ExactSettlementResponse:
    """
    Compute optimal debt settlement via dynamic programming over zero-sum subsets.
    Guarantees the global minimum transaction count for up to 12 non-zero balances.
    Falls back to greedy heuristic if N > 12.
    """
    g = _build_graph_from_request(req)
    res = exact_minimum_settlement(g)
    return ExactSettlementResponse(
        net_balances=res["net_balances"],
        transactions=[TransactionItem(**t) for t in res["transactions"]],
        transaction_count=res["transaction_count"],
        total_amount_settled=res["total_amount_settled"],
        greedy_transaction_count=res["greedy_transaction_count"],
        optimality_gap=res["optimality_gap"],
        algorithm=res["algorithm"],
        capped=res["capped"],
        message=res.get("message"),
    )


@router.post(
    "/net-all",
    response_model=NetAllCyclesResponse,
    summary="Repeatedly net all circular debt cycles until acyclic",
)
def net_all_endpoint(req: SettlementRequest) -> NetAllCyclesResponse:
    """
    Continuously detect and net circular debt chains until no cycles remain (DAG).
    Reduces total outstanding debt volume without any cash settlement required.
    """
    g = _build_graph_from_request(req)
    initial_edge_count = len(g.get_all_edges())

    netted_graph, cycles_netted, total_netted = net_all_cycles(g)
    remaining_edges = [
        DebtEdge(debtor=d, creditor=c, amount=a)
        for d, c, a in netted_graph.get_all_edges()
    ]

    return NetAllCyclesResponse(
        cycles_netted=[CycleNettingItem(**c) for c in cycles_netted],
        total_amount_netted=total_netted,
        remaining_debts=remaining_edges,
        initial_edge_count=initial_edge_count,
        remaining_edge_count=len(remaining_edges),
        eliminated_edge_count=initial_edge_count - len(remaining_edges),
    )


@router.post(
    "/optimize",
    response_model=SettlementOptimizeResponse,
    summary="Settlement with cycle pre-netting pipeline",
)
def optimize_settlement(req: SettlementRequest) -> SettlementOptimizeResponse:
    """
    Multi-stage settlement optimization pipeline:
    1. Detect circular debt loops and net all of them out.
    2. Settle remaining acyclic debts via greedy heap settlement.
    3. If non-zero balances <= 12, also calculate exact optimal transaction count.
    4. Return full before/after audit report with savings.
    """
    g = _build_graph_from_request(req)
    before_edges = [
        DebtEdge(debtor=d, creditor=c, amount=a)
        for d, c, a in g.get_all_edges()
    ]
    before_total = sum(e.amount for e in before_edges)

    # 1. Pre-netting
    netted_graph, cycles_netted, total_netted = net_all_cycles(g)
    after_edges = [
        DebtEdge(debtor=d, creditor=c, amount=a)
        for d, c, a in netted_graph.get_all_edges()
    ]
    after_total = sum(e.amount for e in after_edges)

    # 2. Greedy settlement on netted graph
    summary = settlement_summary(netted_graph)
    greedy_txns = [TransactionItem(**t) for t in summary["transactions"]]

    # 3. Exact evaluation
    exact_res = exact_minimum_settlement(netted_graph)
    exact_count = exact_res["transaction_count"]
    opt_gap = exact_res["optimality_gap"]

    return SettlementOptimizeResponse(
        before_edges=before_edges,
        after_netting_edges=after_edges,
        cycles_netted=[CycleNettingItem(**c) for c in cycles_netted],
        total_netted_amount=total_netted,
        transactions=greedy_txns,
        transaction_count=len(greedy_txns),
        total_amount_settled=summary["total_amount_settled"],
        savings=total_netted,
        before_total_debt=round(before_total, 2),
        after_total_debt=round(after_total, 2),
        exact_transaction_count=exact_count,
        optimality_gap=opt_gap,
    )
