import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import html2canvas from "html2canvas";

function generateShareUrl(nodes: MapNode[], edges: MapEdge[]): string {
  try {
    const data = JSON.stringify({ nodes, edges });
    const encoded = btoa(encodeURIComponent(data));
    return window.location.origin + window.location.pathname + "#" + encoded;
  } catch {
    return window.location.origin + window.location.pathname;
  }
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
  consideration: { label: "Consideration", color: "#7048E8", bg: "#F3F0FF", border: "#7048E8" },
  action: { label: "Action", color: "#2F9E44", bg: "#EBFBEE", border: "#2F9E44" },
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

function estimateNodeHeight(node: MapNode): number {
  // padding: 10 top + 10 bottom
  // header row (type + status): ~15px + marginBottom 4
  // label: fontSize 12, lineHeight 1.4 = ~17px/line, ~28 chars/line at NODE_W
  // notes (if present): fontSize 10, lineHeight 1.4 = ~14px/line, marginTop 3, max 50 chars displayed
  // dep row: marginTop 6 + ~20px
  const availableWidth = NODE_W - 24; // padding 12px each side
  const charsPerLine = Math.floor(availableWidth / 7);
  const labelLines = Math.max(1, Math.ceil(node.label.length / charsPerLine));
  const notesText = node.notes ? (node.notes.length > 50 ? node.notes.substring(0, 50) + "..." : node.notes) : "";
  const notesLines = notesText ? Math.max(1, Math.ceil(notesText.length / (charsPerLine + 2))) : 0;

  let h = 20; // padding
  h += 19; // header + margin
  h += labelLines * 17; // label
  if (notesLines > 0) h += 3 + notesLines * 14; // notes
  h += 26; // dep row
  return Math.max(NODE_H, h);
}

function computeLayout(nodes: MapNode[], edges: MapEdge[]): Record<string, Position> {
  const childrenMap: Record<string, string[]> = {};
  const hasParent = new Set<string>();
  const nodeMap: Record<string, MapNode> = {};
  nodes.forEach((n) => { childrenMap[n.id] = []; nodeMap[n.id] = n; });
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

    const nodeH = nodeMap[id] ? estimateNodeHeight(nodeMap[id]) : NODE_H;
    if (kids.length > 0) {
      let childX = x;
      kids.forEach((kid) => {
        const kidW = getSubtreeWidth(kid);
        layout(kid, childX, y + nodeH + V_GAP);
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
  const isTutorialNode = node.id.startsWith("tutorial-");

  // Status-driven texture treatments (shared by ALL node types)
  // Color = type identity (never changes). Texture = status.
  const isDone = node.status === "done" || node.status === "clear";
  const isBlocked = node.status === "blocked";

  return (
    <div
      className={isTutorialNode ? "tutorial-node-enter" : undefined}
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
        background: isBlocked
          ? `repeating-linear-gradient(-45deg, ${typeStyle.bg}, ${typeStyle.bg} 6px, ${typeStyle.border}11 6px, ${typeStyle.border}11 8px)`
          : typeStyle.bg,
        border: `1.5px ${isDone ? "dashed" : "solid"} ${isSelected ? typeStyle.border : isDone ? typeStyle.border : "#DEE2E6"}`,
        borderRadius: 6,
        padding: "10px 12px",
        cursor: "pointer",
        userSelect: "none",
        opacity: isDone ? 0.7 : 1,
        boxShadow: isSelected
          ? `0 0 0 2px ${typeStyle.border}33`
          : "0 1px 3px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.2s, border-color 0.2s, background 0.2s, opacity 0.2s",
        zIndex: isSelected ? 10 : 1,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: typeStyle.color }}>
          {typeStyle.label}
        </span>
        <span style={{ fontSize: 10, color: isDone ? typeStyle.color : statusStyle.color, display: "flex", alignItems: "center", gap: 3 }}>
          {isDone ? <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg> : <span style={{ fontSize: 8 }}>{statusStyle.icon}</span>}
          {statusStyle.label}
        </span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.4, color: isDone ? "#868E96" : "#212529", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", wordBreak: "break-word" }}>
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


function EditPanel({ node, onUpdate, onDelete, onAddChild, onClose, autoFocusLabel, isGoal }: { node: MapNode; onUpdate: (n: MapNode) => void; onDelete: (id: string) => void; onAddChild: (id: string) => void; onClose: () => void; autoFocusLabel?: boolean; isGoal?: boolean }) {
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
        {Object.entries(NODE_TYPES).filter(([key]) => isGoal ? key === "goal" : key !== "goal").map(([key, val]) => (
          <button key={key} onClick={() => onUpdate({ ...node, type: key as MapNode["type"] })}
            style={{ fontSize: 10, padding: "4px 10px", background: node.type === key ? val.bg : "#fff", border: `1px solid ${node.type === key ? val.border : "#DEE2E6"}`, borderRadius: 3, color: node.type === key ? val.color : "#868E96", cursor: "pointer", fontWeight: node.type === key ? 600 : 400, fontFamily: "inherit" }}>
            {val.label}
          </button>
        ))}
      </div>
      {!isGoal && (
        <div style={{
          fontSize: 10, lineHeight: 1.5, margin: "-4px 0 12px 0",
          padding: "6px 10px", borderRadius: 6,
          background: NODE_TYPES[node.type].bg,
          color: NODE_TYPES[node.type].color,
          border: "none",
        }}>
          {node.type === "constraint" && "A hard requirement. If this fails, the goal fails. e.g. \"Need visa approval\""}
          {node.type === "consideration" && "Something that matters but won't kill the goal if imperfect. e.g. \"Learn the local language\""}
          {node.type === "action" && "A concrete, completable task. e.g. \"Book flight by March 15\""}
        </div>
      )}

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

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => onAddChild(node.id)}
          style={{ fontSize: 10, padding: "6px 12px", background: "#F8F9FA", border: "1px solid #ADB5BD", borderRadius: 4, color: "#495057", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
          + Dep
        </button>
        {!isGoal && <button onClick={() => onDelete(node.id)}
          style={{ fontSize: 10, padding: "6px 12px", background: "none", border: "1px solid #E03131", borderRadius: 4, color: "#E03131", cursor: "pointer", fontFamily: "inherit" }}>
          Delete node
        </button>}
      </div>
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
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#868E96" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}><path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/></svg>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#212529",
            margin: "0 0 12px 0",
            lineHeight: 1.4,
            fontFamily: "inherit",
            letterSpacing: "-0.01em",
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

function Tooltip({ label, children, align = "center" }: { label: string; children: React.ReactNode; align?: "center" | "right" }) {
  const [show, setShow] = useState(false);
  const pillPosition = align === "right"
    ? { right: 0 } as const
    : { left: "50%", transform: "translateX(-50%)" } as const;
  const arrowPosition = align === "right"
    ? { right: 10 } as const
    : { left: "50%", transform: "translateX(-50%)" } as const;
  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          ...pillPosition,
          background: "#212529",
          color: "#fff",
          fontSize: 11,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          padding: "2px 8px",
          borderRadius: 6,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 100,
        }}>
          <div style={{
            position: "absolute",
            bottom: "100%",
            ...arrowPosition,
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderBottom: "5px solid #212529",
          }} />
          {label}
        </div>
      )}
    </div>
  );
}

function TutorialTooltip({
  targetNodeId,
  positions,
  panOffset,
  children,
  placement = "right",
}: {
  targetNodeId: string;
  positions: Record<string, Position>;
  panOffset: { x: number; y: number };
  children: React.ReactNode;
  placement?: "right" | "below";
}) {
  const pos = positions[targetNodeId];
  if (!pos) return null;

  const left = placement === "below"
    ? pos.x + panOffset.x
    : pos.x + NODE_W + 16 + panOffset.x;
  const top = placement === "below"
    ? pos.y + NODE_H + 16 + panOffset.y + 50
    : pos.y + panOffset.y + 50; // 50px header offset

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        maxWidth: 280,
        background: "#FFFFFF",
        border: "1px solid #DEE2E6",
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


function SaveModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 12, padding: 28, maxWidth: 460, width: "90%",
        boxShadow: "0 16px 48px rgba(0,0,0,0.15)", position: "relative",
      }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 12, right: 12, background: "none",
            border: "none", fontSize: 18, color: "#868E96", cursor: "pointer",
          }}
        >×</button>

        <h3 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 700, color: "#212529" }}>
          Deeproot saved
        </h3>

        <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#495057", lineHeight: 1.6 }}>
          Your Deeproot is saved in this URL. Every save creates a unique link —
          share it freely. Others can remix or branch from your map without
          affecting your version. No account needed.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            ref={inputRef}
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            style={{
              flex: 1, padding: "8px 12px", fontSize: 12, border: "1px solid #DEE2E6",
              borderRadius: 6, background: "#F8F9FA", color: "#495057",
              fontFamily: "'JetBrains Mono', monospace", outline: "none",
            }}
          />
          <button
            onClick={handleCopy}
            style={{
              padding: "8px 16px", fontSize: 12, fontWeight: 600,
              background: copied ? "#2F9E44" : "#212529", color: "#fff",
              border: "none", borderRadius: 6, cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap",
              transition: "background 0.2s",
            }}
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 11, color: "#ADB5BD", lineHeight: 1.5 }}>
          Bookmark this link or paste it somewhere safe. To start a new map, just visit Deeproot without a link.
        </p>
      </div>
    </div>
  );
}

