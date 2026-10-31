import { DirectedGraph } from "graphology";
import type { OwnershipRecord } from "./parseCapTable";

export interface GraphNode {
  name: string;
  type: "person" | "company";
}

export interface OwnershipEdge {
  from: string;
  to: string;
  pct: number;
}

export function buildOwnershipGraph(records: OwnershipRecord[]): DirectedGraph {
  const graph = new DirectedGraph();

  for (const r of records) {
    if (!graph.hasNode(r.entity))
      graph.addNode(r.entity, { type: r.entityType });
    if (!graph.hasNode(r.owner))
      graph.addNode(r.owner, { type: r.ownerType });
    // owner → entity ("owner has a stake in entity")
    if (!graph.hasDirectedEdge(r.owner, r.entity))
      graph.addDirectedEdge(r.owner, r.entity, { pct: r.ownershipPct });
  }

  return graph;
}

export function getAllNodes(graph: DirectedGraph): GraphNode[] {
  return graph.nodes().map((name) => ({
    name,
    type: graph.getNodeAttribute(name, "type") as "person" | "company",
  }));
}

/** The startup is the node with no outgoing ownership edges (nothing it owns in the cap table). */
export function getStartupNode(graph: DirectedGraph): string {
  return (
    graph.nodes().find((n) => graph.outDegree(n) === 0) ?? graph.nodes()[0]
  );
}

export function getEdges(graph: DirectedGraph): OwnershipEdge[] {
  return graph.edges().map((key) => ({
    from: graph.source(key),
    to: graph.target(key),
    pct: graph.getEdgeAttribute(key, "pct") as number,
  }));
}

export function isUltimateOwner(graph: DirectedGraph, nodeName: string): boolean {
  return graph.inDegree(nodeName) === 0;
}

/**
 * Walk upward through owners until reaching terminal nodes (UBOs).
 * Cycle-safe: stops revisiting nodes in a circular structure.
 */
export function resolveUltimateOwners(
  graph: DirectedGraph,
  nodeName: string,
): string[] {
  if (!graph.hasNode(nodeName)) return [];

  const terminals = new Set<string>();
  const queue = [nodeName];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const owners = graph.inNeighbors(current);
    if (owners.length === 0) {
      terminals.add(current);
      continue;
    }

    for (const owner of owners) {
      if (visited.has(owner)) {
        // Circular ownership — treat the cycle participant as a terminal.
        terminals.add(owner);
        continue;
      }
      queue.push(owner);
    }
  }

  return [...terminals];
}

/** Detect directed cycles in the ownership graph (owner → entity edges). */
export function findOwnershipCycles(graph: DirectedGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const neighbor of graph.outNeighbors(node)) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (stack.has(neighbor)) {
        const start = path.indexOf(neighbor);
        if (start >= 0) cycles.push([...path.slice(start), neighbor]);
      }
    }

    path.pop();
    stack.delete(node);
  }

  for (const node of graph.nodes()) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}

// BFS from the startup node upward through ownership (inNeighbors = who owns me?).
// Returns [startup, intermediary…, target]. Falls back to [target] if unreachable.
export function findOwnershipPath(
  graph: DirectedGraph,
  startup: string,
  target: string,
): string[] {
  if (startup === target) return [target];

  const queue: string[][] = [[startup]];
  const visited = new Set<string>([startup]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    for (const owner of graph.inNeighbors(current)) {
      if (owner === target) return [...path, target];
      if (!visited.has(owner)) {
        visited.add(owner);
        queue.push([...path, owner]);
      }
    }
  }

  return [target];
}

export interface OwnershipPathStep {
  name: string;
  /** Ownership % on the edge from this node toward the portfolio company (null at startup). */
  edgePct: number | null;
}

/**
 * Effective economic stake of `node` in `startup`, summed across all paths
 * (each path = product of edge ownership %, capped at 100).
 */
export function computeEffectiveStakeInStartup(
  graph: DirectedGraph,
  startup: string,
  node: string,
): number {
  if (!graph.hasNode(startup) || !graph.hasNode(node)) return 0;
  if (node === startup) return 100;

  let total = 0;

  function dfs(current: string, accumulated: number, visited: Set<string>): void {
    if (visited.has(current)) return;
    const nextVisited = new Set(visited);
    nextVisited.add(current);

    for (const child of graph.outNeighbors(current)) {
      const edgeKey = graph.edge(current, child);
      if (!edgeKey) continue;
      const pct = (graph.getEdgeAttribute(edgeKey, "pct") as number) / 100;
      const nextAccum = accumulated * pct;

      if (child === startup) {
        total += nextAccum * 100;
      } else {
        dfs(child, nextAccum, nextVisited);
      }
    }
  }

  dfs(node, 1, new Set());
  return Math.min(100, Math.round(total * 1000) / 1000);
}

/** Path from `node` down to `startup` with the highest effective stake. */
export function findHighestStakePath(
  graph: DirectedGraph,
  startup: string,
  node: string,
): { path: string[]; steps: OwnershipPathStep[]; effectivePct: number } {
  if (!graph.hasNode(startup) || !graph.hasNode(node)) {
    return { path: [node], steps: [{ name: node, edgePct: null }], effectivePct: 0 };
  }
  if (node === startup) {
    return {
      path: [startup],
      steps: [{ name: startup, edgePct: null }],
      effectivePct: 100,
    };
  }

  let bestPath: string[] = [node];
  let bestPct = 0;

  function dfs(
    current: string,
    path: string[],
    accumulated: number,
    visited: Set<string>,
  ): void {
    if (visited.has(current)) return;
    const nextVisited = new Set(visited);
    nextVisited.add(current);

    for (const child of graph.outNeighbors(current)) {
      const edgeKey = graph.edge(current, child);
      if (!edgeKey) continue;
      const pct = (graph.getEdgeAttribute(edgeKey, "pct") as number) / 100;
      const nextAccum = accumulated * pct;
      const nextPath = [...path, child];

      if (child === startup) {
        const stake = nextAccum * 100;
        if (stake > bestPct) {
          bestPct = stake;
          bestPath = nextPath;
        }
      } else {
        dfs(child, nextPath, nextAccum, nextVisited);
      }
    }
  }

  dfs(node, [node], 1, new Set());

  const steps: OwnershipPathStep[] = bestPath.map((name, i) => {
    if (i === bestPath.length - 1) {
      return { name, edgePct: null };
    }
    const edgeKey = graph.edge(name, bestPath[i + 1]);
    const edgePct = edgeKey
      ? (graph.getEdgeAttribute(edgeKey, "pct") as number)
      : null;
    return { name, edgePct };
  });

  return {
    path: bestPath,
    steps,
    effectivePct: Math.min(100, Math.round(bestPct * 1000) / 1000),
  };
}
