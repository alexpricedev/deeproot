import React from "react";

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const MONO_STACK =
  "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";

const paragraphStyle: React.CSSProperties = {
  fontSize: "1.05rem",
  lineHeight: 1.7,
  color: "#212529",
  margin: "0 0 1.25rem 0",
};

const h2Style: React.CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 600,
  color: "#212529",
  margin: "2.5rem 0 0.75rem 0",
  fontFamily: FONT_STACK,
};

export default function FrameworkEssay() {
  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "3rem 1.5rem 4rem",
        fontFamily: FONT_STACK,
        color: "#212529",
      }}
    >
      {/* Back link */}
      <a
        href="/"
        style={{
          fontFamily: MONO_STACK,
          fontSize: "0.8rem",
          letterSpacing: "0.08em",
          textDecoration: "none",
          color: "#868E96",
        }}
      >
        DEEPROOT
      </a>

      {/* Title block */}
      <h1
        style={{
          fontSize: "2.2rem",
          fontWeight: 700,
          color: "#212529",
          margin: "2rem 0 0.25rem 0",
          lineHeight: 1.2,
          fontFamily: FONT_STACK,
        }}
      >
        Constraint Cascading
      </h1>
      <p
        style={{
          fontSize: "1.15rem",
          color: "#868E96",
          margin: "0 0 2.5rem 0",
          fontStyle: "italic",
        }}
      >
        Organising life around hard things
      </p>

      {/* Section 1 */}
      <h2 style={h2Style}>The Failed Session</h2>
      <p style={paragraphStyle}>
        [~200 words] A specific day Alex couldn't fly. The weather was wrong, the
        schedule was wrong, the mental state was wrong. Everything lined up
        against it. This is the scene-setting moment — the frustration of a
        goal that keeps slipping, not because of laziness but because the
        constraints surrounding it are invisible and unmanaged. The feeling of
        trying to force something into a life that hasn't made room for it. How
        the failure wasn't really about flying at all — it was about every
        upstream decision that made the session impossible before it even began.
        The realisation that willpower doesn't fix structural problems.
      </p>

      {/* Section 2 */}
      <h2 style={h2Style}>The First Cascade</h2>
      <p style={paragraphStyle}>
        [~300 words] Walking backward from the failure. What actually prevented
        the session? Not one thing — a chain. Sleep the night before, which
        depended on the kids' bedtime, which depended on dinner timing, which
        depended on when work finished. Each constraint cascaded into the next.
        The act of naming this pattern: constraint cascading. Drawing it out for
        the first time — literally sketching the dependency chain on paper.
        Realising that the hard thing (flying) sits at the top, and everything
        below it either enables or blocks it. The "aha" moment: you don't solve
        the hard thing directly. You solve the things beneath it, and the hard
        thing becomes possible. This section introduces the metaphor and makes
        it tangible through the flying example before generalising.
      </p>

      {/* Section 3 */}
      <h2 style={h2Style}>The Framework</h2>
      <p style={paragraphStyle}>
        [~300 words] Three core ideas that make up constraint cascading:
      </p>
      <p style={paragraphStyle}>
        <strong>Hard things at the top.</strong> The thing you care about most —
        the goal that keeps failing — goes at the top of the map. Everything
        else exists in service of it. This reverses the usual approach of
        starting with what's easy or urgent.
      </p>
      <p style={paragraphStyle}>
        <strong>Recursive constraint mapping.</strong> For each node, ask: "What
        makes this hard?" Each answer becomes a new node below it. Keep going
        until you hit things you can actually control. The map builds itself
        through honest questioning. Dependencies emerge that you never
        consciously recognised.
      </p>
      <p style={paragraphStyle}>
        <strong>Permission to prune.</strong> Not every constraint is worth
        solving. Some branches of the map reveal that a goal has too many
        unresolvable dependencies — and that's valuable information. Pruning
        isn't failure; it's the framework working. You're trading guilt for
        clarity.
      </p>

      {/* Section 4 */}
      <h2 style={h2Style}>The Lineage</h2>
      <p style={paragraphStyle}>
        [~150 words] This didn't come from nowhere. Connections to Wardley
        Mapping (visual dependency mapping, situational awareness), Theory of
        Constraints (find the bottleneck, subordinate everything else to it),
        Hierarchical Task Analysis (breaking tasks into subtasks recursively),
        and Essentialism (the disciplined pursuit of less). Constraint cascading
        borrows from all of these but applies them to personal life rather than
        business strategy. A brief acknowledgement of the shoulders this stands
        on.
      </p>

      {/* Section 5 */}
      <h2 style={h2Style}>How to Build Your Own</h2>
      <p style={paragraphStyle}>
        [~250 words] Practical steps for the reader. Start from your failures —
        pick the thing that keeps not happening despite wanting it to. Sweep
        the categories of your life: work, health, family, finances, learning.
        For each failed goal, walk backward through the constraints. Use
        Deeproot or a piece of paper; the tool matters less than the honesty.
        Accept incompleteness — the map will never be finished, and that's the
        point. It's a living document that changes as your constraints change.
        The goal isn't a perfect map; it's the act of seeing your life as a
        system of dependencies rather than a list of disconnected todos.
      </p>

      {/* Footer */}
      <hr
        style={{
          border: "none",
          borderTop: "1px solid #DEE2E6",
          margin: "3rem 0 1.5rem 0",
        }}
      />
      <p
        style={{
          ...paragraphStyle,
          fontSize: "0.95rem",
          color: "#868E96",
        }}
      >
        I built{" "}
        <a
          href="/"
          style={{
            color: "#868E96",
            textDecoration: "underline",
          }}
        >
          Deeproot
        </a>{" "}
        to make this visual.
      </p>
    </div>
  );
}
