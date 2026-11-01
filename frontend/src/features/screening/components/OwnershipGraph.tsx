"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { EntityResult, OwnershipEdge } from "@/types/screening";

interface Props {
  entities: EntityResult[];
  edges: OwnershipEdge[];
  height?: number;
  fill?: boolean;
  onEntitySelect?: (entity: EntityResult) => void;
}

// Risk colours: flagged = red, review = amber, clear = neutral
const RISK_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  flagged: { bg: "#fef2f2", border: "#ef4444", color: "#991b1b" },
  review:  { bg: "#fffbeb", border: "#f59e0b", color: "#92400e" },
  clear:   { bg: "#ffffff", border: "#e5e7eb", color: "#374151" },
};

const NODE_W    = 148;
const NODE_H    = 40;
const H_GAP_MIN = 20;
const V_GAP     = 80;
const H_MARGIN  = 24;

/**
 * Layout: depth 0 = the portfolio company (bottom of chart).
 * Each extra depth level moves UPWARD — ultimate owners appear at the top.
 * Arrows point FROM owner DOWN TO the entity they own.
 *
 * Edges in the data: from = owner, to = entity (owned).
 * In the CSV: owner "owns" entity, so arrows go owner → entity (downward).
 */
function buildLayout(
  entities: EntityResult[],
  rawEdges: OwnershipEdge[],
  containerWidth: number,
  clickable: boolean,
): { rfNodes: Node[]; rfEdges: Edge[] } {
  const riskMap = new Map(entities.map((e) => [e.name, e.riskLevel]));

  // Drop self-loops (they produce visual noise)
  const validEdges = rawEdges.filter((e) => e.from !== e.to);

  const fromSet = new Set(validEdges.map((e) => e.from));
  const toSet   = new Set(validEdges.map((e) => e.to));

  // The portfolio company = appears as a target but never as an owner
  const target =
    entities.map((e) => e.name).find((n) => toSet.has(n) && !fromSet.has(n)) ??
    entities[0]?.name;

  // BFS downward from the portfolio company using the "who owns this?" map
  const ownersOf = new Map<string, string[]>();
  for (const edge of validEdges) {
    if (!ownersOf.has(edge.to)) ownersOf.set(edge.to, []);
    ownersOf.get(edge.to)!.push(edge.from);
  }

  // depth 0 = portfolio company, higher = further up the ownership chain
  const depths = new Map<string, number>();
  if (target) {
    depths.set(target, 0);
    const queue = [target];
    const visited = new Set([target]);
    while (queue.length) {
      const node = queue.shift()!;
      const d = depths.get(node)!;
      for (const owner of ownersOf.get(node) ?? []) {
        if (!visited.has(owner)) {
          visited.add(owner);
          depths.set(owner, d + 1);
          queue.push(owner);
        }
      }
    }
  }

  const maxDepth = depths.size ? Math.max(...depths.values()) : 0;
  // Nodes not reachable from target still get a row
  for (const e of entities) {
    if (!depths.has(e.name)) depths.set(e.name, maxDepth + 1);
  }

  // Group nodes by row (depth)
  const byDepth = new Map<number, string[]>();
  for (const [name, d] of depths) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(name);
  }

  const usableW = Math.max(containerWidth - H_MARGIN * 2, NODE_W);

  const rfNodes: Node[] = [];
  for (const [depth, names] of byDepth) {
    const count = names.length;
    const gap =
      count > 1
        ? Math.max(H_GAP_MIN, (usableW - count * NODE_W) / (count - 1))
        : 0;
    const rowWidth = count * NODE_W + (count - 1) * gap;
    const startX   = H_MARGIN + (usableW - rowWidth) / 2;

    // depth 0 (company) at bottom: y = maxDepth * row_height, decreasing upward
    const y = (maxDepth - depth) * (NODE_H + V_GAP);

    names.forEach((name, i) => {
      const risk = riskMap.get(name) ?? "clear";
      const s    = RISK_STYLE[risk];
      rfNodes.push({
        id: name,
        position: { x: startX + i * (NODE_W + gap), y },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: { label: name.length > 20 ? `${name.slice(0, 18)}…` : name },
        style: {
          background: s.bg,
          border: `1.5px solid ${s.border}`,
          color: s.color,
          width: NODE_W,
          fontSize: 11,
          fontWeight: risk !== "clear" ? 600 : 400,
          borderRadius: 8,
          padding: "6px 8px",
          textAlign: "center" as const,
          boxShadow: risk !== "clear" ? "0 0 0 3px " + s.border + "33" : "none",
          cursor: clickable ? "pointer" : "default",
        },
      });
    });
  }

  // Flagged / review owners highlight their edges in red/amber
  const alertOwners = new Map(
    entities
      .filter((e) => e.riskLevel !== "clear")
      .map((e) => [e.name, e.riskLevel]),
  );

  const rfEdges: Edge[] = validEdges.map((e, i) => {
    const alert = alertOwners.get(e.from);
    const stroke = alert === "flagged" ? "#ef4444" : alert === "review" ? "#f59e0b" : "#d1d5db";
    return {
      id: `e${i}`,
      source: e.from,
      target: e.to,
      label: `${e.pct}%`,
      labelStyle: { fontSize: 10, fill: "#6b7280" },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      style: { stroke, strokeWidth: alert ? 2 : 1 },
    };
  });

  return { rfNodes, rfEdges };
}

