# Concept Traceability & Academic Report
**Project:** CreditFlow  
**Owner:** Krrish (Backend Logic, Algorithms & Statistics)  
**Semester:** V (Mini Project, SPIT Mumbai)  

This document traces the algorithmic and statistical implementations in CreditFlow to core academic subjects taught in Semesters I–IV: **Design & Analysis of Algorithms (DAA)**, **Discrete Structures & Graph Theory (DSGT)**, **Data Structures (DS)**, and **Statistical Methods & Foundations of Mathematics (SMCS)**.

---

## 1. Design & Analysis of Algorithms (DAA)

### Greedy Algorithm: Minimum Debt Settlement
- **Problem Formulation:** Given a network of debts, minimize the total number of cash transactions required to settle all mutual debts.
- **Algorithm Used:** Max-Heap (Priority Queue) greedy matching.
- **Invariant:** The algebraic sum of all net balances across the closed merchant network is strictly zero:
  $$\sum_{i=1}^N B_i = 0$$
- **Complexity:** $\mathcal{O}(N \log N)$ where $N$ is the number of merchants. Constructing the initial heaps takes $\mathcal{O}(N)$, and each of at most $N-1$ settlement transactions performs heap extractions and insertions in $\mathcal{O}(\log N)$.
- **Empirical Validation:** Benchmarked using sparse graphs (density $0.05$) to isolate heap operations from edge traversal. Tested against the theoretical $N \log_2 N$ curve, yielding Pearson correlation $r = 0.979$ (`settlement_complexity.png`).

### Exact Backtracking Solver & Optimality Gap
- **Theoretical Basis:** Minimizing transactions to zero all net balances is NP-hard in the general case (equivalent to the Minimum Disjoint Zero-Sum Subset Partitioning problem and reducible to Bin Packing / Subset Sum).
- **Mathematical Principle:** A zero-sum balance set $S$ with no non-empty proper zero-sum subset requires exactly $|S| - 1$ transactions. If $S$ can be partitioned into $M$ disjoint non-empty zero-sum subsets $S_1, S_2, \dots, S_M$, the global minimum transaction count is:
  $$T_{\min} = |S| - M$$
  Maximizing $M$ minimizes $T$.
- **Algorithm Used:** Exact bitmask dynamic programming over zero-sum subsets. Integer cents scaling eliminates IEEE 754 floating point rounding errors.
- **Bounded Complexity & Fallback:** Bitmask iteration runs in $\mathcal{O}(3^N)$ submask steps. To ensure deterministic sub-millisecond API response times, a hard boundary cap is enforced at $N \le 12$ non-zero balances. If $N > 12$, the engine gracefully falls back to the $\mathcal{O}(N \log N)$ greedy heuristic and reports `capped=True`.
- **Empirical Validation & Optimality Gap:** Benchmarked on $N \in [3, 12]$ (`exact_vs_greedy_complexity.png`). Demonstrates where greedy diverges from global optimality (e.g., 5-node partition counterexample where greedy produces 4 transactions while exact finds 3, saving 1 transaction). Pearson runtime fit against $\mathcal{O}(2^N)$ yielded $r = 1.000$.

### Dynamic Programming: Warshall's Algorithm
- **Problem Formulation:** Compute global reachability across the directed credit network (if $A$ owes $B$ and $B$ owes $C$, does a directed debt path exist from $C$ back to $A$?).
- **Algorithm Used:** Warshall's Transitive Closure Dynamic Programming algorithm.
- **Recurrence Relation:**
  $$R^{(k)}[i,j] = R^{(k-1)}[i,j] \lor \left(R^{(k-1)}[i,k] \land R^{(k-1)}[k,j]\right)$$
- **Complexity:** $\mathcal{O}(V^3)$ time and $\mathcal{O}(V^2)$ auxiliary space.
- **Empirical Validation:** Measured across $V \in [5, 60]$. Pearson correlation against theoretical cubic growth $V^3$ achieved $r = 0.998$ (`warshall_complexity.png`).

---

## 2. Discrete Structures & Graph Theory (DSGT)

### Directed Graphs & DFS Cycle Netting
- **Graph Modeling:** The informal credit network is modeled as a weighted directed graph $G = (V, E)$, where $V$ represents merchants and directed edges $(u \to v, w)$ indicate that merchant $u$ owes merchant $v$ the amount $w$.
- **Cycle Detection:** Depth-First Search (DFS) with three-color node tracking (White = unvisited, Gray = on current stack, Black = completed). A back-edge to a Gray node identifies a circular debt loop.
- **Loop Netting Pipeline (`net-all` & `optimize`):** Cancels the minimum bottleneck flow $w_{\min} = \min_{(u, v) \in \text{cycle}} w(u, v)$ around detected loops. This completely eliminates circular exposure without moving any cash, transforming cyclic graphs into directed acyclic graphs (DAGs) prior to settlement.
- **Complexity:** $\mathcal{O}(V + E)$ on the adjacency list.
- **Empirical Validation:** Linear growth confirmed with correlation $r = 0.951$ (`cycle_detection_complexity.png`).

