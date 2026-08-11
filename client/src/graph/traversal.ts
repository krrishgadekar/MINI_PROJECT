/**
 * graph/traversal.ts — Client-side BFS/DFS implementations
 *
 * CONCEPT TRACEABILITY:
 *   - CE201 Discrete Structures & Graph Theory: BFS and DFS on a directed graph
 *   - CE202 Data Structures: Adjacency list representation, queue (BFS), stack (DFS)
 *
 * This is Parth's KEY ACADEMIC DELIVERABLE. These algorithms are implemented
 * from scratch in TypeScript — NOT just calling a library. The GraphVisualizer
 * component calls these to highlight reachable merchants when a user clicks a node.
 *
 * Be ready to explain on a whiteboard:
 *   - BFS uses a queue → level-order traversal → finds shortest path
 *   - DFS uses a stack (or recursion) → explores depth-first → useful for cycle detection
 *   - Why adjacency list is used (O(V+E) traversal vs O(V²) for matrix)
 */

import type { DebtEdge } from "../types";

// ---------------------------------------------------------------------------
// Build adjacency list from debt edges
// ---------------------------------------------------------------------------

/**
 * Convert an array of DebtEdge into an adjacency list.
 * The adjacency list maps each merchant to the list of merchants they owe money TO.
 *
 * Time: O(E) where E = number of debt edges
 * Space: O(V + E) for the adjacency list
 */
export function buildAdjacencyList(
  merchants: string[],
  debts: DebtEdge[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();

  // Initialize all merchants with empty neighbor lists
  for (const m of merchants) {
    adj.set(m, []);
  }

  // Add directed edges: debtor → creditor
  for (const debt of debts) {
    const neighbors = adj.get(debt.debtor);
    if (neighbors) {
      neighbors.push(debt.creditor);
    }
  }

  return adj;
}

// ---------------------------------------------------------------------------
// BFS — Breadth-First Search
// ---------------------------------------------------------------------------

/**
 * Perform BFS from a source node and return all reachable merchants in
 * level-order (closest first).
 *
 * Algorithm:
 *   1. Enqueue the source node.
 *   2. While the queue is not empty:
 *      a. Dequeue a node.
 *      b. For each unvisited neighbor, mark visited and enqueue.
 *   3. Return all visited nodes (excluding source).
 *
 * Time complexity:  O(V + E) — each vertex and edge visited at most once.
 * Space complexity: O(V) — for the visited set and queue.
 *
 * @param adjacencyList - Map of merchant → list of merchants they owe
 * @param source - The starting merchant ID
 * @returns Ordered array of reachable merchant IDs (level-order)
 */
export function bfs(
  adjacencyList: Map<string, string[]>,
  source: string
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const queue: string[] = []; // Using array as a simple queue

  visited.add(source);
  queue.push(source);

  while (queue.length > 0) {
    const current = queue.shift()!; // Dequeue from front

    // Visit all unvisited neighbors
    const neighbors = adjacencyList.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        result.push(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// DFS — Depth-First Search
// ---------------------------------------------------------------------------

/**
 * Perform DFS from a source node and return all reachable merchants in
 * depth-first order (deepest path explored first).
 *
 * Uses an iterative approach with an explicit stack (equivalent to
 * recursive DFS but avoids stack overflow on large graphs).
 *
 * Algorithm:
 *   1. Push the source node onto the stack.
 *   2. While the stack is not empty:
 *      a. Pop a node.
 *      b. If not visited: mark visited, push all unvisited neighbors.
 *   3. Return all visited nodes (excluding source).
 *
 * Time complexity:  O(V + E)
 * Space complexity: O(V)
 *
 * @param adjacencyList - Map of merchant → list of merchants they owe
 * @param source - The starting merchant ID
 * @returns Array of reachable merchant IDs (depth-first order)
 */
export function dfs(
  adjacencyList: Map<string, string[]>,
  source: string
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const stack: string[] = [source]; // Explicit stack

  while (stack.length > 0) {
    const current = stack.pop()!; // Pop from top

    if (visited.has(current)) continue;
    visited.add(current);

    if (current !== source) {
      result.push(current);
    }

    // Push neighbors in reverse order so they are visited in original order
    const neighbors = adjacencyList.get(current) || [];
    for (let i = neighbors.length - 1; i >= 0; i--) {
      if (!visited.has(neighbors[i])) {
        stack.push(neighbors[i]);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Find Path (BFS-based shortest path)
// ---------------------------------------------------------------------------

/**
 * Find the shortest path between two merchants using BFS.
 * Used to highlight the settlement flow path in the graph visualizer.
 *
 * Algorithm:
 *   1. BFS from `from`, tracking parent pointers.
 *   2. If `to` is reached, reconstruct the path via parent pointers.
 *   3. Return the path as an ordered list, or null if no path exists.
 *
 * Time: O(V + E), Space: O(V)
 *
 * @param adjacencyList - Map of merchant → list of merchants they owe
 * @param from - Source merchant ID
 * @param to - Target merchant ID
 * @returns Ordered path [from, ..., to] or null if unreachable
 */
export function findPath(
  adjacencyList: Map<string, string[]>,
  from: string,
  to: string
): string[] | null {
  if (from === to) return [from];

  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue: string[] = [from];
  visited.add(from);

  while (queue.length > 0) {
    const current = queue.shift()!;

    const neighbors = adjacencyList.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, current);

        if (neighbor === to) {
          // Reconstruct path
          const path: string[] = [to];
          let node = to;
          while (parent.has(node)) {
            node = parent.get(node)!;
            path.unshift(node);
          }
          return path;
        }

        queue.push(neighbor);
      }
    }
  }

  return null; // No path found
}

// ---------------------------------------------------------------------------
// Get all edges along a path (for highlighting in the visualizer)
// ---------------------------------------------------------------------------

/**
 * Given a path of merchant IDs, return the set of edge keys ("source→target")
 * for highlighting in the graph visualizer.
 */
export function getPathEdges(path: string[]): Set<string> {
  const edges = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    edges.add(`${path[i]}→${path[i + 1]}`);
  }
  return edges;
}
