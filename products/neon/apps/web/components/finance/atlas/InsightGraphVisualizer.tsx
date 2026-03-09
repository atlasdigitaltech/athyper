"use client";

// components/finance/atlas/InsightGraphVisualizer.tsx
//
// Canvas-based force-directed graph visualization for the Atlas Insight Graph.
// Zero external dependencies — uses requestAnimationFrame + simple force simulation.
//
// Features:
//   - Force-directed layout (repulsion + spring + center gravity)
//   - Mouse wheel zoom + drag-to-pan
//   - Node click selection with connected edge highlighting
//   - Node drag to reposition
//   - Dark mode awareness (via CSS class detection)
//   - Label background pills for readability
//   - Hover tooltip with node details
//   - Edge type labels on selected edges
//   - Responsive resize via ResizeObserver

import { useRef, useEffect, useCallback, useState } from "react";
import type { InsightGraphNode, InsightGraphEdge } from "@/lib/finance/use-insight-graph";

// ---------------------------------------------------------------------------
// Node type colors (work on both light and dark backgrounds)
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<string, string> = {
  PERIOD: "#3b82f6",        // blue
  CLOSE_RUN: "#6366f1",     // indigo
  RELEASE: "#8b5cf6",       // purple
  ANOMALY: "#ef4444",       // red
  RISK_SIGNAL: "#f59e0b",   // amber
  TASK: "#14b8a6",          // teal
  ACCOUNT: "#10b981",       // emerald
  RECONCILIATION: "#06b6d4", // cyan
};

const EDGE_COLORS: Record<string, string> = {
  BLOCKED_BY: "#ef4444",
  TRIGGERED_BY: "#f59e0b",
  AFFECTS: "#f97316",
  DERIVED_FROM: "#3b82f6",
  RECONCILES: "#14b8a6",
  ESCALATED_TO: "#8b5cf6",
  DEPENDS_ON: "#6b7280",
};

// ---------------------------------------------------------------------------
// Force simulation types
// ---------------------------------------------------------------------------

interface SimNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  edgeCount: number;
}

interface SimEdge {
  source: string;
  target: string;
  type: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InsightGraphVisualizerProps {
  nodes: InsightGraphNode[];
  edges: InsightGraphEdge[];
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsightGraphVisualizer({
  nodes,
  edges,
  width = 800,
  height = 500,
}: InsightGraphVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<SimEdge[]>([]);
  const frameRef = useRef<number>(0);
  const iterRef = useRef(0);

  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ w: width, h: height });

  // Transform state (zoom + pan)
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  // Drag state
  const dragRef = useRef<{
    active: boolean;
    mode: "pan" | "node";
    nodeId: string | null;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  }>({ active: false, mode: "pan", nodeId: null, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 });