### Strongly Connected Components: Tarjan's Algorithm
- **Problem Formulation:** Rapidly partition the merchant network into equivalence classes of mutual reachability (merchants who have circular debt exposures to each other).
- **Algorithm Used:** Tarjan's single-pass DFS using discovery `index` and `lowlink` values with an explicit invariant stack.
- **Complexity:** $\mathcal{O}(V + E)$ time and $\mathcal{O}(V)$ auxiliary space.
- **Theoretical & Empirical Contrast with Warshall:** While Warshall's algorithm requires $\mathcal{O}(V^3)$ cubic time to produce the complete transitive closure matrix, Tarjan's algorithm extracts all cyclic clusters in linear $\mathcal{O}(V + E)$ time. In benchmarks (`scc_vs_warshall_complexity.png`), Tarjan achieved a **250.6x speedup** over Warshall at $V = 150$, with correlation $r = 0.994$.

### Systemic Default-Contagion Simulator
- **Problem Formulation:** Quantify the financial contagion impact and shock propagation if a specific merchant defaults.
- **Model Mechanics:**
  1. *First-Order (Direct Exposure):* Creditors $C$ owed money by defaulting merchant $X$ suffer direct loss:
     $$L_C = \sum_{debtor=X} w(X \to C)$$
  2. *Second-Order (Indirect Liquidity Shortfall):* Creditor $C$'s loss creates a liquidity shortfall that impairs their capacity to pay downstream obligations to creditors $D$ (edges $C \to D$), transmitted proportionally:
     $$\text{Transmitted}(C \to D) = \min\left(w(C \to D),\, L_C \cdot \frac{w(C \to D)}{\sum_k w(C \to k)}\right)$$
  3. Multi-round BFS cascade traverses the reachability tree until shock attenuation or depth limit ($R=5$).
- **Vulnerability Metric:** Network Vulnerability Score $= \frac{\text{Total Network Loss}}{\text{Total Network Debt}}$.

---

## 3. Foundations of Mathematics & Statistical Methods (SMCS)

### Poisson Process for Credit Risk
- **Modeling Assumption:** Late payment and default occurrences are modeled as a Poisson process occurring at constant empirical rate:
  $$\lambda = \frac{\text{Adverse Events}}{\text{Months Observed}}$$
- **Probability Function:** Probability of at least one adverse event in the next month:
  $$P(X \ge 1) = 1 - P(X = 0) = 1 - e^{-\lambda}$$
- **Cold-Start Handling:** For merchants with $< 3$ months history, an empirical Bayesian prior rate of $\lambda_0 = 0.05$ (5% baseline industry default rate) is assigned.
- **Complexity:** $\mathcal{O}(N \times M)$ where $N$ is merchants and $M$ is months observed. Benchmarking up to $N = 10,000$ confirmed linear scaling ($r = 1.000$, `risk_engine_complexity.png`).

### Statistical Hypothesis Testing: One-Proportion Z-Test
- **Statistical Formulation:** Evaluates whether a merchant's observed delinquency rate $\hat{p} = \frac{x}{n}$ is statistically significantly elevated compared to the network baseline delinquency rate $p_0$:
  $$H_0 : p = p_0 \quad \text{vs.} \quad H_1 : p > p_0$$
- **Test Statistic:**
  $$z = \frac{\hat{p} - p_0}{\sqrt{\frac{p_0(1 - p_0)}{n}}}$$
- **Significance Evaluation:** Right-tailed $p$-value calculated via standard normal cumulative distribution function $\Phi(z)$:
  $$p\text{-value} = 1 - \Phi(z)$$
  A merchant is flagged as significantly elevated risk at $\alpha = 0.05$ ($p < 0.05$).

### Pearson Product-Moment Correlation Analysis
- **Formulation:** Computes linear correlation between continuous credit risk variables using `scipy.stats.pearsonr`:
  $$r = \frac{\sum_{i=1}^n (x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum_{i=1}^n (x_i - \bar{x})^2} \sqrt{\sum_{i=1}^n (y_i - \bar{y})^2}}$$
