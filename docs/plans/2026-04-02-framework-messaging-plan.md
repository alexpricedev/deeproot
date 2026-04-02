# Framework Messaging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a standalone essay page explaining Constraint Cascading and lightly update the welcome overlay to reference the framework.

**Architecture:** Add a simple hash-based route (`#about`) that renders a new `FrameworkEssay` component. The main `ChallengeMap` component remains unchanged except for the welcome overlay text. App.tsx reads the hash to decide which view to show.

**Tech Stack:** React, TypeScript, Vite (existing stack, no new dependencies)

---

### Task 1: Create the FrameworkEssay component

**Files:**
- Create: `src/FrameworkEssay.tsx`

**Step 1: Create the essay component with placeholder structure**

Create `src/FrameworkEssay.tsx` with the full essay content. The component is a styled, readable long-form page with a link back to the app.

```tsx
export default function FrameworkEssay() {
  return (
    <div style={{
      maxWidth: 640,
      margin: "0 auto",
      padding: "60px 24px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#212529",
      lineHeight: 1.7,
    }}>
      <a
        href="/"
        style={{
          fontSize: 12,
          color: "#868E96",
          textDecoration: "none",
          fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        DEEPROOT
      </a>

      <h1 style={{
        fontSize: 28,
        fontWeight: 600,
        marginTop: 24,
        marginBottom: 8,
        letterSpacing: "-0.02em",
        lineHeight: 1.3,
      }}>
        Constraint Cascading
      </h1>
      <p style={{ fontSize: 16, color: "#868E96", marginBottom: 40 }}>
        Organising life around hard things
      </p>

      {/* Section 1: The Failed Session */}
      <section style={{ marginBottom: 36 }}>
        <p style={{ fontSize: 16, marginBottom: 16 }}>
          {/* ~200 words. Alex writes this section — a specific day he couldn't fly. */}
          {/* The frustration of wanting to do the hard thing and watching the day slip. */}
          {/* Ends with: "I started asking why." */}
        </p>
        <p style={P}>
          [PLACEHOLDER: The Failed Session — Alex to write from personal experience]
        </p>
      </section>

      {/* Section 2: The First Cascade */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={H2}>The first cascade</h2>
        <p style={P}>
          [PLACEHOLDER: The First Cascade — walk backward from the failure, 3-4 layers deep. Name "constraint cascading" here.]
        </p>
      </section>

      {/* Section 3: The Framework */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={H2}>The framework</h2>
        <p style={P}>
          [PLACEHOLDER: Three core ideas — hard things at the top, recursive constraint mapping, permission to prune.]
        </p>
      </section>

      {/* Section 4: The Lineage */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={H2}>What this connects to</h2>
        <p style={P}>
          [PLACEHOLDER: Wardley Mapping, Theory of Constraints, HTA, Essentialism. What's different.]
        </p>
      </section>

      {/* Section 5: How to Build Your Own */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={H2}>How to build your own</h2>
        <p style={P}>
          [PLACEHOLDER: Start from failures. Sweep categories. Accept incompleteness. One line about Deeproot at the end.]
        </p>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid #DEE2E6", margin: "48px 0 24px" }} />
      <p style={{ fontSize: 14, color: "#868E96" }}>
        I built{" "}
        <a href="/" style={{ color: "#495057", textDecoration: "underline" }}>
          Deeproot
        </a>{" "}
        to make this visual.
      </p>
    </div>
  );
}

const P: React.CSSProperties = {
  fontSize: 16,
  marginBottom: 16,
};

const H2: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  marginBottom: 12,
  letterSpacing: "-0.01em",
};
```

Note: The essay sections contain placeholders. Alex will write the actual essay content — the component provides the structure, styling, and layout. The placeholder text makes it clear what each section needs.

**Step 2: Commit**

```bash
git add src/FrameworkEssay.tsx
git commit -m "feat: add FrameworkEssay component with placeholder structure"
```

---

### Task 2: Add hash-based routing in App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update App.tsx to route between views**

Replace the current App.tsx with hash-based routing that shows the essay when `#about` is in the URL:

```tsx
import { useState, useEffect } from "react";
import ChallengeMap from "./ChallengeMap";
import FrameworkEssay from "./FrameworkEssay";

function App() {
  const [view, setView] = useState<"app" | "essay">(
    window.location.hash === "#about" ? "essay" : "app"
  );

  useEffect(() => {
    function onHashChange() {
      setView(window.location.hash === "#about" ? "essay" : "app");
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (view === "essay") return <FrameworkEssay />;
  return <ChallengeMap />;
}

export default App;
```

Important: ChallengeMap already uses the URL hash for state persistence (base64-encoded map data). The `#about` hash is a short, recognisable string that won't collide with base64-encoded data, so this routing is safe.

**Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add hash-based routing for essay page"
```

---

### Task 3: Update welcome overlay to reference Constraint Cascading

**Files:**
- Modify: `src/ChallengeMap.tsx:344-368`

**Step 1: Update the WelcomeOverlay text**

In the `WelcomeOverlay` function, update the heading and description paragraph:

Change the `<h1>` text from:
```
Every big goal is a system of smaller ones.
```
To:
```
Every big goal is a system of constraints.
```

Change the `<p>` text from:
```
Deeproot helps you break down ambitious goals into constraints,
considerations, and concrete actions. Let's walk through a quick
example together.
```
To:
```
Deeproot is built on Constraint Cascading — a method for organising
life around hard, meaningful pursuits.{" "}
<a href="#about" style={{ color: "#495057" }}>Read the backstory</a>
, or let's walk through a quick example together.
```

Note: The `<p>` tag on line 358 must be left as a `<p>` — the `<a>` inside it is valid HTML.

**Step 2: Commit**

```bash
git add src/ChallengeMap.tsx
git commit -m "feat: update welcome overlay to reference Constraint Cascading"
```

---

### Task 4: Verify everything works

**Step 1: Start dev server and verify**

```bash
cd /Users/alexprice/conductor/workspaces/challange-map/san-antonio
bun run dev
```

**Step 2: Manual verification checklist**

1. Open the app at `http://localhost:5173` — main ChallengeMap loads as normal
2. Navigate to `http://localhost:5173/#about` — essay page renders with placeholders
3. Click "DEEPROOT" link at top of essay — returns to main app
4. Clear localStorage and reload the main app — welcome overlay shows updated text with "Constraint Cascading" and "Read the backstory" link
5. Click "Read the backstory" link in welcome overlay — navigates to essay page
6. Verify that a shared map URL (with base64 hash) still loads correctly — not intercepted by the `#about` route

**Step 3: Commit any fixes if needed, then stop dev server**
