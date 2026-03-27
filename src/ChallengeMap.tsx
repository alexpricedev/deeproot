import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import html2canvas from "html2canvas";

const DEFAULT_NODES: MapNode[] = [
  { id: "root", label: "Regular, progressing airsports sessions", type: "goal", status: "open", notes: "" },
];

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
}: {
  node: MapNode;
  pos: Position;
  onSelect: (id: string) => void;
  isSelected: boolean;
  onAddChild: (id: string) => void;
  childCount: number;
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
        <button
          onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
          style={{ fontSize: 9, padding: "2px 8px", background: "none", border: "1px solid #DEE2E6", borderRadius: 3, color: "#868E96", cursor: "pointer", fontFamily: "inherit" }}
          onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.borderColor = typeStyle.border; (e.target as HTMLButtonElement).style.color = typeStyle.color; }}
          onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.borderColor = "#DEE2E6"; (e.target as HTMLButtonElement).style.color = "#868E96"; }}
        >
          + dep
        </button>
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

export default function ChallengeMap() {
  const initial = useMemo(() => loadFromHash(), []);
  const [nodes, setNodes] = useState<MapNode[]>(initial?.nodes ?? DEFAULT_NODES);
  const [edges, setEdges] = useState<MapEdge[]>(initial?.edges ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"edit" | "actions">("edit");

  useEffect(() => {
    saveToHash(nodes, edges);
  }, [nodes, edges]);
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const positions = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);

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
    const newId = generateId();
    newNodeId.current = newId;
    setNodes((prev) => [...prev, { id: newId, label: "New dependency", type: "constraint", status: "open", notes: "" }]);
    setEdges((prev) => [...prev, { from: parentId, to: newId }]);
    setSelectedId(newId);
    setSidebarTab("edit");
  }, []);

  const updateNode = useCallback((updated: MapNode) => {
    setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }, []);

  const deleteNode = useCallback((id: string) => {
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
      link.download = "challenge-map.png";
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
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#212529", letterSpacing: "-0.02em" }}>CHALLENGE MAP</span>
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
            <button onClick={exportPng}
              style={{ fontSize: 10, padding: "4px 10px", background: "none", border: "1px solid #DEE2E6", borderRadius: 3, color: "#868E96", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
              Export PNG
            </button>
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
              <NodeCard key={node.id} node={node} pos={positions[node.id]} onSelect={setSelectedId} isSelected={selectedId === node.id} onAddChild={addChild} childCount={getChildCount(node.id)} />
            ) : null
          )}
        </div>

        {nodes.length === 1 && edges.length === 0 && (
          <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", fontSize: 11, color: "#ADB5BD", textAlign: "center", zIndex: 20 }}>
            Click "+ dep" on a node to start building your dependency tree
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div style={{ width: 300, borderLeft: "1px solid #E9ECEF", background: "#FFFFFF", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
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
      </div>
    </div>
  );
}