- **Domain Indicators Analyzed:**
  1. Average payment delay days vs. average debt exposure amount ($r_{\text{delay, amount}}$).
  2. Transaction trade frequency vs. late-payment rate ($r_{\text{freq, late}}$).

### Multi-Factor Composite Risk Score
- **Composite Formulation (Blueprint §11.4):**
  $$\text{Composite Score} = 0.4 \cdot \text{norm}(\lambda) + 0.4 \cdot (1 - p\text{-value}) + 0.2 \cdot \text{norm}(\text{delay})$$
  where:
  - $\text{norm}(\lambda) = 1 - e^{-\lambda} \in [0, 1]$ (Poisson default probability)
  - $(1 - p\text{-value}) \in [0, 1]$ (statistical certainty of above-baseline risk)
  - $\text{norm}(\text{delay}) = \min(1.0, \text{delay} / 30.0)$ (normalized against 30-day delinquency threshold)

---

## 4. Empirical Complexity Validation Summary

All empirical benchmarks were executed using Python 3.11 with `numpy`, `scipy`, and `matplotlib`. Scaling curves were fitted against theoretical models using least-squares alignment.

| Algorithm | Theoretical Complexity | Empirical Fit ($r$) | Verdict | Key Milestone / Benchmark Plot |
|---|---|---|---|---|
| **Warshall's Transitive Closure** | $\mathcal{O}(V^3)$ | $r = 0.998$ | **CONFIRMED** | `warshall_complexity.png` |
| **Greedy Minimum Settlement** | $\mathcal{O}(N \log N)$ | $r = 0.979$ | **CONFIRMED** | `settlement_complexity.png` |
| **DFS Cycle Detection** | $\mathcal{O}(V + E)$ | $r = 0.951$ | **CONFIRMED** | `cycle_detection_complexity.png` |
| **Poisson Risk Engine** | $\mathcal{O}(N \times M)$ | $r = 1.000$ | **CONFIRMED** | `risk_engine_complexity.png` |
| **Tarjan's SCC Algorithm** | $\mathcal{O}(V + E)$ | $r = 0.994$ | **CONFIRMED** | `scc_vs_warshall_complexity.png` (250x speedup at V=150) |
| **Exact Backtracking Solver** | $\mathcal{O}(2^N)$ [cap $N \le 12$] | $r = 1.000$ | **CONFIRMED** | `exact_vs_greedy_complexity.png` (Optimality gap proven) |

---

## 5. Phase 4 — Hardening & Cross-Algorithm Validation

Phase 4 focuses on quality assurance through crosswise bug-bash testing, invariant verification, and stress testing. All hardening tests are implemented in `tests/test_phase4_hardening.py` and `tests/test_api_phase4_stress.py`.

### 5.1 Cross-Algorithm Verification

| Verification | What It Proves | Test Method |
|---|---|---|
| **SCC ↔ Warshall Consistency** | Every pair within a Tarjan SCC of size ≥2 appears as a mutual-reachability pair in Warshall's cyclic risk pairs | 10 random 15-node graphs; asserts containment in both directions |
| **Exact ≤ Greedy** | Exact solver never produces more transactions than greedy heuristic | Tested for $N \in [3, 10]$ with randomized graphs |
| **Netting → DAG** | After `net_all_cycles`, the graph contains zero directed cycles | 5 random 12-node graphs; `has_cycle` returns False |
| **Balance Conservation** | Cycle netting does not alter any merchant's net balance (only redistributes debt edges) | Pre/post net balance comparison across 10 random graphs |
| **Debt Volume Monotonicity** | Total edge weight never increases after netting | Before/after sum of edge weights |
| **Settlement Clears Balances** | Replaying all settlement transactions on net balances produces zero for every merchant | 10 random graphs; both greedy and exact |
| **Contagion Loss Bound** | Total contagion loss ≤ total network debt (no amplification beyond existing debt) | All merchants tested on 10-node graph |

### 5.2 Mathematical Invariants

| Invariant | Formal Statement | Status |
|---|---|---|
| **Balance Sum = 0** | $\sum_{i=1}^{N} B_i = 0$ for all closed debt networks | ✓ Verified across 20 random graphs |
| **Greedy Upper Bound** | Greedy settlement uses at most $|S| - 1$ transactions where $|S|$ = non-zero balance count | ✓ Verified for 10 graphs |
| **SCC Partition** | Tarjan's SCCs form a disjoint, complete partition of all merchants (every merchant in exactly one SCC) | ✓ Verified for 10 random graphs |
| **Warshall Reflexive + Transitive** | Closure[i][i] = True ∀i; Closure[a][b] ∧ Closure[b][c] ⟹ Closure[a][c] | ✓ Verified on 8-node graph |
| **Vulnerability ∈ [0,1]** | Network vulnerability score = total loss / total debt, bounded in unit interval | ✓ Verified for all merchants on 10-node graph |
| **Risk Category Monotonic** | Increasing $\lambda$ ⟹ non-decreasing risk category (LOW → MEDIUM → HIGH → CRITICAL) | ✓ Verified for $\lambda \in [0/12, 12/12]$ |
| **Composite Score ∈ [0,1]** | $0 \le 0.4 \cdot \text{norm}(\lambda) + 0.4 \cdot (1-p) + 0.2 \cdot \text{norm}(d) \le 1$ | ✓ Verified across extreme parameter grid |

