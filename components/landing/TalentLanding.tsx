'use client';

/* ---------------------------------------------------------------------------
 * The landing page.
 *
 * Ported from the reviewed prototype. Three structural decisions carried over,
 * and they are the reason this file looks the way it does:
 *
 *   · The stylesheet is a plain CSS file, not a CSS module, and every selector
 *     in it is scoped under `.tcl`. The motion module finds elements by the
 *     same class names the sheet targets, and a module would hash them apart.
 *     The scoping is mechanical and total, so nothing leaks into the app.
 *
 *   · Every rule that HIDES something is gated on `html.js` (set in the root
 *     layout, before first paint). If that never runs - script error, blocked
 *     inline script, an in-app WebView with JS off - the page is fully
 *     readable rather than blank. It went blank on a real device once; reveals
 *     are an enhancement, never the thing that makes content exist.
 *
 *   · Three regions are handed to the motion module via
 *     dangerouslySetInnerHTML with module-owned constants. That is not a
 *     shortcut: the module rewrites their innerHTML, and marking them opaque
 *     is what stops React reconciling children it did not write. No user input
 *     reaches any of them - the results panel is assembled from a fixed phrase
 *     list and integer counts and never echoes the textarea at all.
 *
 * Copy, tool names, modes and examples come from careerLandingContent.ts.
 * Nothing here is invented, which is also the product's whole claim.
 * ------------------------------------------------------------------------- */

import { useEffect, useRef } from 'react';

import {
  RES_EMPTY,
  chatHtml,
  mountTalentLanding,
  rewriteHtml,
} from './talentLandingMotion';
import './talent-landing.css';

type AuthMode = 'login' | 'signup';

interface TalentLandingProps {
  isAuthenticated: boolean;
  onOpenAuth: (mode: AuthMode, redirect: string) => void;
}

/* All 22 tools, split across two rails. Name only: the content file has real
   descriptions for six of them and none for the other sixteen, and writing the
   missing sixteen would be inventing copy on a page about not doing that. */
const TOOL_HREF: Record<string, string> = {
  'ATS Analyzer': '/tools/ats-analyzer',
  'Resume Builder': '/tools/resume-builder',
  'AI Humanizer': '/tools/ai-humanizer',
  'AI Detector': '/tools/ai-detector',
  'Interview Prep': '/tools/interview-prep',
  'Job Tracker': '/suite/applications',
};

const TOOLS_A = [
  'ATS Analyzer', 'Resume Builder', 'AI Humanizer', 'AI Detector', 'Interview Prep',
  'Job Tracker', 'Cover Letter', 'Ask Taco', 'Career Check', 'Job Match', 'Grammar Checker',
];
const TOOLS_B = [
  'Paraphraser', 'Word Counter', 'Citation Machine', 'Tone Analyzer', 'Summarizer',
  'Email Composer', 'LinkedIn Optimizer', 'ATS Preview', 'Salary Coach', 'Skill Bridge',
  'Career Intelligence',
];

function ToolCard({ name, dup }: { name: string; dup?: boolean }) {
  return (
    <a className="tool" href={TOOL_HREF[name] ?? '/tools'} aria-hidden={dup} tabIndex={dup ? -1 : undefined}>
      <svg viewBox="70 118 372 290" aria-hidden="true"><use href="#mark" /></svg>
      <h3>{name}</h3>
    </a>
  );
}

/* The second pass is what translateX(-50%) needs to wrap seamlessly. It is in
   the markup rather than appended by script, so the rail is never half-built,
   and the copies are hidden from assistive tech and taken out of tab order. */
function ToolRail({ id, tools, slow, reverse }: { id: string; tools: string[]; slow?: boolean; reverse?: boolean }) {
  return (
    <div className="rail rise">
      <div className={`track dup${reverse ? ' rev' : ''}${slow ? ' slow' : ''}`} id={id}>
        {tools.map((n) => <ToolCard key={n} name={n} />)}
        {tools.map((n) => <ToolCard key={`${n}-dup`} name={n} dup />)}
      </div>
    </div>
  );
}

/* The one control on the page that knows whether you are signed in. Everything
   else is an in-page anchor or a real route, so the page works identically for
   a signed-out visitor and a crawler. */
