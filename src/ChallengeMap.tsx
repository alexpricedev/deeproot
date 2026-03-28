import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import html2canvas from "html2canvas";

function saveToHash(nodes: MapNode[], edges: MapEdge[]) {
  try {
    const data = JSON.stringify({ nodes, edges });
    const encoded = btoa(encodeURIComponent(data));
    window.history.replaceState(null, "", "#" + encoded);
  } catch { /* ignore encoding errors */ }
}

function loadFromHash(): { nodes: MapNode[]; edges: MapEdge[] } | null {
  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    const data = JSON.parse(decodeURIComponent(atob(hash)));
    if (Array.isArray(data.nodes) && Array.isArray(data.edges)) return data;
  } catch { /* ignore parse errors */ }
  return null;
}

interface NodeType {
  label: string;
  color: string;
  bg: string;
  border: string;
}

interface StatusType {
  label: string;
  color: string;
  icon: string;
}

interface MapNode {
  id: string;
  label: string;
  type: keyof typeof NODE_TYPES;
  status: keyof typeof STATUS;
  notes: string;
}

interface MapEdge {
  from: string;
  to: string;
}

interface Position {
  x: number;
  y: number;
}

const NODE_TYPES: Record<string, NodeType> = {
  goal: { label: "Goal", color: "#E8590C", bg: "#FFF4E6", border: "#E8590C" },
  constraint: { label: "Constraint", color: "#1971C2", bg: "#E7F5FF", border: "#1971C2" },
  consideration: { label: "Consideration", color: "#2F9E44", bg: "#EBFBEE", border: "#2F9E44" },
  action: { label: "Action", color: "#7048E8", bg: "#F3F0FF", border: "#7048E8" },
};

const STATUS: Record<string, StatusType> = {
  open: { label: "Open", color: "#868E96", icon: "○" },
  active: { label: "Active", color: "#1971C2", icon: "●" },
  blocked: { label: "Blocked", color: "#C92A2A", icon: "●" },
  done: { label: "Done", color: "#2F9E44", icon: "●" },
  // Legacy statuses — kept so old saved maps still render
  unknown: { label: "Open", color: "#868E96", icon: "○" },
  clear: { label: "Done", color: "#2F9E44", icon: "●" },
  at_risk: { label: "Active", color: "#1971C2", icon: "●" },
};

const ACTIVE_STATUSES = ["open", "active", "blocked", "done"];

const NODE_W = 220;
const NODE_H = 80;
const H_GAP = 28;
const V_GAP = 60;

const generateId = () => Math.random().toString(36).substr(2, 9);

function computeLayout(nodes: MapNode[], edges: MapEdge[]): Record<string, Position> {
  const childrenMap: Record<string, string[]> = {};
  const hasParent = new Set<string>();
  nodes.forEach((n) => (childrenMap[n.id] = []));
  edges.forEach((e) => {
    if (childrenMap[e.from]) childrenMap[e.from].push(e.to);
    hasParent.add(e.to);
  });

  const roots = nodes.filter((n) => !hasParent.has(n.id));
  const positions: Record<string, Position> = {};

  function getSubtreeWidth(id: string): number {
    const kids = childrenMap[id] || [];
    if (kids.length === 0) return NODE_W;
    const total = kids.reduce((sum, kid) => sum + getSubtreeWidth(kid) + H_GAP, -H_GAP);
    return Math.max(NODE_W, total);
  }

  function layout(id: string, x: number, y: number) {
    const kids = childrenMap[id] || [];
    const subtreeW = getSubtreeWidth(id);
    const nodeX = x + subtreeW / 2 - NODE_W / 2;
    positions[id] = { x: nodeX, y };

    if (kids.length > 0) {
      let childX = x;
      kids.forEach((kid) => {
        const kidW = getSubtreeWidth(kid);
        layout(kid, childX, y + NODE_H + V_GAP);
        childX += kidW + H_GAP;
      });
    }
  }

  let startX = 40;
  roots.forEach((root) => {
    const w = getSubtreeWidth(root.id);
    layout(root.id, startX, 40);
    startX += w + H_GAP * 3;
  });

  return positions;
}

function ConnectionLine({ from, to, positions }: { from: string; to: string; positions: Record<string, Position> }) {
  const p = positions[from];
  const c = positions[to];
  if (!p || !c) return null;

  const x1 = p.x + NODE_W / 2;
  const y1 = p.y + NODE_H;
  const x2 = c.x + NODE_W / 2;
  const y2 = c.y;
  const midY = (y1 + y2) / 2;

  return (
    <path
      d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
      stroke="#CED4DA"
      strokeWidth="1.5"
      fill="none"
    />
  );
}

