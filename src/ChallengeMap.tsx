import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import html2canvas from "html2canvas";

export function generateShareUrl(nodes: MapNode[], edges: MapEdge[]): string {
  const data = JSON.stringify({ nodes, edges });
  const encoded = btoa(encodeURIComponent(data));
  return window.location.origin + window.location.pathname + "#" + encoded;
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


function EditPanel({ node, onUpdate, onDelete, onAddChild, onClose, autoFocusLabel }: { node: MapNode; onUpdate: (n: MapNode) => void; onDelete: (id: string) => void; onAddChild: (id: string) => void; onClose: () => void; autoFocusLabel?: boolean }) {
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

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => onAddChild(node.id)}
          style={{ fontSize: 10, padding: "6px 12px", background: "#F8F9FA", border: "1px solid #ADB5BD", borderRadius: 4, color: "#495057", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
          + Dep
        </button>
        <button onClick={() => onDelete(node.id)}
          style={{ fontSize: 10, padding: "6px 12px", background: "none", border: "1px solid #E03131", borderRadius: 4, color: "#E03131", cursor: "pointer", fontFamily: "inherit" }}>
          Delete node
        </button>
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
}: {
  targetNodeId: string;
  positions: Record<string, Position>;
  panOffset: { x: number; y: number };
  children: React.ReactNode;
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

function SaveModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
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
          <button
            onClick={onNew}
            style={{
              fontSize: 14, padding: "12px 24px", background: "none",
              border: "1px solid #DEE2E6", borderRadius: 8, color: "#495057",
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
    // Position children below the goal with all positive x coordinates.
    // Left column starts at x=40, center and right offset from there.
    const leftX = 40;
    const centerX = leftX + NODE_W + H_GAP;
    const rightX = centerX + NODE_W + H_GAP;
    return {
      constraint: { x: leftX, y: row1Y },
      consideration: { x: centerX, y: row1Y },
      action: { x: rightX, y: row1Y },
      actionSub1: { x: leftX, y: row2Y },
      actionSub2: { x: centerX, y: row2Y },
    };
  }, [positions]);

  // Center the root node horizontally on first load
  useEffect(() => {
    if (pan === null && canvasRef.current) {
      const rootPos = positions[nodes[0]?.id];
      if (rootPos) {
        const canvasWidth = canvasRef.current.clientWidth;
        // During tutorial, center the full 3-column layout instead of just the root
        if (tutorialStep >= 1 && tutorialStep <= 6) {
          const totalW = 3 * NODE_W + 2 * H_GAP; // width of 3 columns
          const layoutCenterX = 40 + totalW / 2; // center of the tutorial layout
          const centerX = canvasWidth / 2 - layoutCenterX;
          setPan({ x: centerX, y: 20 });
        } else {
          const centerX = (canvasWidth - NODE_W) / 2 - rootPos.x;
          setPan({ x: centerX, y: 0 });
        }
      } else {
        setPan({ x: 0, y: 0 });
      }
    }
  }, [pan, positions, nodes, tutorialStep]);
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
      if (tutorialStep >= 1 && tutorialStep <= 6) return;

      if (e.key === "Escape") {
        if (inInput) {
          (e.target as HTMLElement).blur();
          return;
        }
        setSelectedId(null);
      }
      if (inInput) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
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

  const handleSave = useCallback(() => {
    const url = generateShareUrl(nodes, edges);
    window.history.replaceState(null, "", "#" + url.split("#")[1]);
    localStorage.setItem("deeproot-last-save", url);
    setSaveModalUrl(url);
  }, [nodes, edges]);

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
        style={{ flex: 1, position: "relative", overflow: "hidden", cursor: isPanning ? "grabbing" : "default", backgroundImage: "radial-gradient(circle, #DEE2E6 0.8px, transparent 0.8px)", backgroundSize: "24px 24px" }}>

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
                  style={{ fontSize: 10, padding: "4px 10px", background: "#212529", border: "1px solid #212529", borderRadius: 3, color: "#FFFFFF", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  Save
                </button>
              </Tooltip>
            )}
            {tutorialStep === -1 && (
              <Tooltip label="Open in new tab">
                <button
                  onClick={() => { window.open(window.location.origin + window.location.pathname + "?new=1", "_blank"); }}
                  style={{ fontSize: 10, padding: "4px 10px", background: "none", border: "1px solid #DEE2E6", borderRadius: 3, color: "#868E96", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
                  + New Deeproot
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
            {/* Tutorial dashed connection lines */}
            {tutorialStep === 3 && tutorialPlaceholderPositions && !tutorialRevealed.has("constraint") && (() => {
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
            {tutorialStep === 4 && tutorialPlaceholderPositions && !tutorialRevealed.has("consideration") && (() => {
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
            {tutorialStep === 5 && tutorialPlaceholderPositions && !tutorialRevealed.has("action") && (() => {
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
            </g>
          </svg>
          {nodes.map((node) =>
            positions[node.id] ? (
              <NodeCard key={node.id} node={node} pos={positions[node.id]} onSelect={setSelectedId} isSelected={selectedId === node.id} onAddChild={addChild} childCount={getChildCount(node.id)} hideDep={tutorialStep >= 1 && tutorialStep <= 6} />
            ) : null
          )}
          {/* Tutorial placeholder nodes */}
          {tutorialStep === 3 && tutorialPlaceholderPositions && !tutorialRevealed.has("constraint") && (
            <PlaceholderNode
              pos={tutorialPlaceholderPositions.constraint}
              color={NODE_TYPES.constraint.color}
              onClick={() => {
                setNodes((prev) => [...prev, { id: "tutorial-constraint", label: "No cold weather gear", type: "constraint", status: "open", notes: "" }]);
                setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-constraint" }]);
                setTutorialRevealed((prev) => new Set(prev).add("constraint"));
              }}
            />
          )}
          {tutorialStep === 4 && tutorialPlaceholderPositions && !tutorialRevealed.has("consideration") && (
            <PlaceholderNode
              pos={tutorialPlaceholderPositions.consideration}
              color={NODE_TYPES.consideration.color}
              onClick={() => {
                setNodes((prev) => [...prev, { id: "tutorial-consideration", label: "Best season: July-Sept", type: "consideration", status: "open", notes: "" }]);
                setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-consideration" }]);
                setTutorialRevealed((prev) => new Set(prev).add("consideration"));
              }}
            />
          )}
          {tutorialStep === 5 && tutorialPlaceholderPositions && !tutorialRevealed.has("action") && (
            <PlaceholderNode
              pos={tutorialPlaceholderPositions.action}
              color={NODE_TYPES.action.color}
              onClick={() => {
                setNodes((prev) => [...prev, { id: "tutorial-action-1", label: "Book a guide service", type: "action", status: "open", notes: "" }]);
                setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-action-1" }]);
                setTutorialRevealed((prev) => new Set(prev).add("action"));
                tutorialTimers.current.push(setTimeout(() => {
                  setNodes((prev) => [...prev, { id: "tutorial-action-2", label: "Rent gear from REI", type: "action", status: "open", notes: "" }]);
                  setEdges((prev) => [...prev, { from: "tutorial-constraint", to: "tutorial-action-2" }]);
                }, 400));
                tutorialTimers.current.push(setTimeout(() => {
                  setNodes((prev) => [...prev, { id: "tutorial-action-3", label: "Plan for August trip", type: "action", status: "open", notes: "" }]);
                  setEdges((prev) => [...prev, { from: "tutorial-consideration", to: "tutorial-action-3" }]);
                  tutorialTimers.current.push(setTimeout(() => setTutorialStep(6), 600));
                }, 800));
              }}
            />
          )}
        </div>

        {tutorialStep === -1 && nodes.length === 0 && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", zIndex: 20, maxWidth: 400 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#868E96" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/></svg>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#212529", marginBottom: 8 }}>Your turn.</h2>
            <p style={{ fontSize: 14, color: "#868E96", marginBottom: 24, lineHeight: 1.5 }}>Pick something you actually want to achieve and break it down into constraints, considerations, and actions.</p>
            <button
              onClick={() => {
                const newId = generateId();
                newNodeId.current = newId;
                setNodes([{ id: newId, label: "My goal", type: "goal", status: "open", notes: "" }]);
                setSelectedId(newId);
                setSidebarTab("edit");
              }}
              style={{ fontSize: 14, padding: "12px 28px", background: NODE_TYPES.goal.color, color: "#FFFFFF", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}
            >
              Create your first goal
            </button>
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
                window.location.href = savedUrl;
              }
            }}
            onNew={() => setShowResume(false)}
          />
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

        {/* Tutorial Stage 3: The Constraint — tooltips only (SVG + placeholders are in tree layer) */}
        {tutorialStep === 3 && tutorialPlaceholderPositions && (
          <>
            {!tutorialRevealed.has("constraint") && (
              <TutorialTooltip
                targetNodeId="tutorial-goal"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
              >
                <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>What's standing in your way?</h4>
                <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                  Click the dashed box below to reveal a constraint.
                </p>
              </TutorialTooltip>
            )}
            {tutorialRevealed.has("constraint") && (
              <TutorialTooltip
                targetNodeId="tutorial-constraint"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
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

        {/* Tutorial Stage 4: The Consideration — tooltips only (SVG + placeholders are in tree layer) */}
        {tutorialStep === 4 && tutorialPlaceholderPositions && (
          <>
            {!tutorialRevealed.has("consideration") && (
              <TutorialTooltip
                targetNodeId="tutorial-goal"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
              >
                <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>What do you need to keep in mind?</h4>
                <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                  Click the dashed box below to reveal a consideration.
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

        {/* Tutorial Stage 5: The Actions — tooltips only (SVG + placeholders are in tree layer) */}
        {tutorialStep === 5 && tutorialPlaceholderPositions && (
          <>
            {!tutorialRevealed.has("action") && (
              <TutorialTooltip
                targetNodeId="tutorial-goal"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
              >
                <h4 style={{ margin: "0 0 6px 0", fontSize: 14, color: "#212529" }}>What will you actually do?</h4>
                <p style={{ margin: 0, fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
                  Actions are concrete steps. Click the dashed box to reveal them.
                </p>
              </TutorialTooltip>
            )}
            {tutorialRevealed.has("action") && (
              <TutorialTooltip
                targetNodeId="tutorial-goal"
                positions={positions}
                panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
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
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#868E96" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg>
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
            <EditPanel node={selectedNode} onUpdate={updateNode} onDelete={deleteNode} onAddChild={addChild} onClose={() => setSelectedId(null)} autoFocusLabel={selectedNode.id === newNodeId.current} />
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
                  <div style={{ fontSize: 12, color: isComplete ? "#868E96" : "#212529", wordBreak: "break-word", textDecoration: isComplete ? "line-through" : "none" }}>{n.label}</div>
                  {n.notes && <div style={{ fontSize: 10, color: "#868E96", marginTop: 2, fontStyle: "italic" }}>{n.notes.length > 60 ? n.notes.substring(0, 60) + "..." : n.notes}</div>}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>}
      {saveModalUrl && <SaveModal url={saveModalUrl} onClose={() => setSaveModalUrl(null)} />}
    </div>
  );
}
