import { useState, useEffect } from "react";
import ChallengeMap from "./ChallengeMap";
import FrameworkEssay from "./FrameworkEssay";

function App() {
  const [view, setView] = useState<"app" | "essay">(
    window.location.pathname === "/constraint-cascading" ? "essay" : "app"
  );

  useEffect(() => {
    function onPopState() {
      setView(
        window.location.pathname === "/constraint-cascading" ? "essay" : "app"
      );
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (view === "essay") return <FrameworkEssay />;
  return <ChallengeMap />;
}

export default App;
