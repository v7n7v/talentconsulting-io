"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { LandingExample } from "./landingExamples";
import { TacoBrandSymbol, TacoWordmark } from "@/components/BrandLogo";
import { journeyStage, rangeProgress, stagePresentation, stampPose } from "./landingMotion";
import { useLandingScrollScene, type LandingScrollFrame } from "./useLandingScrollScene";
import "./career-journey-demo.css";

const STAGES = [
  { label: "Your experience", kicker: "01 / Source facts", title: "Experience worth building on." },
  { label: "Your matches", kicker: "02 / Fit, with context", title: "See the fit. See the questions." },
  { label: "Your application", kicker: "03 / Review-ready", title: "Put your evidence into words." },
] as const;
const STICKY_TOP = 32;
const STICKY_CLEARANCE = STICKY_TOP + 24 + 24;
const SCROLL_DISTANCE = 300;
type Presentation = "flow" | "sticky";
type Bounds = { top: number; height: number };
type Geometry = { trackTop: number; articles: Bounds[]; stamp: Bounds };

interface CareerJourneyDemoProps {
  example: LandingExample;
  motionEnabled: boolean;
}

function readingHoldIndex(articles: Array<HTMLElement | null>) {
  const focused = articles.findIndex(article => article?.contains(document.activeElement));
  if (focused >= 0) return focused;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return -1;
  return articles.findIndex(article => {
    if (!article || article.inert) return false;
    for (let index = 0; index < selection.rangeCount; index++) {
      if (selection.getRangeAt(index).intersectsNode(article)) return true;
    }
    return false;
  });
}

function writeStamp(root: HTMLElement, progress: number) {
  const pose = stampPose(progress);
  root.style.setProperty("--career-stamp-opacity", String(pose.opacity));
  root.style.setProperty("--career-stamp-y", `${pose.y}px`);
  root.style.setProperty("--career-stamp-scale", String(pose.scale));
  root.style.setProperty("--career-stamp-rotation", `${pose.rotation}deg`);
  root.style.setProperty("--career-stamp-impact", String(pose.impact));
}

function writeInk(article: HTMLElement, progress: number) {
  article.style.setProperty("--career-ink", String(progress));
  for (let index = 0; index < 4; index++) {
    article.style.setProperty(`--career-marker-${index}`, String(rangeProgress(progress, index * 0.12, 0.55 + index * 0.12)));
  }
}

function writeStage(article: HTMLElement, progress: number, index: number, manual: number | null) {
  const pose = manual === null
    ? stagePresentation(progress, index)
    : { opacity: manual === index ? 1 : 0, y: 0 };
  article.style.setProperty("--career-opacity", String(pose.opacity));
  article.style.setProperty("--career-y", `${pose.y}px`);
  article.style.setProperty("--career-visibility", pose.opacity > 0 ? "visible" : "hidden");
}

function startsAtOrAfterScene(root: HTMLElement) {
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation?.type === "back_forward") return true;
  let target: HTMLElement | null = null;
  try {
    target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
  } catch {
    // An invalid fragment is ordinary navigation, not an animation failure.
  }
  return !!target && (
    root === target || root.contains(target) ||
    !!(root.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)
  );
}

function DocumentContent({ example, index }: { example: LandingExample; index: number }) {
  if (index === 0) return <>
    <p className="career-journey-document-label">Resume excerpt</p>
    <h4>{example.role}</h4>
    <p className="career-journey-source">“{example.source}”</p>
    <div className="career-journey-rule" />
    <p className="career-journey-document-label">Skills in this excerpt</p>
    <ul className="career-journey-tags">
      {example.skills.map(skill => <li key={skill}>{skill}</li>)}
    </ul>
  </>;
  if (index === 1) return <>
    <p className="career-journey-document-label">Example role</p>
    <h4>{example.role}</h4>
    <p className="career-journey-sheet-note">Illustrative requirements to compare with your source.</p>
    <ul className="career-journey-evidence-list">
      {example.requirements.map(requirement => (
        <li key={requirement.label} className={requirement.evidence ? "is-supported" : "is-review"}>
          <span className="career-journey-evidence-mark" aria-hidden="true">{requirement.evidence ? "✓" : "?"}</span>
          <span>
            <strong>{requirement.label}</strong>
            <small>{requirement.evidence ? `In source: “${requirement.evidence}”` : example.gap}</small>
          </span>
        </li>
      ))}
    </ul>
  </>;
  return <>
    <p className="career-journey-document-label">Draft bullet · for your review</p>
    <p className="career-journey-draft">{example.rewrite}</p>
    <p className="career-journey-sheet-note">A review-ready draft, with every detail traceable to your source.</p>
    <div className="career-journey-rule" />
    <p className="career-journey-document-label">Source details retained</p>
    <ul className="career-journey-retained-facts">
      {example.retainedFacts.map(fact => <li key={fact}>{fact}</li>)}
    </ul>
  </>;
}

