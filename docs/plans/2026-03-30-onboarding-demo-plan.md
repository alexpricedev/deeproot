# Onboarding Demo Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 6-node "Climb Mount Rainier" tutorial with a 14-node "Summit Mount Kilimanjaro" tree that showcases depth, breadth, and dependency insight via a "bloom" effect.

**Architecture:** All changes are in `src/ChallengeMap.tsx`. The tutorial is driven by `tutorialStep` (1-6) and `tutorialRevealed` Set. We keep the same 6-step structure but change the content, node IDs, and reveal logic. Step 5 becomes a cascade that adds 8 action nodes across 3 branches with staggered animation.

**Tech Stack:** React, TypeScript, inline styles (no CSS framework)

---

### Task 1: Update tutorial goal node and step 2 tooltip

**Files:**
- Modify: `src/ChallengeMap.tsx:1063-1065` (goal node creation in step 1 onStart)
- Modify: `src/ChallengeMap.tsx:1087-1088` (step 2 tooltip text)

**Step 1: Update the goal node label**

In the `WelcomeOverlay` `onStart` handler (~line 1063), change:
```typescript
label: "Climb Mount Rainier",
```
to:
```typescript
label: "Summit Mount Kilimanjaro",
```

**Step 2: Verify the step 2 tooltip still makes sense**

The existing text "This is your goal. The thing you want to achieve." is generic enough — no change needed.

**Step 3: Run the dev server and verify**

Run: `npm run dev`
Open browser, click "Start the climb", verify the goal node says "Summit Mount Kilimanjaro".

**Step 4: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: update tutorial goal to Summit Mount Kilimanjaro"
```

---

### Task 2: Update step 3 — two constraints with auto-reveal

**Files:**
- Modify: `src/ChallengeMap.tsx:737-740` (step 3 constraint creation in `handleAddChild`)
- Modify: `src/ChallengeMap.tsx:1106-1141` (step 3 tooltip JSX)

**Step 1: Update the constraint creation logic**

In `handleAddChild`, the step 3 block (~line 737-740) currently creates one constraint. Replace to create the first constraint on click, then auto-add the second after 500ms:

```typescript
if (tutorialStep === 3 && !tutorialRevealed.has("constraint")) {
  // First constraint — created by user click
  setNodes((prev) => [...prev, { id: "tutorial-constraint-1", label: "No high-altitude experience", type: "constraint", status: "open", notes: "" }]);
  setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-constraint-1" }]);
  setTutorialRevealed((prev) => new Set(prev).add("constraint"));
  // Second constraint — auto-appears after 500ms
  tutorialTimers.current.push(setTimeout(() => {
    setNodes((prev) => [...prev, { id: "tutorial-constraint-2", label: "Budget: $3,000\u20135,000", type: "constraint", status: "open", notes: "" }]);
    setEdges((prev) => [...prev, { from: "tutorial-goal", to: "tutorial-constraint-2" }]);
    setTutorialRevealed((prev) => new Set(prev).add("constraint-2"));
  }, 500));
}
```

**Step 2: Update step 3 tooltip text**

The "before reveal" tooltip (~line 1113) stays the same ("What's standing in your way?" + click + dep).

The "after reveal" tooltip (~line 1119-1139) targets `tutorial-constraint-1` and text should be:
```
<h4>Those are constraints.</h4>
<p>They block your goal until you deal with them.</p>
```

Wait for `constraint-2` to be revealed before showing the Continue button. Check `tutorialRevealed.has("constraint-2")`.

**Step 3: Update the `hideDep` logic on NodeCard**

The `hideDep` prop (~line 970) currently checks `node.id === "tutorial-goal"`. This still works since we only show "+dep" on the goal node during steps 3-5. No change needed here.

**Step 4: Verify in browser**

Click "+ dep" on step 3. First constraint "No high-altitude experience" appears. After 500ms, "Budget: $3,000–5,000" auto-appears. Continue button shows after both are visible.

**Step 5: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: tutorial step 3 adds two constraints with staggered reveal"
```

---

### Task 3: Update step 4 — consideration

**Files:**
- Modify: `src/ChallengeMap.tsx:741-743` (step 4 consideration creation in `handleAddChild`)
- Modify: `src/ChallengeMap.tsx:1144-1181` (step 4 tooltip JSX)

**Step 1: Update the consideration node**

In `handleAddChild`, step 4 block (~line 741-743), change:
```typescript
{ id: "tutorial-consideration", label: "Best season: July-Sept", type: "consideration", ... }
```
to:
```typescript
{ id: "tutorial-consideration", label: "Best summit window: Jan\u2013Mar", type: "consideration", status: "open", notes: "" }
```

**Step 2: Update tooltip target**

The tooltip targets `tutorial-consideration` — keep this the same. The text "Constraints block. Considerations inform." still works perfectly.