function HeaderCta({ isAuthenticated, onOpenAuth }: TalentLandingProps) {
  if (isAuthenticated) {
    return <a className="cta" href="/suite">Open Studio</a>;
  }
  return (
    <button className="cta" type="button" onClick={() => onOpenAuth('signup', '/suite')}>
      Start free
    </button>
  );
}

export function TalentLanding({ isAuthenticated, onOpenAuth }: TalentLandingProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return mountTalentLanding(el);
  }, []);

  return (
    <div className="tcl" ref={rootRef}>
      <div className="grain" aria-hidden="true"></div>

      <svg width="0" height="0" style={{position: 'absolute'}} aria-hidden="true"><defs>
        <linearGradient id="tcL" x1="256" y1="140" x2="128" y2="389" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--rl0)" /><stop offset=".26" stopColor="var(--rl1)" />
          <stop offset=".6" stopColor="var(--rl2)" /><stop offset="1" stopColor="var(--rl3)" /></linearGradient>
        <linearGradient id="tcR" x1="256" y1="140" x2="385" y2="389" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--rr0)" /><stop offset=".4" stopColor="var(--rr1)" />
          <stop offset=".75" stopColor="var(--rr2)" /><stop offset="1" stopColor="var(--rr3)" /></linearGradient>
        <linearGradient id="tacoG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--taco-0)" /><stop offset=".55" stopColor="var(--taco-1)" />
          <stop offset="1" stopColor="var(--taco-2)" /></linearGradient>
        <path id="rL" d="M215 133 H299 L171 389 H84 Z" />
        <path id="rR" d="M212 133 H298 L428 389 H343 Z" />
        <g id="mark"><use href="#rL" fill="url(#tcL)" /><use href="#rR" fill="url(#tcR)" /></g>
      </defs></svg>

      <header className="nav" id="nav">
        <img
          className="nav-wm"
          id="wmD"
          src="/brand/tc-wordmark-dark.webp"
          alt="Talent Consulting"
          width={124}
          height={20}
          decoding="async"
        />
        <nav className="nav-links">
          <details className="nd"><summary>Career Check<svg className="nd-c" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg></summary>
            <div className="nd-pop">
              <a href="#check"><b>Resume</b><span>ATS structure, clarity, recruiter-readable signals</span></a>
              <a href="#check"><b>Job Match</b><span>Your career story against a role, and the missing proof</span></a>
              <a href="#check"><b>Writing Trust</b><span>Generic AI patterns and low-trust phrasing</span></a>
              <a href="#check"><b>Quick Polish</b><span>Humanise a short draft, facts and numbers intact</span></a>
              <a className="nd-all" href="#check"><b>Paste something now →</b></a>
            </div></details>
          <details className="nd"><summary>Proof<svg className="nd-c" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg></summary>
            <div className="nd-pop">
              <a href="#proof" data-ex="0"><b>Resume bullet</b><span>Responsible for… becomes a number and a decision</span></a>
              <a href="#proof" data-ex="1"><b>Cover letter opening</b><span>Stops being about you, starts being about the work</span></a>
              <a href="#proof" data-ex="2"><b>Recruiter reply</b><span>Warm, specific, and three lines shorter</span></a>
              <a href="#proof" data-ex="3"><b>Interview answer</b><span>A claim turned into something checkable</span></a>
            </div></details>
          <details className="nd"><summary>Tools<svg className="nd-c" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg></summary>
            <div className="nd-pop">
              <a href="/tools/ats-analyzer"><b>ATS Analyzer</b><span>How the parser reads your file</span></a>
              <a href="/tools/resume-builder"><b>Resume Builder</b><span>Structure first, wording second</span></a>
              <a href="/tools/ai-humanizer"><b>AI Humanizer</b><span>Your voice back, facts unchanged</span></a>
              <a href="/tools/ai-detector"><b>AI Detector</b><span>Where the writing reads as generated</span></a>
              <a href="/tools/interview-prep"><b>Interview Prep</b><span>Stories, not scripts</span></a>
              <a href="/suite/applications"><b>Job Tracker</b><span>Stages, dates, and what to do next</span></a>
              <a className="nd-all" href="/tools"><b>All 22 tools →</b></a>
            </div></details>
          <details className="nd"><summary>Taco<svg className="nd-c" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg></summary>
            <div className="nd-pop">
              <a href="#taco" data-chat="0"><b>Before the interview</b><span>Which stories to tell, and how to open them</span></a>
              <a href="#taco" data-chat="1"><b>Straight after</b><span>What to fix before the next round</span></a>
              <a href="#taco" data-chat="2"><b>The week that follows</b><span>When to nudge, and what to say</span></a>
            </div></details>
          <details className="nd"><summary>Pricing<svg className="nd-c" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg></summary>
            <div className="nd-pop">
              <a href="#check"><b>Free</b><span>Career Check, Detector and the basic tools, no account</span></a>
              <a href="/pricing"><b>Standard</b><span>Saved workflows and larger writing limits</span></a>
              {/* "Max", not "Studio". `studio` is the code tier; lib/plan-identity.ts
                  gives it displayName "Talent Max" and shortName "Max", which is what
                  every other customer-facing surface shows. */}
              <a href="/pricing"><b>Max</b><span>Taco's context, job tracking, exports</span></a>
              <a className="nd-all" href="/pricing"><b>Compare the three →</b></a>
            </div></details>
        </nav>
        <span className="nav-sp"></span>
        <HeaderCta isAuthenticated={isAuthenticated} onOpenAuth={onOpenAuth} />
      </header>

      {/* ===================================================== hero */}
      <section className="hero">
        <div className="field" aria-hidden="true"><div className="pool pa"></div><div className="pool pb"></div></div>
        <svg className="hero-mk" viewBox="70 118 372 290" aria-hidden="true">
          <use className="ribA" href="#rL" fill="url(#tcL)" /><use className="ribB" href="#rR" fill="url(#tcR)" /></svg>
        <div className="hero-in hold">
          <div className="kick"><b></b><span className="kick-t" id="kickT">Review-first career operating system</span></div>
          <div className="h1wrap" id="h1wrap">
            <p className="draft" id="draft" aria-hidden="true">We’re <i>passionate about</i>
              a <i>wide range of</i> <i>dynamic</i>, <i>results-driven</i> tools that
              <i>deliver results</i>.</p>
            <h1><span className="ln"><span>Nothing here</span></span><span className="ln"><span className="lit">is invented.</span></span></h1>
            </div>
          <div className="subwrap" id="subwrap">
            <p className="draft" id="subDraft" aria-hidden="true">Our platform will <i>utilize</i> AI to
              <i>solve problems</i> across <i>multiple stakeholders</i>, <i>improving</i> your
              <i>operational efficiency</i> in today’s <i>fast-paced environment</i>.</p>
            <p className="sub">Your real facts, numbers and roles stay real. Talent Consulting only changes how clearly they read, and nothing leaves until you send it.</p>
          </div>
          <div className="acts">
            <a className="btn" href="#check">Run a free career check</a>
            <a className="btn btn-g" href="#tools">See the 22 tools</a>
          </div>
          <div className="proof">
            <div><b>Free</b><span>career check</span></div>
            <div><b className="tab">22+</b><span>career tools</span></div>
            <div><b>ATS</b><span>resume signals</span></div>
            <div><b>Taco</b><span>career agent</span></div>
          </div>
        </div>
      </section>

      <hr className="seam" />

      {/* ===================================================== career check */}
      <section className="sec" id="check">
        <div className="hold">
          <div className="eyeb rise"><svg viewBox="70 118 372 290" aria-hidden="true"><use href="#mark" /></svg>Start here, no account</div>
          <h2 className="rise">Paste something. Get a real next step.</h2>
          <p className="lede rise">Four checks, free, before you sign up for anything. Each one tells you what to fix first rather than handing back a score and leaving.</p>

          <div className="check rise">
            <div className="check-top">
              <span className="check-k">Free career check</span>
              <span className="check-count tab" id="wc">0 / 500 words</span>
            </div>
            <div className="check-body">
              <div className="check-in">
                <label className="sr" htmlFor="ta" style={{position: 'absolute', left: '-9999px'}}>Paste resume text or career writing</label>
                <textarea
                  id="ta"
                  spellCheck={false}
                  defaultValue=""
                  placeholder="Paste resume text, a bullet, a cover letter opening, or a recruiter reply…"
                />
                <div className="try">
                  <button type="button" data-s="0">Try a resume bullet</button>
                  <button type="button" data-s="1">Try a cover letter opening</button>
                  <button type="button" data-s="2">Try a recruiter reply</button>
                </div>
              </div>
              <div className="check-out"><div className="res" id="res" dangerouslySetInnerHTML={{ __html: RES_EMPTY }} /></div>
            </div>
            <div className="check-foot">
              <span>This is the phrase-level pass. The full check adds ATS structure, section order and job matching.</span>
            </div>
          </div>

          <p className="lede rise" style={{'marginTop': '34px'}}>Or start from one of the four:</p>
          <div className="modes" id="modes">
            <article className="mode rise">
              <div className="mode-top">
              <svg className="mode-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l2 2 4-4" /><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4" /></svg>
              <svg className="doc" viewBox="0 0 44 50" aria-hidden="true">
                <rect className="pg" x="7" y="3" width="30" height="44" rx="3" />
                <rect className="hd anim d-hd" x="12" y="10" width="17" height="3.4" rx="1.7" />
                <rect className="ln anim d-l1" x="12" y="19" width="20" height="2.2" rx="1.1" />
                <rect className="ln anim d-l2" x="12" y="25" width="16" height="2.2" rx="1.1" />
                <rect className="ln anim d-l3" x="12" y="31" width="19" height="2.2" rx="1.1" />
                <g className="anim d-tick"><circle cx="33" cy="39" r="6.5" fill="var(--accent)" />
                  <path d="M30 39.2l2 2 4-4.2" stroke="var(--cta-ink)" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></g>
              </svg></div>
              <h3>Resume</h3>
              <p>Check ATS structure, clarity, and recruiter-readable signals.</p>
              <div className="mode-f"><span className="mode-cap">500 words</span><span className="mode-go">Check resume →</span></div>
            </article>
            <article className="mode rise">
              <div className="mode-top">
              <svg className="mode-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>
              <svg className="doc" viewBox="0 0 44 50" aria-hidden="true">
                <g className="anim d-pg2"><rect className="pg" x="2" y="7" width="26" height="38" rx="3" />
                  <rect className="ln" x="6" y="14" width="15" height="2.2" rx="1.1" />
                  <rect className="ln" x="6" y="20" width="12" height="2.2" rx="1.1" /></g>
                <rect className="pg" x="14" y="3" width="26" height="38" rx="3" />
                <rect className="hd" x="18" y="9" width="14" height="3" rx="1.5" />
                <rect className="ln" x="18" y="16" width="17" height="2.2" rx="1.1" />
                <rect className="ln" x="18" y="22" width="13" height="2.2" rx="1.1" />
                <circle cx="33" cy="41" r="6.5" fill="var(--surface)" stroke="var(--line-2)" strokeWidth="2.4" />
                <circle className="anim d-arc" cx="33" cy="41" r="6.5" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="41" strokeDashoffset="41" transform="rotate(-90 33 41)" />
              </svg></div>
              <h3>Job Match</h3>
              <p>Compare your career story against a role and spot missing proof.</p>
              <div className="mode-f"><span className="mode-cap">1,200 words</span><span className="mode-go">Analyze match →</span></div>
            </article>
            <article className="mode rise">
              <div className="mode-top">
              <svg className="mode-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 8a4 4 0 1 0 4 4" /><path d="M12 12l9-9" /></svg>
              <svg className="doc" viewBox="0 0 44 50" aria-hidden="true">
                <rect className="pg" x="7" y="3" width="30" height="44" rx="3" />
                <rect className="hd" x="12" y="10" width="17" height="3.4" rx="1.7" />
                <rect className="ln" x="12" y="19" width="20" height="2.2" rx="1.1" />
                <rect className="wn anim d-w1" x="12" y="25" width="16" height="2.2" rx="1.1" />
                <rect className="ln" x="12" y="31" width="19" height="2.2" rx="1.1" />
                <rect className="wn anim d-w2" x="12" y="37" width="13" height="2.2" rx="1.1" />
                <rect className="anim d-scan" x="8" y="15" width="28" height="2" rx="1" fill="var(--accent)" />
              </svg></div>
              <h3>Writing Trust</h3>
              <p>Scan career writing for generic AI patterns and low-trust phrasing.</p>
              <div className="mode-f"><span className="mode-cap">1,500 words</span><span className="mode-go">Scan trust →</span></div>
            </article>
            <article className="mode rise">
              <div className="mode-top">
              <svg className="mode-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v4M3 5h4M6 17v4M4 19h4" /><path d="M13 3l3.5 6.5L23 13l-6.5 3.5L13 23l-3.5-6.5L3 13l6.5-3.5Z" /></svg>
              <svg className="doc" viewBox="0 0 44 50" aria-hidden="true">
                <rect className="pg" x="7" y="3" width="30" height="44" rx="3" />
                <rect className="hd" x="12" y="10" width="17" height="3.4" rx="1.7" />
                <rect className="ln anim d-r1" x="12" y="19" width="21" height="2.2" rx="1.1" />
                <rect className="ln anim d-r2" x="12" y="25" width="21" height="2.2" rx="1.1" />
                <rect className="ln anim d-r3" x="12" y="31" width="21" height="2.2" rx="1.1" />
                <g className="anim d-spk"><path className="ac" d="M31 36.5l1.9 4.1 4.1 1.9-4.1 1.9-1.9 4.1-1.9-4.1-4.1-1.9 4.1-1.9Z" fill="var(--accent)" stroke="none" opacity=".95" /></g>
              </svg></div>
              <h3>Quick Polish</h3>
              <p>Humanize a short draft while preserving facts, numbers, and intent.</p>
              <div className="mode-f"><span className="mode-cap">300 words · 3/day</span><span className="mode-go">Polish draft →</span></div>
            </article>
          </div>
        </div>
      </section>

      {/* ===================================================== before / after */}
      <section className="sec sec-alt" id="proof">
        <div className="hold">
          <div className="eyeb rise"><svg viewBox="70 118 372 290" aria-hidden="true"><use href="#mark" /></svg>What it actually does</div>
          <h2 className="rise">Vague becomes specific. Nothing gets made up.</h2>
          <p className="lede rise">The same facts, argued properly. Weak phrasing is marked, not deleted, so you decide what survives.</p>

          <div className="rw rise" id="rw">
            <div className="rw-pick" role="tablist" aria-label="Examples">
              <button type="button" role="tab" aria-selected="true" data-i="0">Resume bullet</button>
              <button type="button" role="tab" aria-selected="false" data-i="1">Cover letter opening</button>
              <button type="button" role="tab" aria-selected="false" data-i="2">Recruiter reply</button>
              <button type="button" role="tab" aria-selected="false" data-i="3">Interview answer</button>
            </div>
            <div className="rw-stage">
              <p className="rw-text" id="rwText" dangerouslySetInnerHTML={{ __html: rewriteHtml(0) }} />
              <div className="rw-side">
                <div><div className="rw-score tab" id="rwScore">38</div><div className="rw-cap" id="rwCap">Before</div></div>
                <button className="rw-go" id="rwGo" type="button">Rewrite it</button>
              </div>
            </div>
            <div className="rw-foot"><b id="rwMetric">Specificity up</b></div>
          </div>
        </div>
      </section>

      {/* ===================================================== tools */}
      <section className="sec sec-alt" id="tools">
        <div className="hold" id="toolsHead">
          <div className="eyeb rise"><svg viewBox="70 118 372 290" aria-hidden="true"><use href="#mark" /></svg>The suite</div>
          <h2 className="rise">Six you'll open weekly. Sixteen more when you need them.</h2>
          <p className="lede rise">One workspace from first draft to interview day, with no per-tool colour coding, because you should be able to find things by name, not by hue.</p>

        </div>
        <ToolRail id="rowA" tools={TOOLS_A} />
        <ToolRail id="rowB" tools={TOOLS_B} reverse slow />
      </section>

      {/* ===================================================== taco */}
      <section className="sec" id="taco">
        <div className="hold">
          <div className="taco">
            <div>
              <div className="eyeb rise"><svg viewBox="70 118 372 290" aria-hidden="true"><use href="#mark" /></svg>The agent</div>
              <h2 className="rise">Taco keeps the next move in view.</h2>
              <p className="lede rise">The process gets noisy fast: tabs, drafts, stages, follow-ups. Taco carries the context between them. Here is how three of those conversations go.</p>
              <ul className="taco-list rise">
                <li><i></i>Remembers your target roles and strongest proof points.</li>
                <li><i></i>Suggests the next move after a resume check or job match.</li>
                <li><i></i>Turns scattered drafts into saved career workflows.</li>
                <li><i></i>Helps prepare follow-ups, interview stories, and application context.</li>
              </ul>
            </div>
            <div className="chat rise">
              <div className="chat-h"><svg className="taco-mk" viewBox="0 0 32 32" role="img" aria-label="Taco">
                  <rect className="body" x="1" y="1" width="30" height="30" rx="10" />
                  <path className="stroke" d="M9.5 21.5 16 11.2l6.5 10.3" />
                  <circle className="dot" cx="16" cy="24.4" r="1.7" />
                </svg><span className="chat-n">Taco</span>
                <div className="chat-tabs" id="chatTabs" role="tablist" aria-label="Conversations">
                  <button role="tab" aria-selected="true" data-c="0" type="button">Before</button>
                  <button role="tab" aria-selected="false" data-c="1" type="button">During</button>
                  <button role="tab" aria-selected="false" data-c="2" type="button">After</button>
                </div></div>
              <div className="chat-log" id="chatLog" dangerouslySetInnerHTML={{ __html: chatHtml(0) }} />
              <div className="chat-f"><div className="tl">
                <span><b>Resume analyzed</b> · 2 days ago</span><span><b>Job match found</b> · Yesterday</span>
                <span><b>Cover letter drafted</b> · 6 hours ago</span><span><b>Interview prep loaded</b> · Just now</span>
              </div></div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================== pricing */}
      <section className="sec sec-alt" id="pricing">
        <div className="hold">
          <div className="eyeb rise"><svg viewBox="70 118 372 290" aria-hidden="true"><use href="#mark" /></svg>Plans</div>
          <h2 className="rise">Start free. Grow into the system.</h2>
          <p className="lede rise">Three plans. <b>Free</b> covers the Career Check, the Detector and the basic
            tools with no account. <b>Standard</b> adds saved workflows and larger limits;
            <b>Studio</b> adds Taco’s context, job tracking and exports.</p>
          <div className="plan-row rise">
            <a className="btn" href="#check">Run a free check</a>
            <a className="plan-link" href="/pricing">Compare the three plans →</a>
          </div>
        </div>
      </section>

      {/* ============================================= thumb-zone dock (< 980px)
          A floating pill, not a bar welded to the edge: it clears the home
          indicator on its own and the page keeps a visible margin underneath, so
          the last line of content is never trapped behind glass. Present without
          script - .js is what hides it until the hero CTA has scrolled away. */}
      <div className="bbar" id="bbar">
        <div className="bbar-in">
          <button
            className="menu-t"
            id="menuT"
            type="button"
            aria-expanded="false"
            aria-controls="sheet"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />
            </svg>
          </button>
          <span className="bb-here" id="bbHere">Career Check</span>
          <a className="btn" href="#check">Start free</a>
        </div>
      </div>
      <div className="sheet" id="sheet" hidden>
        <div className="sheet-in">
          <a href="#check">Career Check</a>
          <a href="#proof">Proof</a>
          <a href="#tools">Tools</a>
          <a href="#taco">Taco</a>
          <a href="#pricing">Pricing</a>
        </div>
      </div>

      <footer><div className="hold foot"><img
        className="foot-wm"
        id="fwmD"
        src="/brand/tc-wordmark-dark.webp"
        alt=""
        aria-hidden="true"
        width={112}
        height={18}
        loading="lazy"
        decoding="async"
      />
        <nav><a href="#tools">Tools</a><a href="#pricing">Pricing</a><a href="/for-teams">For teams</a>
          <a href="/blog">Blog</a><a href="/help">Help</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
      </div></footer>
    </div>
  );
}

export default TalentLanding;