### 5.3 Boundary & Degenerate Input Testing

| Scenario | Algorithms Tested | Expected Behavior |
|---|---|---|
| Empty graph (0 merchants) | All | Returns empty/zero results, no crash |
| Single node | SCC, Settlement, Exact | Singleton SCC, 0 transactions |
| Self-debt (A→A) | Balance computation | Net balance remains 0 |
| Perfectly balanced cycle | Exact, Greedy | 0 transactions needed |
| Exact solver at cap (N=12) | Exact | Uses DP, not fallback |
| Beyond cap (N>12) | Exact | Falls back to greedy with `capped=True` |
| Fractional amounts (33.33) | Exact, Netting | No floating point drift |
| Very small amounts (0.01) | Greedy | Correct 1-transaction settlement |
| Very large amounts (10⁹) | Greedy | No overflow |
| Z-test with 0 trials | Z-test | Safe defaults (z=0, not significant) |
| Baseline p=0 or p=1 | Z-test | SE guard returns z=0 |
| Empty correlation series | Pearson | Returns r=0, not significant |

### 5.4 Concurrent Execution & Stress Testing

| Test | Scale | Purpose |
|---|---|---|
| 10 parallel exact solvers | 5 threads | Verify stateless engine has no shared state corruption |
| 10 parallel SCC calls | 5 threads | Thread safety of Tarjan's algorithm |
| 5 parallel contagion simulations | 5 threads | Same graph, different failed merchants |
| Mixed parallel (SCC + exact + contagion) | 6 threads | Cross-endpoint concurrency |
| Warshall on 50 nodes, 60% density | 1 | Performance regression gate |
| Tarjan on 100 nodes | 1 | Linear scaling validation |
| Greedy on 500 merchants | 1 | Sparse graph stress |
| Risk engine on 1000 merchants | 1 | Portfolio scoring at scale |
| API: 10 parallel /settlement/exact | 5 threads | FastAPI endpoint thread safety |
| API: large payload (50-node SCC) | 1 | Payload size handling |
| API: 1000-element correlation series | 1 | Statistical endpoint throughput |

### 5.5 API-Level Endpoint Consistency

| Check | Endpoints | Assertion |
|---|---|---|
| Savings = net-all total | `/settlement/optimize` vs `/settlement/net-all` | `optimize.savings == net_all.total_amount_netted` |
| Same total $ settled | `/settlement/exact` vs `/settlement` (greedy) | `abs(exact_total - greedy_total) < 1.0` |
| Acyclic ⟹ no SCC cycles | `/graph/scc` vs `/settlement/cycles` | `cyclic_count == 0` and `has_cycle == false` |
| Cyclic ⟹ SCC detects | `/graph/scc` vs `/settlement/cycles` | `cyclic_count >= 1` and `has_cycle == true` |
| risk_category == risk_label | `/risk/score` | K9 fix: CRITICAL ↔ CRITICAL (no VERY_HIGH alias) |

---

## 6. Conclusion
CreditFlow v2 establishes rigorous traceability between computer science theory and real-world financial software engineering:
1. **DAA:** Proved the exact vs greedy settlement trade-off with mathematical proofs and empirical benchmarks. Phase 4 cross-verified that exact ≤ greedy across all tested inputs.
2. **DSGT:** Combined Tarjan's linear SCC grouping with Warshall's cubic reachability to provide both speed and depth. Phase 4 verified SCC ↔ Warshall consistency on random graphs.
3. **SMCS:** Upgraded cold-start Poisson risk with one-proportion z-tests, Pearson correlation, and systemic contagion simulation. Phase 4 hardened all statistical methods against boundary inputs (zero trials, degenerate variance, extreme baselines).
4. **SE (Software Engineering):** Phase 4 hardening suite covers 9 test categories with 88 dedicated hardening and stress test cases (221 overall across test suites) including concurrent stress, invariant verification, floating-point guards, and crosswise bug-bash across all algorithm modules.
