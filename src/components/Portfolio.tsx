import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Github,
  Linkedin,
  MapPin,
  Menu,
  Printer,
  X,
} from "lucide-react";
import type { PortfolioData } from "../types";
import "./Portfolio.css";

type Section = PortfolioData["sections"][number];
type Item = Section["items"][number];
type Props = {
  data: PortfolioData;
  preview?: boolean;
  onEdit?: () => void;
  onClosePreview?: () => void;
};

function Paragraphs({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
    </div>
  );
}

function ItemTags({ tags }: { tags: string[] }) {
  return tags.length ? (
    <ul className="pf-tags" aria-label="Skills and tools">
      {tags.map((tag, index) => (
        <li key={`${tag}-${index}`}>{tag}</li>
      ))}
    </ul>
  ) : null;
}

function ProjectCard({ item, index }: { item: Item; index: number }) {
  return (
    <article className={`pf-project pf-project-${index % 3}`}>
      <div className="pf-project-art" aria-hidden="true">
        <div className="pf-art-top">
          <span>{item.featured ? "SELECTED PROJECT" : "PROJECT"}</span>
          <span>{String(index + 1).padStart(2, "0")} /</span>
        </div>
        <div className="pf-project-orbit">
          <i />
          <i />
          <i />
        </div>
        <div className="pf-art-label">{item.title}</div>
        <div className="pf-art-bottom">
          <span>
            {item.tags.slice(0, 2).join(" + ") || "Ideas made tangible"}
          </span>
          <ArrowDownRight size={30} strokeWidth={1.2} />
        </div>
      </div>
      <div className="pf-project-meta">
        <span>{item.subtitle}</span>
        {item.period && <span>{item.period}</span>}
      </div>
      <h3>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer">
            {item.title}
            <ArrowUpRight size={25} aria-label="Opens in a new tab" />
          </a>
        ) : (
          item.title
        )}
      </h3>
      {item.description && (
        <Paragraphs text={item.description} className="pf-item-description" />
      )}
      <ItemTags tags={item.tags} />
    </article>
  );
}

