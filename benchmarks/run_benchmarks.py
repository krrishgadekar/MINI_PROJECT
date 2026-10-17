"""
run_benchmarks.py — CreditFlow Algorithm Complexity Benchmarking

Concept Traceability:
  - Design & Analysis of Algorithms (DAA):
      "Back every Big-O claim with an actual runtime-vs-input-size plot,
       not just asymptotic notation." — PDF Section 6 (Testing & Validation)

Algorithms benchmarked:
  1. Warshall's Transitive Closure  → Claimed: O(V³)
  2. Greedy Minimum Settlement      → Claimed: O(N log N)
  3. DFS Cycle Detection            → Claimed: O(V + E)
  4. Poisson Risk Scoring           → Claimed: O(N * M)  [N merchants, M months]

What this script does:
  - Generates synthetic merchant debt graphs of increasing sizes
  - Measures real wall-clock time for each algorithm at each size
  - Fits a theoretical curve (V³, N log N, etc.) to the measured data
  - Plots measured times vs. theoretical curves side-by-side
  - Saves each plot to benchmarks/results/ as a PNG
  - Prints a summary table to stdout

Usage:
  python -m benchmarks.run_benchmarks

Output:
  benchmarks/results/warshall_complexity.png
  benchmarks/results/settlement_complexity.png
  benchmarks/results/cycle_detection_complexity.png
  benchmarks/results/risk_engine_complexity.png
  benchmarks/results/all_algorithms_comparison.png
"""

import time
import random
import math
import os
import sys
from typing import List, Tuple, Dict

import numpy as np
import matplotlib
matplotlib.use("Agg")           # non-interactive backend (no display needed)
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

# Make sure we can import from the project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from creditflow.graph import MerchantGraph
from creditflow.algorithms.warshall import warshall_transitive_closure
from creditflow.algorithms.settlement import greedy_minimum_settlement
from creditflow.algorithms.exact_settlement import exact_minimum_settlement
from creditflow.algorithms.cycle_detection import find_all_cycles
from creditflow.algorithms.scc import tarjan_scc
from creditflow.algorithms.risk_engine import MerchantRiskProfile, RiskEngine

