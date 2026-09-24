import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, RefreshCw } from "lucide-react";
import { api } from "./api";
import type { PortfolioData } from "./types";
import { Portfolio } from "./components/Portfolio";
import { Studio } from "./components/Studio";
export default function App() {
  const [page, setPage] = useState(
    location.pathname.startsWith("/studio") ? "studio" : "portfolio",
  );
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const studioDirty = useRef(false);
  useEffect(() => {
    const pop = () => {
      const next = location.pathname.startsWith("/studio")
        ? "studio"
        : "portfolio";
      if (studioDirty.current && next === "portfolio") {
        history.pushState({}, "", "/studio");
        window.dispatchEvent(new Event("portfolio:request-leave"));
        return;
      }
      setPage(next);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (page === "portfolio")
      api<PortfolioData>("/portfolio")
        .then(setData)
        .catch((e) => setError(e.message));
  }, [page, retry]);
  function navigate(to: string) {
    history.pushState({}, "", to);
    setPage(to === "/studio" ? "studio" : "portfolio");
    window.scrollTo(0, 0);
  }
  if (page === "studio")
    return (
      <Studio
        onView={() => navigate("/")}
        onDirtyChange={(value) => {
          studioDirty.current = value;
        }}
      />
    );
  if (error)
    return (
      <main className="app-loading">
        <div className="brand-mark">a.</div>
        <h1>A little interruption.</h1>
        <p>{error}</p>
        <button
          className="btn btn-primary"
          onClick={() => {
            setError("");
            setRetry((x) => x + 1);
          }}
        >
          <RefreshCw size={16} /> Try again
        </button>
        <button className="btn btn-ghost" onClick={() => navigate("/studio")}>
          Open studio <ArrowRight size={16} />
        </button>
      </main>
    );
  if (!data)
    return (
      <main className="app-loading">
        <div className="brand-mark">a.</div>
        <LoaderCircle className="spin" />
        <p>Making an introduction…</p>
      </main>
    );
  return <Portfolio data={data} onEdit={() => navigate("/studio")} />;
}