function SectionContent({ section }: { section: Section }) {
  const items = section.items.filter((item) => item.visible);
  if (section.type === "projects")
    return (
      <div className="pf-project-grid">
        {items.map((item, index) => (
          <ProjectCard key={item.id} item={item} index={index} />
        ))}
      </div>
    );
  if (section.type === "skills")
    return (
      <div className="pf-skill-grid">
        {items.map((item, index) => (
          <article key={item.id} className="pf-skill-card">
            <span className="pf-small-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3>{item.title}</h3>
            {item.subtitle && (
              <p className="pf-item-subtitle">{item.subtitle}</p>
            )}
            {item.description && (
              <Paragraphs
                text={item.description}
                className="pf-item-description"
              />
            )}
            <ItemTags tags={item.tags} />
            {item.url && (
              <a
                className="pf-text-link"
                href={item.url}
                target="_blank"
                rel="noreferrer"
              >
                Learn more <ArrowUpRight size={16} />
                <span className="pf-sr-only">
                  {" "}
                  about {item.title} (opens in a new tab)
                </span>
              </a>
            )}
          </article>
        ))}
      </div>
    );
  return (
    <div
      className={`pf-timeline ${section.type === "education" ? "pf-education" : ""}`}
    >
      {items.map((item) => (
        <article key={item.id} className="pf-timeline-item">
          <div className="pf-timeline-date">
            <span className="pf-timeline-dot" />
            {item.period}
          </div>
          <div className="pf-timeline-content">
            <h3>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.title}
                  <ArrowUpRight size={21} aria-label="Opens in a new tab" />
                </a>
              ) : (
                item.title
              )}
            </h3>
            {item.subtitle && (
              <p className="pf-item-subtitle">{item.subtitle}</p>
            )}
            {item.description && (
              <Paragraphs
                text={item.description}
                className="pf-item-description"
              />
            )}
            <ItemTags tags={item.tags} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function Portfolio({
  data,
  preview = false,
  onEdit,
  onClosePreview,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const { profile, theme } = data;
  useEffect(() => {
    setPortraitFailed(false);
  }, [profile.portrait]);
  useEffect(() => {
    if (preview) return;
    document.title = `${profile.name}${profile.role ? ` · ${profile.role}` : " · Portfolio"}`;
    let description = document.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute("content", profile.intro.slice(0, 300));
  }, [profile.name, profile.role, profile.intro, preview]);
  const sections = data.sections.filter(
    (section) => section.visible && section.items.some((item) => item.visible),
  );
  const projectSection = sections.find(
    (section) => section.type === "projects",
  );
  const firstSection = projectSection || sections[0];
  const headline = profile.headline.trim() ? profile.headline : profile.name;
  const headlineLines = headline.split(/\r?\n/);
  const lastHeadlineLine = headlineLines.reduce(
    (last, line, index) => (line.trim() ? index : last),
    0,
  );
  const accentWordCount = headline.trim().split(/\s+/).length > 4 ? 2 : 1;
  const initials = profile.name
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => name[0])
    .slice(0, 2)
    .join("");
  const sectionHref = (id: string) =>
    `#${encodeURIComponent(`section-${encodeURIComponent(id)}`)}`;
  const externalLinks = [
    { href: profile.github, label: "GitHub", Icon: Github },
    { href: profile.linkedin, label: "LinkedIn", Icon: Linkedin },
  ].filter((link) => link.href);
  return (
    <div
      className="portfolio"
      data-accent={theme.accent}
      data-surface={theme.surface}
      data-font={theme.font}
    >
      <a className="pf-skip-link" href="#main-content">
        Skip to content
      </a>
      {preview && (
        <div className="pf-preview-banner">
          <span>
            <Check size={15} /> You’re previewing your unpublished changes
          </span>
          <button type="button" onClick={onClosePreview}>
            Back to studio <X size={15} />
          </button>
        </div>
      )}
      <header className="pf-header pf-container" id="top">
        <a
          className="pf-wordmark"
          href="#top"
          aria-label={`${profile.name}, home`}
        >
          {profile.name.split(" ")[0]}
          <span className="pf-wordmark-dot">.</span>
          <span className="pf-wordmark-label">PERSONAL PORTFOLIO</span>
        </a>
        <nav
          id="pf-main-navigation"
          className={`pf-navigation ${menuOpen ? "pf-navigation-open" : ""}`}
          aria-label="Main navigation"
        >
          {sections.slice(0, 3).map((section) => (
            <a
              href={sectionHref(section.id)}
              key={section.id}
              onClick={() => setMenuOpen(false)}
            >
              {section.title}
            </a>
          ))}
          {(profile.email || externalLinks.length > 0) && (
            <a href="#contact" onClick={() => setMenuOpen(false)}>
              Contact
            </a>
          )}
        </nav>
        <div className="pf-header-actions">
          <button
            type="button"
            className="pf-resume-button"
            onClick={() => window.print()}
          >
            Save résumé <Printer size={15} />
          </button>
          <button
            className="pf-menu-button"
            type="button"
            aria-controls="pf-main-navigation"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section
          className="pf-hero pf-container"
          aria-labelledby="pf-hero-title"
        >
          <div className="pf-hero-content">
            <p className="pf-eyebrow">
              <span className="pf-tiny-cross">✳</span>
              {profile.role || "A work in progress. In the best way."}
            </p>
            <div className="pf-print-heading">
              <strong>{profile.name}</strong>
              {profile.location && <span>{profile.location}</span>}
              <div className="pf-print-contact">
                {profile.email && (
                  <a href={`mailto:${profile.email}`}>{profile.email}</a>
                )}
                {externalLinks.map(({ href, label }) => (
                  <a key={label} href={href}>
                    {label}: {href}
                  </a>
                ))}
              </div>
            </div>
            <h1 id="pf-hero-title">
              {headlineLines.map((line, index) => {
                const words = Array.from(line.matchAll(/\S+/g));
                const accentStart =
                  words[Math.max(0, words.length - accentWordCount)]?.index ??
                  0;
                return (
                  <span className="pf-headline-line" key={index}>
                    {index === lastHeadlineLine ? (
                      <>
                        {line.slice(0, accentStart)}
                        <em>{line.slice(accentStart)}</em>
                      </>
                    ) : (
                      line
                    )}
                  </span>
                );
              })}
            </h1>
            {profile.intro && (
              <Paragraphs text={profile.intro} className="pf-hero-intro" />
            )}
            <div className="pf-hero-actions">
              {firstSection && (
                <a
                  className="pf-button-primary"
                  href={sectionHref(firstSection.id)}
                >
                  {projectSection ? "Explore my work" : "Get to know me"}
                  <ArrowDownRight size={19} />
                </a>
              )}
              {profile.email && (
                <a className="pf-button-text" href={`mailto:${profile.email}`}>
                  Let’s talk
                  <ArrowUpRight size={18} />
                </a>
              )}
            </div>
            {profile.availability && (
              <p className="pf-availability">
                <span />
                {profile.availability}
              </p>
            )}
          </div>
          <div className="pf-hero-visual">
            <div className="pf-portrait-decoration" aria-hidden="true" />
            <div className="pf-portrait-card">
              <div className="pf-portrait-image">
                {profile.portrait && !portraitFailed ? (
                  <img
                    src={profile.portrait}
                    alt={profile.name}
                    onError={() => setPortraitFailed(true)}
                  />
                ) : (
                  <div
                    className="pf-portrait-placeholder"
                    aria-label={profile.name}
                  >
                    {initials}
                    <span>A little introduction.</span>
                  </div>
                )}
                <span className="pf-image-corner pf-image-corner-one" />
                <span className="pf-image-corner pf-image-corner-two" />
              </div>
              <div className="pf-portrait-caption">
                <div>
                  <strong>{profile.name}</strong>
                  {profile.location && (
                    <span>
                      <MapPin size={12} />
                      {profile.location}
                    </span>
                  )}
                </div>
                <span className="pf-caption-star" aria-hidden="true">
                  ✳
                </span>
              </div>
            </div>
            <div className="pf-portrait-note">
              <ArrowDownLeft size={31} strokeWidth={1.2} />
              <span>
                The person
                <br />
                behind the work.
              </span>
            </div>
            <span className="pf-portrait-side-label" aria-hidden="true">
              A COLLECTION OF WORK & IDEAS
            </span>
          </div>
        </section>

        <div className="pf-hero-bottom pf-container">
          <span>
            {profile.location
              ? `BASED IN ${profile.location.toUpperCase()}`
              : "A PERSONAL COLLECTION"}
          </span>
          <span>BUILT WITH PURPOSE. ALWAYS EVOLVING.</span>
          {(profile.about ||
            firstSection ||
            profile.email ||
            externalLinks.length > 0) && (
            <a
              href={
                profile.about
                  ? "#about"
                  : firstSection
                    ? sectionHref(firstSection.id)
                    : "#contact"
              }
              aria-label="Scroll to explore"
            >
              <ArrowDown size={18} />
            </a>
          )}
        </div>

        {profile.about && (
          <section
            id="about"
            className="pf-about pf-container"
            aria-labelledby="pf-about-title"
          >
            <div className="pf-section-eyebrow">
              <span className="pf-small-index">01 / A LITTLE CONTEXT</span>
              <h2 id="pf-about-title">
                Hello, I’m
                <br />
                <em>{profile.name.split(" ")[0]}.</em>
              </h2>
            </div>
            <div className="pf-about-copy">
              <Paragraphs text={profile.about} />
              <span className="pf-about-signature">
                Curiosity → practice → progress <ArrowUpRight size={19} />
              </span>
            </div>
          </section>
        )}

        {sections.map((section, index) => (
          <section
            className={`pf-content-section pf-section-${section.type} pf-container`}
            id={`section-${encodeURIComponent(section.id)}`}
            key={section.id}
            aria-labelledby={`heading-${encodeURIComponent(section.id)}`}
          >
            <div className="pf-section-heading">
              <div>
                <span className="pf-small-index">
                  {String(index + (profile.about ? 2 : 1)).padStart(2, "0")} /{" "}
                  {section.type === "projects"
                    ? "FROM IDEA TO REALITY"
                    : section.type === "experience"
                      ? "THE JOURNEY SO FAR"
                      : section.type === "skills"
                        ? "MY TOOLKIT"
                        : section.type === "education"
                          ? "FOUNDATIONS & GROWTH"
                          : "MORE OF THE STORY"}
                </span>
                <h2 id={`heading-${encodeURIComponent(section.id)}`}>
                  {section.title}
                  {!/[.!?]$/.test(section.title) && (
                    <span className="pf-section-dot">.</span>
                  )}
                </h2>
              </div>
              <span className="pf-section-count">
                {String(
                  section.items.filter((item) => item.visible).length,
                ).padStart(2, "0")}
                <ArrowDownRight size={24} strokeWidth={1.3} />
              </span>
            </div>
            <SectionContent section={section} />
          </section>
        ))}

        {(profile.email || externalLinks.length > 0) && (
          <section
            id="contact"
            className="pf-contact"
            aria-labelledby="pf-contact-title"
          >
            <div className="pf-container pf-contact-inner">
              <div className="pf-contact-intro">
                <span className="pf-small-index">HAVE SOMETHING IN MIND?</span>
                <h2 id="pf-contact-title">
                  Good things start
                  <br />
                  with a <em>hello.</em>
                  <span className="pf-contact-asterisk" aria-hidden="true">
                    ✳
                  </span>
                </h2>
                <p>For ideas, opportunities, or just a good conversation.</p>
              </div>
              <div className="pf-contact-links">
                {profile.email && (
                  <a
                    className="pf-contact-email"
                    href={`mailto:${profile.email}`}
                  >
                    <span>GET IN TOUCH</span>
                    <strong>{profile.email}</strong>
                    <ArrowUpRight size={30} strokeWidth={1.3} />
                  </a>
                )}
                <div className="pf-social-links">
                  {externalLinks.map(({ href, label, Icon }) => (
                    <a key={label} href={href} target="_blank" rel="noreferrer">
                      <Icon size={16} />
                      {label}
                      <ArrowUpRight size={15} />
                      <span className="pf-sr-only"> (opens in a new tab)</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
      <footer className="pf-footer pf-container">
        <p>
          © {new Date().getFullYear()} {profile.name}
          <span>Made to grow.</span>
        </p>
        <div>
          <a href="#top">
            Back to top <ArrowUpRight size={14} />
          </a>
          {onEdit ? (
            <button type="button" onClick={onEdit}>
              Portfolio studio
            </button>
          ) : (
            <a href="/studio">Portfolio studio</a>
          )}
        </div>
      </footer>
    </div>
  );
}

export default Portfolio;
