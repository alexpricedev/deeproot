# Save & Share Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace auto-save-to-hash with a manual Save button, save modal with shareable URL, localStorage resume prompt, and tutorial updates.

**Architecture:** Remove the `useEffect` that auto-saves to the URL hash on every state change. Add a Save button to the header toolbar that encodes state into the hash, stores the URL in localStorage, and shows a modal. On bare load (no hash), check localStorage for a previous save and prompt the user. Update the "+ New Deeproot" button to append `?new=1` to skip the prompt. Add a tutorial step about saving.

**Tech Stack:** React (existing), localStorage, window.history API, Clipboard API

---

### Task 1: Remove auto-save and add `generateShareUrl` helper

**Files:**
- Modify: `src/ChallengeMap.tsx:4-9` (saveToHash function)
- Modify: `src/ChallengeMap.tsx:501-505` (useEffect auto-save)
- Modify: `src/ChallengeMap.tsx:601-617` (enableHashSave toggles in addChild/updateNode/deleteNode)

**Step 1: Create `generateShareUrl` helper**

Replace the existing `saveToHash` function (lines 4-9) with a function that returns a full URL string instead of mutating the browser URL:

```typescript
function generateShareUrl(nodes: MapNode[], edges: MapEdge[]): string {
  const data = JSON.stringify({ nodes, edges });
  const encoded = btoa(encodeURIComponent(data));
  return window.location.origin + window.location.pathname + "#" + encoded;
}
```

**Step 2: Remove the auto-save `useEffect`**

Delete lines 501-505:

```typescript
// DELETE THIS ENTIRE BLOCK
useEffect(() => {
  if (enableHashSave) {
    saveToHash(nodes, edges);
  }
}, [nodes, edges, enableHashSave]);
```

**Step 3: Remove `enableHashSave` state and all references**

Delete or simplify these:
- Line 477: `const [enableHashSave, setEnableHashSave] = useState<boolean>(initial !== null);`
- Line 478-479: `enableHashSaveRef` and its `.current` assignment
- Line 602: `if (!enableHashSaveRef.current) setEnableHashSave(true);` in `addChild`
- Line 612: `if (!enableHashSaveRef.current) setEnableHashSave(true);` in `updateNode`
- Line 617: `if (!enableHashSaveRef.current) setEnableHashSave(true);` in `deleteNode`
- Line 909: `if (!enableHashSaveRef.current) setEnableHashSave(true);` in "Create your first goal"
- Line 973: `setEnableHashSave(true);` in tutorial skip
- Line 1140: `setEnableHashSave(true);` in tutorial complete

**Step 4: Remove the bottom-right "Progress saved in URL" hint**

Delete lines 917-921:

```typescript
// DELETE THIS
{tutorialStep === -1 && nodes.length > 0 && (
  <div style={{ position: "absolute", bottom: 8, right: 16, fontSize: 10, color: "#868E96", zIndex: 20 }}>
    Progress saved in URL — bookmark or share anytime
  </div>
)}
```

**Step 5: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "Remove auto-save to URL hash, add generateShareUrl helper"
```

---

### Task 2: Add Save Modal component

**Files:**
- Modify: `src/ChallengeMap.tsx` (add SaveModal component before `ChallengeMap` export)

**Step 1: Add the SaveModal component**

Add this component above the `export default function ChallengeMap()` line. It should:
- Accept props: `url: string`, `onClose: () => void`
- Show a modal overlay (centered, semi-transparent backdrop)
- Display heading: "Deeproot saved"
- Show the URL in a readonly input field (auto-selected on focus)
- "Copy link" button that uses `navigator.clipboard.writeText(url)` with "Copied!" feedback
- Explanatory text: "Your Deeproot is saved in this URL. Every save creates a unique link — share it freely. Others can remix or branch from your map without affecting your version. No account needed."
- Close button (X) and close on backdrop click

```typescript
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
```

**Step 2: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "Add SaveModal component"
```

---

### Task 3: Add Save button to header and wire up modal

**Files:**
- Modify: `src/ChallengeMap.tsx` (ChallengeMap component — state + header buttons)

**Step 1: Add modal state**

Inside the `ChallengeMap` component, add state for the save modal:

```typescript
const [saveModalUrl, setSaveModalUrl] = useState<string | null>(null);
```

**Step 2: Add save handler**

