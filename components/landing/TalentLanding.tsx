"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TacoWordmark, TacoName } from '@/components/BrandLogo';
import "../taco-public-palette.css";
import "./talent-landing.css";
import { AnimatedCareerExample } from "./AnimatedCareerExample";
import { CareerJourneyDemo } from "./CareerJourneyDemo";
import { LANDING_EXAMPLES, type LandingExample } from "./landingExamples";
import { useReducedMotionPreference } from "./useLandingScrollScene";

type AuthMode = "login" | "signup";
interface TalentLandingProps {
  isAuthenticated: boolean;
  onOpenAuth: (mode: AuthMode, redirect: string) => void;
}
function AuthAction({
  isAuthenticated,
  onOpenAuth,
  className = "landing-button landing-button-coral",
}: TalentLandingProps & { className?: string }) {
  const href = "/suite/agent?intent=resume-upload";
  return isAuthenticated ? (
    <a className={className} href={href}>
      Start with my resume <span aria-hidden="true">↗</span>
    </a>
  ) : (
    <button
      className={className}
      type="button"
      onClick={() => onOpenAuth("signup", href)}
    >
      Start with my resume <span aria-hidden="true">↗</span>
    </button>
  );
}

function ClosingMarquee({ motionEnabled }: { motionEnabled: boolean }) {
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const node = marqueeRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let intersects = false;
    const update = () =>
      setRunning(intersects && document.visibilityState === "visible");
    const observer = new IntersectionObserver(([entry]) => {
      intersects = entry.isIntersecting;
      update();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <div
      className="footer-marquee"
      ref={marqueeRef}
      data-running={motionEnabled && running}
      aria-hidden="true"
    >
      <div className="footer-marquee-track">
        {[0, 1].map((copy) => (
          <div className="footer-marquee-group" key={copy}>
            <span>Your experience</span>
            <span>↗</span>
            <span>Your next move</span>
            <span>↗</span>
            <span>Make it yours</span>
            <span>↗</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TalentLanding({
  isAuthenticated,
  onOpenAuth,
}: TalentLandingProps) {
  const [selectedExampleId, setSelectedExampleId] =
    useState<LandingExample["id"]>("designer");
  const selectedExample =
    LANDING_EXAMPLES.find((item) => item.id === selectedExampleId) ??
    LANDING_EXAMPLES[0];
  const reducedMotion = useReducedMotionPreference();
  const motionEnabled = !reducedMotion;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);
  const closeMenu = () => setMenuOpen(false);
  return (
    <div className="taco-landing">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="landing-nav">
        <Link href="/" className="brand" aria-label="Taco home">
          <TacoWordmark className="brand-wordmark" sizes="(max-width: 420px) 114px, 150px" priority />
        </Link>
        <button
          ref={menuButtonRef}
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="landing-menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? "Close menu" : "Menu"}
        </button>
        <nav
          id="landing-menu"
          className={menuOpen ? "landing-menu is-open" : "landing-menu"}
          aria-label="Main navigation"
        >
          <a href="#how" onClick={closeMenu}>
            How it works
          </a>
          <a href="/pricing" onClick={closeMenu}>
            Pricing
          </a>
          <a href="/privacy" onClick={closeMenu}>
            Privacy
          </a>
          {isAuthenticated ? (
            <a className="nav-signin" href="/suite">
              Open studio <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <button
              className="nav-signin"
              type="button"
              onClick={() => {
                closeMenu();
                onOpenAuth("login", "/suite/agent?intent=resume-upload");
              }}
            >
              Sign in <span aria-hidden="true">↗</span>
            </button>
          )}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">
              <i /> AI job search, grounded in your experience.
            </p>
            <h1>
              Your next chapter.
              <br />
              <em>Starts with you.</em>
            </h1>
            <p className="hero-lede">
              <TacoName /> turns your experience into relevant roles and
              application drafts you can review and make your own.
            </p>
            <div className="hero-actions">
              <AuthAction
                isAuthenticated={isAuthenticated}
                onOpenAuth={onOpenAuth}
              />
              <a className="text-link" href="#demo">
                Explore the example <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="account-cue">
              {isAuthenticated
                ? "Open your career workspace to continue."
                : "Create a free account. Your first scout includes up to 3 roles."}
            </p>
          </div>
          <AnimatedCareerExample
            example={selectedExample}
            onExampleChange={setSelectedExampleId}
            motionEnabled={motionEnabled}
          />
        </section>
        <section className="story-band" id="how">
          <div>
            <span className="story-num">01</span>
            <strong>Bring your experience</strong>
            <p>Resume, projects, and the details that make your work yours.</p>
          </div>
          <div>
            <span className="story-num">02</span>
            <strong>Find your fit</strong>
            <p>
              See why a role matches, including the gaps worth thinking through.
            </p>
          </div>
          <div>
            <span className="story-num">03</span>
            <strong>Make it yours</strong>
            <p>Shape every application with evidence you can stand behind.</p>
          </div>
        </section>
        <CareerJourneyDemo
          example={selectedExample}
          motionEnabled={motionEnabled}
        />
        <div className="landing-lower">
          <section className="outcomes-section">
            <h2 className="eyebrow">
              <i /> A calmer way through
            </h2>
            <div className="outcomes-grid">
              <article>
                <span className="outcome-index">01</span>
                <h3>
                  Find roles
                  <br />
                  <em>with a reason.</em>
                </h3>
                <p>
                  Search by the work you want to do, then understand the match
                  before you spend an hour applying.
                </p>
                <a href="/suite/job-search">Explore job search ↗</a>
              </article>
              <article>
                <span className="outcome-index">02</span>
                <h3>
                  Prepare applications
                  <br />
                  <em>you can own.</em>
                </h3>
                <p>
                  Build a thoughtful draft from your source material, with every
                  change visible for review.
                </p>
                <a href="/suite/agent">Explore application prep ↗</a>
              </article>
              <article>
                <span className="outcome-index">03</span>
                <h3>
                  Practice interviews
                  <br />
                  <em>out loud.</em>
                </h3>
                <p>
                  Turn real project stories into prompts and practice, so your
                  experience is ready when the question comes.
                </p>
                <a href="/tools/interview-prep">Explore interview prep ↗</a>
              </article>
            </div>
          </section>
          <section className="trust-section">
            <div>
              <p className="eyebrow">
                <i /> Built for discernment
              </p>
              <h2>
                You decide what
                <br />
                <em>leaves the room.</em>
              </h2>
            </div>
            <div className="trust-list">
              <p>
                <b>01</b>
                <span>
                  <strong>Review-first by default</strong> You review drafts and
                  submit applications yourself.
                </span>
              </p>
              <p>
                <b>02</b>
                <span>
                  <strong>Missing facts stay visible</strong> <TacoName /> calls out a
                  gap instead of papering it over.
                </span>
              </p>
              <p>
                <b>03</b>
                <span>
                  <strong>Private by design</strong> Read how we handle your
                  information in our <a href="/privacy">privacy center ↗</a>.
                </span>
              </p>
            </div>
          </section>
          <section className="plans-section" id="pricing">
            <div className="section-intro">
              <p className="eyebrow">
                <i /> Start where you are
              </p>
              <h2>
                Useful from
                <br />
                <em>the first upload.</em>
              </h2>
              <p>
                Start with one free scout. Choose Standard for on-demand
                searches or Max for recurring scouting and prepared packets.
              </p>
            </div>
            <div className="plans">
              <article>
                <span>FREE</span>
                <h3>First scout</h3>
                <p>Explore up to 3 roles and see what fits.</p>
                <a href="/pricing">See what&apos;s included ↗</a>
              </article>
              <article className="plan-featured">
                <span>STANDARD</span>
                <h3>For the search</h3>
                <p>On-demand scouting and the core career toolkit.</p>
                <a href="/pricing">Compare plans ↗</a>
              </article>
              <article>
                <span>MAX</span>
                <h3>For the whole arc</h3>
                <p>
                  Recurring scouting and prepared application packets for your
                  review.
                </p>
                <a href="/pricing">See full plan details ↗</a>
              </article>
            </div>
            <p className="plan-note">
              Free includes one scout of up to 3 roles. Prepared application
              packets require Max.
            </p>
          </section>
          <section className="faq-section">
            <h2 className="eyebrow">
              <i /> Questions, answered
            </h2>
            <details>
              <summary><span>Does <TacoName /> apply to jobs for me?</span></summary>
              <p>
                No. <TacoName /> helps you prepare and review. You decide when and where
                anything is sent.
              </p>
            </details>
            <details>
              <summary><span>Will it make up experience I do not have?</span></summary>
              <p>
                <TacoName /> is designed to work from your source facts. Check proposed
                edits against your experience and correct anything unsupported.
              </p>
            </details>
            <details>
              <summary><span>Can I start without an account?</span></summary>
              <p>
                Yes. Explore this example or try the <a href="/tools">free tools</a>
                {" "}without an account. Create a free account to upload a resume
                and keep your work in your private workspace.
              </p>
            </details>
          </section>
        </div>
        <section
          className="footer-cta"
          aria-labelledby="closing-title"
          data-motion={motionEnabled ? "on" : "off"}
        >
          <div className="footer-cta-main">
            <div className="footer-cta-copy">
              <p className="eyebrow">The next move is yours.</p>
              <h2 id="closing-title">
                Start with the work
                <br />
                <em>you already did.</em>
              </h2>
            </div>
            <div className="footer-cta-actions">
              <AuthAction
                isAuthenticated={isAuthenticated}
                onOpenAuth={onOpenAuth}
              />
            </div>
          </div>
          <ClosingMarquee motionEnabled={motionEnabled} />
        </section>
      </main>
      <footer className="landing-footer">
        <Link href="/" className="brand" aria-label="Taco home">
          <TacoWordmark className="brand-wordmark" sizes="(max-width: 420px) 114px, 150px" />
        </Link>
        <div>
          <a href="/pricing">Pricing</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
        </div>
        <span>© {new Date().getFullYear()} TalentConsulting</span>
      </footer>
    </div>
  );
}