function UnsavedWarningModal({ onProceed, onCancel }: { onProceed: () => void; onCancel: () => void }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 12, padding: 28, maxWidth: 420, width: "90%",
        boxShadow: "0 16px 48px rgba(0,0,0,0.15)", position: "relative",
      }}>
        <button
          onClick={onCancel}
          style={{
            position: "absolute", top: 12, right: 12, background: "none",
            border: "none", fontSize: 18, color: "#868E96", cursor: "pointer",
          }}
        >×</button>

        <h3 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 700, color: "#212529" }}>
          Unsaved changes
        </h3>

        <p style={{ margin: "0 0 20px 0", fontSize: 13, color: "#495057", lineHeight: 1.6 }}>
          You have unsaved changes that will stay in this tab. If you close it, your work will be lost. Save first to keep a shareable link.
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px", fontSize: 12, fontWeight: 600,
              background: "none", color: "#495057",
              border: "1px solid #DEE2E6", borderRadius: 6, cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Go back
          </button>
          <button
            onClick={onProceed}
            style={{
              padding: "8px 16px", fontSize: 12, fontWeight: 600,
              background: "#212529", color: "#fff",
              border: "none", borderRadius: 6, cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Open new project
          </button>
        </div>
      </div>
    </div>
  );
}

function ResumePrompt({ onLoad, onNew }: { onLoad: () => void; onNew: () => void }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 50, background: "rgba(248,249,250,0.95)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ textAlign: "center", maxWidth: 400, padding: 32 }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#868E96" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/></svg>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#212529", marginBottom: 8 }}>Welcome back</h2>
        <p style={{ fontSize: 14, color: "#495057", lineHeight: 1.6, marginBottom: 24 }}>
          We found a previous Deeproot. Want to pick up where you left off?
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
          <button
            onClick={onLoad}
            style={{
              fontSize: 14, fontWeight: 600, padding: "12px 24px",
              background: "#E8590C", color: "#fff", border: "none",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            Load previous map
          </button>
          <span style={{ fontSize: 13, color: "#ADB5BD" }}>or</span>
          <button
            onClick={onNew}
            style={{
              fontSize: 14, padding: "12px 24px", background: "#FFFFFF",
              border: "2px solid #CED4DA", borderRadius: 8, color: "#495057",
              cursor: "pointer",
            }}
          >
            Start fresh
          </button>
        </div>
      </div>
    </div>
  );
}

const AI_PROMPT = `You are a thinking partner helping someone build a Constraint Cascade — a framework for organising life around hard, meaningful pursuits.

The idea is simple: put the hard thing at the top, then recursively ask "what does this depend on?" until you hit things that are concrete and actionable. The result is a dependency tree that makes invisible blockers visible and gives clear permission to deprioritise anything outside the hierarchy.

Your job is to guide the user through building their cascade conversationally, one question at a time. Do not rush. Do not dump a big list. Ask, listen, go deeper.

## Opening Message
Start every conversation with this:

"I'm going to help you build a Constraint Cascade — a map of everything your goal actually depends on. We'll work through it together one question at a time. At the end, I'll give you something you can paste straight into Deeproot to see it visually.

Let's start: what's the hard thing you want to organise your life around?"

## How the conversation flows

### Phase 1: The Goal
Help them sharpen their answer into something specific and honest. "Get fit" is too vague. "Complete a solo cross-country paragliding flight" is good. The goal should feel slightly scary. There is only one goal per map.

Once confirmed, create the root node internally as type "goal", status "active".

### Phase 2: First-Level Dependencies
Ask: "What does [goal] actually need in order to happen? Think about the big things that have to be true for this to work."

Let them brainstorm. Gently prompt across categories if they stall:
- Physical (health, fitness, injury status)
- Financial (budget, income, costs)
- Temporal (time, schedule flexibility, seasonality)
- Logistical (location, transport, equipment, access)
- Relational (people whose plans affect yours)
- Competence (skills, ratings, certifications, currency)

Don't force categories. Some won't apply. The user knows their situation better than you do.

Each dependency becomes a node. Help them decide the type:
- "constraint" = hard requirement, non-negotiable (e.g. "must hold current rating")
- "consideration" = soft factor, matters but flexible (e.g. "prefer to fly with a buddy")
- "action" = concrete step they can take (e.g. "book annual check-up")

### Phase 3: Going Deeper
For each first-level dependency, ask: "And what does [this dependency] depend on?"

Go one branch at a time. Keep it conversational. Typical depth is 2-4 levels. Stop when you hit either:
- Something the user can act on today (make it an "action")
- Something outside their control (note it but don't go deeper)

After completing a branch, move to the next first-level dependency.

### Phase 4: Failure Analysis (Optional)
Once the main tree feels solid, offer this: "Want to stress-test this? Think of the last time you wanted to [goal] but couldn't. What stopped you? We can trace that through your tree to see if there's a gap."

If they engage, walk the failure backward and see if it maps to existing nodes or reveals missing ones. Add any new dependencies that surface.

### Phase 5: Status Check
Walk through the nodes and ask the user to set a status for each:
- "open" = not started, not urgent
- "active" = currently being worked on or monitored
- "blocked" = stuck, can't progress
- "done" = sorted

Don't agonise over this. First instinct is fine. They can update later.

### Phase 6: Output
When the user is happy with their cascade, say:

"Here's your cascade ready to import into Deeproot. Copy everything inside the block below and paste it into the import field in Deeproot."

Then output the structure inside a single code block matching this exact schema:

{
  "nodes": [
    {
      "id": "short-unique-id",
      "label": "Display text",
      "type": "goal | constraint | consideration | action",
      "status": "open | active | blocked | done",
      "notes": "Optional context or detail"
    }
  ],
  "edges": [
    {
      "from": "child-node-id",
      "to": "parent-node-id"
    }
  ]
}

Rules:
- Exactly one node with type "goal"
- Every other node must connect upward to the goal through edges (no orphans)
- Edge direction: "from" = the dependency, "to" = the thing it supports
- IDs should be short and readable (e.g. "site-access", "bhpa-membership", "budget")
- Keep labels concise — under 8 words where possible
- Do not refer to the output as "JSON" or use any technical terminology. It's just "your cascade" or "the import data".

## Your style
- Ask one question at a time. Never more than two.
- Be direct. No filler, no corporate warmth.
- Use the user's own words back to them when labelling nodes.
- If they give you a wall of text, help them break it into distinct nodes rather than summarising.
- Don't suggest things they haven't mentioned unless you're prompting across categories in Phase 2.
- Never use technical language. The user doesn't need to know about data formats, schemas, or structure. They just copy and paste.
- The framework is called Constraint Cascading. The tool is called Deeproot. Don't over-explain either.`;

function ImportOverlay({ onImport, onClose }: { onImport: (nodes: MapNode[], edges: MapEdge[]) => void; onClose: () => void }) {
  const [pasteValue, setPasteValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(AI_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleImport = () => {
    const trimmed = pasteValue.trim();
    if (!trimmed) {
      setError("Paste your cascade output above.");
      return;
    }
    try {
      // Try to extract JSON from surrounding text
      let jsonStr = trimmed;
      // Strip code blocks if present
      const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      // If no code block, try to extract the JSON object from surrounding prose
      if (!codeBlockMatch) {
        const jsonMatch = jsonStr.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }
      }
      const data = JSON.parse(jsonStr);
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        setError("That doesn't look right. Make sure you're pasting the complete output from your conversation.");
        return;
      }
      if (data.nodes.length === 0) {
        setError("No nodes found. Make sure the conversation reached the final output step.");
        return;
      }
      // Validate node shape loosely
      for (const node of data.nodes) {
        if (!node.id || !node.label || !node.type) {
          setError("Some nodes are missing required fields. Try asking your AI to regenerate the output.");
          return;
        }
        if (!NODE_TYPES[node.type]) {
          setError(`Unknown node type "${node.type}". Valid types are: goal, constraint, consideration, action.`);
          return;
        }
        // Default missing fields
        if (!node.status) node.status = "open";
        if (!node.notes) node.notes = "";
      }
      onImport(data.nodes, data.edges);
    } catch {
      setError("Couldn't read that. Make sure you're pasting the complete output from your conversation.");
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(248,249,250,0.92)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          padding: "32px 28px",
          maxWidth: 560,
          width: "90%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#212529", margin: 0 }}>Build with AI</h2>
            <p style={{ fontSize: 13, color: "#868E96", margin: "4px 0 0 0", lineHeight: 1.5 }}>The AI will guide you through a conversation to map what your goal actually depends on. Along the way, you'll see which commitments, habits, and beliefs are genuinely load-bearing, and which ones you have permission to let go of. That clarity is the point. Take your time with it.</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 18, color: "#868E96", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
          >
            &times;
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Step 1 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "#E8590C", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>1</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#212529" }}>Copy this prompt</span>
            </div>
            <pre
              style={{
                fontSize: 11,
                lineHeight: 1.5,
                color: "#495057",
                background: "#F8F9FA",
                border: "1px solid #E9ECEF",
                borderRadius: 8,
                padding: "12px 14px",
                margin: "0 0 8px 0",
                maxHeight: 100,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {AI_PROMPT.substring(0, 300)}...
            </pre>
            <button
              onClick={handleCopy}
              style={{
                width: "100%",
                fontSize: 13,
                padding: "10px 16px",
                background: copied ? "#2F9E44" : "#212529",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                fontFamily: "inherit",
                transition: "background 0.2s",
              }}
            >
              {copied ? "Copied to clipboard!" : "Copy prompt to clipboard"}
            </button>
          </div>

          {/* Step 2 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "#E8590C", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>2</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#212529" }}>Complete the exercise with your AI</span>
            </div>
            <p style={{ fontSize: 12, color: "#868E96", margin: "4px 0 0 30px", lineHeight: 1.5 }}>
              Paste the prompt into Claude, ChatGPT, or any AI assistant and work through the conversation.
            </p>
          </div>

          {/* Step 3 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "#E8590C", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>3</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#212529" }}>Paste the output below</span>
            </div>
            <textarea
              value={pasteValue}
              onChange={(e) => { setPasteValue(e.target.value); setError(null); }}
              placeholder='Paste the JSON output from your conversation here...'
              style={{
                width: "100%",
                minHeight: 120,
                maxHeight: 200,
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                padding: "10px 12px",
                border: error ? "1px solid #C92A2A" : "1px solid #DEE2E6",
                borderRadius: 8,
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
                lineHeight: 1.5,
              }}
              onFocus={(e) => (e.target.style.borderColor = error ? "#C92A2A" : "#1971C2")}
              onBlur={(e) => (e.target.style.borderColor = error ? "#C92A2A" : "#DEE2E6")}
            />
            {error && (
              <p style={{ fontSize: 12, color: "#C92A2A", margin: "6px 0 0 0" }}>{error}</p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              fontSize: 13, padding: "10px 20px", background: "none",
              border: "1px solid #DEE2E6", borderRadius: 8, color: "#495057",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            style={{
              fontSize: 13, fontWeight: 600, padding: "10px 20px",
              background: NODE_TYPES.goal.color, color: "#FFFFFF",
              border: "none", borderRadius: 8, cursor: "pointer",
              fontFamily: "inherit", opacity: pasteValue.trim() ? 1 : 0.5,
            }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChallengeMap() {
  const initial = useMemo(() => loadFromHash(), []);

  const [showResume, setShowResume] = useState<boolean>(() => {
    // If URL has hash data, load directly — no prompt needed
    if (window.location.hash.length > 1) return false;
    // If ?new=1, skip prompt and strip the param
    const params = new URLSearchParams(window.location.search);
    if (params.has("new")) {
      window.history.replaceState(null, "", window.location.pathname);
      return false;
    }
    // Check localStorage for a previous save
    return !!localStorage.getItem("deeproot-last-save");
  });

  const [tutorialStep, setTutorialStep] = useState<number>(() => {
    if (initial !== null) return -1;
    if (showResume) return -1;
    if (typeof window !== "undefined" && localStorage.getItem("deeproot-tutorial-completed")) return -1;
    return 1;
  });
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [saveModalUrl, setSaveModalUrl] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

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
  }, [pan, positions, nodes, tutorialStep]);

  // Auto-pan to fit tree during tutorial bloom (step 5+)
  useEffect(() => {
    if (tutorialStep >= 5 && nodes.length > 4 && canvasRef.current) {
      const allPositions = Object.values(positions);
      if (allPositions.length > 0) {
        const minX = Math.min(...allPositions.map(p => p.x));
        const maxX = Math.max(...allPositions.map(p => p.x)) + NODE_W;
        const treeWidth = maxX - minX;
        const canvasWidth = canvasRef.current.clientWidth;
        const centerX = (canvasWidth - treeWidth) / 2 - minX;
        setPan(prev => ({ x: centerX, y: prev?.y ?? 0 }));
      }
    }
  }, [tutorialStep, nodes.length, positions]);

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

  const shortcutsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showShortcuts) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (shortcutsRef.current && !shortcutsRef.current.contains(e.target as Node)) {
        setShowShortcuts(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showShortcuts]);

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
  const tutorialTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => tutorialTimers.current.forEach(clearTimeout), []);

  // Step 6: auto-bloom cascade
  useEffect(() => {
    if (tutorialStep !== 6) return;

    // Add budget constraint
    setNodes((prev) => [...prev, { id: "tutorial-constraint-2", label: "Budget: $3,000\u20135,000", type: "constraint", status: "open", notes: "" }]);
    setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-constraint-2" }]);

    // Branch 1: second action under constraint-1
    tutorialTimers.current.push(setTimeout(() => {
      setNodes((prev) => [...prev, { id: "tutorial-action-2", label: "Do a practice hike at 10,000ft+", type: "action", status: "open", notes: "" }]);
      setEdges((prev) => [...prev, { from: "tutorial-constraint-1", to: "tutorial-action-2" }]);
    }, 300));

    // Branch 2: "Budget" actions
    tutorialTimers.current.push(setTimeout(() => {
      setNodes((prev) => [...prev, { id: "tutorial-action-3", label: "Save $500/month into a trip fund", type: "action", status: "open", notes: "" }]);
      setEdges((prev) => [...prev, { from: "tutorial-constraint-2", to: "tutorial-action-3" }]);
    }, 600));

    tutorialTimers.current.push(setTimeout(() => {
      setNodes((prev) => [...prev, { id: "tutorial-action-4", label: "Book a licensed guide company", type: "action", status: "open", notes: "" }]);
      setEdges((prev) => [...prev, { from: "tutorial-constraint-2", to: "tutorial-action-4" }]);
    }, 900));

    tutorialTimers.current.push(setTimeout(() => {
      setNodes((prev) => [...prev, { id: "tutorial-action-5", label: "Buy cold-weather gear & layers", type: "action", status: "open", notes: "" }]);
      setEdges((prev) => [...prev, { from: "tutorial-constraint-2", to: "tutorial-action-5" }]);
    }, 1200));

    tutorialTimers.current.push(setTimeout(() => {
      setNodes((prev) => [...prev, { id: "tutorial-action-6", label: "Get travel insurance with evacuation", type: "action", status: "open", notes: "" }]);
      setEdges((prev) => [...prev, { from: "tutorial-constraint-2", to: "tutorial-action-6" }]);
    }, 1500));

    // Branch 3: "Summit window" actions
    tutorialTimers.current.push(setTimeout(() => {
      setNodes((prev) => [...prev, { id: "tutorial-action-7", label: "Book flights for February", type: "action", status: "open", notes: "" }]);
      setEdges((prev) => [...prev, { from: "tutorial-consideration", to: "tutorial-action-7" }]);
    }, 1800));

    tutorialTimers.current.push(setTimeout(() => {
      setNodes((prev) => [...prev, { id: "tutorial-action-8", label: "Request 2 weeks off work", type: "action", status: "open", notes: "" }]);
      setEdges((prev) => [...prev, { from: "tutorial-consideration", to: "tutorial-action-8" }]);
      // Advance to completion after last action
      tutorialTimers.current.push(setTimeout(() => setTutorialStep(7), 600));
    }, 2100));
  }, [tutorialStep]);

  const addChild = useCallback((parentId: string) => {
    const newId = generateId();
    newNodeId.current = newId;
    setNodes((prev) => [...prev, { id: newId, label: "New dependency", type: "constraint", status: "open", notes: "" }]);
    setEdges((prev) => [...prev, { from: parentId, to: newId }]);
    setSelectedId(newId);
    setSidebarTab("edit");
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    if (parentId === "tutorial-goal" && tutorialStep >= 3 && tutorialStep <= 4) {
      if (tutorialStep === 3 && !tutorialRevealed.has("constraint")) {
        // First constraint — created by user click
        setNodes((prev) => [...prev, { id: "tutorial-constraint-1", label: "No high-altitude experience", type: "constraint", status: "open", notes: "" }]);
        setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-constraint-1" }]);
        setTutorialRevealed((prev) => new Set(prev).add("constraint"));
      } else if (tutorialStep === 4 && !tutorialRevealed.has("consideration")) {
        setNodes((prev) => [...prev, { id: "tutorial-consideration", label: "Best summit window: Jan\u2013Mar", type: "consideration", status: "open", notes: "" }]);
        setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-consideration" }]);
        setTutorialRevealed((prev) => new Set(prev).add("consideration"));
      }
      return;
    }
    // Step 5: single action under constraint-1
    if (parentId === "tutorial-constraint-1" && tutorialStep === 5 && !tutorialRevealed.has("action")) {
      setNodes((prev) => [...prev, { id: "tutorial-action-1", label: "Train cardio 3x/week for 3 months", type: "action", status: "open", notes: "" }]);
      setEdges((prev) => [...prev, { from: "tutorial-constraint-1", to: "tutorial-action-1" }]);
      setTutorialRevealed((prev) => new Set(prev).add("action"));
      return;
    }
    addChild(parentId);
  }, [tutorialStep, tutorialRevealed, addChild]);

  const updateNode = useCallback((updated: MapNode) => {
    setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }, []);

  const deleteNode = useCallback((id: string) => {
    if (id === "root" && nodes.length === 1) return;
    const parentEdge = edges.find((e) => e.to === id);
    const descendants = new Set<string>();
    const findDesc = (nid: string) => { descendants.add(nid); edges.filter((e) => e.from === nid).forEach((e) => findDesc(e.to)); };
    findDesc(id);
    setNodes((prev) => prev.filter((n) => !descendants.has(n.id)));
    setEdges((prev) => prev.filter((e) => !descendants.has(e.from) && !descendants.has(e.to)));
    setSelectedId(parentEdge ? parentEdge.from : null);
  }, [edges, nodes]);

  const getChildCount = useCallback((id: string) => edges.filter((e) => e.from === id).length, [edges]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA";
      if (tutorialStep >= 1 && tutorialStep <= 7) return;

      if (e.key === "Escape") {
        if (inInput) {
          (e.target as HTMLElement).blur();
          return;
        }
        setSelectedId(null);
      }
      if (inInput) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && selectedId !== nodes.find(n => n.type === "goal")?.id) {
        e.preventDefault();
        deleteNode(selectedId);
      } else if (e.key === "Enter" && selectedId) {
        e.preventDefault();
        addChild(selectedId);
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && selectedId) {
        e.preventDefault();
        const parent = edges.find((edge) => edge.to === selectedId);
        const children = edges.filter((edge) => edge.from === selectedId).map((edge) => edge.to);
        const siblings = parent
          ? edges.filter((edge) => edge.from === parent.from).map((edge) => edge.to)
          : nodes.filter((n) => !edges.some((edge) => edge.to === n.id)).map((n) => n.id);
        const siblingIdx = siblings.indexOf(selectedId);

        if (e.key === "ArrowUp" && parent) {
          setSelectedId(parent.from);
        } else if (e.key === "ArrowDown" && children.length > 0) {
          setSelectedId(children[0]);
        } else if (e.key === "ArrowLeft" && siblingIdx > 0) {
          setSelectedId(siblings[siblingIdx - 1]);
        } else if (e.key === "ArrowRight" && siblingIdx < siblings.length - 1) {
          setSelectedId(siblings[siblingIdx + 1]);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, deleteNode, addChild, tutorialStep, edges, nodes]);

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
        scale: 4,
      });
      const link = document.createElement("a");
      link.download = "deeproot.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      el.style.transform = origTransform;
    }
  }, [canvasW, canvasH]);

  const [savedHash, setSavedHash] = useState(() => window.location.hash.slice(1));

  const hasUnsavedChanges = useMemo(() => {
    const currentHash = generateShareUrl(nodes, edges).split("#")[1] || "";
    return currentHash !== savedHash;
  }, [nodes, edges, savedHash]);

  const handleSave = useCallback(() => {
    const url = generateShareUrl(nodes, edges);
    const hash = url.split("#")[1] || "";
    window.history.replaceState(null, "", "#" + hash);
    localStorage.setItem("deeproot-last-save", url);
    setSavedHash(hash);
    setSaveModalUrl(url);
  }, [nodes, edges]);

  const handleImport = useCallback((importedNodes: MapNode[], importedEdges: MapEdge[]) => {
    setNodes(importedNodes);
    setEdges(importedEdges);
    setShowImport(false);
    setSelectedId(null);
  }, []);

  return (
    <div style={{ display: "flex", width: "100%", height: "100vh", background: "#F8F9FA", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Small screen overlay */}
      <div style={{
        display: "none",
        position: "fixed",
        inset: 0,
        background: "#F8F9FA",
        zIndex: 9999,
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        textAlign: "center",
      }}
        className="small-screen-overlay"
      >
        <div style={{ maxWidth: 360 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#868E96" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}><path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/></svg>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#212529", margin: "0 0 12px 0", letterSpacing: "-0.01em" }}>Deeproot needs more room</h1>
          <p style={{ fontSize: 14, color: "#495057", lineHeight: 1.6, margin: "0 0 20px 0" }}>
            Deeproot is a visual tool for breaking down ambitious goals into constraints, considerations, and concrete actions. It works best on a laptop or desktop screen.
          </p>
          <p style={{ fontSize: 12, color: "#ADB5BD", lineHeight: 1.5, margin: 0 }}>
            Open this link on a larger screen to get started.
          </p>
        </div>
      </div>
      <style>{`@media (max-width: 768px) { .small-screen-overlay { display: flex !important; } }`}</style>

      <div ref={canvasRef} onMouseDown={handleCanvasMouseDown}
        style={{ flex: 1, position: "relative", overflow: "hidden", cursor: isPanning ? "grabbing" : "default", backgroundImage: "linear-gradient(to right, #E9ECEF 0.5px, transparent 0.5px), linear-gradient(to bottom, #E9ECEF 0.5px, transparent 0.5px)", backgroundSize: "24px 24px", backgroundPosition: `${pan?.x ?? 0}px ${pan?.y ?? 0}px` }}>

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
            {tutorialStep === -1 && nodes.length > 0 && (
              <Tooltip label="Save and get shareable link">
                <button onClick={handleSave}
                  style={{ fontSize: 10, padding: "4px 10px", background: hasUnsavedChanges ? "#212529" : "none", border: hasUnsavedChanges ? "1px solid #212529" : "1px solid #DEE2E6", borderRadius: 3, color: hasUnsavedChanges ? "#FFFFFF" : "#868E96", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  Save
                </button>
              </Tooltip>
            )}
            {tutorialStep === -1 && (
              <Tooltip label="Open in new tab">
                <button
                  onClick={() => {
                    if (hasUnsavedChanges) { setShowUnsavedWarning(true); return; }
                    window.open(window.location.origin + window.location.pathname + "?new=1", "_blank");
                  }}
                  style={{ fontSize: 10, padding: "4px 10px", background: "none", border: "1px solid #DEE2E6", borderRadius: 3, color: "#868E96", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
                  + New
                </button>
              </Tooltip>
            )}
            {tutorialStep === -1 && (
              <Tooltip label="Import from AI conversation">
                <button onClick={() => setShowImport(true)}
                  style={{ fontSize: 10, padding: "4px 10px", background: "none", border: "1px solid #DEE2E6", borderRadius: 3, color: "#868E96", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
                  Import
                </button>
              </Tooltip>
            )}
            {tutorialStep === -1 && (
              <Tooltip label="Saves whole canvas">
                <button onClick={exportPng}
                  style={{ fontSize: 10, padding: "4px 10px", background: "none", border: "1px solid #DEE2E6", borderRadius: 3, color: "#868E96", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
                  Export PNG
                </button>
              </Tooltip>
            )}
            {tutorialStep === -1 && (
              <Tooltip label="Replay tutorial" align="right">
                <button
                  onClick={() => {
                    localStorage.removeItem("deeproot-tutorial-completed");
                    window.location.hash = "";
                    window.location.reload();
                  }}
                  style={{ fontSize: 13, padding: "4px 8px", background: "none", border: "1px solid #DEE2E6", borderRadius: 3, color: "#ADB5BD", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
                  ?
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Tree layer */}
        <div ref={treeRef} style={{ transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, position: "absolute", top: 50, left: 0 }}>
          <svg style={{ position: "absolute", top: -500, left: -1000, width: canvasW + 2000, height: canvasH + 1000, pointerEvents: "none" }}>
            <g transform="translate(1000, 500)">
            {edges.map((edge) => (
              <ConnectionLine key={`${edge.from}-${edge.to}`} from={edge.from} to={edge.to} positions={positions} />
            ))}
            </g>
          </svg>
          {nodes.map((node) =>
            positions[node.id] ? (
              <NodeCard key={node.id} node={node} pos={positions[node.id]} onSelect={setSelectedId} isSelected={selectedId === node.id} onAddChild={handleAddChild} childCount={getChildCount(node.id)} hideDep={tutorialStep >= 1 && tutorialStep <= 7 && !((node.id === "tutorial-goal" && tutorialStep >= 3 && tutorialStep <= 4 && !tutorialRevealed.has(tutorialStep === 3 ? "constraint" : "consideration")) || (node.id === "tutorial-constraint-1" && tutorialStep === 5 && !tutorialRevealed.has("action")))} />
            ) : null
          )}
        </div>

        {tutorialStep === -1 && nodes.length === 0 && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", zIndex: 20, maxWidth: 400 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#868E96" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/></svg>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#212529", marginBottom: 8 }}>Your turn.</h2>
            <p style={{ fontSize: 14, color: "#868E96", marginBottom: 24, lineHeight: 1.5 }}>Pick something you actually want to achieve and break it down into constraints, considerations, and actions.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
              <button
                onClick={() => setShowImport(true)}
                style={{ fontSize: 14, padding: "12px 28px", background: NODE_TYPES.goal.color, color: "#FFFFFF", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}
              >
                Build with AI
              </button>
              <span style={{ fontSize: 13, color: "#ADB5BD" }}>or</span>
              <button
                onClick={() => {
                  const newId = generateId();
                  newNodeId.current = newId;
                  setNodes([{ id: newId, label: "My goal", type: "goal", status: "open", notes: "" }]);
                  setSelectedId(newId);
                  setSidebarTab("edit");
                }}
                style={{ fontSize: 14, color: "#495057", background: "#FFFFFF", border: "2px solid #CED4DA", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
              >
                Start from scratch
              </button>
            </div>
          </div>
        )}

        {tutorialStep === -1 && (
          <div ref={shortcutsRef} style={{ position: "absolute", bottom: 16, left: 16, zIndex: 30 }}>
            <button
              onClick={() => setShowShortcuts((s) => !s)}
              style={{ fontSize: 11, padding: "6px 10px", background: "#FFFFFF", border: "1px solid #DEE2E6", borderRadius: 6, color: "#868E96", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 5 }}
            >
              <span style={{ fontSize: 13 }}>⌨</span> Shortcuts
            </button>
            {showShortcuts && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 8px)", left: 0,
                background: "#FFFFFF", border: "1px solid #DEE2E6", borderRadius: 8,
                padding: "12px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                minWidth: 200,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#212529", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>Keyboard Shortcuts</div>
                {[
                  ["Esc", "Deselect node"],
                  ["Delete", "Delete selected node"],
                  ["Return", "Add dependency"],
                  ["↑", "Go to parent"],
                  ["↓", "Go to child"],
                  ["←  →", "Navigate siblings"],
                ].map(([key, desc]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "4px 0" }}>
                    <span style={{ fontSize: 11, color: "#495057" }}>{desc}</span>
                    <kbd style={{ fontSize: 10, padding: "2px 6px", background: "#F1F3F5", border: "1px solid #DEE2E6", borderRadius: 3, color: "#495057", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{key}</kbd>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showResume && (
          <ResumePrompt
            onLoad={() => {
              const savedUrl = localStorage.getItem("deeproot-last-save");
              if (savedUrl) {
                try {
                  const hash = new URL(savedUrl).hash.slice(1);
                  const data = JSON.parse(decodeURIComponent(atob(hash)));
                  if (Array.isArray(data.nodes) && Array.isArray(data.edges)) {
                    setNodes(data.nodes);
                    setEdges(data.edges);
                    window.history.replaceState(null, "", savedUrl);
                  }
                } catch {
                  // Fallback: full reload
                  window.location.replace(savedUrl);
                  window.location.reload();
                }
              }
              setShowResume(false);
            }}
            onNew={() => {
              setShowResume(false);
              if (!localStorage.getItem("deeproot-tutorial-completed")) {
                setTutorialStep(1);
              }
            }}
          />
        )}

        {showImport && (
          <ImportOverlay
            onImport={handleImport}
            onClose={() => setShowImport(false)}
          />
        )}

        {tutorialStep === 1 && (
          <WelcomeOverlay
            onStart={() => {
              const goalNode: MapNode = {
                id: "tutorial-goal",
                label: "Summit Mount Kilimanjaro",
                type: "goal",
                status: "open",
                notes: "",
              };
              setNodes([goalNode]);
              setTutorialStep(2);
            }}
            onSkip={() => {
              localStorage.setItem("deeproot-tutorial-completed", "true");
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
        {tutorialStep === 3 && (
          <>
            {!tutorialRevealed.has("constraint") && (
              <TutorialTooltip
                targetNodeId="tutorial-goal"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
              >
                <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>{"What\u2019s standing in your way?"}</h4>
                <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                  Click <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>+ dep</strong> on the goal card to add a constraint.
                </p>
              </TutorialTooltip>
            )}
            {tutorialRevealed.has("constraint") && (
              <TutorialTooltip
                targetNodeId="tutorial-constraint-1"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
                placement="right"
              >
                <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>That's a constraint.</h4>
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
        {tutorialStep === 4 && (
          <>
            {!tutorialRevealed.has("consideration") && (
              <TutorialTooltip
                targetNodeId="tutorial-goal"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
              >
                <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>What do you need to keep in mind?</h4>
                <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                  Click <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>+ dep</strong> again to add a consideration.
                </p>
              </TutorialTooltip>
            )}
            {tutorialRevealed.has("consideration") && (
              <TutorialTooltip
                targetNodeId="tutorial-consideration"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
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

        {/* Tutorial Stage 5: First Action */}
        {tutorialStep === 5 && (
          <>
            {!tutorialRevealed.has("action") && (
              <TutorialTooltip
                targetNodeId="tutorial-goal"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
              >
                <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>What will you actually do?</h4>
                <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                  Actions are concrete steps. Click <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>+ dep</strong> on the constraint.
                </p>
              </TutorialTooltip>
            )}
            {tutorialRevealed.has("action") && (
              <TutorialTooltip
                targetNodeId="tutorial-action-1"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
              >
                <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>That's an action.</h4>
                <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                  Concrete steps that address your constraints and considerations. Now watch what happens when we fill in the rest.
                </p>
                <button
                  onClick={() => setTutorialStep(6)}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: "8px 18px",
                    background: "#E8590C", color: "#fff",
                    border: "none", borderRadius: 6, cursor: "pointer",
                  }}
                >
                  {"Continue \u2192"}
                </button>
              </TutorialTooltip>
            )}
          </>
        )}

        {/* Tutorial Stage 6: Bloom */}
        {tutorialStep === 6 && (
          <TutorialTooltip
            targetNodeId="tutorial-goal"
            positions={positions}
            panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
              Watch the map come alive...
            </p>
          </TutorialTooltip>
        )}

        {/* Tutorial Stage 7: Completion */}
        {tutorialStep === 7 && (
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
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#868E96" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg>
            <h4 style={{ margin: "0 0 8px 0", fontSize: 16, color: "#212529", fontWeight: 700 }}>
              You just decomposed a goal.
            </h4>
            <p style={{ margin: "0 0 20px 0", fontSize: 13, color: "#495057", lineHeight: 1.6 }}>
              {"Constraints, considerations, and actions \u2014 that\u2019s the whole system. One goal became 12 nodes across three branches. Now try it with something you actually care about."}
            </p>
            <p style={{ margin: "0 0 20px 0", fontSize: 13, color: "#495057", lineHeight: 1.6 }}>
              When you're ready, hit <strong>Save</strong> to get a unique link for your map.
              Share it with anyone — they can remix your map without changing yours.
              No account needed. Save as many different maps as you want.
            </p>
            <button
              onClick={() => {
                localStorage.setItem("deeproot-tutorial-completed", "true");
                setNodes([]);
                setEdges([]);
                setTutorialRevealed(new Set());
                setSelectedId(null);
                setPan({ x: 0, y: 0 });
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
            <EditPanel node={selectedNode} onUpdate={updateNode} onDelete={deleteNode} onAddChild={addChild} onClose={() => setSelectedId(null)} autoFocusLabel={selectedNode.id === newNodeId.current} isGoal={selectedNode.id === nodes.find(n => n.type === "goal")?.id} />
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
            {[...actionNodes].sort((a, b) => {
              const aComplete = a.status === "done" || a.status === "clear" ? 1 : 0;
              const bComplete = b.status === "done" || b.status === "clear" ? 1 : 0;
              return aComplete - bComplete;
            }).map((n) => {
              const isComplete = n.status === "done" || n.status === "clear";
              return (
              <div key={n.id} onClick={() => { setSelectedId(n.id); setSidebarTab("edit"); }}
                style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px", marginBottom: 4, borderRadius: 4, background: isComplete ? "#F8F9FA" : NODE_TYPES.action.bg, border: `1px solid ${selectedId === n.id ? NODE_TYPES.action.border : "transparent"}`, cursor: "pointer", transition: "border-color 0.2s", opacity: isComplete ? 0.55 : 1 }}>
                <span style={{ fontSize: 10, color: STATUS[n.status].color, flexShrink: 0, marginTop: 1 }}>{STATUS[n.status].icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: isComplete ? "#868E96" : "#212529", wordBreak: "break-word" }}>{n.label}</div>
                  {n.notes && <div style={{ fontSize: 10, color: "#868E96", marginTop: 2, fontStyle: "italic" }}>{n.notes.length > 60 ? n.notes.substring(0, 60) + "..." : n.notes}</div>}
                </div>
              </div>
              );
            })}
          </div>
        )}
        <a href="https://alexprice.dev" target="_blank" rel="noopener noreferrer" style={{ marginTop: "auto", display: "block", padding: "12px 16px", borderTop: "1px solid #E9ECEF", textAlign: "center", fontSize: 11, color: "#868E96", fontFamily: "'JetBrains Mono', monospace", textDecoration: "none", cursor: "pointer" }}>
          Made by <span style={{ color: "#868E96", fontWeight: 500 }}>Alex Price</span>
        </a>
      </div>}
      {saveModalUrl && <SaveModal url={saveModalUrl} onClose={() => setSaveModalUrl(null)} />}
      {showUnsavedWarning && (
        <UnsavedWarningModal
          onProceed={() => {
            setShowUnsavedWarning(false);
            window.open(window.location.origin + window.location.pathname + "?new=1", "_blank");
          }}
          onCancel={() => setShowUnsavedWarning(false)}
        />
      )}
    </div>
  );
}