function NodeCard({
  node,
  pos,
  onSelect,
  isSelected,
  onAddChild,
  childCount,
  hideDep,
}: {
  node: MapNode;
  pos: Position;
  onSelect: (id: string) => void;
  isSelected: boolean;
  onAddChild: (id: string) => void;
  childCount: number;
  hideDep?: boolean;
}) {
  const typeStyle = NODE_TYPES[node.type];
  const statusStyle = STATUS[node.status];

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: NODE_W,
        minHeight: NODE_H - 20,
        background: typeStyle.bg,
        border: `1.5px solid ${isSelected ? typeStyle.border : "#DEE2E6"}`,
        borderRadius: 6,
        padding: "10px 12px",
        cursor: "pointer",
        userSelect: "none",
        boxShadow: isSelected
          ? `0 0 0 2px ${typeStyle.border}33`
          : "0 1px 3px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.2s, border-color 0.2s, background 0.2s",
        zIndex: isSelected ? 10 : 1,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: typeStyle.color }}>
          {typeStyle.label}
        </span>
        <span style={{ fontSize: 10, color: statusStyle.color, display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 8 }}>{statusStyle.icon}</span>
          {statusStyle.label}
        </span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.4, color: "#212529", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", wordBreak: "break-word" }}>
        {node.label}
      </div>
      {node.notes && (
        <div style={{ fontSize: 10, lineHeight: 1.4, color: "#868E96", marginTop: 3, fontStyle: "italic", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          {node.notes.length > 50 ? node.notes.substring(0, 50) + "..." : node.notes}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        {childCount > 0 ? (
          <span style={{ fontSize: 9, color: "#ADB5BD" }}>{childCount} dep{childCount !== 1 ? "s" : ""}</span>
        ) : <span />}
        {!hideDep && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
            style={{ fontSize: 9, padding: "2px 8px", background: "none", border: "1px solid #DEE2E6", borderRadius: 3, color: "#868E96", cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.borderColor = typeStyle.border; (e.target as HTMLButtonElement).style.color = typeStyle.color; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.borderColor = "#DEE2E6"; (e.target as HTMLButtonElement).style.color = "#868E96"; }}
          >
            + dep
          </button>
        )}
      </div>
    </div>
  );
}


function EditPanel({ node, onUpdate, onDelete, onClose, autoFocusLabel }: { node: MapNode; onUpdate: (n: MapNode) => void; onDelete: (id: string) => void; onClose: () => void; autoFocusLabel?: boolean }) {
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusLabel && labelRef.current) {
      labelRef.current.focus();
      labelRef.current.select();
    }
  }, [node.id, autoFocusLabel]);

  return (
    <div style={{ padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "#212529", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>Edit Node</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, color: "#868E96", cursor: "pointer" }}>×</button>
      </div>

      <label style={{ fontSize: 10, color: "#868E96", display: "block", marginBottom: 4 }}>Label</label>
      <input ref={labelRef} type="text" value={node.label} onChange={(e) => onUpdate({ ...node, label: e.target.value })}
        style={{ width: "100%", fontSize: 12, padding: "8px", border: "1px solid #DEE2E6", borderRadius: 4, outline: "none", marginBottom: 12, boxSizing: "border-box", fontFamily: "inherit" }} />

      <label style={{ fontSize: 10, color: "#868E96", display: "block", marginBottom: 4 }}>Type</label>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {Object.entries(NODE_TYPES).map(([key, val]) => (
          <button key={key} onClick={() => onUpdate({ ...node, type: key as MapNode["type"] })}
            style={{ fontSize: 10, padding: "4px 10px", background: node.type === key ? val.bg : "#fff", border: `1px solid ${node.type === key ? val.border : "#DEE2E6"}`, borderRadius: 3, color: node.type === key ? val.color : "#868E96", cursor: "pointer", fontWeight: node.type === key ? 600 : 400, fontFamily: "inherit" }}>
            {val.label}
          </button>
        ))}
      </div>

      <label style={{ fontSize: 10, color: "#868E96", display: "block", marginBottom: 4 }}>Status</label>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {ACTIVE_STATUSES.map((key) => [key, STATUS[key]] as const).map(([key, val]) => (
          <button key={key} onClick={() => onUpdate({ ...node, status: key as MapNode["status"] })}
            style={{ fontSize: 10, padding: "4px 10px", background: node.status === key ? "#F8F9FA" : "#fff", border: `1px solid ${node.status === key ? val.color : "#DEE2E6"}`, borderRadius: 3, color: node.status === key ? val.color : "#868E96", cursor: "pointer", fontWeight: node.status === key ? 600 : 400, fontFamily: "inherit" }}>
            {val.icon} {val.label}
          </button>
        ))}
      </div>

      <label style={{ fontSize: 10, color: "#868E96", display: "block", marginBottom: 4 }}>Notes</label>
      <textarea value={node.notes} onChange={(e) => onUpdate({ ...node, notes: e.target.value })}
        placeholder="Add notes, reflections, or context..." rows={4}
        style={{ width: "100%", fontSize: 12, padding: "8px", border: "1px solid #DEE2E6", borderRadius: 4, outline: "none", marginBottom: 12, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />

      <button onClick={() => onDelete(node.id)}
        style={{ fontSize: 10, padding: "6px 12px", background: "none", border: "1px solid #E03131", borderRadius: 4, color: "#E03131", cursor: "pointer", fontFamily: "inherit" }}>
        Delete node
      </button>
    </div>
  );
}

/* ── Tutorial Components ─────────────────────────────────────────────── */

function WelcomeOverlay({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(248,249,250,0.85)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          padding: "40px 36px",
          maxWidth: 480,
          width: "90%",
          textAlign: "center",
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>{"\u26F0\uFE0F"}</div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#212529",
            margin: "0 0 12px 0",
            lineHeight: 1.3,
          }}
        >
          Every big goal is a system of smaller ones.
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#495057",
            lineHeight: 1.6,
            margin: "0 0 28px 0",
          }}
        >
          Deeproot helps you break down ambitious goals into constraints,
          considerations, and concrete actions. Let's walk through a quick
          example together.
        </p>
        <button
          onClick={onStart}
          style={{
            fontSize: 14,
            fontWeight: 600,
            padding: "12px 28px",
            background: NODE_TYPES.goal.color,
            color: "#FFFFFF",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            marginBottom: 12,
            fontFamily: "inherit",
          }}
        >
          {"Start the climb \u2192"}
        </button>
        <div>
          <button
            onClick={onSkip}
            style={{
              fontSize: 12,
              color: "#868E96",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: "inherit",
            }}
          >
            Skip tutorial
          </button>
        </div>
      </div>
    </div>
  );
}