export function CareerJourneyDemo({ example, motionEnabled }: CareerJourneyDemoProps) {
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const articleRefs = useRef<Array<HTMLElement | null>>([]);
  const controlRefs = useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([]);
  const restoreControlRef = useRef<number | null>(null);
  const geometryRef = useRef<Geometry | null>(null);
  const runtime = useRef({ layout: "flow" as Presentation, decision: "pending" as "pending" | "locked" | "sticky", active: 0, manual: null as number | null, lastScrollY: null as number | null });
  const [presentation, setPresentation] = useState<Presentation>("flow");
  const [activeStage, setActiveStage] = useState(0);
  const [manualStage, setManualStage] = useState<number | null>(null);
  const animate = motionEnabled;

  const updateActive = useCallback((index: number) => {
    if (runtime.current.active === index) return;
    runtime.current.active = index;
    setActiveStage(index);
  }, []);

  const chooseStage = useCallback((index: number) => {
    if (runtime.current.layout !== "sticky") return;
    const held = readingHoldIndex(articleRefs.current);
    if (held >= 0) index = held;
    runtime.current.manual = index;
    runtime.current.lastScrollY = window.scrollY;
    setManualStage(index);
    updateActive(index);
    articleRefs.current.forEach((article, stage) => {
      if (!article) return;
      writeStage(article, 1, stage, index);
      writeInk(article, 1);
    });
    if (rootRef.current) writeStamp(rootRef.current, 1);
  }, [updateActive]);

  const releaseToFlow = useCallback(() => {
    const root = rootRef.current;
    const shell = shellRef.current;
    if (!root || !shell) return;
    runtime.current.decision = "locked";
    if (runtime.current.layout !== "sticky") return;

    const focused = document.activeElement;
    const focusedControl = controlRefs.current.findIndex(node => node === focused);
    if (focusedControl >= 0) restoreControlRef.current = focusedControl;
    const shellRect = shell.getBoundingClientRect();
    const focusedContent = focused instanceof HTMLElement && shell.contains(focused) ? focused : null;
    const anchor = shellRect.bottom <= 0
      ? root.nextElementSibling as HTMLElement | null
      : focusedContent || articleRefs.current[runtime.current.active];
    const preservePosition = shellRect.top < window.innerHeight && !!anchor;
    const previousTop = preservePosition ? anchor!.getBoundingClientRect().top : 0;

    // Change layout synchronously so the correction uses the new natural-flow geometry.
    root.dataset.layout = "flow";
    runtime.current.layout = "flow";
    runtime.current.manual = null;
    geometryRef.current = null;
    setPresentation("flow");
    setManualStage(null);
    if (preservePosition) {
      const delta = anchor!.getBoundingClientRect().top - previousTop;
      if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, behavior: "instant" });
    }
    runtime.current.lastScrollY = window.scrollY;
    window.dispatchEvent(new Event("taco:landing-layout"));
  }, []);

  const onFrame = useCallback((frame: LandingScrollFrame) => {
    const root = rootRef.current;
    const track = trackRef.current;
    const shell = shellRef.current;
    const stamp = stampRef.current;
    if (!root || !track || !shell || !stamp) return;
    const scrollChanged = runtime.current.lastScrollY !== null &&
      Math.abs(frame.scrollY - runtime.current.lastScrollY) > 0.5;
    runtime.current.lastScrollY = frame.scrollY;
    const canAnimate = animate && frame.viewportScale === 1;
    // Keep the wayfinder visible while reading, but give zoomed/short screens
    // their full viewport instead of pinning navigation over the document.
    root.dataset.wayfinder = frame.viewportScale === 1 && frame.viewportHeight >= 600 ? "pinned" : "flow";

    if (!canAnimate) {
      if (runtime.current.layout === "sticky") releaseToFlow();
      writeStamp(root, 1);
      articleRefs.current.forEach(article => { if (article) writeInk(article, 1); });
    }

    if (frame.measure || !geometryRef.current) {
      if (canAnimate && runtime.current.decision === "pending" && (!document.fonts || document.fonts.status === "loaded")) {
        const canTrySticky = frame.viewportWidth >= 1100 &&
          root.getBoundingClientRect().top > frame.viewportHeight &&
          !startsAtOrAfterScene(root);
        if (canTrySticky) {
          // The same articles occupy a single grid cell in this temporary, offscreen layout.
          // Its height is the tallest document, never the sum of the three flow documents.
          root.dataset.layout = "measure";
          const height = shell.getBoundingClientRect().height;
          root.dataset.layout = "flow";
          if (height + STICKY_CLEARANCE <= frame.viewportHeight) {
            root.style.setProperty("--career-shell-height", `${height}px`);
            root.dataset.layout = "sticky";
            runtime.current.layout = "sticky";
            runtime.current.decision = "sticky";
            setPresentation("sticky");
            window.dispatchEvent(new Event("taco:landing-layout"));
          } else {
            runtime.current.decision = "locked";
          }
        } else {
          runtime.current.decision = "locked";
        }
      }

      if (runtime.current.layout === "sticky") {
        const height = shell.getBoundingClientRect().height;
        if (frame.viewportWidth < 1100 || height + STICKY_CLEARANCE > frame.viewportHeight) {
          releaseToFlow();
        } else {
          root.style.setProperty("--career-shell-height", `${height}px`);
        }
      }

      const readBounds = (node: HTMLElement): Bounds => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top + window.scrollY, height: rect.height };
      };
      geometryRef.current = {
        trackTop: readBounds(track).top,
        articles: articleRefs.current.map(article => article ? readBounds(article) : { top: 0, height: 0 }),
        stamp: readBounds(stamp),
      };
    }

    const geometry = geometryRef.current;
    if (!geometry) return;
    if (runtime.current.layout === "sticky") {
      const progress = rangeProgress(frame.scrollY, geometry.trackTop - STICKY_TOP, geometry.trackTop - STICKY_TOP + SCROLL_DISTANCE);
      const held = readingHoldIndex(articleRefs.current);
      if (held >= 0 && runtime.current.manual !== held) {
        runtime.current.manual = held;
        setManualStage(held);
        updateActive(held);
      } else if (held < 0 && scrollChanged && runtime.current.manual !== null) {
        // Measurement and render invalidations do not cancel a deliberately selected step.
        // Ordinary scrolling resumes the physical story once reading focus/selection leaves.
        runtime.current.manual = null;
        setManualStage(null);
      }
      const manual = runtime.current.manual;
      if (manual === null) updateActive(journeyStage(progress));
      articleRefs.current.forEach((article, index) => {
        if (!article) return;
        writeStage(article, progress, index, manual);
        const start = index === 0 ? 0 : index === 1 ? 0.34 : 0.68;
        const end = index === 0 ? 0.28 : index === 1 ? 0.62 : 0.86;
        writeInk(article, manual === null ? rangeProgress(progress, start, end) : 1);
      });
      writeStamp(root, manual === null ? rangeProgress(progress, 0.86, 0.96) : 1);
    } else {
      let visibleStage = 0;
      geometry.articles.forEach((bounds, index) => {
        const article = articleRefs.current[index];
        if (!article) return;
        if (canAnimate) writeInk(article, rangeProgress(frame.scrollY, bounds.top - frame.viewportHeight * 0.75, bounds.top + bounds.height - frame.viewportHeight * 0.5));
        if (bounds.top <= frame.scrollY + frame.viewportHeight * 0.45) visibleStage = index;
      });
      updateActive(visibleStage);
      const start = geometry.stamp.top - frame.viewportHeight * 0.9;
      const end = geometry.stamp.top + geometry.stamp.height - frame.viewportHeight * 0.35;
      if (canAnimate) writeStamp(root, rangeProgress(frame.scrollY, start, end));
    }
  }, [animate, releaseToFlow, updateActive]);

  useLandingScrollScene(rootRef, onFrame, {
    // Navigation follows the visible document even when motion is disabled.
    // The shared subscription only schedules frames in response to events.
    enabled: true,
    watchKey: `${example.id}:${presentation}:${manualStage ?? "scroll"}:${animate}`,
  });

  useLayoutEffect(() => {
    const index = restoreControlRef.current;
    if (index !== null) {
      controlRefs.current[index]?.focus({ preventScroll: true });
      restoreControlRef.current = null;
    }
    if (!animate && rootRef.current) {
      writeStamp(rootRef.current, 1);
      articleRefs.current.forEach(article => { if (article) writeInk(article, 1); });
    }
    window.dispatchEvent(new Event("taco:landing-layout"));
  }, [animate, example.id, manualStage, presentation]);

  useEffect(() => {
    const holdSelection = () => {
      if (runtime.current.layout !== "sticky") return;
      const index = readingHoldIndex(articleRefs.current);
      if (index >= 0) chooseStage(index);
    };
    document.addEventListener("selectionchange", holdSelection);
    return () => document.removeEventListener("selectionchange", holdSelection);
  }, [chooseStage]);

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3;
    chooseStage(next);
    controlRefs.current[next]?.focus({ preventScroll: true });
  };

  const sticky = presentation === "sticky";

  return (
    <section className="career-journey" id="demo" ref={rootRef} data-layout={presentation} data-motion={animate ? "scroll" : "static"}>
      <div className="career-journey-intro">
        <p className="eyebrow"><i /> Illustrative example</p>
        <h2>One source of truth.<br /><em>Three useful moves.</em></h2>
        <p>Follow this illustrative {example.role.toLowerCase()} example from source experience to role fit to application draft.</p>
      </div>
      <div className="career-journey-track" ref={trackRef}>
        <div className="career-journey-shell" ref={shellRef}>
          <div className="career-journey-toolbar">
            <div className="career-journey-tabs" role={sticky ? "tablist" : "navigation"} aria-label="Taco example steps">
              {STAGES.map((stage, index) => sticky ? (
                <button
                  key={stage.label}
                  ref={node => { controlRefs.current[index] = node; }}
                  id={`career-journey-tab-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={activeStage === index}
                  aria-controls={`career-journey-panel-${index}`}
                  tabIndex={activeStage === index ? 0 : -1}
                  onClick={() => chooseStage(index)}
                  onKeyDown={event => onTabKeyDown(event, index)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>{stage.label}
                </button>
              ) : (
                <a
                  key={stage.label}
                  ref={node => { controlRefs.current[index] = node; }}
                  href={`#career-journey-panel-${index}`}
                  aria-current={activeStage === index ? "step" : undefined}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>{stage.label}
                </a>
              ))}
            </div>
            <div className="career-journey-trail" data-stage={activeStage} aria-hidden="true">
              <svg viewBox="0 0 600 56" preserveAspectRatio="none" focusable="false">
                <path className="career-journey-trail-line" d="M100 28 C168 4 232 52 300 28 S432 4 500 28" />
                <path className="career-journey-trail-ink" pathLength="1" d="M100 28 C168 4 232 52 300 28 S432 4 500 28" />
                {[100, 300, 500].map((x, index) => (
                  <circle key={x} cx={x} cy="28" r="3" className={index <= activeStage ? "is-visited" : undefined} />
                ))}
              </svg>
              <span className="career-journey-traveler">
                <span key={activeStage} className="career-journey-traveler-symbol">
                  <TacoBrandSymbol decorative />
                </span>
              </span>
            </div>
          </div>
          <div className="career-journey-documents">
            {STAGES.map((stage, index) => {
              const inactive = sticky && activeStage !== index;
              return (
                <article
                  key={index}
                  ref={node => { articleRefs.current[index] = node; }}
                  className={`career-journey-document career-journey-document-${index}`}
                  id={`career-journey-panel-${index}`}
                  role={sticky ? "tabpanel" : undefined}
                  aria-labelledby={sticky ? `career-journey-tab-${index}` : `career-journey-heading-${index}`}
                  aria-hidden={inactive || undefined}
                  inert={inactive || undefined}
                  tabIndex={sticky && !inactive ? 0 : -1}
                  data-active={!inactive}
                  onFocusCapture={() => chooseStage(index)}
                >
                  <header className="career-journey-document-heading">
                    <p className="career-journey-kicker">{stage.kicker}</p>
                    <h3 id={`career-journey-heading-${index}`}>{stage.title}</h3>
                  </header>
                  <div className="career-journey-sheet">
                    <div className="career-journey-sheet-top">
                      <span className="career-journey-sheet-brand brand-caption"><TacoWordmark className="brand-wordmark-mini" sizes="46px" /> / career notes</span>
                      <span>Illustrative · fictional role</span>
                    </div>
                    <div className="career-journey-sheet-body">
                      <DocumentContent example={example} index={index} />
                      {index === 2 && <div className="career-journey-stamp-slot" ref={stampRef} aria-hidden="true">
                        <span className="career-journey-stamp-impact" />
                        <span className="career-journey-stamp"><b>FOR REVIEW</b><i>↗</i></span>
                      </div>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
