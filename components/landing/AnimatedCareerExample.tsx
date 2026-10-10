"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { TacoWordmark } from "@/components/BrandLogo";
import { LANDING_EXAMPLES, type LandingExample } from "./landingExamples";
import { subscribeHeroExampleCycle } from "./heroExampleCycle";

interface AnimatedCareerExampleProps {
  example: LandingExample;
  onExampleChange: (id: LandingExample["id"]) => void;
  motionEnabled: boolean;
}

type Segment = { key: string; text: string };

function segmentsFor(example: LandingExample): Segment[] {
  // Keep the role and field labels readable while the example details are typed.
  return [
    ...example.skills.map((text, index) => ({ key: `skill-${index}`, text })),
    { key: "gap", text: `Review the gap: ${example.gap}` },
    { key: "source", text: example.source },
    { key: "rewrite", text: example.rewrite },
  ];
}

function TypedText({
  text,
  visible,
  active,
}: {
  text: string;
  visible?: string;
  active?: boolean;
}) {
  return (
    <span className="hero-typed-text">
      <span className="hero-typed-reserve">{text}</span>
      {visible !== undefined && (
        <span className="hero-typed-visible" aria-hidden="true">
          {visible}
          {active && <i className="hero-writing-cursor" aria-hidden="true" />}
        </span>
      )}
    </span>
  );
}

export function AnimatedCareerExample({
  example,
  onExampleChange,
  motionEnabled,
}: AnimatedCareerExampleProps) {
  const segments = segmentsFor(example);
  const total = segments.reduce(
    (sum, item) => sum + Math.max(1, item.text.length),
    0,
  );
  const [written, setWritten] = useState<{
    id: LandingExample["id"] | null;
    count: number;
  }>({ id: null, count: total });
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const roleRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    LANDING_EXAMPLES.findIndex((item) => item.id === example.id),
  );
  const currentCount = written.id === example.id ? written.count : total;
  const isWriting = motionEnabled && currentCount < total;

  useEffect(() => {
    if (!container || !motionEnabled) return;
    return subscribeHeroExampleCycle(
      container,
      (progress) => setWritten({ id: example.id, count: Math.floor(progress * total) }),
      () => onExampleChange(LANDING_EXAMPLES[(selectedIndex + 1) % LANDING_EXAMPLES.length].id),
    );
  }, [container, example.id, motionEnabled, onExampleChange, selectedIndex, total]);

  const segmentText = (key: string, text: string) => {
    if (!isWriting) return { visible: undefined, active: false };
    let remaining = currentCount;
    for (const item of segments) {
      const length = Math.max(1, item.text.length);
      if (item.key === key)
        return {
          visible: item.text.slice(0, Math.min(length, Math.max(0, remaining))),
          active: remaining < length,
        };
      remaining -= length;
      if (remaining < 0) return { visible: "", active: false };
    }
    return { visible: text, active: false };
  };
  const typed = (key: string, text: string) => (
    <TypedText text={text} {...segmentText(key, text)} />
  );
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? LANDING_EXAMPLES.length - 1
          : (selectedIndex +
              (event.key === "ArrowRight" ? 1 : -1) +
              LANDING_EXAMPLES.length) %
            LANDING_EXAMPLES.length;
    onExampleChange(LANDING_EXAMPLES[next].id);
    roleRefs.current[next]?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={setContainer}
      className="hero-example"
      data-writing={isWriting ? "writing" : "complete"}
      data-motion={motionEnabled ? "on" : "off"}
    >
      <div className="hero-note note-one" aria-hidden="true">
        experience
        <br />
        <strong>→</strong> signal
      </div>
      <div className="hero-note note-two" aria-hidden="true">
        keep the facts
      </div>
      <div
        className="hero-example-controls"
        aria-label="Choose an illustrative role"
      >
        <div
          className="hero-example-control-row"
          role="tablist"
          aria-label="Illustrative fictional roles"
        >
          {LANDING_EXAMPLES.map((item, index) => (
            <button
              key={item.id}
              id={`hero-role-${item.id}`}
              ref={(node) => {
                roleRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={item.id === example.id}
              aria-controls="hero-example-card"
              tabIndex={item.id === example.id ? 0 : -1}
              onClick={() => onExampleChange(item.id)}
              onKeyDown={onKeyDown}
            >
              {item.role}
            </button>
          ))}
        </div>
      </div>
      <div className="hero-example-card-frame">
        <div
          id="hero-example-card"
          role="tabpanel"
          aria-labelledby={`hero-role-${example.id}`}
          className="app-window hero-example-card"
        >
          <div className="window-top">
            <span className="window-dot" />
            <span className="window-label brand-caption"><TacoWordmark className="brand-wordmark-mini" sizes="46px" /> / career notes</span>
            <span className="window-menu">•••</span>
          </div>
          <div className="window-body">
            <div className="window-kicker">
              Illustrative example · fictional role
            </div>
            <h2>{example.role}</h2>
            <p className="window-company">
              Source facts → role fit → draft
            </p>
            <div className="match-line">
              <span>Skills in the source</span>
              <b>{example.skills.length} signals</b>
            </div>
            <div className="window-tags" aria-label="Skills in the source">
              {example.skills.map((skill, index) => (
                <span
                  key={skill}
                  data-empty={
                    isWriting &&
                    segmentText(`skill-${index}`, skill).visible === ""
                  }
                >
                  {typed(`skill-${index}`, skill)}
                </span>
              ))}
            </div>
            <div className="window-review">
              <span className="review-mark">↗</span>
              {typed("gap", `Review the gap: ${example.gap}`)}
            </div>
            <div className="window-source">
              <span>Source fact</span>
              <p>{typed("source", example.source)}</p>
            </div>
            <div className="window-rewrite">
              <span>Review-ready draft</span>
              <p className="typed-copy">{typed("rewrite", example.rewrite)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