function GraphCanvas({
  entities,
  edges,
  containerWidth,
  onEntitySelect,
}: {
  entities: EntityResult[];
  edges: OwnershipEdge[];
  containerWidth: number;
  onEntitySelect?: (entity: EntityResult) => void;
}) {
  const { fitView } = useReactFlow();
  const entityMap = useMemo(
    () => new Map(entities.map((e) => [e.name, e])),
    [entities],
  );

  const { rfNodes, rfEdges } = useMemo(
    () => buildLayout(entities, edges, containerWidth, !!onEntitySelect),
    [entities, edges, containerWidth, onEntitySelect],
  );

  const fit = useCallback(() => {
    requestAnimationFrame(() => {
      fitView({ padding: 0.1, maxZoom: 1.0, duration: 200 });
    });
  }, [fitView]);

  useEffect(() => { fit(); }, [rfNodes, rfEdges, fit]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const entity = entityMap.get(node.id);
      if (entity && onEntitySelect) onEntitySelect(entity);
    },
    [entityMap, onEntitySelect],
  );

  return (
    <ReactFlow
      className="h-full w-full"
      nodes={rfNodes}
      edges={rfEdges}
      fitView
      fitViewOptions={{ padding: 0.1, maxZoom: 1.0 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={!!onEntitySelect}
      onNodeClick={onEntitySelect ? handleNodeClick : undefined}
      proOptions={{ hideAttribution: true }}
      onInit={fit}
    >
      <Background gap={20} color="#f3f4f6" />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}

export function OwnershipGraph({
  entities,
  edges,
  height = 420,
  fill = false,
  onEntitySelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth || 800);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${fill ? "w-full h-full min-h-0" : "w-full"}`}
      style={fill ? undefined : { height }}
    >
      <div className={fill ? "h-full w-full" : "h-full w-full"} style={fill ? undefined : { height }}>
        <ReactFlowProvider>
          <GraphCanvas
            entities={entities}
            edges={edges}
            containerWidth={containerWidth}
            onEntitySelect={onEntitySelect}
          />
        </ReactFlowProvider>
      </div>
      {onEntitySelect && (
        <div className="pointer-events-none absolute top-2 right-2 z-10 rounded-md bg-white/90 border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 shadow-sm backdrop-blur-sm">
          Click a node for Watchman details
        </div>
      )}
    </div>
  );
}
