# Mountain Metaphor Tutorial Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an interactive onboarding tutorial to Deeproot that uses a mountain climbing metaphor to teach goal decomposition through a 6-stage hands-on experience.

**Architecture:** All tutorial logic lives in `src/ChallengeMap.tsx` (single-file architecture). A `tutorialStep` state variable drives which stage is shown. Tutorial creates real `MapNode`/`MapEdge` objects using existing logic. Hash persistence is suppressed during the tutorial. Sidebar and header actions are hidden during tutorial stages.

**Tech Stack:** React 19, TypeScript, Vite, inline styles (matching existing codebase patterns)

**Design Doc:** `~/.gstack/projects/alexpricedev-deeproot/alexprice-alexpricedev-office-hours-design-20260328-062302.md`

---

### Task 1: Tutorial State Management

**Files:**
- Modify: `src/ChallengeMap.tsx:284-293` (component initialization and hash save effect)

**Step 1: Add tutorialStep state initialization**

In `ChallengeMap()`, after the `initial` useMemo (line 285), add tutorial state that checks localStorage and hash data synchronously:

```typescript
const [tutorialStep, setTutorialStep] = useState<number>(() => {
  if (initial !== null) return -1; // has hash data, skip tutorial
  if (localStorage.getItem('deeproot-tutorial-completed')) return -1; // returning user
  return 1; // show welcome screen
});
const [enableHashSave, setEnableHashSave] = useState(initial !== null);
```

**Step 2: Guard the saveToHash effect**

Replace the existing `useEffect` at lines 291-293:

```typescript
useEffect(() => {
  if (enableHashSave) {
    saveToHash(nodes, edges);
  }
}, [nodes, edges, enableHashSave]);
```

**Step 3: Update DEFAULT_NODES to empty array when tutorial is active**

Change the nodes initialization at line 286 to start empty when tutorial runs:

```typescript
const [nodes, setNodes] = useState<MapNode[]>(initial?.nodes ?? (tutorialStep === -1 ? DEFAULT_NODES : []));
const [edges, setEdges] = useState<MapEdge[]>(initial?.edges ?? []);
```

Wait... DEFAULT_NODES has the old airsports node. We should keep it for non-tutorial users who have no hash but have completed the tutorial. Actually, the design says to replace the hardcoded airsports default. Let's start with an empty canvas when tutorial is skipped too, and the tutorial will create nodes. For users who completed the tutorial and come back, they'll have their own hash data.

```typescript
const [nodes, setNodes] = useState<MapNode[]>(initial?.nodes ?? []);
const [edges, setEdges] = useState<MapEdge[]>(initial?.edges ?? []);
```

**Step 4: Verify the app still loads**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds with no type errors.