function TutorialTooltip({
  targetNodeId,
  positions,
  panOffset,
  color,
  children,
  canvasRef,
}: {
  targetNodeId: string;
  positions: Record<string, Position>;
  panOffset: { x: number; y: number };
  color: string;
  children: React.ReactNode;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}) {
  const pos = positions[targetNodeId];
  if (!pos) return null;

  const left = pos.x + NODE_W + 16 + panOffset.x;
  const top = pos.y + panOffset.y + 50; // 50px header offset

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        maxWidth: 280,
        background: "#FFFFFF",
        borderLeft: `4px solid ${color}`,
        borderRadius: 10,
        padding: "16px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
        zIndex: 50,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {children}
    </div>
  );
}

function TutorialProgress({ currentStep }: { currentStep: number }) {
  const totalSteps = 6;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", gap: 6 }}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const step = i + 1;
          let bg: string;
          if (step < currentStep) bg = "#2F9E44";
          else if (step === currentStep) bg = NODE_TYPES.goal.color;
          else bg = "#DEE2E6";
          return (
            <div
              key={step}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: bg,
              }}
            />
          );
        })}
      </div>
      <span
        style={{
          fontSize: 10,
          color: "#868E96",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        Step {currentStep} of {totalSteps}
      </span>
    </div>
  );
}

function PlaceholderNode({
  pos,
  color,
  onClick,
}: {
  pos: Position;
  color: string;
  onClick: () => void;
}) {
  return (
    <div
      tabIndex={0}
      role="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: NODE_W,
        minHeight: NODE_H - 20,
        border: `2px dashed ${color}`,
        borderRadius: 6,
        background: "rgba(255,255,255,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: 12,
        color: color,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontWeight: 500,
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      Click to reveal
    </div>
  );
}

