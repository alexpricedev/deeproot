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
