import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Palette,
  Plus,
  Rocket,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { api, downloadJson, uid } from "../api";
import type { Item, PortfolioData, Section, StudioState } from "../types";
import { portfolioSchema } from "../../shared/schema.js";
import { Portfolio } from "./Portfolio";
import "./Studio.css";

type Page =
  | "overview"
  | "profile"
  | "sections"
  | "appearance"
  | "sources"
  | "history";
type Confirm = {
  title: string;
  description: string;
  label: string;
  action: () => void;
  danger?: boolean;
};
const pages = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "profile", label: "Your profile", icon: UserRound },
  { id: "sections", label: "Content & sections", icon: Layers3 },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "sources", label: "Source library", icon: FolderOpen },
  { id: "history", label: "Version history", icon: History },
] as const;
const sectionTypes = [
  {
    value: "projects",
    label: "Projects",
    hint: "Work, experiments, and case studies",
  },
  {
    value: "experience",
    label: "Experience",
    hint: "Your professional journey",
  },
  {
    value: "education",
    label: "Education",
    hint: "Degrees, courses, and learning",
  },
  {
    value: "skills",
    label: "Skills",
    hint: "Group your tools and capabilities",
  },
  {
    value: "custom",
    label: "Custom section",
    hint: "Awards, writing, volunteering, anything",
  },
] as const;
const formatDate = (date: string | null) =>
  date
    ? new Date(date).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not published yet";

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="studio-modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Studio({
  onView,
  onDirtyChange,
}: {
  onView: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [session, setSession] = useState<{
    authenticated: boolean;
    localMode: boolean;
  } | null>(null);
  const [state, setState] = useState<StudioState | null>(null);
  const [draft, setDraft] = useState<PortfolioData | null>(null);
  const [page, setPage] = useState<Page>("overview");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [preview, setPreview] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selected, setSelected] = useState("work");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [addSection, setAddSection] = useState(false);
  const [password, setPassword] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [sourceSearch, setSourceSearch] = useState("");

  async function load() {
    const result = await api<StudioState>("/studio");
    setState(result);
    setDraft(result.draft);
    setDirty(false);
    setError("");
  }
  useEffect(() => {
    api<{ authenticated: boolean; localMode: boolean }>("/session")
      .then(async (s) => {
        setSession(s);
        if (s.authenticated) await load();
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    document.title = "Portfolio Studio — Asadkhon Rasulov";
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const requestLeave = () => leave();
    window.addEventListener("portfolio:request-leave", requestLeave);
    return () =>
      window.removeEventListener("portfolio:request-leave", requestLeave);
  }, [dirty, onView]);
  function change(update: (data: PortfolioData) => PortfolioData) {
    setDraft((current) => (current ? update(current) : current));
    setDirty(true);
  }
  function updateProfile(key: keyof PortfolioData["profile"], value: string) {
    change((d) => ({ ...d, profile: { ...d.profile, [key]: value } }));
  }
  function updateSection(id: string, changes: Partial<Section>) {
    change((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === id ? { ...s, ...changes } : s)),
    }));
  }
  function updateItem(
    sectionId: string,
    itemId: string,
    changes: Partial<Item>,
  ) {
    change((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((i) =>
                i.id === itemId ? { ...i, ...changes } : i,
              ),
            }
          : s,
      ),
    }));
  }
  async function task(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    if (!draft || !state) throw new Error("Your workspace is still loading.");
    const parsed = portfolioSchema.safeParse(draft);
    if (!parsed.success)
      throw new Error(
        parsed.error.issues
          .map((i) => `${i.path.join(" → ")}: ${i.message}`)
          .slice(0, 3)
          .join(" · "),
      );
    const result = await api<StudioState>("/draft", {
      method: "PUT",
      body: JSON.stringify({
        portfolio: parsed.data,
        revision: state.revision,
      }),
    });
    setState(result);
    setDraft(result.draft);
    setDirty(false);
    return result;
  }
  function publish() {
    task(async () => {
      const current = dirty ? await saveDraft() : state;
      if (!current) return;
      const result = await api<StudioState>("/publish", {
        method: "POST",
        body: JSON.stringify({ revision: current.revision }),
      });
      setState(result);
      setToast("Published. Your public portfolio is up to date.");
    });
  }
  function navigate(next: Page) {
    setPage(next);
    setMobileMenu(false);
    setError("");
    window.scrollTo(0, 0);
  }
  function leave() {
    if (dirty)
      setConfirm({
        title: "Save before you leave?",
        description:
          "You have unsaved edits. Save your draft to keep them, or leave and discard these changes.",
        label: "Leave without saving",
        danger: true,
        action: onView,
      });
    else onView();
  }
  function moveSection(index: number, direction: number) {
    change((d) => {
      const sections = [...d.sections];
      [sections[index], sections[index + direction]] = [
        sections[index + direction],
        sections[index],
      ];
      return { ...d, sections };
    });
  }
  function moveItem(section: Section, index: number, direction: number) {
    const items = [...section.items];
    [items[index], items[index + direction]] = [
      items[index + direction],
      items[index],
    ];
    updateSection(section.id, { items });
  }
  async function importFile(file: File) {
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Please use a JSON backup smaller than 2 MB.");
      const parsed = portfolioSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success)
        throw new Error(
          "This file is not a valid portfolio backup. Export a backup from this studio to see the format.",
        );
      setConfirm({
        title: "Import this portfolio?",
        description: `Replace your working draft with “${parsed.data.profile.name}”. Your published site stays as it is until you publish. Export your current draft first if you want to keep it.`,
        label: "Replace draft",
        action: () => {
          setDraft(parsed.data);
          setDirty(true);
          setSelected(parsed.data.sections[0]?.id || "");
          setToast("Imported into your draft. Review and save when ready.");
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import that file.");
    }
  }
  async function uploadSource(file: File) {
    await task(async () => {
      const form = new FormData();
      form.append("file", file);
      form.append("note", sourceNote);
      const result = await api<StudioState>("/sources", {
        method: "POST",
        body: form,
      });
      setState((previous) =>
        previous ? { ...previous, sources: result.sources } : previous,
      );
      setSourceNote("");
      setToast("Source added to your private library.");
    });
  }
  async function login(event: FormEvent) {
    event.preventDefault();
    await task(async () => {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      const result = await api<{ authenticated: boolean; localMode: boolean }>(
        "/session",
      );
      setSession(result);
      await load();
    });
  }
  const currentSection = draft?.sections.find((s) => s.id === selected);
  const reviewSection = draft?.sections.find((s) => s.id === "review-notes");
  const visibleSections =
    draft?.sections.filter(
      (s) => s.visible && s.items.some((i) => i.visible),
    ) || [];

  if (preview && draft)
    return (
      <Portfolio
        data={draft}
        preview
        onClosePreview={() => {
          setPreview(false);
          document.title = "Portfolio Studio — Asadkhon Rasulov";
        }}
      />
    );
  if (!session)
    return (
      <main className="app-loading">
        <div className="brand-mark">a.</div>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="btn btn-primary"
              onClick={() => location.reload()}
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>Opening your workspace…</p>
          </>
        )}
      </main>
    );
  if (!session.authenticated)
    return (
      <main className="login-page">
        <div className="login-intro">
          <a className="studio-wordmark" href="/">
            a<span>.</span>
          </a>
          <div>
            <span className="eyebrow">
              A LITTLE SPACE FOR YOUR NEXT CHAPTER
            </span>
            <h1>
              Your story.
              <br />
              Always evolving.
            </h1>
            <p>
              A home for everything you’ve built,
              <br />
              and everything that comes next.
            </p>
          </div>
          <span className="login-foot">PORTFOLIO STUDIO / 01</span>
        </div>
        <div className="login-form-wrap">
          <form onSubmit={login} className="login-form">
            <div className="login-lock">
              <LockKeyhole size={24} />
            </div>
            <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
            <h2>Welcome back.</h2>
            <p>Make yourself at home. Your next chapter starts here.</p>
            <Field label="Studio password">
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
              />
            </Field>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary login-submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  Open my studio <ArrowRight size={18} />
                </>
              )}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onView}>
              <ArrowLeft size={15} /> Back to portfolio
            </button>
          </form>
        </div>
      </main>
    );

  return (
    <div className="studio-shell">
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside
        id="studio-sidebar"
        className={`studio-sidebar ${mobileMenu ? "is-open" : ""}`}
      >
        <a
          className="studio-logo"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            leave();
          }}
        >
          <span className="brand-mark">a.</span>
          <span>
            Portfolio<span className="logo-studio">STUDIO</span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Studio navigation">
          {pages.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`sidebar-link ${page === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              {label}
              {id === "sources" && !!state?.sources.length && (
                <span className="nav-count" aria-hidden="true">
                  {state.sources.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="tiny-orbit">
            <Sparkles size={19} />
          </div>
          <strong>
            A work in progress.
            <br />
            Just like you.
          </strong>
          <p>Your portfolio can grow one small update at a time.</p>
        </div>
        <div className="sidebar-bottom">
          <button className="sidebar-link" onClick={leave}>
            <ArrowUpRight size={18} /> View public portfolio
          </button>
          <div className="owner-card">
            {draft?.profile.portrait ? (
              <img src={draft.profile.portrait} alt="" />
            ) : (
              <span className="owner-initial">A</span>
            )}
            <div>
              <strong>{draft?.profile.name || "Your portfolio"}</strong>
              <span>
                {session.localMode ? "Local workspace" : "Owner workspace"}
              </span>
            </div>
            {!session.localMode && (
              <button
                className="icon-btn"
                title="Sign out"
                aria-label="Sign out"
                onClick={() => {
                  const action = () =>
                    task(async () => {
                      await api("/logout", { method: "POST" });
                      setSession({ ...session, authenticated: false });
                      setDraft(null);
                      setState(null);
                      setDirty(false);
                    });
                  if (dirty)
                    setConfirm({
                      title: "Sign out with unsaved changes?",
                      description:
                        "Unsaved changes will be discarded. Save your draft first to keep them.",
                      label: "Sign out",
                      action,
                    });
                  else action();
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="studio-body">
        <header className="studio-topbar">
          <div className="studio-breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-expanded={mobileMenu}
              aria-controls="studio-sidebar"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{pages.find((p) => p.id === page)?.label}</strong>
          </div>
          <div className="studio-actions">
            <span className={`save-state ${dirty ? "unsaved" : ""}`}>
              <span />
              {busy ? "Working…" : dirty ? "Unsaved changes" : "Draft saved"}
            </span>
            <button
              className="btn btn-outline save-button"
              disabled={busy || !dirty}
              onClick={() =>
                task(async () => {
                  await saveDraft();
                  setToast("Draft saved. Your public site hasn’t changed.");
                })
              }
            >
              <Save size={15} />
              <span>Save draft</span>
            </button>
            <button
              className="btn btn-outline"
              disabled={!draft || busy}
              onClick={() => {
                setPreview(true);
                window.scrollTo(0, 0);
              }}
            >
              <Eye size={16} />
              <span>Preview</span>
            </button>
            <button
              className="btn btn-primary"
              disabled={!draft || busy}
              onClick={publish}
            >
              <Rocket size={16} />
              <span>Publish</span>
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <CircleHelp size={18} />
            <span>{error}</span>
            <button
              className="text-button"
              onClick={() => {
                if (dirty)
                  setConfirm({
                    title: "Reload saved draft?",
                    description:
                      "Your unsaved edits will be discarded and the latest saved draft will be loaded.",
                    label: "Reload draft",
                    action: () => task(load),
                  });
                else task(load);
              }}
            >
              Reload draft
            </button>
            <button
              className="icon-btn"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!draft || !state ? (
          <main className="app-loading">
            <LoaderCircle className="spin" />
            <p>Loading your story…</p>
          </main>
        ) : (
          <fieldset disabled={busy} className="studio-content-fieldset">
            <main className={`studio-content page-${page}`}>
              {page === "overview" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">MAKE IT YOURS</span>
                      <h1>A little more you.</h1>
                      <p>
                        Welcome to your studio,{" "}
                        {draft.profile.name.split(" ")[0]}. What’s your next
                        chapter?
                      </p>
                    </div>
                    <span className="workspace-tag">
                      <span />
                      {session.localMode
                        ? "LOCAL WORKSPACE"
                        : "PRIVATE WORKSPACE"}
                    </span>
                  </div>
                  <div className="overview-grid">
                    <section className="portfolio-preview-card">
                      <div className="preview-card-heading">
                        <span>
                          <span className="status-dot" /> YOUR PORTFOLIO
                        </span>
                        <button
                          className="icon-btn"
                          aria-label="Preview portfolio"
                          onClick={() => setPreview(true)}
                        >
                          <ArrowUpRight size={20} />
                        </button>
                      </div>
                      <div
                        className={`mini-portfolio mini-${draft.theme.accent} mini-${draft.theme.surface}`}
                      >
                        <div className="mini-navigation">
                          <strong>
                            {draft.profile.name.split(" ")[0].toLowerCase()}
                            <span>.</span>
                          </strong>
                          <span>Work &nbsp; About &nbsp; Contact</span>
                        </div>
                        <div className="mini-hero">
                          <div>
                            <span className="mini-eyebrow">
                              {draft.profile.role}
                            </span>
                            <h2>{draft.profile.headline}</h2>
                            <span className="mini-cta">
                              Explore my work <ArrowUpRight size={12} />
                            </span>
                          </div>
                          {draft.profile.portrait ? (
                            <img
                              src={draft.profile.portrait}
                              alt={`${draft.profile.name}'s portrait`}
                            />
                          ) : (
                            <div className="mini-placeholder">
                              {draft.profile.name[0]}
                            </div>
                          )}
                        </div>
                        <div className="mini-bottom">
                          <span>BUILT WITH CURIOSITY</span>
                          <span>↘</span>
                        </div>
                      </div>
                      <div className="preview-card-footer">
                        <span>
                          <CheckCircle2 size={15} />
                          {state.publishedAt
                            ? `Last published ${formatDate(state.publishedAt)}`
                            : "Your starting portfolio is ready"}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setPreview(true)}
                        >
                          Take a look <ArrowRight size={15} />
                        </button>
                      </div>
                    </section>
                    <section className="next-chapter-card">
                      <div className="orbit-art" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <Sparkles size={38} />
                      </div>
                      <span className="eyebrow">SPACE TO GROW</span>
                      <h2>
                        You’re more than
                        <br />a one-page résumé.
                      </h2>
                      <p>
                        New project? A different direction? Add it. This space
                        is built to evolve with you.
                      </p>
                      <button
                        className="btn btn-dark"
                        onClick={() => {
                          navigate("sections");
                          if (draft.sections.length < 30) setAddSection(true);
                        }}
                      >
                        Add something new <Plus size={16} />
                      </button>
                    </section>
                  </div>
                  <div className="studio-stats">
                    <div>
                      <span>Public sections</span>
                      <strong>
                        {String(visibleSections.length).padStart(2, "0")}
                        <Layers3 size={21} />
                      </strong>
                      <small>Arranged your way</small>
                    </div>
                    <div>
                      <span>Projects in your story</span>
                      <strong>
                        {String(
                          draft.sections
                            .filter((s) => s.type === "projects")
                            .reduce(
                              (n, s) =>
                                n + s.items.filter((i) => i.visible).length,
                              0,
                            ),
                        ).padStart(2, "0")}
                        <FolderOpen size={21} />
                      </strong>
                      <small>Ideas turned into something real</small>
                    </div>
                    <div>
                      <span>Private source files</span>
                      <strong>
                        {String(state.sources.length).padStart(2, "0")}
                        <FileText size={21} />
                      </strong>
                      <small>Your reference shelf</small>
                    </div>
                  </div>
                  <div className="overview-bottom">
                    <section className="studio-panel review-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">A THOUGHTFUL START</span>
                          <h2>A few things to make it yours</h2>
                        </div>
                        <span className="count-pill">
                          {reviewSection?.items.length || 0}
                        </span>
                      </div>
                      <p className="panel-description">
                        Your documents started the story. A little context from
                        you will make it stronger.
                      </p>
                      {reviewSection?.items.length ? (
                        reviewSection.items.map((item, index) => (
                          <button
                            className="review-row"
                            key={item.id}
                            onClick={() => {
                              setSelected("review-notes");
                              setExpanded(item.id);
                              navigate("sections");
                            }}
                          >
                            <span className="review-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span>{item.title}</span>
                            <ArrowUpRight size={17} />
                          </button>
                        ))
                      ) : (
                        <div className="empty-small">
                          <CheckCircle2 size={22} />
                          <p>All clear. Your next chapter is yours to write.</p>
                        </div>
                      )}
                    </section>
                    <section className="studio-panel quick-panel">
                      <span className="eyebrow">
                        SMALL CHANGES, BIG DIFFERENCE
                      </span>
                      <h2>Pick up anywhere.</h2>
                      <button onClick={() => navigate("profile")}>
                        <span className="quick-icon">
                          <UserRound size={20} />
                        </span>
                        <span>
                          <strong>Refine your introduction</strong>
                          <small>Let your personality come through</small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                      <button onClick={() => navigate("appearance")}>
                        <span className="quick-icon">
                          <Palette size={20} />
                        </span>
                        <span>
                          <strong>Find your visual style</strong>
                          <small>Colors, type, and a little character</small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                      <button onClick={() => navigate("sources")}>
                        <span className="quick-icon">
                          <Upload size={20} />
                        </span>
                        <span>
                          <strong>Bring your story together</strong>
                          <small>Keep documents and notes close by</small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                      <div className="draft-note">
                        <LockKeyhole size={15} />
                        <p>Your edits stay in your draft until you publish.</p>
                      </div>
                    </section>
                  </div>
                </>
              )}
              {page === "profile" && (
                <>
                  <PageHeading
                    eyebrow="THE PERSON BEHIND THE WORK"
                    title="Hello, you."
                    description="An introduction in your own words. Leave anything blank that you’d rather keep to yourself."
                  />
                  <section className="studio-panel form-panel">
                    <div className="form-section-heading">
                      <UserRound size={20} />
                      <div>
                        <h2>The essentials</h2>
                        <p>Help someone get to know you in a few seconds.</p>
                      </div>
                    </div>
                    <div className="form-grid">
                      <Field label="Your name">
                        <input
                          value={draft.profile.name}
                          onChange={(e) =>
                            updateProfile("name", e.target.value)
                          }
                          maxLength={100}
                        />
                      </Field>
                      <Field
                        label="What you do"
                        hint="A role, a focus, or your own description."
                      >
                        <input
                          value={draft.profile.role}
                          onChange={(e) =>
                            updateProfile("role", e.target.value)
                          }
                          placeholder="Software developer & creative builder"
                          maxLength={300}
                        />
                      </Field>
                      <Field
                        label="Your headline"
                        className="full-width"
                        hint="Use a line break to give it a little rhythm."
                      >
                        <textarea
                          className="headline-input"
                          rows={2}
                          value={draft.profile.headline}
                          onChange={(e) =>
                            updateProfile("headline", e.target.value)
                          }
                          maxLength={300}
                        />
                      </Field>
                      <Field
                        label="A short introduction"
                        className="full-width"
                      >
                        <textarea
                          rows={3}
                          value={draft.profile.intro}
                          onChange={(e) =>
                            updateProfile("intro", e.target.value)
                          }
                          maxLength={12000}
                        />
                      </Field>
                      <Field
                        label="The longer story"
                        className="full-width"
                        hint="What connects your work, your interests, and where you’re going?"
                      >
                        <textarea
                          rows={6}
                          value={draft.profile.about}
                          onChange={(e) =>
                            updateProfile("about", e.target.value)
                          }
                          maxLength={12000}
                        />
                      </Field>
                      <Field
                        label="Location"
                        hint="Optional. A city or country is enough."
                      >
                        <input
                          value={draft.profile.location}
                          onChange={(e) =>
                            updateProfile("location", e.target.value)
                          }
                          placeholder="Where you’re based"
                          maxLength={300}
                        />
                      </Field>
                      <Field
                        label="Availability"
                        hint="Optional. Only appears when filled in."
                      >
                        <input
                          value={draft.profile.availability}
                          onChange={(e) =>
                            updateProfile("availability", e.target.value)
                          }
                          placeholder="Open to new opportunities"
                          maxLength={300}
                        />
                      </Field>
                    </div>
                  </section>
                  <section className="studio-panel form-panel">
                    <div className="form-section-heading">
                      <ArrowUpRight size={20} />
                      <div>
                        <h2>Make a connection</h2>
                        <p>
                          These details are visible on your published portfolio.
                        </p>
                      </div>
                    </div>
                    <div className="form-grid">
                      <Field label="Public email">
                        <input
                          type="email"
                          value={draft.profile.email}
                          onChange={(e) =>
                            updateProfile("email", e.target.value)
                          }
                          placeholder="you@example.com"
                        />
                      </Field>
                      <Field label="GitHub URL">
                        <input
                          type="url"
                          value={draft.profile.github}
                          onChange={(e) =>
                            updateProfile("github", e.target.value)
                          }
                          placeholder="https://github.com/you"
                        />
                      </Field>
                      <Field label="LinkedIn URL">
                        <input
                          type="url"
                          value={draft.profile.linkedin}
                          onChange={(e) =>
                            updateProfile("linkedin", e.target.value)
                          }
                          placeholder="https://linkedin.com/in/you"
                        />
                      </Field>
                      <Field
                        label="Portrait image"
                        hint="Use /portrait.jpg for your original photo, an https:// image URL, or leave blank."
                      >
                        <input
                          value={draft.profile.portrait}
                          onChange={(e) =>
                            updateProfile("portrait", e.target.value)
                          }
                          placeholder="https://…"
                        />
                      </Field>
                    </div>
                  </section>
                </>
              )}
              {page === "sections" && (
                <>
                  <PageHeading
                    eyebrow="EVERY PART OF YOUR STORY"
                    title="Room for everything."
                    description="Arrange your sections, add details, and choose what the world gets to see."
                    action={
                      <button
                        className="btn btn-primary"
                        disabled={draft.sections.length >= 30}
                        onClick={() => setAddSection(true)}
                      >
                        <Plus size={17} /> Add section
                      </button>
                    }
                  />
                  <div className="content-editor-grid">
                    <section className="section-list studio-panel">
                      <div className="section-list-heading">
                        <span className="eyebrow">YOUR SECTIONS</span>
                        <small>{draft.sections.length} / 30</small>
                      </div>
                      {draft.sections.map((section, index) => (
                        <div
                          key={section.id}
                          className={`section-list-row ${selected === section.id ? "selected" : ""}`}
                        >
                          <button
                            className="section-select"
                            onClick={() => {
                              setSelected(section.id);
                              setExpanded(null);
                            }}
                          >
                            <span className="section-list-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span>
                              <strong>{section.title}</strong>
                              <small>
                                {section.items.length}{" "}
                                {section.items.length === 1 ? "item" : "items"}{" "}
                                · {section.visible ? "Public" : "Hidden"}
                              </small>
                            </span>
                            {!section.visible && <EyeOff size={14} />}
                          </button>
                          <div className="reorder-controls">
                            <button
                              className="icon-btn"
                              disabled={index === 0}
                              aria-label={`Move ${section.title} up`}
                              onClick={() => moveSection(index, -1)}
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              className="icon-btn"
                              disabled={index === draft.sections.length - 1}
                              aria-label={`Move ${section.title} down`}
                              onClick={() => moveSection(index, 1)}
                            >
                              <ArrowDown size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        className="add-section-inline"
                        onClick={() => setAddSection(true)}
                        disabled={draft.sections.length >= 30}
                      >
                        <Plus size={16} /> Make room for more
                      </button>
                    </section>
                    <div className="section-editor">
                      {currentSection ? (
                        <>
                          <section className="studio-panel section-settings">
                            <div className="section-settings-top">
                              <span className="eyebrow">
                                {currentSection.type.toUpperCase()} SECTION
                              </span>
                              <button
                                className="icon-btn danger"
                                aria-label={`Delete ${currentSection.title}`}
                                onClick={() =>
                                  setConfirm({
                                    title: "Remove this section?",
                                    description: `“${currentSection.title}” and its ${currentSection.items.length} items will be removed from your draft. The published site won’t change until you publish.`,
                                    label: "Remove section",
                                    danger: true,
                                    action: () => {
                                      change((d) => ({
                                        ...d,
                                        sections: d.sections.filter(
                                          (s) => s.id !== currentSection.id,
                                        ),
                                      }));
                                      setSelected(
                                        draft.sections.find(
                                          (s) => s.id !== currentSection.id,
                                        )?.id || "",
                                      );
                                    },
                                  })
                                }
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>
                            <Field label="Section title">
                              <input
                                value={currentSection.title}
                                onChange={(e) =>
                                  updateSection(currentSection.id, {
                                    title: e.target.value,
                                  })
                                }
                                maxLength={100}
                              />
                            </Field>
                            <div className="section-visibility">
                              <div>
                                <strong>
                                  {currentSection.visible
                                    ? "Visible on your portfolio"
                                    : "Private in your studio"}
                                </strong>
                                <small>
                                  {currentSection.visible
                                    ? "Included when you publish."
                                    : "Keep rough ideas or notes here until they’re ready."}
                                </small>
                              </div>
                              <button
                                className={`switch ${currentSection.visible ? "on" : ""}`}
                                role="switch"
                                aria-checked={currentSection.visible}
                                aria-label={`Show ${currentSection.title} publicly`}
                                onClick={() =>
                                  updateSection(currentSection.id, {
                                    visible: !currentSection.visible,
                                  })
                                }
                              >
                                <span />
                              </button>
                            </div>
                          </section>
                          <div className="items-heading">
                            <h2>
                              {currentSection.type === "skills"
                                ? "Skill groups"
                                : "Your entries"}{" "}
                              <span>{currentSection.items.length}</span>
                            </h2>
                            <button
                              className="text-button"
                              disabled={currentSection.items.length >= 100}
                              onClick={() => {
                                const item: Item = {
                                  id: uid(),
                                  title:
                                    currentSection.type === "skills"
                                      ? "New skill group"
                                      : "Untitled entry",
                                  subtitle: "",
                                  period: "",
                                  description: "",
                                  tags: [],
                                  url: "",
                                  featured: false,
                                  visible: true,
                                };
                                updateSection(currentSection.id, {
                                  items: [...currentSection.items, item],
                                });
                                setExpanded(item.id);
                              }}
                            >
                              <Plus size={16} /> Add{" "}
                              {currentSection.type === "skills"
                                ? "group"
                                : "entry"}
                            </button>
                          </div>
                          {!currentSection.items.length && (
                            <EmptyState
                              icon={<Layers3 size={30} />}
                              title="An open page."
                              description="Add your first entry. There’s no right order to tell your story."
                            />
                          )}
                          {currentSection.items.map((item, index) => (
                            <article
                              key={item.id}
                              className={`entry-card ${expanded === item.id ? "expanded" : ""}`}
                            >
                              <div className="entry-header">
                                <button
                                  className="entry-expand"
                                  onClick={() =>
                                    setExpanded(
                                      expanded === item.id ? null : item.id,
                                    )
                                  }
                                >
                                  <span
                                    className={`entry-index ${!item.visible ? "entry-hidden" : ""}`}
                                  >
                                    {!item.visible ? (
                                      <EyeOff size={16} />
                                    ) : (
                                      String(index + 1).padStart(2, "0")
                                    )}
                                  </span>
                                  <span>
                                    <strong>
                                      {item.title || "Untitled entry"}
                                    </strong>
                                    <small>
                                      {item.subtitle ||
                                        item.tags.join(" · ") ||
                                        "Make it your own"}
                                    </small>
                                  </span>
                                  <ChevronDown
                                    size={18}
                                    className={
                                      expanded === item.id ? "rotate" : ""
                                    }
                                  />
                                </button>
                                <div className="entry-move">
                                  <button
                                    className="icon-btn"
                                    disabled={index === 0}
                                    aria-label={`Move ${item.title} up`}
                                    onClick={() =>
                                      moveItem(currentSection, index, -1)
                                    }
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                  <button
                                    className="icon-btn"
                                    disabled={
                                      index === currentSection.items.length - 1
                                    }
                                    aria-label={`Move ${item.title} down`}
                                    onClick={() =>
                                      moveItem(currentSection, index, 1)
                                    }
                                  >
                                    <ArrowDown size={14} />
                                  </button>
                                </div>
                              </div>
                              {expanded === item.id && (
                                <div className="entry-fields">
                                  <div className="form-grid">
                                    <Field
                                      label={
                                        currentSection.type === "skills"
                                          ? "Group name"
                                          : "Title"
                                      }
                                      className="full-width"
                                    >
                                      <input
                                        value={item.title}
                                        onChange={(e) =>
                                          updateItem(
                                            currentSection.id,
                                            item.id,
                                            { title: e.target.value },
                                          )
                                        }
                                        maxLength={300}
                                      />
                                    </Field>
                                    <Field label="Subtitle / organization">
                                      <input
                                        value={item.subtitle}
                                        onChange={(e) =>
                                          updateItem(
                                            currentSection.id,
                                            item.id,
                                            { subtitle: e.target.value },
                                          )
                                        }
                                        placeholder="A little context"
                                        maxLength={300}
                                      />
                                    </Field>
                                    <Field label="Dates / period">
                                      <input
                                        value={item.period}
                                        onChange={(e) =>
                                          updateItem(
                                            currentSection.id,
                                            item.id,
                                            { period: e.target.value },
                                          )
                                        }
                                        placeholder="2025 — Present"
                                        maxLength={300}
                                      />
                                    </Field>
                                    <Field
                                      label="Description"
                                      className="full-width"
                                    >
                                      <textarea
                                        rows={5}
                                        value={item.description}
                                        onChange={(e) =>
                                          updateItem(
                                            currentSection.id,
                                            item.id,
                                            { description: e.target.value },
                                          )
                                        }
                                        placeholder="What did you do, learn, or contribute?"
                                        maxLength={12000}
                                      />
                                    </Field>
                                    <Field
                                      label={
                                        currentSection.type === "skills"
                                          ? "Skills (comma separated)"
                                          : "Tags (comma separated)"
                                      }
                                      className="full-width"
                                      hint="Separate each one with a comma."
                                    >
                                      <TagInput
                                        key={item.id}
                                        tags={item.tags}
                                        onChange={(tags) =>
                                          updateItem(
                                            currentSection.id,
                                            item.id,
                                            { tags },
                                          )
                                        }
                                      />
                                    </Field>
                                    <Field
                                      label="Link"
                                      className="full-width"
                                      hint="Optional. A project, credential, article, or anything worth sharing."
                                    >
                                      <input
                                        type="url"
                                        value={item.url}
                                        onChange={(e) =>
                                          updateItem(
                                            currentSection.id,
                                            item.id,
                                            { url: e.target.value },
                                          )
                                        }
                                        placeholder="https://…"
                                        maxLength={2000}
                                      />
                                    </Field>
                                  </div>
                                  <div className="entry-footer">
                                    <label className="checkbox-label">
                                      <input
                                        type="checkbox"
                                        checked={item.visible}
                                        onChange={(e) =>
                                          updateItem(
                                            currentSection.id,
                                            item.id,
                                            { visible: e.target.checked },
                                          )
                                        }
                                      />{" "}
                                      Show this entry
                                    </label>
                                    {currentSection.type === "projects" && (
                                      <label className="checkbox-label">
                                        <input
                                          type="checkbox"
                                          checked={item.featured}
                                          onChange={(e) =>
                                            updateItem(
                                              currentSection.id,
                                              item.id,
                                              { featured: e.target.checked },
                                            )
                                          }
                                        />{" "}
                                        Featured
                                      </label>
                                    )}
                                    <button
                                      className="text-button danger"
                                      onClick={() =>
                                        setConfirm({
                                          title: "Remove this entry?",
                                          description: `“${item.title}” will be removed from this draft.`,
                                          label: "Remove entry",
                                          danger: true,
                                          action: () =>
                                            updateSection(currentSection.id, {
                                              items:
                                                currentSection.items.filter(
                                                  (i) => i.id !== item.id,
                                                ),
                                            }),
                                        })
                                      }
                                    >
                                      <Trash2 size={14} /> Remove
                                    </button>
                                  </div>
                                </div>
                              )}
                            </article>
                          ))}
                        </>
                      ) : (
                        <EmptyState
                          icon={<Layers3 size={30} />}
                          title="Your story starts here."
                          description="Choose a section or create a new one to begin."
                        />
                      )}
                    </div>
                  </div>
                </>
              )}
              {page === "appearance" && (
                <>
                  <PageHeading
                    eyebrow="A LITTLE CHARACTER"
                    title="Find your feel."
                    description="Your words, your work, your visual language. All of these choices can change."
                  />
                  <div className="appearance-grid">
                    <div>
                      <section className="studio-panel form-panel">
                        <h2>A signature color</h2>
                        <p className="panel-description">
                          A small accent with a big personality.
                        </p>
                        <div className="color-options">
                          {(
                            [
                              {
                                id: "lime",
                                name: "Fresh perspective",
                                color: "#c9f178",
                              },
                              {
                                id: "blue",
                                name: "Clear skies",
                                color: "#a7cff2",
                              },
                              {
                                id: "terracotta",
                                name: "Warm welcome",
                                color: "#e9ac93",
                              },
                            ] as const
                          ).map((color) => (
                            <button
                              key={color.id}
                              className={`color-option ${draft.theme.accent === color.id ? "chosen" : ""}`}
                              onClick={() =>
                                change((d) => ({
                                  ...d,
                                  theme: { ...d.theme, accent: color.id },
                                }))
                              }
                              aria-pressed={draft.theme.accent === color.id}
                            >
                              <span style={{ background: color.color }}>
                                {draft.theme.accent === color.id && (
                                  <Check size={22} />
                                )}
                              </span>
                              <strong>{color.name}</strong>
                            </button>
                          ))}
                        </div>
                      </section>
                      <section className="studio-panel form-panel">
                        <h2>Set the atmosphere</h2>
                        <p className="panel-description">
                          A bright canvas or something after hours.
                        </p>
                        <div className="choice-grid">
                          {(["paper", "dark"] as const).map((surface) => (
                            <button
                              className={`theme-choice ${draft.theme.surface === surface ? "chosen" : ""}`}
                              key={surface}
                              onClick={() =>
                                change((d) => ({
                                  ...d,
                                  theme: { ...d.theme, surface },
                                }))
                              }
                              aria-pressed={draft.theme.surface === surface}
                            >
                              <span
                                className={`surface-sample surface-${surface}`}
                              >
                                <span />
                                <span />
                                <span />
                              </span>
                              <strong>
                                {surface === "paper"
                                  ? "Paper & ink"
                                  : "After hours"}
                              </strong>
                              {draft.theme.surface === surface && (
                                <CheckCircle2 size={17} />
                              )}
                            </button>
                          ))}
                        </div>
                      </section>
                      <section className="studio-panel form-panel">
                        <h2>Let the type speak</h2>
                        <div className="choice-grid">
                          {(["editorial", "modern"] as const).map((font) => (
                            <button
                              className={`type-choice ${draft.theme.font === font ? "chosen" : ""}`}
                              key={font}
                              onClick={() =>
                                change((d) => ({
                                  ...d,
                                  theme: { ...d.theme, font },
                                }))
                              }
                              aria-pressed={draft.theme.font === font}
                            >
                              <span
                                style={{
                                  fontFamily:
                                    font === "editorial"
                                      ? "var(--font-serif)"
                                      : "var(--font-sans)",
                                }}
                              >
                                Aa
                              </span>
                              <strong>
                                {font === "editorial" ? "Editorial" : "Modern"}
                              </strong>
                              <small>
                                {font === "editorial"
                                  ? "Expressive & personal"
                                  : "Clean & direct"}
                              </small>
                            </button>
                          ))}
                        </div>
                      </section>
                    </div>
                    <aside className="appearance-preview studio-panel">
                      <span className="eyebrow">A FEEL FOR YOUR PORTFOLIO</span>
                      <div
                        className={`style-sample mini-${draft.theme.accent} mini-${draft.theme.surface}`}
                        style={{
                          fontFamily:
                            draft.theme.font === "editorial"
                              ? "var(--font-serif)"
                              : "var(--font-sans)",
                        }}
                      >
                        <span className="sample-orbit">✳</span>
                        <span className="sample-label">
                          {draft.profile.name}
                        </span>
                        <h2>
                          Good things
                          <br />
                          are always
                          <br />
                          <em>evolving.</em>
                        </h2>
                        <span className="sample-line" />
                        <p>
                          A space for your work.
                          <br />A reflection of you.
                        </p>
                      </div>
                      <button
                        className="btn btn-outline"
                        onClick={() => setPreview(true)}
                      >
                        <Eye size={16} /> Preview the whole picture
                      </button>
                    </aside>
                  </div>
                </>
              )}
              {page === "sources" && (
                <>
                  <PageHeading
                    eyebrow="YOUR PRIVATE REFERENCE SHELF"
                    title="Keep it together."
                    description="Save the documents behind your story. Files stay private; you decide what becomes part of your portfolio."
                  />
                  <div className="sources-grid">
                    <section className="studio-panel source-upload">
                      <div className="upload-illustration">
                        <FileText size={35} />
                        <span>
                          <Plus size={13} />
                        </span>
                      </div>
                      <h2>A place for the originals.</h2>
                      <p>
                        Résumés, certificates, notes, project briefs.
                        <br />
                        Bring the pieces of your story together.
                      </p>
                      <Field label="A note for this file (optional)">
                        <textarea
                          rows={2}
                          value={sourceNote}
                          onChange={(e) => setSourceNote(e.target.value)}
                          maxLength={1000}
                          placeholder="What should future you remember?"
                        />
                      </Field>
                      <button
                        className="btn btn-primary"
                        onClick={() => uploadRef.current?.click()}
                      >
                        <Upload size={16} /> Choose a file
                      </button>
                      <small>PDF, DOCX, TXT, PNG, JPG · up to 10 MB</small>
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                        hidden
                        ref={uploadRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadSource(file);
                          e.target.value = "";
                        }}
                      />
                      <div className="source-explainer">
                        <LockKeyhole size={16} />
                        <p>
                          Reference files aren’t automatically added to your
                          public story. Review them, then add the details you
                          want in Content & sections.
                        </p>
                      </div>
                    </section>
                    <section className="studio-panel source-list">
                      <div className="panel-heading">
                        <h2>Your library</h2>
                        <span className="count-pill">
                          {state.sources.length}
                        </span>
                      </div>
                      <label className="search-input">
                        <Search size={17} />
                        <input
                          aria-label="Search source files"
                          value={sourceSearch}
                          onChange={(e) => setSourceSearch(e.target.value)}
                          placeholder="Find a file…"
                        />
                      </label>
                      {state.sources
                        .filter((s) =>
                          `${s.name} ${s.note}`
                            .toLowerCase()
                            .includes(sourceSearch.toLowerCase()),
                        )
                        .map((source) => (
                          <article className="source-row" key={source.id}>
                            <div className="file-icon">
                              <FileText size={21} />
                            </div>
                            <div className="source-details">
                              <a
                                href={`/api/sources/${encodeURIComponent(source.id)}/file`}
                                download
                              >
                                {source.name}
                              </a>
                              <small>
                                {Math.max(1, Math.round(source.size / 1024))} KB
                                · {formatDate(source.createdAt)}
                              </small>
                              {source.note && <p>{source.note}</p>}
                            </div>
                            <a
                              className="icon-btn"
                              aria-label={`Download ${source.name}`}
                              href={`/api/sources/${encodeURIComponent(source.id)}/file`}
                              download
                            >
                              <Download size={16} />
                            </a>
                            <button
                              className="icon-btn danger"
                              aria-label={`Delete ${source.name}`}
                              onClick={() =>
                                setConfirm({
                                  title: "Delete this source file?",
                                  description: `“${source.name}” will be permanently removed from your private library. Your portfolio text won’t change.`,
                                  label: "Delete file",
                                  danger: true,
                                  action: () =>
                                    task(async () => {
                                      const result = await api<StudioState>(
                                        `/sources/${source.id}`,
                                        { method: "DELETE" },
                                      );
                                      setState((previous) =>
                                        previous
                                          ? {
                                              ...previous,
                                              sources: result.sources,
                                            }
                                          : previous,
                                      );
                                      setToast("Source file deleted.");
                                    }),
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </article>
                        ))}
                      {!state.sources.length ? (
                        <EmptyState
                          icon={<FolderOpen size={30} />}
                          title="Your shelf is ready."
                          description="Add a document to keep it close while you update your story."
                        />
                      ) : (
                        !state.sources.some((s) =>
                          `${s.name} ${s.note}`
                            .toLowerCase()
                            .includes(sourceSearch.toLowerCase()),
                        ) && (
                          <p className="empty-small">
                            No files match your search.
                          </p>
                        )
                      )}
                    </section>
                  </div>
                  <section className="studio-panel backup-panel">
                    <div>
                      <span className="eyebrow">TAKE YOUR STORY WITH YOU</span>
                      <h2>A backup, just in case.</h2>
                      <p>
                        Export your full draft as JSON, including hidden
                        sections. Import it later or move it to another
                        installation. Source files can be downloaded
                        individually.
                      </p>
                    </div>
                    <div className="backup-actions">
                      <button
                        className="btn btn-outline"
                        onClick={() =>
                          downloadJson(draft, "portfolio-backup.json")
                        }
                      >
                        <Download size={16} /> Export draft
                      </button>
                      <button
                        className="btn btn-outline"
                        onClick={() => importRef.current?.click()}
                      >
                        <Upload size={16} /> Import backup
                      </button>
                    </div>
                  </section>
                  <input
                    hidden
                    type="file"
                    accept=".json,application/json"
                    ref={importRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importFile(file);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
              {page === "history" && (
                <>
                  <PageHeading
                    eyebrow="EVERY CHAPTER COUNTS"
                    title="Room to change your mind."
                    description="Every publish saves a version. Bring one back to your draft, polish it, and publish again when you’re ready."
                  />
                  <section className="studio-panel history-panel">
                    <div className="history-current">
                      <span className="history-icon">
                        <CheckCircle2 size={23} />
                      </span>
                      <div>
                        <strong>Current published portfolio</strong>
                        <span>{formatDate(state.publishedAt)}</span>
                      </div>
                      <button className="btn btn-outline" onClick={leave}>
                        View site <ArrowUpRight size={15} />
                      </button>
                    </div>
                    {state.history.length ? (
                      state.history.map((version, index) => (
                        <div className="history-row" key={version.id}>
                          <span className="history-track">
                            <Clock3 size={17} />
                          </span>
                          <div>
                            <strong>
                              {version.label ||
                                `Published version ${state.history.length - index}`}
                            </strong>
                            <span>{formatDate(version.createdAt)}</span>
                          </div>
                          <button
                            className="btn btn-outline"
                            onClick={() =>
                              setConfirm({
                                title: "Restore this version to your draft?",
                                description:
                                  "This replaces your working draft, including any unsaved edits. Your public portfolio stays as it is until you publish again.",
                                label: "Restore to draft",
                                action: () =>
                                  task(async () => {
                                    const result = await api<StudioState>(
                                      `/restore/${version.id}`,
                                      {
                                        method: "POST",
                                        body: JSON.stringify({
                                          revision: state.revision,
                                        }),
                                      },
                                    );
                                    setState(result);
                                    setDraft(result.draft);
                                    setDirty(false);
                                    setToast(
                                      "Version restored to your draft. Preview it before publishing.",
                                    );
                                  }),
                              })
                            }
                          >
                            Restore to draft
                          </button>
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        icon={<History size={30} />}
                        title="The beginning of your story."
                        description="Publish your first update and your version history will start here."
                      />
                    )}
                    <p className="history-note">
                      <CircleHelp size={15} /> Your 20 most recent published
                      versions are kept. Export a JSON backup for a longer
                      archive.
                    </p>
                  </section>
                </>
              )}
              <footer className="studio-footer">
                <span>Made to grow with you.</span>
                <span>
                  <LockKeyhole size={12} />{" "}
                  {session.localMode
                    ? "Saved on this computer"
                    : "Private owner workspace"}
                </span>
              </footer>
            </main>
          </fieldset>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="modal-description">{confirm.description}</p>
          <div className="modal-actions">
            <button
              className="btn btn-outline"
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              className={`btn ${confirm.danger ? "btn-danger" : "btn-primary"}`}
              onClick={() => {
                const action = confirm.action;
                setConfirm(null);
                action();
              }}
            >
              {confirm.label}
            </button>
          </div>
        </Modal>
      )}
      {addSection && (
        <AddSectionModal
          onClose={() => setAddSection(false)}
          onAdd={(type, title) => {
            const id = uid();
            change((d) => ({
              ...d,
              sections: [
                ...d.sections,
                { id, type, title, visible: true, items: [] },
              ],
            }));
            setSelected(id);
            setExpanded(null);
            setAddSection(false);
            navigate("sections");
          }}
        />
      )}
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [value, setValue] = useState(tags.join(", "));
  useEffect(() => {
    setValue((current) => {
      const normalized = current
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return JSON.stringify(normalized) === JSON.stringify(tags)
        ? current
        : tags.join(", ");
    });
  }, [tags]);
  return (
    <input
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
      placeholder="Python, Unity, research…"
    />
  );
}
function AddSectionModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (type: Section["type"], title: string) => void;
}) {
  const [type, setType] = useState<Section["type"]>("projects");
  const [title, setTitle] = useState("");
  return (
    <Modal title="Make room for something new." onClose={onClose}>
      <p className="modal-description">
        Start with a format. You can make the rest your own.
      </p>
      <div className="section-type-options">
        {sectionTypes.map((option) => (
          <button
            key={option.value}
            className={type === option.value ? "selected" : ""}
            onClick={() => setType(option.value)}
          >
            <span>
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </span>
            {type === option.value ? (
              <CheckCircle2 size={19} />
            ) : (
              <span className="radio-empty" />
            )}
          </button>
        ))}
      </div>
      <Field label="Give it a name">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={sectionTypes.find((t) => t.value === type)?.label}
          maxLength={100}
        />
      </Field>
      <div className="modal-actions">
        <button className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={() =>
            onAdd(
              type,
              title.trim() || sectionTypes.find((t) => t.value === type)!.label,
            )
          }
        >
          <Plus size={16} /> Add section
        </button>
      </div>
    </Modal>
  );
}