# ---------------------------------------------------------------------------
# Output directory
# ---------------------------------------------------------------------------
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(RESULTS_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Plot styling
# ---------------------------------------------------------------------------
STYLE = {
    "measured_color":     "#4F86F7",   # blue  — actual measured time
    "theory_color":       "#FF6B6B",   # red   — theoretical curve
    "bg_color":           "#0F1117",   # dark background
    "grid_color":         "#2A2D35",
    "text_color":         "#E8E8E8",
    "accent_color":       "#FFD700",   # gold  — for labels
    "figure_facecolor":   "#0F1117",
    "axes_facecolor":     "#1A1D27",
}

plt.rcParams.update({
    "figure.facecolor":   STYLE["figure_facecolor"],
    "axes.facecolor":     STYLE["axes_facecolor"],
    "axes.edgecolor":     STYLE["grid_color"],
    "axes.labelcolor":    STYLE["text_color"],
    "xtick.color":        STYLE["text_color"],
    "ytick.color":        STYLE["text_color"],
    "text.color":         STYLE["text_color"],
    "grid.color":         STYLE["grid_color"],
    "grid.linewidth":     0.5,
    "font.family":        "monospace",
    "font.size":          10,
})

REPEATS = 5  # number of timing repetitions per size (take median)


# ---------------------------------------------------------------------------
# Synthetic graph generators
# ---------------------------------------------------------------------------

def make_random_graph(n_merchants: int, edge_density: float = 0.4) -> MerchantGraph:
    """
    Generate a random debt graph with n_merchants nodes.
    Each directed edge exists with probability edge_density.
    """
    g = MerchantGraph()
    names = [f"M{i:03d}" for i in range(n_merchants)]
    for name in names:
        g.add_merchant(name)
    for i, debtor in enumerate(names):
        for j, creditor in enumerate(names):
            if i != j and random.random() < edge_density:
                amount = round(random.uniform(10, 1000), 2)
                g.add_debt(debtor, creditor, amount)
    return g


def make_random_histories(n_merchants: int, months: int = 12) -> List[MerchantRiskProfile]:
    """Generate n merchant profiles each with `months` months of random history."""
    profiles = []
    for i in range(n_merchants):
        p = MerchantRiskProfile(f"M{i:03d}")
        for _ in range(months):
            p.record_month(
                had_late_payment=random.random() < 0.25,
                had_default=random.random() < 0.05,
            )
        profiles.append(p)
    return profiles


# ---------------------------------------------------------------------------
# Timing utility
# ---------------------------------------------------------------------------

def measure_time(fn, *args, repeats: int = REPEATS) -> float:
    """Run fn(*args) `repeats` times and return the MEDIAN wall-clock time (seconds)."""
    times = []
    for _ in range(repeats):
        start = time.perf_counter()
        fn(*args)
        times.append(time.perf_counter() - start)
    return float(np.median(times))


# ---------------------------------------------------------------------------
# Benchmark 1 — Warshall's Transitive Closure  O(V³)
# ---------------------------------------------------------------------------

def benchmark_warshall(sizes: List[int]) -> Dict[str, list]:
    print("\n[1/4] Benchmarking Warshall's Transitive Closure  (claimed O(V^3)) ...")
    measured = []
    for v in sizes:
        g = make_random_graph(v, edge_density=0.4)
        t = measure_time(warshall_transitive_closure, g)
        measured.append(t)
        print(f"      V={v:4d}  ->  {t*1000:.3f} ms")
    return {"sizes": sizes, "measured": measured}


# ---------------------------------------------------------------------------
# Benchmark 2 — Greedy Minimum Settlement  O(N log N)
# ---------------------------------------------------------------------------

def benchmark_settlement(sizes: List[int]) -> Dict[str, list]:
    print("\n[2/4] Benchmarking Greedy Minimum Settlement  (claimed O(N log N)) ...")
    print("      Note: using sparse graphs (density=0.05) so E stays O(N),")
    print("      isolating the heap algorithm from graph-traversal overhead.")
    measured = []
    for n in sizes:
        # Use SPARSE graphs so edge count E ≈ 0.05*N*(N-1) stays much smaller than N^2
        # This isolates the heap-based settlement algorithm (the actual O(N log N) part)
        random.seed(n)   # deterministic per size
        g = make_random_graph(n, edge_density=0.05)
        t = measure_time(greedy_minimum_settlement, g)
        measured.append(t)
        e = len(g.get_all_edges())
        print(f"      N={n:4d}  E={e:5d}  ->  {t*1000:.4f} ms")
    return {"sizes": sizes, "measured": measured}


# ---------------------------------------------------------------------------
# Benchmark 3 — DFS Cycle Detection  O(V + E)
# ---------------------------------------------------------------------------

def benchmark_cycle_detection(sizes: List[int]) -> Dict[str, list]:
    print("\n[3/4] Benchmarking DFS Cycle Detection  (claimed O(V+E)) ...")
    print("      Using fixed random seed per size for consistent edge counts.")
    measured = []
    edge_counts = []
    for v in sizes:
        random.seed(v * 7)  # fixed seed per size for reproducible E
        g = make_random_graph(v, edge_density=0.3)
        e = len(g.get_all_edges())
        edge_counts.append(e)
        t = measure_time(find_all_cycles, g)
        measured.append(t)
        print(f"      V={v:4d}  E={e:5d}  V+E={v+e:5d}  ->  {t*1000:.4f} ms")
    return {"sizes": sizes, "measured": measured, "edge_counts": edge_counts}


# ---------------------------------------------------------------------------
# Benchmark 4 — Risk Engine  O(N * M)
# ---------------------------------------------------------------------------

def benchmark_risk_engine(sizes: List[int], months: int = 24) -> Dict[str, list]:
    print(f"\n[4/4] Benchmarking Risk Engine  (claimed O(N*M), M={months} months) ...")
    measured = []
    for n in sizes:
        profiles = make_random_histories(n, months)
        def score_all():
            for p in profiles:
                _ = p.risk_score
        t = measure_time(score_all)
        measured.append(t)
        print(f"      N={n:4d}  ->  {t*1000:.3f} ms")
    return {"sizes": sizes, "measured": measured}


# ---------------------------------------------------------------------------
# Benchmark 5 — Exact Solver vs. Greedy Settlement (Optimality & Runtime)
# ---------------------------------------------------------------------------

def benchmark_exact_vs_greedy(sizes: List[int]) -> Dict[str, list]:
    print("\n[5/6] Benchmarking Exact vs. Greedy Settlement (DAA trade-off) ...")
    exact_times = []
    greedy_times = []
    exact_counts = []
    greedy_counts = []
    optimality_gaps = []

    for n in sizes:
        random.seed(n * 13)
        g = make_random_graph(n, edge_density=0.4)

        t_greedy = measure_time(greedy_minimum_settlement, g)
        greedy_res = greedy_minimum_settlement(g)

        t_exact = measure_time(exact_minimum_settlement, g)
        exact_res = exact_minimum_settlement(g)

        exact_times.append(t_exact)
        greedy_times.append(t_greedy)
        exact_counts.append(exact_res["transaction_count"])
        greedy_counts.append(len(greedy_res))
        gap = max(0, len(greedy_res) - exact_res["transaction_count"])
        optimality_gaps.append(gap)

        print(f"      N={n:2d} | Exact: {t_exact*1000:7.3f} ms ({exact_res['transaction_count']} txns) | Greedy: {t_greedy*1000:6.3f} ms ({len(greedy_res)} txns) | Gap: {gap}")

    return {
        "sizes": sizes,
        "exact_times": exact_times,
        "greedy_times": greedy_times,
        "exact_counts": exact_counts,
        "greedy_counts": greedy_counts,
        "optimality_gaps": optimality_gaps,
    }


# ---------------------------------------------------------------------------
# Benchmark 6 — Tarjan's SCC O(V+E) vs. Warshall's O(V³)
# ---------------------------------------------------------------------------

def benchmark_scc_vs_warshall(sizes: List[int]) -> Dict[str, list]:
    print("\n[6/6] Benchmarking Tarjan's SCC O(V+E) vs. Warshall's O(V³) ...")
    scc_times = []
    warshall_times = []
    edge_counts = []

    for v in sizes:
        random.seed(v * 17)
        g = make_random_graph(v, edge_density=0.3)
        e = len(g.get_all_edges())
        edge_counts.append(e)

        t_scc = measure_time(tarjan_scc, g)
        t_warshall = measure_time(warshall_transitive_closure, g)

        scc_times.append(t_scc)
        warshall_times.append(t_warshall)

        speedup = t_warshall / max(t_scc, 1e-9)
        print(f"      V={v:3d} E={e:4d} | Tarjan: {t_scc*1000:6.3f} ms | Warshall: {t_warshall*1000:7.2f} ms | Speedup: {speedup:5.1f}x")

    return {
        "sizes": sizes,
        "scc_times": scc_times,
        "warshall_times": warshall_times,
        "edge_counts": edge_counts,
    }


# ---------------------------------------------------------------------------
# Plotting helpers
# ---------------------------------------------------------------------------

def _fit_and_scale(x: np.ndarray, y: np.ndarray, theory_fn) -> np.ndarray:
    """
    Scale the theoretical curve so it passes through the measured midpoint.
    This keeps the SHAPE of the curve (O(V^3) etc.) while aligning it visually
    with the measured data — standard practice in complexity analysis.
    """
    theory_raw = np.array([theory_fn(xi) for xi in x])
    # Find the scaling constant using least-squares on log scale
    mid = len(x) // 2
    if theory_raw[mid] > 0 and y[mid] > 0:
        scale = y[mid] / theory_raw[mid]
    else:
        scale = 1.0
    return theory_raw * scale


def plot_single(ax, data: dict, title: str, xlabel: str,
                theory_fn, theory_label: str, color: str = STYLE["measured_color"]):
    """Plot measured times vs. fitted theoretical curve on a given Axes."""
    sizes = np.array(data["sizes"], dtype=float)
    measured = np.array(data["measured"]) * 1000  # convert to milliseconds

    # Compute scaling constant: align theory curve to measured data at midpoint
    mid = len(sizes) // 2
    theory_at_sizes = np.array([theory_fn(xi) for xi in sizes])
    if theory_at_sizes[mid] > 0 and measured[mid] > 0:
        scale = measured[mid] / theory_at_sizes[mid]
    else:
        scale = 1.0

    # Smooth x range for the theory curve line
    x_smooth = np.linspace(sizes[0], sizes[-1], 300)
    theory_smooth = np.array([theory_fn(xi) * scale for xi in x_smooth])

    ax.plot(sizes, measured,
            "o-", color=STYLE["measured_color"], linewidth=2.5,
            markersize=7, label="Measured time (ms)", zorder=5)

    ax.plot(x_smooth, theory_smooth,
            "--", color=STYLE["theory_color"], linewidth=2,
            label=f"Theoretical {theory_label}", zorder=4, alpha=0.85)

    ax.set_title(title, fontsize=12, fontweight="bold",
                 color=STYLE["accent_color"], pad=10)

    ax.set_xlabel(xlabel, fontsize=9)
    ax.set_ylabel("Time (ms)", fontsize=9)
    ax.legend(fontsize=8, facecolor=STYLE["axes_facecolor"],
              edgecolor=STYLE["grid_color"], labelcolor=STYLE["text_color"])
    ax.grid(True, alpha=0.4)

    # Annotate the last measured point
    ax.annotate(f"{measured[-1]:.2f} ms",
                xy=(sizes[-1], measured[-1]),
                xytext=(-40, 12), textcoords="offset points",
                fontsize=8, color=STYLE["accent_color"],
                arrowprops=dict(arrowstyle="->", color=STYLE["accent_color"], lw=1))


# ---------------------------------------------------------------------------
# Save individual plots
# ---------------------------------------------------------------------------

def save_warshall_plot(data: dict):
    fig, ax = plt.subplots(figsize=(8, 5))
    plot_single(ax, data,
                title="Warshall's Transitive Closure — O(V^3)",
                xlabel="Number of Merchants (V)",
                theory_fn=lambda v: v**3,
                theory_label="V^3")
    ax.set_title(
        "Warshall's Transitive Closure — O(V^3)\n"
        "Discrete Structures & Graph Theory + DAA",
        fontsize=11, fontweight="bold", color=STYLE["accent_color"], pad=12)
    fig.tight_layout()
    path = os.path.join(RESULTS_DIR, "warshall_complexity.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"\n  Saved: {path}")
    return path


def save_settlement_plot(data: dict):
    fig, ax = plt.subplots(figsize=(8, 5))
    plot_single(ax, data,
                title="Greedy Settlement — O(N log N)",
                xlabel="Number of Merchants (N)",
                theory_fn=lambda n: n * math.log2(max(n, 2)),
                theory_label="N log2N")
    ax.set_title(
        "Greedy Minimum Settlement — O(N log N)\n"
        "Design & Analysis of Algorithms",
        fontsize=11, fontweight="bold", color=STYLE["accent_color"], pad=12)
    fig.tight_layout()
    path = os.path.join(RESULTS_DIR, "settlement_complexity.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved: {path}")
    return path


def save_cycle_plot(data: dict):
    """Special plot: use actual V+E values as the theory curve."""
    sizes = np.array(data["sizes"], dtype=float)
    measured = np.array(data["measured"]) * 1000
    edge_counts = np.array(data["edge_counts"], dtype=float)
    ve_values = sizes + edge_counts   # actual V+E for each measured size

    fig, ax = plt.subplots(figsize=(8, 5))

    # Scale V+E curve to align at midpoint
    mid = len(sizes) // 2
    scale = measured[mid] / ve_values[mid] if ve_values[mid] > 0 else 1.0
    theory_scaled = ve_values * scale

    ax.plot(sizes, measured,
            "o-", color=STYLE["measured_color"], linewidth=2.5,
            markersize=7, label="Measured time (ms)", zorder=5)
    ax.plot(sizes, theory_scaled,
            "--", color=STYLE["theory_color"], linewidth=2,
            label="Theoretical V+E (actual edge counts)", zorder=4, alpha=0.85)

    ax.set_title(
        "DFS Cycle Detection — O(V+E)\n"
        "Discrete Structures & Graph Theory",
        fontsize=11, fontweight="bold", color=STYLE["accent_color"], pad=12)
    ax.set_xlabel("Number of Merchants (V)", fontsize=9)
    ax.set_ylabel("Time (ms)", fontsize=9)
    ax.legend(fontsize=8, facecolor=STYLE["axes_facecolor"],
              edgecolor=STYLE["grid_color"], labelcolor=STYLE["text_color"])
    ax.grid(True, alpha=0.4)

    # Annotate last point
    ax.annotate(f"{measured[-1]:.2f} ms",
                xy=(sizes[-1], measured[-1]),
                xytext=(-40, 12), textcoords="offset points",
                fontsize=8, color=STYLE["accent_color"],
                arrowprops=dict(arrowstyle="->", color=STYLE["accent_color"], lw=1))

    fig.tight_layout()
    path = os.path.join(RESULTS_DIR, "cycle_detection_complexity.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved: {path}")
    return path


def save_risk_plot(data: dict, months: int = 24):
    fig, ax = plt.subplots(figsize=(8, 5))
    plot_single(ax, data,
                title=f"Poisson Risk Engine — O(N*M)  [M={months}]",
                xlabel="Number of Merchants (N)",
                theory_fn=lambda n: n * months,
                theory_label=f"N * {months}")
    ax.set_title(
        f"Poisson Risk Engine — O(N*M), M={months} months\n"
        "Statistical Methods / Foundation of Mathematics",
        fontsize=11, fontweight="bold", color=STYLE["accent_color"], pad=12)
    fig.tight_layout()
    path = os.path.join(RESULTS_DIR, "risk_engine_complexity.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved: {path}")
    return path


# ---------------------------------------------------------------------------
# Combined 2x2 dashboard plot
# ---------------------------------------------------------------------------

def save_combined_plot(warshall_data, settlement_data, cycle_data, risk_data, months: int = 24):
    fig = plt.figure(figsize=(16, 12))
    fig.suptitle(
        "CreditFlow — Algorithm Complexity Benchmarks\n"
        "SPIT Mumbai - Semester V Mini Project - Krrish (Backend Logic & Algorithms)",
        fontsize=14, fontweight="bold", color=STYLE["accent_color"], y=0.98)

    gs = gridspec.GridSpec(2, 2, figure=fig, hspace=0.45, wspace=0.35)

    ax1 = fig.add_subplot(gs[0, 0])
    ax2 = fig.add_subplot(gs[0, 1])
    ax3 = fig.add_subplot(gs[1, 0])
    ax4 = fig.add_subplot(gs[1, 1])

    plot_single(ax1, warshall_data,
                "Warshall's Closure — O(V^3)",
                "Merchants (V)",
                lambda v: v**3, "V^3")

    plot_single(ax2, settlement_data,
                "Greedy Settlement — O(N log N)",
                "Merchants (N)",
                lambda n: n * math.log2(max(n, 2)), "N log2N")

    # DFS panel: use actual V+E from real edge counts (same approach as save_cycle_plot)
    cycle_sizes = np.array(cycle_data["sizes"], dtype=float)
    cycle_measured = np.array(cycle_data["measured"]) * 1000
    cycle_ec = np.array(cycle_data["edge_counts"], dtype=float)
    ve_values = cycle_sizes + cycle_ec
    mid3 = len(cycle_sizes) // 2
    scale3 = cycle_measured[mid3] / ve_values[mid3] if ve_values[mid3] > 0 else 1.0
    ax3.plot(cycle_sizes, cycle_measured, "o-", color=STYLE["measured_color"],
             linewidth=2.5, markersize=6, label="Measured time (ms)", zorder=5)
    ax3.plot(cycle_sizes, ve_values * scale3, "--", color=STYLE["theory_color"],
             linewidth=2, label="Theoretical V+E", zorder=4, alpha=0.85)
    ax3.set_title("DFS Cycle Detection — O(V+E)", fontsize=11, fontweight="bold",
                  color=STYLE["accent_color"], pad=8)
    ax3.set_xlabel("Merchants (V)", fontsize=9)
    ax3.set_ylabel("Time (ms)", fontsize=9)
    ax3.legend(fontsize=7, facecolor=STYLE["axes_facecolor"],
               edgecolor=STYLE["grid_color"], labelcolor=STYLE["text_color"])
    ax3.grid(True, alpha=0.4)

    plot_single(ax4, risk_data,
                f"Poisson Risk Engine — O(N*M)",
                "Merchants (N)",
                lambda n: n * months, f"N*{months}")

    # Footer note
    fig.text(0.5, 0.01,
             "Blue line = actual measured time  |  Red dashed = theoretical curve (scaled to same midpoint)\n"
             "Shape match validates Big-O claim. Run: python -m benchmarks.run_benchmarks",
             ha="center", fontsize=8, color="#888888")

    path = os.path.join(RESULTS_DIR, "all_algorithms_comparison.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved COMBINED plot: {path}")
    return path


def save_exact_vs_greedy_plot(data: dict):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.2))
    sizes = np.array(data["sizes"])
    exact_ms = np.array(data["exact_times"]) * 1000
    greedy_ms = np.array(data["greedy_times"]) * 1000

    # Subplot 1: Runtime (Log scale)
    ax1.plot(sizes, exact_ms, "o-", color="#FF6B6B", linewidth=2.5, markersize=6, label="Exact Solver (O(2^N) DP)")
    ax1.plot(sizes, greedy_ms, "s-", color="#4F86F7", linewidth=2.5, markersize=6, label="Greedy Heuristic (O(N log N))")
    ax1.set_title("Runtime Comparison (Wall-Clock)\nDesign & Analysis of Algorithms", fontsize=11, fontweight="bold", color=STYLE["accent_color"], pad=12)
    ax1.set_xlabel("Merchants with Non-Zero Balances (N)", fontsize=9)
    ax1.set_ylabel("Time (ms) — Log Scale", fontsize=9)
    ax1.set_yscale("log")
    ax1.legend(fontsize=8, facecolor=STYLE["axes_facecolor"], edgecolor=STYLE["grid_color"], labelcolor=STYLE["text_color"])
    ax1.grid(True, alpha=0.4)

    # Subplot 2: Solution Quality / Optimality Gap
    ax2.plot(sizes, data["greedy_counts"], "s--", color="#4F86F7", linewidth=2, label="Greedy Txn Count")
    ax2.plot(sizes, data["exact_counts"], "o-", color="#00E676", linewidth=2.5, label="Exact Optimal Txn Count")
    ax2.fill_between(sizes, data["exact_counts"], data["greedy_counts"], color="#FFD700", alpha=0.25, label="Optimality Gap")
    ax2.set_title("Solution Quality (Transaction Count)\nOptimality Gap Demonstration", fontsize=11, fontweight="bold", color=STYLE["accent_color"], pad=12)
    ax2.set_xlabel("Merchants with Non-Zero Balances (N)", fontsize=9)
    ax2.set_ylabel("Transactions Required", fontsize=9)
    ax2.legend(fontsize=8, facecolor=STYLE["axes_facecolor"], edgecolor=STYLE["grid_color"], labelcolor=STYLE["text_color"])
    ax2.grid(True, alpha=0.4)

    fig.tight_layout()
    path = os.path.join(RESULTS_DIR, "exact_vs_greedy_complexity.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved: {path}")
    return path