  // Dark mode detection
  const isDarkRef = useRef(false);
  useEffect(() => {
    const check = () => {
      isDarkRef.current = document.documentElement.classList.contains("dark");
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        if (cr.width > 0) setDimensions({ w: cr.width, h: Math.max(400, cr.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Initialize simulation
  useEffect(() => {
    const w = dimensions.w;
    const h = dimensions.h;

    // Build edge count map
    const edgeCounts = new Map<string, number>();
    for (const e of edges) {
      edgeCounts.set(e.source, (edgeCounts.get(e.source) ?? 0) + 1);
      edgeCounts.set(e.target, (edgeCounts.get(e.target) ?? 0) + 1);
    }

    // Initialize nodes with random positions around center
    simNodesRef.current = nodes.map((n) => {
      const ec = edgeCounts.get(n.id) ?? 0;
      return {
        id: n.id,
        type: n.type,
        label: n.label,
        x: w / 2 + (Math.random() - 0.5) * w * 0.6,
        y: h / 2 + (Math.random() - 0.5) * h * 0.6,
        vx: 0,
        vy: 0,
        radius: Math.max(6, Math.min(18, 6 + ec * 2)),
        color: NODE_COLORS[n.type] ?? "#6b7280",
        edgeCount: ec,
      };
    });

    simEdgesRef.current = edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      color: EDGE_COLORS[e.type] ?? "#d1d5db",
    }));

    iterRef.current = 0;
    // Reset transform on data change
    transformRef.current = { scale: 1, offsetX: 0, offsetY: 0 };
  }, [nodes, edges, dimensions]);

  // Screen coords → graph coords
  const screenToGraph = useCallback((sx: number, sy: number) => {
    const t = transformRef.current;
    return {
      x: (sx - t.offsetX) / t.scale,
      y: (sy - t.offsetY) / t.scale,
    };
  }, []);

  // Find node at screen position
  const findNodeAt = useCallback((sx: number, sy: number): SimNode | null => {
    const { x: gx, y: gy } = screenToGraph(sx, sy);
    for (const n of simNodesRef.current) {
      const dx = gx - n.x;
      const dy = gy - n.y;
      const hitRadius = n.radius / transformRef.current.scale + 4;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return n;
    }
    return null;
  }, [screenToGraph]);

  // Force simulation loop
  const simulate = useCallback(() => {
    const sNodes = simNodesRef.current;
    const sEdges = simEdgesRef.current;
    const w = dimensions.w;
    const h = dimensions.h;

    if (sNodes.length === 0) return;

    const MAX_ITERS = 250;
    if (iterRef.current >= MAX_ITERS) {
      draw(sNodes, sEdges, w, h);
      return;
    }
    iterRef.current++;

    const alpha = Math.max(0.005, 1 - iterRef.current / MAX_ITERS);
    const nodeMap = new Map(sNodes.map(n => [n.id, n]));

    // Repulsion (charge force)
    for (let i = 0; i < sNodes.length; i++) {
      for (let j = i + 1; j < sNodes.length; j++) {
        const a = sNodes[i];
        const b = sNodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = -400 * alpha / (dist * dist);
        const fx = force * dx / dist;
        const fy = force * dy / dist;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction (spring force along edges)
    for (const e of sEdges) {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (!s || !t) continue;
      let dx = t.x - s.x;
      let dy = t.y - s.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const idealDist = 100;
      const force = (dist - idealDist) * 0.02 * alpha;
      const fx = force * dx / dist;
      const fy = force * dy / dist;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    }

    // Center gravity
    for (const n of sNodes) {
      n.vx += (w / 2 - n.x) * 0.004 * alpha;
      n.vy += (h / 2 - n.y) * 0.004 * alpha;
    }

    // Apply velocity with damping (skip dragged node)
    const draggedId = dragRef.current.active && dragRef.current.mode === "node" ? dragRef.current.nodeId : null;
    for (const n of sNodes) {
      if (n.id === draggedId) continue;
      n.vx *= 0.55;
      n.vy *= 0.55;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(n.radius, Math.min(w - n.radius, n.x));
      n.y = Math.max(n.radius, Math.min(h - n.radius, n.y));
    }

    draw(sNodes, sEdges, w, h);
    frameRef.current = requestAnimationFrame(simulate);
  }, [dimensions]);

  // Draw function
  const draw = useCallback((sNodes: SimNode[], sEdges: SimEdge[], w: number, h: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const isDark = isDarkRef.current;
    const bgColor = isDark ? "#1a1a2e" : "#ffffff";
    const labelColor = isDark ? "#e2e8f0" : "#374151";
    const labelBg = isDark ? "rgba(30,30,50,0.85)" : "rgba(255,255,255,0.85)";
    const gridColor = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Draw subtle grid
    const t = transformRef.current;
    ctx.save();
    const gridSize = 40 * t.scale;
    if (gridSize > 10) {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      const startX = t.offsetX % gridSize;
      const startY = t.offsetY % gridSize;
      for (let x = startX; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = startY; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Apply transform for graph content
    ctx.save();
    ctx.translate(t.offsetX, t.offsetY);
    ctx.scale(t.scale, t.scale);

    const nodeMap = new Map(sNodes.map(n => [n.id, n]));
    const selectedId = selectedNodeId;

    // Connected edges for selected node
    const connectedEdgeSet = new Set<string>();
    const connectedNodeSet = new Set<string>();
    if (selectedId) {
      connectedNodeSet.add(selectedId);
      for (const e of sEdges) {
        if (e.source === selectedId || e.target === selectedId) {
          connectedEdgeSet.add(`${e.source}→${e.target}→${e.type}`);
          connectedNodeSet.add(e.source);
          connectedNodeSet.add(e.target);
        }
      }
    }

    // Draw edges
    for (const e of sEdges) {
      const s = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (!s || !tgt) continue;

      const edgeKey = `${e.source}→${e.target}→${e.type}`;
      const isHighlighted = selectedId ? connectedEdgeSet.has(edgeKey) : false;
      const isDimmed = selectedId && !isHighlighted;

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = isDimmed ? (isDark ? "rgba(100,100,100,0.15)" : "rgba(200,200,200,0.2)")
                       : isHighlighted ? e.color + "cc"
                       : e.color + "50";
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.stroke();

      // Arrow head
      const angle = Math.atan2(tgt.y - s.y, tgt.x - s.x);
      const arrowDist = tgt.radius + 4;
      const ax = tgt.x - Math.cos(angle) * arrowDist;
      const ay = tgt.y - Math.sin(angle) * arrowDist;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 7 * Math.cos(angle - 0.35), ay - 7 * Math.sin(angle - 0.35));
      ctx.lineTo(ax - 7 * Math.cos(angle + 0.35), ay - 7 * Math.sin(angle + 0.35));
      ctx.closePath();
      ctx.fillStyle = isDimmed ? "rgba(180,180,180,0.2)" : isHighlighted ? e.color + "cc" : e.color + "70";
      ctx.fill();

      // Edge type label on highlighted edges
      if (isHighlighted) {
        const mx = (s.x + tgt.x) / 2;
        const my = (s.y + tgt.y) / 2;
        const edgeLabel = e.type.replace(/_/g, " ");
        ctx.font = "9px system-ui, sans-serif";
        const tw = ctx.measureText(edgeLabel).width;
        ctx.fillStyle = labelBg;
        ctx.fillRect(mx - tw / 2 - 3, my - 6, tw + 6, 12);
        ctx.fillStyle = e.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(edgeLabel, mx, my);
      }
    }

    // Draw nodes
    for (const n of sNodes) {
      const isSelected = n.id === selectedId;
      const isConnected = connectedNodeSet.has(n.id);
      const isDimmed = selectedId != null && !isConnected;

      // Glow for selected node
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = n.color + "30";
        ctx.fill();
      }

      // Circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = isDimmed ? (isDark ? "#444" : "#ccc") : n.color;
      ctx.fill();
      ctx.strokeStyle = isDark ? "#2d2d44" : "#ffffff";
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label with background pill
      const labelText = n.label.length > 22 ? n.label.slice(0, 20) + "\u2026" : n.label;
      ctx.font = "10px system-ui, sans-serif";
      const textWidth = ctx.measureText(labelText).width;
      const pillX = n.x - textWidth / 2 - 4;
      const pillY = n.y + n.radius + 2;
      const pillW = textWidth + 8;
      const pillH = 14;

      if (!isDimmed) {
        // Rounded pill background
        const r = 3;
        ctx.beginPath();
        ctx.moveTo(pillX + r, pillY);
        ctx.lineTo(pillX + pillW - r, pillY);
        ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + r, r);
        ctx.lineTo(pillX + pillW, pillY + pillH - r);
        ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - r, pillY + pillH, r);
        ctx.lineTo(pillX + r, pillY + pillH);
        ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - r, r);
        ctx.lineTo(pillX, pillY + r);
        ctx.arcTo(pillX, pillY, pillX + r, pillY, r);
        ctx.closePath();
        ctx.fillStyle = labelBg;
        ctx.fill();

        ctx.fillStyle = isDimmed ? (isDark ? "#666" : "#aaa") : labelColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(labelText, n.x, pillY + 2);
      }
    }

    ctx.restore();

    // Zoom indicator (bottom-right)
    const zoomPct = Math.round(t.scale * 100);
    if (zoomPct !== 100) {
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${zoomPct}%`, w - 8, h - 8);
    }
  }, [selectedNodeId]);

  // Start simulation
  useEffect(() => {
    frameRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [simulate]);

  // Redraw when selection changes (after simulation settles)
  useEffect(() => {
    if (iterRef.current >= 250) {
      draw(simNodesRef.current, simEdgesRef.current, dimensions.w, dimensions.h);
    }
  }, [selectedNodeId, dimensions, draw]);

  // Mouse wheel → zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const t = transformRef.current;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(5, t.scale * zoomFactor));

    // Zoom toward cursor position
    t.offsetX = mx - (mx - t.offsetX) * (newScale / t.scale);
    t.offsetY = my - (my - t.offsetY) * (newScale / t.scale);
    t.scale = newScale;

    // Redraw immediately
    draw(simNodesRef.current, simEdgesRef.current, dimensions.w, dimensions.h);
  }, [dimensions, draw]);

  // Mouse down → start drag (node or pan)
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const node = findNodeAt(mx, my);
    const t = transformRef.current;

    if (node) {
      dragRef.current = {
        active: true,
        mode: "node",
        nodeId: node.id,
        startX: mx,
        startY: my,
        startOffsetX: node.x,
        startOffsetY: node.y,
      };
    } else {
      dragRef.current = {
        active: true,
        mode: "pan",
        nodeId: null,
        startX: mx,
        startY: my,
        startOffsetX: t.offsetX,
        startOffsetY: t.offsetY,
      };
    }
  }, [findNodeAt]);

  // Mouse move → drag or hover
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const d = dragRef.current;
    if (d.active) {
      if (d.mode === "pan") {
        const t = transformRef.current;
        t.offsetX = d.startOffsetX + (mx - d.startX);
        t.offsetY = d.startOffsetY + (my - d.startY);
      } else if (d.mode === "node" && d.nodeId) {
        const node = simNodesRef.current.find(n => n.id === d.nodeId);
        if (node) {
          const t = transformRef.current;
          node.x = d.startOffsetX + (mx - d.startX) / t.scale;
          node.y = d.startOffsetY + (my - d.startY) / t.scale;
          node.vx = 0;
          node.vy = 0;
        }
      }
      draw(simNodesRef.current, simEdgesRef.current, dimensions.w, dimensions.h);
      return;
    }

    // Hover detection
    const found = findNodeAt(mx, my);
    setHoveredNode(found);
    canvas.style.cursor = found ? "pointer" : "grab";
  }, [dimensions, draw, findNodeAt]);

  // Mouse up → end drag or select
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Detect click (minimal drag distance)
    const dist = Math.sqrt((mx - d.startX) ** 2 + (my - d.startY) ** 2);
    if (dist < 4) {
      const node = findNodeAt(mx, my);
      if (node) {
        setSelectedNodeId(prev => prev === node.id ? null : node.id);
      } else {
        setSelectedNodeId(null);
      }
    }

    dragRef.current = { active: false, mode: "pan", nodeId: null, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 };
  }, [findNodeAt]);

  // Find selected node for info panel
  const selectedNode = selectedNodeId ? simNodesRef.current.find(n => n.id === selectedNodeId) : null;
  const selectedEdges = selectedNodeId
    ? simEdgesRef.current.filter(e => e.source === selectedNodeId || e.target === selectedNodeId)
    : [];

  return (
    <div ref={containerRef} className="relative w-full" style={{ minHeight: 400 }}>
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.w, height: dimensions.h }}
        className="rounded border bg-background cursor-grab"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setHoveredNode(null);
          dragRef.current = { active: false, mode: "pan", nodeId: null, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 };
        }}
      />

      {/* Hover tooltip */}
      {hoveredNode && !selectedNode && (
        <div className="absolute left-2 top-2 rounded-md border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <p className="text-xs font-semibold">{hoveredNode.label}</p>
          <p className="text-[10px] text-muted-foreground">
            {hoveredNode.type} · {hoveredNode.edgeCount} connections
          </p>
        </div>
      )}

      {/* Selected node detail panel */}
      {selectedNode && (
        <div className="absolute left-2 top-2 max-w-56 rounded-md border bg-background/95 px-3 py-2 shadow-md backdrop-blur">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: selectedNode.color }}
            />
            <p className="text-xs font-semibold truncate">{selectedNode.label}</p>
          </div>
          <p className="text-[10px] text-muted-foreground mb-1.5">
            {selectedNode.type} · {selectedNode.edgeCount} connections
          </p>
          {selectedEdges.length > 0 && (
            <div className="border-t pt-1.5">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Connected edges:</p>
              <div className="space-y-0.5 max-h-32 overflow-auto">
                {selectedEdges.map((e, i) => {
                  const otherNodeId = e.source === selectedNodeId ? e.target : e.source;
                  const otherNode = simNodesRef.current.find(n => n.id === otherNodeId);
                  const direction = e.source === selectedNodeId ? "\u2192" : "\u2190";
                  return (
                    <p key={i} className="text-[10px] text-muted-foreground truncate">
                      <span className="font-mono" style={{ color: e.color }}>{e.type.replace(/_/g, " ")}</span>
                      {" "}{direction} {otherNode?.label ?? otherNodeId}
                    </p>
                  );
                })}
              </div>
            </div>
          )}
          <button
            onClick={() => setSelectedNodeId(null)}
            className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute right-2 top-2 text-[9px] text-muted-foreground/60">
        Scroll to zoom · Drag to pan · Click node to select
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-3">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-muted-foreground">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