**Step 5: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: add tutorial state management and hash save guard"
```

---

### Task 2: Welcome Screen Overlay

**Files:**
- Modify: `src/ChallengeMap.tsx` (add WelcomeOverlay component and render it)

**Step 1: Create WelcomeOverlay component**

Add this component definition above the `ChallengeMap` default export (after `EditPanel`):

```typescript
function WelcomeOverlay({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(248,249,250,0.85)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: "#FFFFFF", borderRadius: 12, padding: "40px 48px",
        maxWidth: 480, textAlign: "center",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#9968;</div>
        <h1 style={{
          fontSize: 24, fontWeight: 700, margin: "0 0 12px 0", color: "#212529",
          lineHeight: 1.3,
        }}>
          Every big goal is a system of smaller ones.
        </h1>
        <p style={{
          fontSize: 15, lineHeight: 1.6, color: "#495057", margin: "0 0 24px 0",
        }}>
          Deeproot helps you break down ambitious goals into the constraints holding you back, considerations to keep in mind, and actions that move you forward.
        </p>
        <p style={{
          fontSize: 14, fontWeight: 600, color: NODE_TYPES.goal.color,
          margin: "0 0 24px 0",
        }}>
          Let's try it with a mountain climb.
        </p>
        <button onClick={onStart} style={{
          background: NODE_TYPES.goal.color, color: "#FFFFFF", border: "none",
          padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>
          Start the climb →
        </button>
        <div>
          <button onClick={onSkip} style={{
            background: "none", border: "none", color: "#ADB5BD",
            fontSize: 12, marginTop: 16, cursor: "pointer", fontFamily: "inherit",
          }}>
            I already know how this works — skip
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Render WelcomeOverlay in the canvas area**

Inside the `ChallengeMap` return, after the header div and before the tree layer div, add:

```typescript
{tutorialStep === 1 && (
  <WelcomeOverlay
    onStart={() => {
      // Create the goal node
      const goalId = "tutorial-goal";
      setNodes([{ id: goalId, label: "Climb Mount Rainier", type: "goal", status: "open", notes: "" }]);
      setTutorialStep(2);
    }}
    onSkip={() => {
      localStorage.setItem('deeproot-tutorial-completed', 'true');
      setEnableHashSave(true);
      setTutorialStep(-1);
    }}
  />
)}
```

**Step 3: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: add welcome screen overlay for tutorial"
```

---

### Task 3: Tutorial Tooltip Component

**Files:**
- Modify: `src/ChallengeMap.tsx` (add TutorialTooltip component)

**Step 1: Create TutorialTooltip component**

Add this component before WelcomeOverlay:

```typescript
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

  // Position tooltip to the right of the target node
  const headerOffset = 50; // header height
  const tooltipX = pos.x + NODE_W + 16 + panOffset.x;
  const tooltipY = pos.y + panOffset.y + headerOffset;

  return (
    <div style={{
      position: "absolute",
      left: tooltipX,
      top: tooltipY,
      maxWidth: 280,
      background: "#FFFFFF",
      borderRadius: 10,
      padding: "16px 20px",
      borderLeft: `4px solid ${color}`,
      boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
      zIndex: 50,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {children}
    </div>
  );
}
```

**Step 2: Create TutorialProgress component**

```typescript
function TutorialProgress({ currentStep }: { currentStep: number }) {
  return (
    <div style={{
      position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
      display: "flex", gap: 8, alignItems: "center", zIndex: 50,
    }}>
      {[1, 2, 3, 4, 5, 6].map((step) => (
        <div key={step} style={{
          width: 10, height: 10, borderRadius: "50%",
          background: step < currentStep ? "#2F9E44" : step === currentStep ? NODE_TYPES.goal.color : "#DEE2E6",
          transition: "background 0.3s",
        }} />
      ))}
      <span style={{ fontSize: 11, color: "#ADB5BD", marginLeft: 8 }}>
        Step {currentStep} of 6{currentStep === 6 ? " — Done!" : ""}
      </span>
    </div>
  );
}
```

**Step 3: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: add TutorialTooltip and TutorialProgress components"
```

---

### Task 4: Tutorial Placeholder Node Component

**Files:**
- Modify: `src/ChallengeMap.tsx` (add PlaceholderNode component)

**Step 1: Create PlaceholderNode component**

Add this before TutorialTooltip:

```typescript
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
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: NODE_W,
        minHeight: NODE_H - 20,
        background: "rgba(255,255,255,0.5)",
        border: `2px dashed ${color}`,
        borderRadius: 6,
        padding: "10px 12px",
        cursor: "pointer",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.2s, border-color 0.2s",
        boxSizing: "border-box",
      }}
    >
      <span style={{ fontSize: 12, color: color, fontWeight: 500, opacity: 0.8 }}>
        Click to reveal
      </span>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: add PlaceholderNode component for tutorial"
```

---

### Task 5: Tutorial Stage 2 — The Goal

**Files:**
- Modify: `src/ChallengeMap.tsx` (add stage 2 rendering)

**Step 1: Add CSS keyframes for node fade-in**

At the top of the file, after the imports, add a style tag injection:

```typescript
// Inject tutorial animation styles
if (!document.getElementById('tutorial-styles')) {
  const style = document.createElement('style');
  style.id = 'tutorial-styles';
  style.textContent = `
    @keyframes tutorialFadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .tutorial-node-enter {
      animation: tutorialFadeIn 0.3s ease-out forwards;
    }
    @keyframes tutorialLineDraw {
      from { stroke-dashoffset: var(--line-length); }
      to { stroke-dashoffset: 0; }
    }
    .tutorial-line-draw {
      animation: tutorialLineDraw 0.4s ease-in-out forwards;
    }
  `;
  document.head.appendChild(style);
}
```

**Step 2: Render stage 2 (The Goal) tooltip**

Inside the canvas area in ChallengeMap return, after the WelcomeOverlay conditional, add the tutorial rendering block. This will grow in subsequent tasks:

```typescript
{/* Tutorial tooltips */}
{tutorialStep === 2 && nodes.length > 0 && (
  <TutorialTooltip
    targetNodeId="tutorial-goal"
    positions={positions}
    panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
    color={NODE_TYPES.goal.color}
    canvasRef={canvasRef}
  >
    <div style={{ fontSize: 14, fontWeight: 600, color: "#212529", marginBottom: 8 }}>
      This is your goal.
    </div>
    <p style={{ fontSize: 13, lineHeight: 1.5, color: "#495057", margin: "0 0 12px 0" }}>
      The thing you want to achieve. Everything else on this map exists to make it happen.
    </p>
    <button
      onClick={() => setTutorialStep(3)}
      style={{
        background: NODE_TYPES.goal.color, color: "#FFFFFF", border: "none",
        padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      Continue →
    </button>
  </TutorialTooltip>
)}

{/* Tutorial progress dots */}
{tutorialStep >= 1 && tutorialStep <= 6 && (
  <TutorialProgress currentStep={tutorialStep} />
)}
```

**Step 3: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: add tutorial stage 2 (the goal) with fade-in animation"
```

---

### Task 6: Tutorial Stage 3 — The Constraint

**Files:**
- Modify: `src/ChallengeMap.tsx` (add stage 3 with placeholder node)

**Step 1: Add state for tracking which placeholders have been clicked**

In ChallengeMap, after the tutorialStep state, add:

```typescript
const [tutorialRevealed, setTutorialRevealed] = useState<Set<string>>(new Set());
```

**Step 2: Create a helper to compute placeholder positions**

Since during the tutorial we're building a tree step by step, we can compute placeholder positions based on the goal node position. Add this inside ChallengeMap (after positions useMemo):

```typescript
const tutorialPlaceholderPositions = useMemo(() => {
  const goalPos = positions["tutorial-goal"];
  if (!goalPos) return {};
  return {
    constraint: { x: goalPos.x - NODE_W - H_GAP / 2, y: goalPos.y + NODE_H + V_GAP },
    consideration: { x: goalPos.x, y: goalPos.y + NODE_H + V_GAP },
    action: { x: goalPos.x + NODE_W + H_GAP / 2, y: goalPos.y + NODE_H + V_GAP },
    actionSub1: { x: goalPos.x - NODE_W - H_GAP / 2, y: goalPos.y + (NODE_H + V_GAP) * 2 },
    actionSub2: { x: goalPos.x, y: goalPos.y + (NODE_H + V_GAP) * 2 },
  };
}, [positions]);
```

**Step 3: Render stage 3 — placeholder and tooltip**

Add after the stage 2 block:

```typescript
{tutorialStep === 3 && (
  <>
    {!tutorialRevealed.has("constraint") ? (
      <>
        {/* Dashed connection line to placeholder */}
        <div style={{ position: "absolute", top: 50, left: 0, transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, pointerEvents: "none", zIndex: 5 }}>
          <svg style={{ position: "absolute", top: 0, left: 0, width: canvasW, height: canvasH }}>
            {(() => {
              const goalPos = positions["tutorial-goal"];
              const pPos = tutorialPlaceholderPositions.constraint;
              if (!goalPos || !pPos) return null;
              const x1 = goalPos.x + NODE_W / 2;
              const y1 = goalPos.y + NODE_H;
              const x2 = pPos.x + NODE_W / 2;
              const y2 = pPos.y;
              const midY = (y1 + y2) / 2;
              return <path d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`} stroke={NODE_TYPES.constraint.color} strokeWidth="1.5" fill="none" strokeDasharray="6,4" opacity="0.4" />;
            })()}
          </svg>
        </div>
        {/* Placeholder node */}
        <div style={{ position: "absolute", top: 50, left: 0, transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, zIndex: 15 }}>
          <PlaceholderNode
            pos={tutorialPlaceholderPositions.constraint!}
            color={NODE_TYPES.constraint.color}
            onClick={() => {
              const id = "tutorial-constraint";
              setNodes((prev) => [...prev, { id, label: "No cold weather gear", type: "constraint", status: "open", notes: "" }]);
              setEdges((prev) => [...prev, { from: "tutorial-goal", to: id }]);
              setTutorialRevealed((prev) => new Set(prev).add("constraint"));
            }}
          />
        </div>
        <TutorialTooltip
          targetNodeId="tutorial-goal"
          positions={positions}
          panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
          color={NODE_TYPES.constraint.color}
          canvasRef={canvasRef}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "#212529", marginBottom: 8 }}>
            What's stopping you?
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "#495057", margin: 0 }}>
            Constraints are things that block progress. For a mountain climb, it might be <em>"No cold weather gear"</em> or <em>"Not fit enough yet."</em>
          </p>
          <p style={{ fontSize: 12, color: "#ADB5BD", margin: "8px 0 0 0" }}>
            Click the dashed node below to reveal it.
          </p>
        </TutorialTooltip>
      </>
    ) : (
      <TutorialTooltip
        targetNodeId="tutorial-constraint"
        positions={positions}
        panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
        color={NODE_TYPES.constraint.color}
        canvasRef={canvasRef}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "#212529", marginBottom: 8 }}>
          That's a constraint.
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "#495057", margin: "0 0 12px 0" }}>
          It blocks your goal until you deal with it. Now let's think about what to keep in mind.
        </p>
        <button
          onClick={() => setTutorialStep(4)}
          style={{
            background: NODE_TYPES.consideration.color, color: "#FFFFFF", border: "none",
            padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Continue →
        </button>
      </TutorialTooltip>
    )}
  </>
)}
```

**Step 4: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: add tutorial stage 3 (the constraint) with placeholder reveal"
```

---

### Task 7: Tutorial Stage 4 — The Consideration

**Files:**
- Modify: `src/ChallengeMap.tsx` (add stage 4)

**Step 1: Add stage 4 rendering**

Same pattern as stage 3 but for consideration. Add after the stage 3 block:

```typescript
{tutorialStep === 4 && (
  <>
    {!tutorialRevealed.has("consideration") ? (
      <>
        <div style={{ position: "absolute", top: 50, left: 0, transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, pointerEvents: "none", zIndex: 5 }}>
          <svg style={{ position: "absolute", top: 0, left: 0, width: canvasW, height: canvasH }}>
            {(() => {
              const goalPos = positions["tutorial-goal"];
              const pPos = tutorialPlaceholderPositions.consideration;
              if (!goalPos || !pPos) return null;
              const x1 = goalPos.x + NODE_W / 2;
              const y1 = goalPos.y + NODE_H;
              const x2 = pPos.x + NODE_W / 2;
              const y2 = pPos.y;
              const midY = (y1 + y2) / 2;
              return <path d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`} stroke={NODE_TYPES.consideration.color} strokeWidth="1.5" fill="none" strokeDasharray="6,4" opacity="0.4" />;
            })()}
          </svg>
        </div>
        <div style={{ position: "absolute", top: 50, left: 0, transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, zIndex: 15 }}>
          <PlaceholderNode
            pos={tutorialPlaceholderPositions.consideration!}
            color={NODE_TYPES.consideration.color}
            onClick={() => {
              const id = "tutorial-consideration";
              setNodes((prev) => [...prev, { id, label: "Best season: July-Sept", type: "consideration", status: "open", notes: "" }]);
              setEdges((prev) => [...prev, { from: "tutorial-goal", to: id }]);
              setTutorialRevealed((prev) => new Set(prev).add("consideration"));
            }}
          />
        </div>
        <TutorialTooltip
          targetNodeId="tutorial-constraint"
          positions={positions}
          panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
          color={NODE_TYPES.consideration.color}
          canvasRef={canvasRef}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "#212529", marginBottom: 8 }}>
            What do you need to keep in mind?
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "#495057", margin: 0 }}>
            Considerations are factors that shape your approach. They don't block you like constraints, they inform your decisions.
          </p>
          <p style={{ fontSize: 12, color: "#ADB5BD", margin: "8px 0 0 0" }}>
            Click the dashed node to reveal it.
          </p>
        </TutorialTooltip>
      </>
    ) : (
      <TutorialTooltip
        targetNodeId="tutorial-consideration"
        positions={positions}
        panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
        color={NODE_TYPES.consideration.color}
        canvasRef={canvasRef}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "#212529", marginBottom: 8 }}>
          That's a consideration.
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "#495057", margin: "0 0 12px 0" }}>
          Constraints block. Considerations inform. Now let's figure out what to actually <strong>do</strong>.
        </p>
        <button
          onClick={() => setTutorialStep(5)}
          style={{
            background: NODE_TYPES.action.color, color: "#FFFFFF", border: "none",
            padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Continue →
        </button>
      </TutorialTooltip>
    )}
  </>
)}
```

**Step 2: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: add tutorial stage 4 (the consideration)"
```

---

### Task 8: Tutorial Stage 5 — The Actions (with auto-reveal)

**Files:**
- Modify: `src/ChallengeMap.tsx` (add stage 5 with staggered auto-reveal)

**Step 1: Add stage 5 rendering**

The action stage reveals one node on click, then auto-reveals two more with staggered delays. Add after stage 4:

```typescript
{tutorialStep === 5 && (
  <>
    {!tutorialRevealed.has("action") ? (
      <>
        <div style={{ position: "absolute", top: 50, left: 0, transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, pointerEvents: "none", zIndex: 5 }}>
          <svg style={{ position: "absolute", top: 0, left: 0, width: canvasW, height: canvasH }}>
            {(() => {
              const goalPos = positions["tutorial-goal"];
              const pPos = tutorialPlaceholderPositions.action;
              if (!goalPos || !pPos) return null;
              const x1 = goalPos.x + NODE_W / 2;
              const y1 = goalPos.y + NODE_H;
              const x2 = pPos.x + NODE_W / 2;
              const y2 = pPos.y;
              const midY = (y1 + y2) / 2;
              return <path d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`} stroke={NODE_TYPES.action.color} strokeWidth="1.5" fill="none" strokeDasharray="6,4" opacity="0.4" />;
            })()}
          </svg>
        </div>
        <div style={{ position: "absolute", top: 50, left: 0, transform: `translate(${pan?.x ?? 0}px, ${pan?.y ?? 0}px)`, zIndex: 15 }}>
          <PlaceholderNode
            pos={tutorialPlaceholderPositions.action!}
            color={NODE_TYPES.action.color}
            onClick={() => {
              // First action: user-triggered
              const id1 = "tutorial-action-1";
              setNodes((prev) => [...prev, { id: id1, label: "Book a guide service", type: "action", status: "open", notes: "" }]);
              setEdges((prev) => [...prev, { from: "tutorial-goal", to: id1 }]);
              setTutorialRevealed((prev) => new Set(prev).add("action"));

              // Second action: auto-appear after 400ms
              setTimeout(() => {
                const id2 = "tutorial-action-2";
                setNodes((prev) => [...prev, { id: id2, label: "Rent gear from REI", type: "action", status: "open", notes: "" }]);
                setEdges((prev) => [...prev, { from: "tutorial-constraint", to: id2 }]);
              }, 400);

              // Third action: auto-appear after 800ms
              setTimeout(() => {
                const id3 = "tutorial-action-3";
                setNodes((prev) => [...prev, { id: id3, label: "Plan for August trip", type: "action", status: "open", notes: "" }]);
                setEdges((prev) => [...prev, { from: "tutorial-consideration", to: id3 }]);
                // Move to completion after a brief pause
                setTimeout(() => setTutorialStep(6), 600);
              }, 800);
            }}
          />
        </div>
        <TutorialTooltip
          targetNodeId="tutorial-goal"
          positions={positions}
          panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
          color={NODE_TYPES.action.color}
          canvasRef={canvasRef}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "#212529", marginBottom: 8 }}>
            What will you actually do?
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "#495057", margin: 0 }}>
            Actions are concrete steps that move you toward your goal, resolve constraints, or respond to considerations.
          </p>
          <p style={{ fontSize: 12, color: "#ADB5BD", margin: "8px 0 0 0" }}>
            Click the dashed node to reveal it.
          </p>
        </TutorialTooltip>
      </>
    ) : (
      <TutorialTooltip
        targetNodeId="tutorial-action-1"
        positions={positions}
        panOffset={{ x: pan?.x ?? 0, y: pan?.y ?? 0 }}
        color={NODE_TYPES.action.color}
        canvasRef={canvasRef}
      >
        <div style={{ fontSize: 13, color: "#495057", lineHeight: 1.5 }}>
          Watch the map come together...
        </div>
      </TutorialTooltip>
    )}
  </>
)}
```

**Step 2: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: add tutorial stage 5 (actions) with staggered auto-reveal"
```

---

### Task 9: Tutorial Stage 6 — Completion

**Files:**
- Modify: `src/ChallengeMap.tsx` (add completion stage)

**Step 1: Add stage 6 rendering**

Add after the stage 5 block:

```typescript
{tutorialStep === 6 && (
  <div style={{
    position: "absolute", bottom: 60, right: 320, maxWidth: 320,
    background: "#FFFFFF", borderRadius: 10, padding: "20px 24px",
    borderLeft: `4px solid ${NODE_TYPES.goal.color}`,
    boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 50,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  }}>
    <div style={{ fontSize: 20, marginBottom: 8 }}>&#127881;</div>
    <div style={{ fontSize: 16, fontWeight: 700, color: "#212529", marginBottom: 8 }}>
      You just decomposed a goal.
    </div>
    <p style={{ fontSize: 13, lineHeight: 1.5, color: "#495057", margin: "0 0 16px 0" }}>
      Constraints, considerations, and actions — that's the whole system. Now try it with something you actually care about.
    </p>
    <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
      <button
        onClick={() => {
          localStorage.setItem('deeproot-tutorial-completed', 'true');
          setNodes([]);
          setEdges([]);
          setTutorialRevealed(new Set());
          setEnableHashSave(true);
          setSelectedId(null);
          setTutorialStep(-1);
        }}
        style={{
          background: NODE_TYPES.goal.color, color: "#FFFFFF", border: "none",
          padding: "10px 20px", borderRadius: 6, fontSize: 14, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Start my own map →
      </button>
      <button
        onClick={() => {
          localStorage.setItem('deeproot-tutorial-completed', 'true');
          setTutorialStep(-1);
          // Don't enable hash save yet — wait for first user edit
        }}
        style={{
          background: "none", border: "1px solid #DEE2E6", color: "#495057",
          padding: "8px 20px", borderRadius: 6, fontSize: 13,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Keep exploring this one
      </button>
    </div>
  </div>
)}
```

**Step 2: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: add tutorial stage 6 (completion) with map reset option"
```

---

### Task 10: Hide Sidebar and Header Actions During Tutorial

**Files:**
- Modify: `src/ChallengeMap.tsx` (conditional rendering for sidebar and header)

**Step 1: Conditionally hide sidebar**

Wrap the sidebar div (currently at ~line 450) with a tutorial check. Replace the sidebar section:

The sidebar div that starts with `<div style={{ width: 300, borderLeft:...` should be wrapped:

```typescript
{tutorialStep === -1 && (
  <div style={{ width: 300, borderLeft: "1px solid #E9ECEF", ... }}>
    {/* ... existing sidebar content ... */}
  </div>
)}
```

**Step 2: Conditionally hide Export PNG button during tutorial**

In the header, wrap the Export PNG button:

```typescript
{tutorialStep === -1 && (
  <button onClick={exportPng} style={{...}}>Export PNG</button>
)}
```

**Step 3: Disable "+ dep" button on nodes during tutorial**

In the `NodeCard` component, add a `tutorialActive` prop:

Add to NodeCard props: `tutorialActive?: boolean`

In the "+ dep" button rendering, add:

```typescript
style={{ ..., display: tutorialActive ? 'none' : undefined }}
```

Pass `tutorialActive={tutorialStep >= 1 && tutorialStep <= 6}` to each NodeCard.

Actually, since NodeCard doesn't have access to tutorialStep, we need to pass it down. Add `hideDep?: boolean` prop to NodeCard and pass `hideDep={tutorialStep >= 1 && tutorialStep <= 6}` from the map rendering.

**Step 4: Also hide the hint text when tutorial active**

The hint "Click '+ dep' on a node..." at ~line 442 should also be hidden during tutorial:

```typescript
{tutorialStep === -1 && nodes.length === 1 && edges.length === 0 && (
```

Wait, we changed the default to empty nodes for tutorial, so this condition should use a different check. Actually, since this hint is for non-tutorial users, just gate it on `tutorialStep === -1`.

**Step 5: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: hide sidebar and controls during tutorial stages"
```

---

### Task 11: Enable Hash Save After First User Edit (Post-Tutorial)

**Files:**
- Modify: `src/ChallengeMap.tsx` (update addChild, updateNode, deleteNode)

**Step 1: Enable hash save on first user edit**

In the `addChild`, `updateNode`, and `deleteNode` callbacks, add a check to enable hash saving if it's not already enabled:

Wrap each callback to also flip `enableHashSave`:

For `addChild`:
```typescript
const addChild = useCallback((parentId: string) => {
  if (!enableHashSave) setEnableHashSave(true);
  // ... existing logic
}, [enableHashSave]);
```

Do the same for `updateNode` and `deleteNode`.

**Step 2: Handle "Start my own map" path**

When user clicks "Start my own map" in stage 6, hash save is already enabled (set in the onClick handler). When they click "Keep exploring this one," hash save stays disabled until the first edit. Verify the onClick handlers in Task 9 already handle this correctly (they do — "Start my own map" calls `setEnableHashSave(true)`, "Keep exploring" does not).

**Step 3: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: enable hash persistence after first user edit"
```

---

### Task 12: Replay Tutorial Button

**Files:**
- Modify: `src/ChallengeMap.tsx` (add replay button to header)

**Step 1: Add replay button in header**

In the header, after the Export PNG button (when tutorial is not active), add:

```typescript
<button
  onClick={() => {
    localStorage.removeItem('deeproot-tutorial-completed');
    window.location.hash = '';
    window.location.reload();
  }}
  title="Replay tutorial"
  style={{
    fontSize: 13, padding: "4px 8px", background: "none",
    border: "1px solid #DEE2E6", borderRadius: 3, color: "#ADB5BD",
    cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
  }}
>
  ?
</button>
```

Only show when `tutorialStep === -1`.

**Step 2: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: add replay tutorial button in header"
```

---

### Task 13: Remove Old Default Node

**Files:**
- Modify: `src/ChallengeMap.tsx` (clean up DEFAULT_NODES)

**Step 1: Remove the airsports default**

The `DEFAULT_NODES` constant at line 4 is no longer used since we initialize with an empty array. Remove it entirely or keep it as an empty array fallback:

```typescript
const DEFAULT_NODES: MapNode[] = [];
```

**Step 2: Verify build**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: remove hardcoded airsports default node"
```

---

### Task 14: Manual QA and Polish

**Files:**
- Modify: `src/ChallengeMap.tsx` (bug fixes as needed)

**Step 1: Start dev server and test**

Run: `cd /Users/alexprice/conductor/workspaces/challange-map/palenque && npx vite --port 5174`

Test the following flow:
1. Open http://localhost:5174 — should see welcome screen
2. Click "Start the climb" — goal node appears with tooltip
3. Click "Continue" — constraint placeholder and tooltip appear
4. Click the dashed placeholder — constraint node reveals, tooltip updates
5. Click "Continue" — consideration placeholder appears
6. Click placeholder — consideration reveals
7. Click "Continue" — action placeholder appears
8. Click placeholder — first action appears, then two more auto-appear staggered
9. Completion card appears — click "Start my own map"
10. Canvas clears, sidebar and controls are back
11. Add a node — verify URL hash updates
12. Reload page — verify tutorial doesn't show again
13. Click "?" in header — verify tutorial replays

**Step 2: Fix any issues found**

Address layout, positioning, or interaction issues discovered during testing.

**Step 3: Final commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "fix: tutorial polish and bug fixes from QA"
```