**Step 3: Verify in browser**

Step 4 creates "Best summit window: Jan–Mar" as a consideration. Tooltip appears next to it.

**Step 4: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: update tutorial consideration to Kilimanjaro summit window"
```

---

### Task 4: Update step 5 — bloom all 8 actions

This is the biggest change. Currently step 5 adds 3 actions. Now it adds 8 actions across 3 branches with staggered cascade.

**Files:**
- Modify: `src/ChallengeMap.tsx:745-758` (step 5 action creation in `handleAddChild`)
- Modify: `src/ChallengeMap.tsx:1183-1210` (step 5 tooltip JSX)

**Step 1: Replace the action creation logic**

In `handleAddChild`, replace the entire step 5 block with:

```typescript
} else if (tutorialStep === 5 && !tutorialRevealed.has("action")) {
  // Branch 1: "No high-altitude experience" actions
  setNodes((prev) => [...prev, { id: "tutorial-action-1", label: "Train cardio 3x/week for 3 months", type: "action", status: "open", notes: "" }]);
  setEdges((prev) => [...prev, { from: "tutorial-constraint-1", to: "tutorial-action-1" }]);
  setTutorialRevealed((prev) => new Set(prev).add("action"));

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
    // Advance to step 6 after last action
    tutorialTimers.current.push(setTimeout(() => setTutorialStep(6), 600));
  }, 2100));
}
```

**Step 2: Update step 5 tooltip text**

The "before reveal" tooltip should still say "What will you actually do?" and prompt to click "+ dep".

The "after reveal" tooltip should say:
```
<p>Watch the map come alive...</p>
```

**Step 3: Add auto-pan to fit the full tree during bloom**

After the bloom starts, the tree will be much wider than the viewport. Add a `useEffect` that auto-pans when tutorial step 5 has the "action" reveal and the tree grows. This should happen in the existing centering `useEffect` (~line 667-678).

Update the centering effect to detect when we're in tutorial step 5/6 with many nodes, and zoom-to-fit:

```typescript
// Inside the pan-centering useEffect, add a branch:
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
```

Note: This needs careful integration with the existing effect to avoid infinite loops. Only trigger when node count changes during tutorial.

**Step 4: Verify in browser**

Click "+ dep" on step 5. Watch 8 actions cascade in branch-by-branch with 300ms spacing. Tree should auto-center. Step 6 appears after the last action.

**Step 5: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: tutorial step 5 blooms 8 actions across 3 branches"
```

---

### Task 5: Update step 6 completion and cleanup

**Files:**
- Modify: `src/ChallengeMap.tsx:1212-1285` (step 6 completion modal)

**Step 1: Update the completion text**

The current text "You just decomposed a goal" works well. But update the body to reference the larger tree:

```
Constraints, considerations, and actions — that's the whole system.
One goal became 14 nodes across three branches. Now try it with
something you actually care about.
```

**Step 2: Verify the cleanup on "Start my own map" clears all 14 nodes**

The existing cleanup code (~line 1243-1247) does `setNodes([])`, `setEdges([])`, `setTutorialRevealed(new Set())` — this already handles any number of nodes. No change needed.

**Step 3: Verify full tutorial flow end-to-end**

Walk through all 6 steps in the browser. Verify:
- Step 1: Welcome overlay
- Step 2: "Summit Mount Kilimanjaro" goal appears
- Step 3: Click +dep → "No high-altitude experience" → 500ms → "Budget: $3,000–5,000"
- Step 4: Click +dep → "Best summit window: Jan–Mar"
- Step 5: Click +dep → 8 actions bloom in branch by branch, tree auto-centers
- Step 6: Completion modal with updated text

**Step 4: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: update tutorial completion text for larger tree"
```

---

### Task 6: Fix hideDep logic for new node IDs

**Files:**
- Modify: `src/ChallengeMap.tsx:970` (hideDep prop on NodeCard)

**Step 1: Review current hideDep logic**

Current logic (~line 970):
```
hideDep={tutorialStep >= 1 && tutorialStep <= 6 && !(node.id === "tutorial-goal" && tutorialStep >= 3 && tutorialStep <= 5 && !tutorialRevealed.has(tutorialStep === 3 ? "constraint" : tutorialStep === 4 ? "consideration" : "action"))}
```

This hides all "+dep" buttons during the tutorial except on the goal node at the right steps. This still works correctly since:
- Steps 3, 4, 5 all require clicking "+dep" on the goal node
- The tutorialRevealed keys ("constraint", "consideration", "action") match what we set

No change needed — verify it works.

**Step 2: Verify in browser**

During steps 3-5, only the goal node should show the "+dep" button, and only when the user hasn't yet clicked it for that step. All other nodes (constraints, consideration) should hide their "+dep" buttons.

**Step 3: Commit (if changes were needed)**

Only commit if changes were made.