export default function ChallengeMap() {
  const initial = useMemo(() => loadFromHash(), []);

  const [tutorialStep, setTutorialStep] = useState<number>(() => {
    if (initial !== null) return -1;
    if (typeof window !== "undefined" && localStorage.getItem("deeproot-tutorial-completed")) return -1;
    return 1;
  });
  const [enableHashSave, setEnableHashSave] = useState<boolean>(initial !== null);
  const enableHashSaveRef = useRef(enableHashSave);
  enableHashSaveRef.current = enableHashSave;
  const [tutorialRevealed, setTutorialRevealed] = useState<Set<string>>(new Set());

  // Inject tutorial CSS animations
  useEffect(() => {
    if (document.getElementById("tutorial-animations")) return;
    const style = document.createElement("style");
    style.id = "tutorial-animations";
    style.textContent = `
      @keyframes tutorialFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      .tutorial-node-enter { animation: tutorialFadeIn 0.3s ease-out forwards; }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  const [nodes, setNodes] = useState<MapNode[]>(initial?.nodes ?? []);
  const [edges, setEdges] = useState<MapEdge[]>(initial?.edges ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"edit" | "actions">("edit");

  useEffect(() => {
    if (enableHashSave) {
      saveToHash(nodes, edges);
    }
  }, [nodes, edges, enableHashSave]);
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const positions = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);

  const tutorialPlaceholderPositions = useMemo(() => {
    const goalPos = positions["tutorial-goal"];
    if (!goalPos) return null;
    const row1Y = goalPos.y + NODE_H + V_GAP;
    const row2Y = goalPos.y + 2 * (NODE_H + V_GAP);
    return {
      constraint: { x: goalPos.x - NODE_W - H_GAP / 2, y: row1Y },
      consideration: { x: goalPos.x, y: row1Y },
      action: { x: goalPos.x + NODE_W + H_GAP / 2, y: row1Y },
      actionSub1: { x: goalPos.x - NODE_W - H_GAP / 2, y: row2Y },
      actionSub2: { x: goalPos.x, y: row2Y },
    };
  }, [positions]);

  // Center the root node horizontally on first load
  useEffect(() => {
    if (pan === null && canvasRef.current) {
      const rootPos = positions[nodes[0]?.id];
      if (rootPos) {
        const canvasWidth = canvasRef.current.clientWidth;
        const centerX = (canvasWidth - NODE_W) / 2 - rootPos.x;
        setPan({ x: centerX, y: 0 });
      } else {
        setPan({ x: 0, y: 0 });
      }
    }
  }, [pan, positions, nodes]);
  const selectedNode = nodes.find((n) => n.id === selectedId);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.current.x + panStart.current.panX,
        y: e.clientY - panStart.current.y + panStart.current.panY,
      });
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === "svg") {
      setSelectedId(null);
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan?.x ?? 0, panY: pan?.y ?? 0 };
    }
  }, [pan]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const newNodeId = useRef<string | null>(null);

  const addChild = useCallback((parentId: string) => {
    if (!enableHashSaveRef.current) setEnableHashSave(true);
    const newId = generateId();
    newNodeId.current = newId;
    setNodes((prev) => [...prev, { id: newId, label: "New dependency", type: "constraint", status: "open", notes: "" }]);
    setEdges((prev) => [...prev, { from: parentId, to: newId }]);
    setSelectedId(newId);
    setSidebarTab("edit");
  }, []);

  const updateNode = useCallback((updated: MapNode) => {
    if (!enableHashSaveRef.current) setEnableHashSave(true);
    setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }, []);

  const deleteNode = useCallback((id: string) => {
    if (!enableHashSaveRef.current) setEnableHashSave(true);
    if (id === "root" && nodes.length === 1) return;
    const descendants = new Set<string>();
    const findDesc = (nid: string) => { descendants.add(nid); edges.filter((e) => e.from === nid).forEach((e) => findDesc(e.to)); };
    findDesc(id);
    setNodes((prev) => prev.filter((n) => !descendants.has(n.id)));
    setEdges((prev) => prev.filter((e) => !descendants.has(e.from) && !descendants.has(e.to)));
    setSelectedId(null);
  }, [edges, nodes]);

  const getChildCount = useCallback((id: string) => edges.filter((e) => e.from === id).length, [edges]);

  const statusCounts = nodes.reduce<Record<string, number>>((acc, n) => { acc[n.status] = (acc[n.status] || 0) + 1; return acc; }, {});
  const actionNodes = useMemo(() => nodes.filter((n) => n.type === "action"), [nodes]);

  const allPos = Object.values(positions);
  const canvasW = allPos.length ? Math.max(...allPos.map((p) => p.x)) + NODE_W + 80 : 800;
  const canvasH = allPos.length ? Math.max(...allPos.map((p) => p.y)) + NODE_H + 80 : 600;

  const exportPng = useCallback(async () => {
    if (!treeRef.current) return;
    const el = treeRef.current;
    const origTransform = el.style.transform;
    el.style.transform = "none";
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: "#FFFFFF",
        width: canvasW,
        height: canvasH,
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = "deeproot.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      el.style.transform = origTransform;
    }
  }, [canvasW, canvasH]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100vh", background: "#F8F9FA", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div ref={canvasRef} onMouseDown={handleCanvasMouseDown}
        style={{ flex: 1, position: "relative", overflow: "hidden", cursor: isPanning ? "grabbing" : "default" }}>

        {/* Header */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "12px 16px", background: "rgba(248,249,250,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid #E9ECEF", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#212529", letterSpacing: "-0.02em" }}>DEEPROOT</span>
            <span style={{ fontSize: 10, color: "#ADB5BD" }}>{nodes.length} node{nodes.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {ACTIVE_STATUSES.map((key) => [key, STATUS[key]] as const).map(([key, val]) =>
              statusCounts[key] ? (
                <span key={key} style={{ fontSize: 10, color: val.color, display: "flex", alignItems: "center", gap: 3 }}>
                  {val.icon} {statusCounts[key]} {val.label.toLowerCase()}
                </span>
              ) : null
            )}
            {tutorialStep === -1 && (
              <button onClick={exportPng}
                style={{ fontSize: 10, padding: "4px 10px", background: "none", border: "1px solid #DEE2E6", borderRadius: 3, color: "#868E96", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
                Export PNG
              </button>
            )}
            {tutorialStep === -1 && (
              <button
                title="Replay tutorial"
                onClick={() => {
                  localStorage.removeItem("deeproot-tutorial-completed");
                  window.location.hash = "";
                  window.location.reload();
                }}
                style={{ fontSize: 13, padding: "4px 8px", background: "none", border: "1px solid #DEE2E6", borderRadius: 3, color: "#ADB5BD", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
                ?
              </button>
            )}
          </div>
        </div>

        {/* Tree layer */}
        <div ref={treeRef} style={{ transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, position: "absolute", top: 50, left: 0 }}>
          <svg style={{ position: "absolute", top: 0, left: 0, width: canvasW, height: canvasH, pointerEvents: "none" }}>
            {edges.map((edge) => (
              <ConnectionLine key={`${edge.from}-${edge.to}`} from={edge.from} to={edge.to} positions={positions} />
            ))}
          </svg>
          {nodes.map((node) =>
            positions[node.id] ? (
              <NodeCard key={node.id} node={node} pos={positions[node.id]} onSelect={setSelectedId} isSelected={selectedId === node.id} onAddChild={addChild} childCount={getChildCount(node.id)} hideDep={tutorialStep >= 1 && tutorialStep <= 6} />
            ) : null
          )}
        </div>

        {tutorialStep === -1 && nodes.length === 1 && edges.length === 0 && (
          <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", fontSize: 11, color: "#ADB5BD", textAlign: "center", zIndex: 20 }}>
            Click "+ dep" on a node to start building your dependency tree
          </div>
        )}

        {tutorialStep === 1 && (
          <WelcomeOverlay
            onStart={() => {
              const goalNode: MapNode = {
                id: "tutorial-goal",
                label: "Climb Mount Rainier",
                type: "goal",
                status: "open",
                notes: "",
              };
              setNodes([goalNode]);
              setTutorialStep(2);
            }}
            onSkip={() => {
              localStorage.setItem("deeproot-tutorial-completed", "true");
              setEnableHashSave(true);
              setTutorialStep(-1);
            }}
          />
        )}

        {/* Tutorial Stage 2: The Goal */}
        {tutorialStep === 2 && (
          <TutorialTooltip
            targetNodeId="tutorial-goal"
            positions={positions}
            panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
            color={NODE_TYPES.goal.color}
            canvasRef={canvasRef}
          >
            <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>This is your goal.</h4>
            <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
              The thing you want to achieve. Everything else on this map exists to make it happen.
            </p>
            <button
              onClick={() => setTutorialStep(3)}
              style={{
                fontSize: 13, fontWeight: 600, padding: "8px 18px",
                background: NODE_TYPES.goal.color, color: "#fff",
                border: "none", borderRadius: 6, cursor: "pointer",
              }}
            >
              {"Continue \u2192"}
            </button>
          </TutorialTooltip>
        )}

        {/* Tutorial Stage 3: The Constraint */}
        {tutorialStep === 3 && tutorialPlaceholderPositions && (
          <>
            {!tutorialRevealed.has("constraint") && (
              <>
                {/* Dashed connection line from goal to constraint placeholder */}
                <div style={{ transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, position: "absolute", top: 50, left: 0, pointerEvents: "none" }}>
                  <svg style={{ position: "absolute", top: 0, left: 0, width: canvasW + 500, height: canvasH + 500, pointerEvents: "none" }}>
                    {(() => {
                      const goalPos = positions["tutorial-goal"];
                      if (!goalPos) return null;
                      const cp = tutorialPlaceholderPositions.constraint;
                      const x1 = goalPos.x + NODE_W / 2;
                      const y1 = goalPos.y + NODE_H;
                      const x2 = cp.x + NODE_W / 2;
                      const y2 = cp.y;
                      const midY = (y1 + y2) / 2;
                      return (
                        <path
                          d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                          stroke="#CED4DA"
                          strokeWidth="1.5"
                          strokeDasharray="6 4"
                          fill="none"
                        />
                      );
                    })()}
                  </svg>
                </div>
                {/* Placeholder node */}
                <div style={{ transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, position: "absolute", top: 50, left: 0, pointerEvents: "auto" }}>
                  <PlaceholderNode
                    pos={tutorialPlaceholderPositions.constraint}
                    color={NODE_TYPES.constraint.color}
                    onClick={() => {
                      setNodes((prev) => [...prev, { id: "tutorial-constraint", label: "No cold weather gear", type: "constraint", status: "open", notes: "" }]);
                      setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-constraint" }]);
                      setTutorialRevealed((prev) => new Set(prev).add("constraint"));
                    }}
                  />
                </div>
                {/* Tooltip near the goal node */}
                <TutorialTooltip
                  targetNodeId="tutorial-goal"
                  positions={positions}
                  panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
                  color={NODE_TYPES.constraint.color}
                  canvasRef={canvasRef}
                >
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>What's standing in your way?</h4>
                  <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                    Click the dashed box below to reveal a constraint.
                  </p>
                </TutorialTooltip>
              </>
            )}
            {tutorialRevealed.has("constraint") && (
              <TutorialTooltip
                targetNodeId="tutorial-constraint"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
                color={NODE_TYPES.constraint.color}
                canvasRef={canvasRef}
              >
                <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>{"That\u2019s a constraint."}</h4>
                <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                  It blocks your goal until you deal with it.
                </p>
                <button
                  onClick={() => setTutorialStep(4)}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: "8px 18px",
                    background: "#2F9E44", color: "#fff",
                    border: "none", borderRadius: 6, cursor: "pointer",
                  }}
                >
                  {"Continue \u2192"}
                </button>
              </TutorialTooltip>
            )}
          </>
        )}

        {/* Tutorial Stage 4: The Consideration */}
        {tutorialStep === 4 && tutorialPlaceholderPositions && (
          <>
            {!tutorialRevealed.has("consideration") && (
              <>
                {/* Dashed connection line from goal to consideration placeholder */}
                <div style={{ transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, position: "absolute", top: 50, left: 0, pointerEvents: "none" }}>
                  <svg style={{ position: "absolute", top: 0, left: 0, width: canvasW + 500, height: canvasH + 500, pointerEvents: "none" }}>
                    {(() => {
                      const goalPos = positions["tutorial-goal"];
                      if (!goalPos) return null;
                      const cp = tutorialPlaceholderPositions.consideration;
                      const x1 = goalPos.x + NODE_W / 2;
                      const y1 = goalPos.y + NODE_H;
                      const x2 = cp.x + NODE_W / 2;
                      const y2 = cp.y;
                      const midY = (y1 + y2) / 2;
                      return (
                        <path
                          d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                          stroke="#CED4DA"
                          strokeWidth="1.5"
                          strokeDasharray="6 4"
                          fill="none"
                        />
                      );
                    })()}
                  </svg>
                </div>
                {/* Placeholder node */}
                <div style={{ transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, position: "absolute", top: 50, left: 0, pointerEvents: "auto" }}>
                  <PlaceholderNode
                    pos={tutorialPlaceholderPositions.consideration}
                    color={NODE_TYPES.consideration.color}
                    onClick={() => {
                      setNodes((prev) => [...prev, { id: "tutorial-consideration", label: "Best season: July-Sept", type: "consideration", status: "open", notes: "" }]);
                      setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-consideration" }]);
                      setTutorialRevealed((prev) => new Set(prev).add("consideration"));
                    }}
                  />
                </div>
                {/* Tooltip near the goal node */}
                <TutorialTooltip
                  targetNodeId="tutorial-goal"
                  positions={positions}
                  panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
                  color={NODE_TYPES.consideration.color}
                  canvasRef={canvasRef}
                >
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>What do you need to keep in mind?</h4>
                  <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                    Click the dashed box below to reveal a consideration.
                  </p>
                </TutorialTooltip>
              </>
            )}
            {tutorialRevealed.has("consideration") && (
              <TutorialTooltip
                targetNodeId="tutorial-consideration"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
                color={NODE_TYPES.consideration.color}
                canvasRef={canvasRef}
              >
                <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                  {"Constraints block. Considerations inform. Now let\u2019s figure out what to actually do."}
                </p>
                <button
                  onClick={() => setTutorialStep(5)}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: "8px 18px",
                    background: "#7048E8", color: "#fff",
                    border: "none", borderRadius: 6, cursor: "pointer",
                  }}
                >
                  {"Continue \u2192"}
                </button>
              </TutorialTooltip>
            )}
          </>
        )}

        {/* Tutorial Stage 5: The Actions */}
        {tutorialStep === 5 && tutorialPlaceholderPositions && (
          <>
            {!tutorialRevealed.has("action") && (
              <>
                {/* Dashed connection line from goal to action placeholder */}
                <div style={{ transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, position: "absolute", top: 50, left: 0, pointerEvents: "none" }}>
                  <svg style={{ position: "absolute", top: 0, left: 0, width: canvasW + 500, height: canvasH + 500, pointerEvents: "none" }}>
                    {(() => {
                      const goalPos = positions["tutorial-goal"];
                      if (!goalPos) return null;
                      const ap = tutorialPlaceholderPositions.action;
                      const x1 = goalPos.x + NODE_W / 2;
                      const y1 = goalPos.y + NODE_H;
                      const x2 = ap.x + NODE_W / 2;
                      const y2 = ap.y;
                      const midY = (y1 + y2) / 2;
                      return (
                        <path
                          d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                          stroke="#CED4DA"
                          strokeWidth="1.5"
                          strokeDasharray="6 4"
                          fill="none"
                        />
                      );
                    })()}
                  </svg>
                </div>
                {/* Placeholder node */}
                <div style={{ transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, position: "absolute", top: 50, left: 0, pointerEvents: "auto" }}>
                  <PlaceholderNode
                    pos={tutorialPlaceholderPositions.action}
                    color={NODE_TYPES.action.color}
                    onClick={() => {
                      // Immediately add first action
                      setNodes((prev) => [...prev, { id: "tutorial-action-1", label: "Book a guide service", type: "action", status: "open", notes: "" }]);
                      setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-action-1" }]);
                      setTutorialRevealed((prev) => new Set(prev).add("action"));

                      // After 400ms: add second action
                      setTimeout(() => {
                        setNodes((prev) => [...prev, { id: "tutorial-action-2", label: "Rent gear from REI", type: "action", status: "open", notes: "" }]);
                        setEdges((prev) => [...prev, { from: "tutorial-constraint", to: "tutorial-action-2" }]);
                      }, 400);

                      // After 800ms: add third action, then advance
                      setTimeout(() => {
                        setNodes((prev) => [...prev, { id: "tutorial-action-3", label: "Plan for August trip", type: "action", status: "open", notes: "" }]);
                        setEdges((prev) => [...prev, { from: "tutorial-consideration", to: "tutorial-action-3" }]);
                        setTimeout(() => setTutorialStep(6), 600);
                      }, 800);
                    }}
                  />
                </div>
                {/* Tooltip near the goal node */}
                <TutorialTooltip
                  targetNodeId="tutorial-goal"
                  positions={positions}
                  panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
                  color={NODE_TYPES.action.color}
                  canvasRef={canvasRef}
                >
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>What will you actually do?</h4>
                  <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                    Actions are concrete steps. Click the dashed box to reveal them.
                  </p>
                </TutorialTooltip>
              </>
            )}
            {tutorialRevealed.has("action") && (
              <TutorialTooltip
                targetNodeId="tutorial-goal"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
                color={NODE_TYPES.action.color}
                canvasRef={canvasRef}
              >
                <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                  Watch the map come together...
                </p>
              </TutorialTooltip>
            )}
          </>
        )}

        {/* Tutorial Stage 6: Completion */}
        {tutorialStep === 6 && (
          <div
            style={{
              position: "absolute",
              bottom: 60,
              right: 316,
              maxWidth: 340,
              background: "#FFFFFF",
              borderRadius: 12,
              padding: "24px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              zIndex: 50,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>{"\uD83C\uDF89"}</div>
            <h4 style={{ margin: "0 0 8px 0", fontSize: 16, color: "#212529", fontWeight: 700 }}>
              You just decomposed a goal.
            </h4>
            <p style={{ margin: "0 0 20px 0", fontSize: 13, color: "#495057", lineHeight: 1.6 }}>
              {"Constraints, considerations, and actions \u2014 that\u2019s the whole system. Now try it with something you actually care about."}
            </p>
            <button
              onClick={() => {
                localStorage.setItem("deeproot-tutorial-completed", "true");
                setNodes([]);
                setEdges([]);
                setTutorialRevealed(new Set());
                setEnableHashSave(true);
                setSelectedId(null);
                setTutorialStep(-1);
              }}
              style={{
                display: "block",
                width: "100%",
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 20px",
                background: NODE_TYPES.goal.color,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                marginBottom: 8,
              }}
            >
              {"Start my own map \u2192"}
            </button>
            <button
              onClick={() => {
                localStorage.setItem("deeproot-tutorial-completed", "true");
                setTutorialStep(-1);
              }}
              style={{
                display: "block",
                width: "100%",
                fontSize: 12,
                padding: "8px 20px",
                background: "none",
                border: "none",
                color: "#868E96",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Keep exploring this one
            </button>
          </div>
        )}

        {tutorialStep >= 2 && tutorialStep <= 6 && (
          <TutorialProgress currentStep={tutorialStep} />
        )}
      </div>

      {/* Sidebar */}
      {tutorialStep === -1 && <div style={{ width: 300, borderLeft: "1px solid #E9ECEF", background: "#FFFFFF", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", borderBottom: "1px solid #E9ECEF" }}>
          {([{ id: "edit" as const, label: "Node" }, { id: "actions" as const, label: "Actions" }]).map((tab) => (
            <button key={tab.id} onClick={() => setSidebarTab(tab.id)}
              style={{ flex: 1, padding: "10px", fontSize: 11, fontWeight: sidebarTab === tab.id ? 600 : 400, color: sidebarTab === tab.id ? "#212529" : "#868E96", background: "none", border: "none", borderBottom: sidebarTab === tab.id ? "2px solid #212529" : "2px solid transparent", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {tab.label}
              {tab.id === "actions" && actionNodes.length > 0 && (
                <span style={{ marginLeft: 4, fontSize: 9, background: NODE_TYPES.action.color, color: "#fff", borderRadius: 8, padding: "1px 5px" }}>{actionNodes.length}</span>
              )}
            </button>
          ))}
        </div>

        {sidebarTab === "edit" ? (
          selectedNode ? (
            <EditPanel node={selectedNode} onUpdate={updateNode} onDelete={deleteNode} onClose={() => setSelectedId(null)} autoFocusLabel={selectedNode.id === newNodeId.current} />
          ) : (
            <div style={{ padding: 16, fontSize: 11, color: "#ADB5BD", textAlign: "center", marginTop: 40 }}>Select a node to edit</div>
          )
        ) : (
          <div style={{ padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 12px 0", color: "#212529", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Actions
            </h3>
            <p style={{ fontSize: 11, color: "#868E96", margin: "0 0 12px 0" }}>
              All nodes marked as "Action" across your map.
            </p>
            {actionNodes.length === 0 && <p style={{ fontSize: 11, color: "#ADB5BD", fontStyle: "italic" }}>No action nodes yet.</p>}
            {actionNodes.map((n) => (
              <div key={n.id} onClick={() => { setSelectedId(n.id); setSidebarTab("edit"); }}
                style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px", marginBottom: 4, borderRadius: 4, background: NODE_TYPES.action.bg, border: `1px solid ${selectedId === n.id ? NODE_TYPES.action.border : "transparent"}`, cursor: "pointer", transition: "border-color 0.2s" }}>
                <span style={{ fontSize: 10, color: STATUS[n.status].color, flexShrink: 0, marginTop: 1 }}>{STATUS[n.status].icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#212529", wordBreak: "break-word" }}>{n.label}</div>
                  {n.notes && <div style={{ fontSize: 10, color: "#868E96", marginTop: 2, fontStyle: "italic" }}>{n.notes.length > 60 ? n.notes.substring(0, 60) + "..." : n.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}
    </div>
  );
}