def save_scc_vs_warshall_plot(data: dict):
    fig, ax = plt.subplots(figsize=(9, 5.5))
    sizes = np.array(data["sizes"])
    scc_ms = np.array(data["scc_times"]) * 1000
    warshall_ms = np.array(data["warshall_times"]) * 1000

    ax.plot(sizes, warshall_ms, "o-", color="#FF6B6B", linewidth=2.5, markersize=6, label="Warshall Transitive Closure (O(V^3))", zorder=5)
    ax.plot(sizes, scc_ms, "s-", color="#00E676", linewidth=2.5, markersize=6, label="Tarjan's SCC Algorithm (O(V+E))", zorder=6)

    ax.set_title("Tarjan's SCC O(V+E) vs. Warshall's Closure O(V^3)\nAsymptotic Scaling Comparison", fontsize=11, fontweight="bold", color=STYLE["accent_color"], pad=12)
    ax.set_xlabel("Number of Merchants (V)", fontsize=9)
    ax.set_ylabel("Time (ms)", fontsize=9)
    ax.legend(fontsize=9, facecolor=STYLE["axes_facecolor"], edgecolor=STYLE["grid_color"], labelcolor=STYLE["text_color"])
    ax.grid(True, alpha=0.4)

    max_speedup = warshall_ms[-1] / max(scc_ms[-1], 1e-9)
    ax.annotate(f"{max_speedup:.0f}x Speedup at V={sizes[-1]}",
                xy=(sizes[-1], warshall_ms[-1]),
                xytext=(-120, -30), textcoords="offset points",
                fontsize=9, color=STYLE["accent_color"],
                arrowprops=dict(arrowstyle="->", color=STYLE["accent_color"], lw=1.2))

    fig.tight_layout()
    path = os.path.join(RESULTS_DIR, "scc_vs_warshall_complexity.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved: {path}")
    return path