```typescript
const handleSave = useCallback(() => {
  const url = generateShareUrl(nodes, edges);
  window.history.replaceState(null, "", "#" + url.split("#")[1]);
  localStorage.setItem("deeproot-last-save", url);
  setSaveModalUrl(url);
}, [nodes, edges]);
```

**Step 3: Add Save button to header**

In the header toolbar (around line 743), add a Save button alongside the existing buttons. Place it before "Export PNG". Only show when `tutorialStep === -1` and `nodes.length > 0`:

```typescript
{tutorialStep === -1 && nodes.length > 0 && (
  <button onClick={handleSave}
    style={{ fontSize: 10, padding: "4px 10px", background: "#212529", border: "1px solid #212529", borderRadius: 3, color: "#FFFFFF", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
    Save
  </button>
)}
```

**Step 4: Render the modal**

At the end of the component's return, just before the closing `</div>`, render the modal conditionally:

```typescript
{saveModalUrl && <SaveModal url={saveModalUrl} onClose={() => setSaveModalUrl(null)} />}
```

**Step 5: Update "+ New Deeproot" button**

Change the existing "+ New Deeproot" button (line 754) to append `?new=1`:

```typescript
onClick={() => { window.open(window.location.origin + window.location.pathname + "?new=1", "_blank"); }}
```

**Step 6: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "Add Save button and wire up save modal"
```

---

### Task 4: Add resume prompt on bare load

**Files:**
- Modify: `src/ChallengeMap.tsx` (add ResumePrompt component + load logic)

**Step 1: Add ResumePrompt component**

Add above the `ChallengeMap` export. It should:
- Accept props: `onLoad: () => void`, `onNew: () => void`
- Show a centered overlay (similar style to WelcomeOverlay)
- Text: "Welcome back" + "We found a previous Deeproot. Want to pick up where you left off?"
- Two buttons: "Load previous map" and "Start fresh"

```typescript
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
```

**Step 2: Add resume logic to ChallengeMap**

At the top of the `ChallengeMap` component, add logic to detect the `?new=1` param and check localStorage:

```typescript
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
```

**Step 3: Render the ResumePrompt**

Render it when `showResume` is true, before the tutorial/canvas. Place it alongside the tutorial overlays (around the tutorialStep === 1 area):

```typescript
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
```

**Step 4: Suppress tutorial when resume prompt is showing**

The tutorial should not start while the resume prompt is visible. Modify the `tutorialStep` initial state to check for this — or simply render the resume prompt on top (higher z-index) which already blocks interaction. The current z-index of 50 handles this.

**Step 5: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "Add resume prompt for returning users with localStorage save"
```

---

### Task 5: Update tutorial with saving explanation

**Files:**
- Modify: `src/ChallengeMap.tsx` (tutorial step 6 — completion overlay)

**Step 1: Add saving explanation to tutorial completion**

In the tutorial step 6 completion overlay (around line 1127), add text about saving between the existing paragraph and the "Start my own map" button:

```typescript
<p style={{ margin: "0 0 20px 0", fontSize: 13, color: "#495057", lineHeight: 1.6 }}>
  When you're ready, hit <strong>Save</strong> to get a unique link for your map.
  Share it with anyone — they can remix your map without changing yours.
  No account needed. Save as many different maps as you want.
</p>
```

This goes after the existing paragraph ("Constraints, considerations, and actions...") and before the "Start my own map" button.

**Step 2: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "Add saving explanation to tutorial completion step"
```

---

### Task 6: Verify and clean up

**Files:**
- Modify: `src/ChallengeMap.tsx` (any remaining cleanup)

**Step 1: Run the dev server and manually verify**

```bash
cd /Users/alexprice/conductor/workspaces/challange-map/bordeaux && bun run dev
```

Verify:
- Fresh load (no hash, no localStorage): tutorial starts normally
- Tutorial completion mentions saving
- Creating nodes and clicking Save shows modal with URL
- Copy button works
- Closing modal, making changes, saving again shows different URL
- Closing tab, reopening bare URL shows resume prompt
- "Load previous map" navigates to saved URL and loads state
- "Start fresh" dismisses prompt, shows tutorial or blank canvas
- "+ New Deeproot" opens new tab without resume prompt
- Loading a hash URL directly skips resume prompt and loads data

**Step 2: Build check**

```bash
cd /Users/alexprice/conductor/workspaces/challange-map/bordeaux && bun run build
```

**Step 3: Final commit if any cleanup needed**

```bash
git add src/ChallengeMap.tsx
git commit -m "Clean up save & share implementation"
```