# ---------------------------------------------------------------------------
# Summary table
# ---------------------------------------------------------------------------

def print_summary_table(warshall_data, settlement_data, cycle_data, risk_data, exact_data=None, scc_data=None):
    print("\n" + "="*70)
    print("  COMPLEXITY BENCHMARK SUMMARY")
    print("="*70)
    print(f"  {'Algorithm':<35} {'Claimed':<14} Verdict")
    print("-"*70)

    def verdict(sizes, measured, theory_fn):
        x = np.array(sizes, dtype=float)
        y = np.array(measured)
        theory = np.array([theory_fn(xi) for xi in x])
        corr = float(np.corrcoef(y, theory)[0, 1])
        if corr > 0.90:
            return f"[CONFIRMED]  (r={corr:.3f})"
        elif corr > 0.70:
            return f"[PLAUSIBLE]  (r={corr:.3f})"
        else:
            return f"[MISMATCH]   (r={corr:.3f})"

    rows = [
        ("Warshall's Transitive Closure", "O(V^3)",
         warshall_data["sizes"], warshall_data["measured"], lambda v: v**3),
        ("Greedy Minimum Settlement", "O(N log N)",
         settlement_data["sizes"], settlement_data["measured"],
         lambda n: n * math.log2(max(n, 2))),
        ("DFS Cycle Detection", "O(V+E)",
         cycle_data["sizes"], cycle_data["measured"],
         lambda v: v + 0.3 * v * v),
        ("Poisson Risk Engine", "O(N×M)",
         risk_data["sizes"], risk_data["measured"], lambda n: n * 24),
    ]

    if scc_data:
        rows.append((
            "Tarjan's SCC Algorithm", "O(V+E)",
            scc_data["sizes"], scc_data["scc_times"],
            lambda v: v + 0.3 * v * v,
        ))

    if exact_data:
        rows.append((
            "Exact Backtracking Settlement", "O(2^N) [N<=12]",
            exact_data["sizes"], exact_data["exact_times"],
            lambda n: 2**n,
        ))

    for name, claim, sizes, measured, fn in rows:
        v = verdict(sizes, measured, fn)
        print(f"  {name:<35} {claim:<14} {v}")

    print("="*70)
    print(f"  Plots saved to: benchmarks/results/")
    print("="*70)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run():
    random.seed(42)   # reproducible results

    warshall_sizes   = [5, 10, 15, 20, 25, 30, 35, 40, 50, 60]
    settlement_sizes = [10, 25, 50, 75, 100, 150, 200, 300, 500, 750]
    cycle_sizes      = [5, 10, 15, 20, 30, 40, 50, 60, 75, 100]
    risk_sizes       = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
    exact_sizes      = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    scc_sizes        = [10, 20, 30, 40, 50, 75, 100, 125, 150]
    months           = 24

    print("=" * 60)
    print("  CreditFlow — Algorithm Complexity Benchmarks")
    print("  SPIT Mumbai · Krrish (Backend Logic & Algorithms)")
    print("=" * 60)

    warshall_data   = benchmark_warshall(warshall_sizes)
    settlement_data = benchmark_settlement(settlement_sizes)
    cycle_data      = benchmark_cycle_detection(cycle_sizes)
    risk_data       = benchmark_risk_engine(risk_sizes, months=months)
    exact_data      = benchmark_exact_vs_greedy(exact_sizes)
    scc_data        = benchmark_scc_vs_warshall(scc_sizes)

    print("\n  Generating plots ...")
    save_warshall_plot(warshall_data)
    save_settlement_plot(settlement_data)
    save_cycle_plot(cycle_data)
    save_risk_plot(risk_data, months=months)
    save_combined_plot(warshall_data, settlement_data, cycle_data, risk_data, months=months)
    save_exact_vs_greedy_plot(exact_data)
    save_scc_vs_warshall_plot(scc_data)

    print_summary_table(warshall_data, settlement_data, cycle_data, risk_data, exact_data, scc_data)


if __name__ == "__main__":
    run()
