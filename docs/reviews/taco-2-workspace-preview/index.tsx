import {
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  SuiteToolShell,
  SuitePanel,
  EvidenceBadge,
} from "../../../components/suite/SuiteToolChrome";
import {
  inputSnapshot,
  postingUrlIsValid,
  prepareReviewNote,
  type ReviewNote,
  type SourceKind,
  type WorkspaceInputs,
} from "./logic";

type Pane = "resume" | "matches" | "applications" | "interview";
type IconName =
  | "source"
  | "matches"
  | "note"
  | "interview"
  | "arrow"
  | "plus"
  | "lock"
  | "moon"
  | "sun"
  | "download"
  | "check";
type EvidenceState = "verified" | "inferred" | "draft" | "missing";

const destinations: Array<{
  id: Pane;
  label: string;
  shortLabel: string;
  icon: IconName;
  detail: string;
}> = [
  {
    id: "resume",
    label: "Resume",
    shortLabel: "Resume",
    icon: "source",
    detail: "Keep the source intact",
  },
  {
    id: "matches",
    label: "Matches",
    shortLabel: "Matches",
    icon: "matches",
    detail: "Bring a real posting",
  },
  {
    id: "applications",
    label: "Applications",
    shortLabel: "Apply",
    icon: "note",
    detail: "Review your next move",
  },
  {
    id: "interview",
    label: "Interview",
    shortLabel: "Interview",
    icon: "interview",
    detail: "Practice from evidence",
  },
];

function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    source: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h4M9 12h6M9 16h6" />
      </>
    ),
    matches: (
      <>
        <path d="M4 6h16v14H4zM8 6V3h8v3M4 11h16" />
        <path d="m9 15 2 2 4-4" />
      </>
    ),
    note: (
      <>
        <path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5" />
      </>
    ),
    interview: (
      <>
        <path d="M4 4h16v12h-9l-5 4v-4H4z" />
        <path d="M8 9h8M8 12h5" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h15m-6-6 6 6-6 6" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    lock: (
      <>
        <rect x="6" y="10" width="12" height="10" rx="2" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3M12 14v2" />
      </>
    ),
    moon: <path d="M20 14A8.5 8.5 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      className={`t2-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <button
      type="button"
      className={`t2-button btn-${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Badge({ state, label }: { state: EvidenceState; label: string }) {
  return (
    <span className="t2-evidence-badge" data-state={state}>
      <EvidenceBadge state={state} label={label} />
    </span>
  );
}

function PanelHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="t2-panel-heading">
      <p className="t2-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children && <p className="t2-supporting">{children}</p>}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="t2-empty-state">
      <span className="t2-empty-icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && <div className="t2-empty-action">{action}</div>}
    </div>
  );
}

function Workspace() {
  const [pane, setPane] = useState<Pane>("resume");
  const [theme, setTheme] = useState<"paper" | "dark">("paper");
  const [sourceName, setSourceName] = useState("");
  const [sourceKind, setSourceKind] = useState<SourceKind>("");
  const [sourceText, setSourceText] = useState("");
  const [sourceAdded, setSourceAdded] = useState(false);
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [constraints, setConstraints] = useState("");
  const [postingTitle, setPostingTitle] = useState("");
  const [postingUrl, setPostingUrl] = useState("");
  const [postingText, setPostingText] = useState("");
  const [postingAdded, setPostingAdded] = useState(false);
  const [applicationNotes, setApplicationNotes] = useState("");
  const [practiceNotes, setPracticeNotes] = useState("");
  const [note, setNote] = useState<ReviewNote | null>(null);
  const [reviewChecked, setReviewChecked] = useState(false);
  const [approvedSnapshot, setApprovedSnapshot] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const evidenceInput = useRef<HTMLTextAreaElement>(null);

  const inputs: WorkspaceInputs = {
    sourceName,
    sourceKind,
    sourceText,
    sourceAdded,
    sourceConfirmed,
    targetRole,
    constraints,
    postingTitle,
    postingUrl,
    postingText,
    postingAdded,
    applicationNotes,
  };
  const snapshot = inputSnapshot(inputs);
  const noteIsStale = Boolean(note && note.snapshot !== snapshot);
  const noteIsApproved = Boolean(
    note && !noteIsStale && approvedSnapshot === note.snapshot,
  );
  const canPrepare = sourceAdded && postingAdded;
  const nextActionLabel = !sourceAdded
    ? "Add your evidence"
    : !postingAdded
      ? "Add a posting"
      : !note || noteIsStale
        ? "Prepare review note"
        : !noteIsApproved
          ? "Review your note"
          : "Practice answers";

  function invalidateApproval() {
    if (approvedSnapshot)
      setMessage("Inputs changed. Your approval was cleared.");
    else setMessage("");
    setApprovedSnapshot(null);
    setReviewChecked(false);
  }

  function editSource(edit: () => void) {
    invalidateApproval();
    setSourceAdded(false);
    setSourceConfirmed(false);
    edit();
  }

  function editPosting(edit: () => void) {
    invalidateApproval();
    setPostingAdded(false);
    edit();
  }

  function navigate(nextPane: Pane) {
    setPane(nextPane);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function focusEvidence() {
    setPane("resume");
    setMessage("");
    window.setTimeout(() => evidenceInput.current?.focus(), 0);
  }

  function addEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceName.trim() || !sourceText.trim()) {
      setMessage("Give your source a name and add its text.");
      return;
    }
    invalidateApproval();
    setSourceAdded(true);
    setMessage(
      "Evidence added in this tab. Your original text is kept intact.",
    );
  }

  async function importText(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt") || file.size > 200_000) {
      setMessage("Choose a plain .txt file smaller than 200 KB.");
      return;
    }
    try {
      const text = await file.text();
      editSource(() => {
        setSourceName(file.name);
        setSourceText(text);
      });
      setMessage(
        "Text imported into the editor. Add the evidence to put it in your trail.",
      );
    } catch {
      setMessage(
        "This file could not be read. You can paste its text into the editor.",
      );
    }
  }

  function addPosting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!postingTitle.trim() || !postingText.trim()) {
      setMessage("Add the posting title and the original posting text.");
      return;
    }
    if (!postingUrlIsValid(postingUrl)) {
      setMessage(
        "Use a full http:// or https:// posting URL, or leave it empty.",
      );
      return;
    }
    invalidateApproval();
    setPostingAdded(true);
    setMessage(
      "Posting added by you. Fit has not been assessed and freshness has not been verified.",
    );
  }

  function prepareNote() {
    if (!canPrepare) return;
    setNote(prepareReviewNote(inputs));
    setApprovedSnapshot(null);
    setReviewChecked(false);
    setMessage(
      "Review note prepared from the exact text you entered. It awaits your review.",
    );
  }

  function approveNote() {
    if (!note || noteIsStale || !reviewChecked) return;
    setApprovedSnapshot(note.snapshot);
    setMessage("You approved this exact local note. Nothing has been sent.");
  }

  function takeNextStep() {
    if (!sourceAdded) {
      focusEvidence();
    } else if (!postingAdded) {
      navigate("matches");
    } else if (!note || noteIsStale) {
      navigate("applications");
      prepareNote();
    } else {
      navigate(noteIsApproved ? "interview" : "applications");
    }
  }

  function downloadNote() {
    if (!note || !noteIsApproved) return;
    const file = new Blob(
      [
        `${note.text}\n\nApproval: Approved by you for this exact snapshot.\nNothing has been sent.\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "taco-review-note.txt";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Download requested for your approved review note.");
  }

  const evidenceLedger = (
    <SuitePanel className="t2-panel t2-ledger-panel">
      <details className="t2-ledger">
        <summary>
          What is established?
          <span className="t2-details-marker" aria-hidden="true">
            +
          </span>
        </summary>
        <div className="t2-ledger-content">
          <p className="t2-supporting">
            The labels describe where the text came from, and what you have
            reviewed.
          </p>
          <dl>
            <div>
              <dt>Your source</dt>
              <dd>
                {sourceAdded ? (
                  <>
                    <Badge state="verified" label="From your source" />
                    <span className="t2-filename">{sourceName}</span>
                  </>
                ) : (
                  <Badge state="missing" label="No source added" />
                )}
              </dd>
            </div>
            <div>
              <dt>Source confirmation</dt>
              <dd>
                {sourceAdded && sourceConfirmed ? (
                  <Badge state="verified" label="Confirmed by you" />
                ) : (
                  <Badge state="missing" label="Not confirmed by you" />
                )}
              </dd>
            </div>
            <div>
              <dt>Your direction</dt>
              <dd>
                {targetRole.trim() ? (
                  <>
                    <Badge state="verified" label="Entered by you" />
                    <span>{targetRole}</span>
                  </>
                ) : (
                  <Badge state="missing" label="Target role not provided" />
                )}
              </dd>
            </div>
            <div>
              <dt>Job posting</dt>
              <dd>
                {postingAdded ? (
                  <>
                    <Badge state="verified" label="Added by you" />
                    <span>Fit not assessed. Freshness not verified.</span>
                  </>
                ) : (
                  <Badge state="missing" label="No posting added" />
                )}
              </dd>
            </div>
            <div>
              <dt>Review note</dt>
              <dd>
                {note ? (
                  <Badge
                    state={noteIsApproved ? "verified" : "draft"}
                    label={
                      noteIsApproved
                        ? "Approved by you"
                        : noteIsStale
                          ? "Inputs changed — prepare again"
                          : "Awaiting review"
                    }
                  />
                ) : (
                  <Badge state="missing" label="No review note prepared" />
                )}
              </dd>
            </div>
          </dl>
          <p className="t2-fine-print">
            Your confirmation records your choice. It does not independently
            verify a source. No model inference is performed in this concept.
          </p>
        </div>
      </details>
    </SuitePanel>
  );

  const sourceExcerpt = sourceAdded ? (
    <div className="t2-source-result">
      <div className="t2-result-top">
        <span className="t2-filename">{sourceName}</span>
        <Badge state="verified" label="From your source" />
      </div>
      {sourceKind && <p className="t2-source-kind">{sourceKind}</p>}
      <div className="t2-verbatim" role="region" aria-label="Original source text" tabIndex={0}>
        <pre>{sourceText}</pre>
      </div>
      <p className="t2-fine-print">
        Original text, displayed verbatim. No career claims have been added.
      </p>
      <label className="t2-checkbox-label">
        <input
          type="checkbox"
          checked={sourceConfirmed}
          onChange={(event) => {
            invalidateApproval();
            setSourceConfirmed(event.target.checked);
          }}
        />
        <span>Confirm this source</span>
      </label>
      <p className="t2-fine-print">
        This is your confirmation, not an independent verification.
      </p>
      {sourceConfirmed && <Badge state="verified" label="Confirmed by you" />}
    </div>
  ) : (
    <EmptyState icon="source" title="Nothing about you has been assumed.">
      Add a real source to see its words here. Your evidence will stay separate
      from anything awaiting review.
    </EmptyState>
  );

  return (
    <div className="taco2" data-theme={theme}>
      <a className="t2-skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <header className="t2-topbar">
        <div className="t2-brand">
          <span className="t2-mark-frame">
            <img src="/public/brand/taco-mark.svg" alt="" />
          </span>
          <div className="t2-brand-copy">
            <span className="t2-brand-name">Taco</span>
            <span className="t2-concept-label">Taco 2.0 · local concept</span>
          </div>
        </div>
        <div className="t2-topbar-actions">
          <span className="t2-private-note">
            <Icon name="lock" />
            Your entries stay in this tab.
          </span>
          <Button
            className="t2-theme-toggle"
            onClick={() => setTheme(theme === "paper" ? "dark" : "paper")}
            aria-label={`Switch to ${theme === "paper" ? "dark" : "paper"} view`}
          >
            <Icon name={theme === "paper" ? "moon" : "sun"} />
            <span>{theme === "paper" ? "Dark view" : "Paper view"}</span>
          </Button>
        </div>
      </header>
      <div className="t2-layout">
        <aside className="t2-sidebar">
          <p className="t2-eyebrow">Your workspace</p>
          <nav aria-label="Workspace">
            {destinations.map((destination) => (
              <button
                key={destination.id}
                type="button"
                className={`t2-nav-item ${pane === destination.id ? "is-active" : ""}`}
                aria-current={pane === destination.id ? "page" : undefined}
                onClick={() => navigate(destination.id)}
              >
                <Icon name={destination.icon} />
                <span>
                  <span className="t2-nav-title">{destination.label}</span>
                  <span className="t2-nav-detail">{destination.detail}</span>
                </span>
              </button>
            ))}
          </nav>
          <div className="t2-sidebar-note">
            <span className="t2-sidebar-rule" />
            <p>
              Built on your evidence.
              <br />
              Moved by your choice.
            </p>
            <span className="t2-fine-print">
              A local concept, ready to explore.
            </span>
          </div>
        </aside>
        <div className="t2-main-column">
          <nav className="t2-quick-tools" aria-label="Quick tools">
            {destinations.map((destination) => (
              <button
                key={destination.id}
                type="button"
                className={pane === destination.id ? "is-active" : ""}
                aria-label={destination.label}
                aria-current={pane === destination.id ? "page" : undefined}
                onClick={() => navigate(destination.id)}
              >
                <Icon name={destination.icon} />
                <span>{destination.shortLabel}</span>
              </button>
            ))}
          </nav>
          <main id="workspace-content" tabIndex={-1}>
            <SuiteToolShell
              variant="workbench"
              noBackground
              className="t2-shell"
              contentClassName="t2-shell-content"
            >
              <header className="t2-workspace-header">
                <div>
                  <p className="t2-eyebrow">A little clarity. A next step.</p>
                  <h1>
                    Your next move,
                    <br />
                    <span>with evidence.</span>
                  </h1>
                  <p className="t2-intro">
                    Bring what is true. Choose what comes next.
                    <br className="t2-desktop-break" /> Keep the review in your
                    hands.
                  </p>
                </div>
                <div className="t2-header-side">
                  <Button variant="primary" onClick={takeNextStep}>
                    {nextActionLabel}
                    <Icon name="arrow" />
                  </Button>
                  <p className="t2-mobile-privacy">
                    <Icon name="lock" />
                    Your entries stay in this tab.
                  </p>
                  <p className="t2-header-caption">
                    {sourceAdded
                      ? "Your source stays in this tab."
                      : "No source is loaded about you."}
                  </p>
                </div>
              </header>
              <div className="t2-section-label">
                <span>
                  {
                    destinations.find((destination) => destination.id === pane)
                      ?.label
                  }
                </span>
                <span className="t2-section-line" />
                <span className="t2-section-context">
                  {pane === "resume"
                    ? "Source first"
                    : pane === "matches"
                      ? "Your posting, your choice"
                      : pane === "applications"
                        ? "Review before action"
                        : "Practice with context"}
                </span>
              </div>
              <div
                className="t2-status-message"
                role="status"
                aria-live="polite"
              >
                {message}
              </div>
              {pane === "resume" && (
                <div className="t2-workspace-grid">
                  <div className="t2-pane-stack">
                    <SuitePanel className="t2-panel t2-composer-panel">
                      <PanelHeading
                        eyebrow="01 / Evidence"
                        title="Your source, in your words."
                      >
                        A resume, project notes, or a piece of work you can
                        stand behind. Start with one real source.
                      </PanelHeading>
                      <form onSubmit={addEvidence} className="t2-form">
                        <div className="t2-field-grid">
                          <label className="t2-field">
                            <span>Source name</span>
                            <input
                              value={sourceName}
                              onChange={(event) =>
                                editSource(() =>
                                  setSourceName(event.target.value),
                                )
                              }
                              required
                              placeholder="Name this source"
                              autoComplete="off"
                            />
                          </label>
                          <label className="t2-field">
                            <span>
                              Source type <em>(optional)</em>
                            </span>
                            <select
                              value={sourceKind}
                              onChange={(event) =>
                                editSource(() =>
                                  setSourceKind(
                                    event.target.value as SourceKind,
                                  ),
                                )
                              }
                            >
                              <option value="">Choose a source type</option>
                              <option value="Resume">Resume</option>
                              <option value="Project evidence">
                                Project evidence
                              </option>
                              <option value="Other evidence">
                                Other evidence
                              </option>
                            </select>
                          </label>
                        </div>
                        <label className="t2-field">
                          <span>Your evidence</span>
                          <textarea
                            ref={evidenceInput}
                            id="evidence-text"
                            value={sourceText}
                            onChange={(event) =>
                              editSource(() =>
                                setSourceText(event.target.value),
                              )
                            }
                            required
                            placeholder="Paste text from your resume or a real piece of work."
                            rows={7}
                            spellCheck={false}
                            aria-describedby="evidence-help"
                          />
                        </label>
                        <p id="evidence-help" className="t2-fine-print">
                          We keep the text you provide. This concept does not
                          rewrite it or assess your resume.
                        </p>
                        <div className="t2-form-actions">
                          <Button type="submit" variant="primary">
                            {sourceAdded ? "Update evidence" : "Add evidence"}
                            <Icon name="plus" />
                          </Button>
                          <label className="t2-button btn-secondary t2-file-label">
                            Import .txt
                            <input
                              type="file"
                              className="t2-sr-only"
                              aria-label="Import a plain text file"
                              accept=".txt,text/plain"
                              onChange={(event) => {
                                void importText(event.target.files?.[0]);
                                event.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </form>
                    </SuitePanel>
                    <SuitePanel className="t2-panel t2-direction-panel">
                      <PanelHeading
                        eyebrow="02 / Direction"
                        title="Where would you like to go?"
                      >
                        Add a role and any constraints that matter to you. Both
                        are optional here.
                      </PanelHeading>
                      <div className="t2-form">
                        <label className="t2-field">
                          <span>
                            Target role <em>(optional)</em>
                          </span>
                          <input
                            value={targetRole}
                            onChange={(event) => {
                              invalidateApproval();
                              setTargetRole(event.target.value);
                            }}
                            placeholder="A role you want to explore"
                            autoComplete="off"
                          />
                        </label>
                        <label className="t2-field">
                          <span>
                            Your constraints <em>(optional)</em>
                          </span>
                          <textarea
                            value={constraints}
                            onChange={(event) => {
                              invalidateApproval();
                              setConstraints(event.target.value);
                            }}
                            placeholder="What needs to be true for your next move?"
                            rows={2}
                          />
                        </label>
                      </div>
                    </SuitePanel>
                  </div>
                  <div className="t2-pane-stack">
                    <SuitePanel className="t2-panel t2-trail-panel">
                      <PanelHeading
                        eyebrow="The evidence trail"
                        title={
                          sourceAdded
                            ? "Your words, kept intact."
                            : "An honest starting point."
                        }
                      />
                      {sourceExcerpt}
                    </SuitePanel>
                    {evidenceLedger}
                    <div className="t2-next-step">
                      <p className="t2-eyebrow">When you’re ready</p>
                      <p>
                        Bring a real posting, then put the source and your notes
                        beside it.
                      </p>
                      <Button
                        variant="quiet"
                        onClick={() => navigate("matches")}
                      >
                        Go to Matches
                        <Icon name="arrow" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {pane === "matches" && (
                <div className="t2-workspace-grid">
                  <div className="t2-pane-stack">
                    <SuitePanel className="t2-panel t2-composer-panel">
                      <PanelHeading
                        eyebrow="Choose an opportunity"
                        title="Add a real posting."
                      >
                        Bring the posting you’re considering. You decide what
                        belongs in this workspace.
                      </PanelHeading>
                      <form onSubmit={addPosting} className="t2-form">
                        <label className="t2-field">
                          <span>Posting title</span>
                          <input
                            value={postingTitle}
                            onChange={(event) =>
                              editPosting(() =>
                                setPostingTitle(event.target.value),
                              )
                            }
                            required
                            placeholder="The title from the posting"
                            autoComplete="off"
                          />
                        </label>
                        <label className="t2-field">
                          <span>
                            Posting URL <em>(optional)</em>
                          </span>
                          <input
                            type="url"
                            value={postingUrl}
                            onChange={(event) =>
                              editPosting(() =>
                                setPostingUrl(event.target.value),
                              )
                            }
                            placeholder="Paste the original source URL"
                            autoComplete="off"
                            inputMode="url"
                            aria-describedby="posting-url-help"
                          />
                        </label>
                        <p id="posting-url-help" className="t2-fine-print">
                          Stored as a reference in this tab. The URL is not
                          opened or checked.
                        </p>
                        <label className="t2-field">
                          <span>Posting text</span>
                          <textarea
                            value={postingText}
                            onChange={(event) =>
                              editPosting(() =>
                                setPostingText(event.target.value),
                              )
                            }
                            required
                            rows={8}
                            placeholder="Paste the original job posting text."
                            spellCheck={false}
                          />
                        </label>
                        <div className="t2-form-actions">
                          <Button type="submit" variant="primary">
                            {postingAdded ? "Update posting" : "Add posting"}
                            <Icon name="plus" />
                          </Button>
                        </div>
                      </form>
                    </SuitePanel>
                  </div>
                  <div className="t2-pane-stack">
                    <SuitePanel className="t2-panel t2-trail-panel">
                      <PanelHeading
                        eyebrow="In this tab"
                        title={
                          postingAdded
                            ? "An opportunity you chose."
                            : "Your shortlist starts here."
                        }
                      />
                      {postingAdded ? (
                        <div className="t2-posting-result">
                          <Badge state="verified" label="Added by you" />
                          <h3>{postingTitle}</h3>
                          {postingUrl && (
                            <div className="t2-url-reference">
                              <span className="t2-eyebrow">Source URL</span>
                              <p>{postingUrl}</p>
                            </div>
                          )}
                          <dl className="t2-unmeasured">
                            <div>
                              <dt>Fit</dt>
                              <dd>Not assessed</dd>
                            </div>
                            <div>
                              <dt>Freshness</dt>
                              <dd>Not verified</dd>
                            </div>
                          </dl>
                          <details className="t2-original-posting">
                            <summary>
                              Read the original posting
                              <span
                                className="t2-details-marker"
                                aria-hidden="true"
                              >
                                +
                              </span>
                            </summary>
                            <div className="t2-verbatim" role="region" aria-label="Original posting text" tabIndex={0}>
                              <pre>{postingText}</pre>
                            </div>
                          </details>
                          <Button onClick={() => navigate("applications")}>
                            Create a review note
                            <Icon name="arrow" />
                          </Button>
                        </div>
                      ) : (
                        <EmptyState icon="matches" title="No postings added.">
                          Your shortlist is empty. This local concept does not
                          discover jobs or calculate a fit score.
                        </EmptyState>
                      )}
                    </SuitePanel>
                    {evidenceLedger}
                  </div>
                </div>
              )}
              {pane === "applications" && (
                <div className="t2-workspace-grid t2-review-grid">
                  <div className="t2-pane-stack">
                    <SuitePanel className="t2-panel t2-composer-panel">
                      <PanelHeading
                        eyebrow="Before your next move"
                        title="Make room for review."
                      >
                        Collect your source, a posting, and your own notes into
                        one local review note.
                      </PanelHeading>
                      <dl className="t2-review-context">
                        <div>
                          <dt>Your source</dt>
                          <dd>
                            {sourceAdded ? (
                              <span className="t2-filename">{sourceName}</span>
                            ) : (
                              "No source added"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Your posting</dt>
                          <dd>
                            {postingAdded ? postingTitle : "No posting added"}
                          </dd>
                        </div>
                        <div>
                          <dt>Target role</dt>
                          <dd>{targetRole || "Not provided"}</dd>
                        </div>
                      </dl>
                      {!canPrepare && (
                        <div className="t2-prerequisites">
                          <p>
                            A source and a posting are needed before preparing a
                            note.
                          </p>
                          <div className="t2-form-actions">
                            {!sourceAdded && (
                              <Button onClick={focusEvidence}>
                                Add your evidence
                                <Icon name="plus" />
                              </Button>
                            )}
                            {!postingAdded && (
                              <Button onClick={() => navigate("matches")}>
                                Add a posting
                                <Icon name="plus" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="t2-form">
                        <label className="t2-field">
                          <span>
                            Your application notes <em>(optional)</em>
                          </span>
                          <textarea
                            value={applicationNotes}
                            onChange={(event) => {
                              invalidateApproval();
                              setApplicationNotes(event.target.value);
                            }}
                            rows={6}
                            placeholder="What do you want to remember or review about this opportunity?"
                          />
                        </label>
                        <p className="t2-fine-print">
                          Your notes will be included verbatim. No tailored
                          resume or cover letter is generated.
                        </p>
                        <Button
                          variant="primary"
                          disabled={!canPrepare}
                          onClick={prepareNote}
                        >
                          {note ? "Prepare note again" : "Prepare review note"}
                          <Icon name="arrow" />
                        </Button>
                      </div>
                    </SuitePanel>
                    {evidenceLedger}
                  </div>
                  <div className="t2-pane-stack">
                    <SuitePanel className="t2-panel t2-review-panel">
                      <PanelHeading
                        eyebrow="Local review note"
                        title={
                          note
                            ? "Read it. Make it yours."
                            : "Your review comes first."
                        }
                      />
                      {note ? (
                        <div className="t2-review-result">
                          <Badge
                            state={noteIsApproved ? "verified" : "draft"}
                            label={
                              noteIsApproved
                                ? "Approved by you"
                                : noteIsStale
                                  ? "Inputs changed — prepare again"
                                  : "Awaiting review"
                            }
                          />
                          {noteIsStale && (
                            <p className="t2-stale-message">
                              This note reflects earlier inputs. Prepare it
                              again before reviewing or downloading.
                            </p>
                          )}
                          <div className="t2-note-document" role="region" aria-label="Review note text" tabIndex={0}>
                            <pre>{note.text}</pre>
                          </div>
                          <label className="t2-checkbox-label">
                            <input
                              type="checkbox"
                              checked={reviewChecked}
                              disabled={noteIsStale || noteIsApproved}
                              onChange={(event) =>
                                setReviewChecked(event.target.checked)
                              }
                            />
                            <span>I reviewed this exact note.</span>
                          </label>
                          <div className="t2-form-actions">
                            <Button
                              variant="primary"
                              onClick={approveNote}
                              disabled={
                                !reviewChecked || noteIsStale || noteIsApproved
                              }
                            >
                              {noteIsApproved
                                ? "Note approved"
                                : "Approve this note"}
                              <Icon name="check" />
                            </Button>
                            <Button
                              onClick={downloadNote}
                              disabled={!noteIsApproved}
                            >
                              Download .txt
                              <Icon name="download" />
                            </Button>
                          </div>
                          <p className="t2-fine-print">
                            Approval applies to this exact note. Changes to its
                            inputs clear it. Nothing has been sent.
                          </p>
                        </div>
                      ) : (
                        <EmptyState
                          icon="note"
                          title="No review note prepared."
                        >
                          The note will collect only the source, posting,
                          direction, and notes you entered. It will await your
                          review.
                        </EmptyState>
                      )}
                    </SuitePanel>
                  </div>
                </div>
              )}
              {pane === "interview" && (
                <div className="t2-workspace-grid">
                  <div className="t2-pane-stack">
                    <SuitePanel className="t2-panel t2-composer-panel">
                      <PanelHeading
                        eyebrow="A little practice"
                        title="Start from something real."
                      >
                        Use your source as a reference. Give the answer in your
                        own words.
                      </PanelHeading>
                      {sourceAdded ? (
                        <div className="t2-interview-content">
                          <Badge
                            state="verified"
                            label="Prompts linked to your source"
                          />
                          <p className="t2-supporting">
                            These are general practice prompts, using{" "}
                            <span className="t2-filename">{sourceName}</span> as
                            context. No answer or score has been inferred.
                          </p>
                          <ol className="t2-prompts">
                            <li>
                              <h3>Talk through the work.</h3>
                              <p>
                                Choose a passage in your source. What was
                                happening, and what needed to be done?
                              </p>
                            </li>
                            <li>
                              <h3>Make your part clear.</h3>
                              <p>
                                What did you personally contribute to the work
                                you described? Separate your actions from the
                                team’s.
                              </p>
                            </li>
                            <li>
                              <h3>Describe the outcome honestly.</h3>
                              <p>
                                What can your source establish about the result?
                                If something is missing, say what is still
                                unknown.
                              </p>
                            </li>
                          </ol>
                          <label className="t2-field">
                            <span>
                              Your practice notes <em>(optional)</em>
                            </span>
                            <textarea
                              value={practiceNotes}
                              onChange={(event) =>
                                setPracticeNotes(event.target.value)
                              }
                              rows={5}
                              placeholder="Use these notes to practice in your own words."
                            />
                          </label>
                          {practiceNotes && (
                            <Button
                              variant="quiet"
                              onClick={() => setPracticeNotes("")}
                            >
                              Clear practice notes
                            </Button>
                          )}
                        </div>
                      ) : (
                        <EmptyState
                          icon="interview"
                          title="Your practice needs a source."
                        >
                          Add real evidence first. Then use it as a reference
                          for general interview prompts.
                          <span className="t2-empty-inline-action">
                            <Button variant="primary" onClick={focusEvidence}>
                              Add your evidence
                              <Icon name="plus" />
                            </Button>
                          </span>
                        </EmptyState>
                      )}
                    </SuitePanel>
                  </div>
                  <div className="t2-pane-stack">
                    <SuitePanel className="t2-panel t2-trail-panel">
                      <PanelHeading
                        eyebrow="Your reference"
                        title="Keep the evidence close."
                      />
                      {sourceExcerpt}
                    </SuitePanel>
                    {evidenceLedger}
                  </div>
                </div>
              )}
              <footer className="t2-workspace-footer">
                <span className="t2-footer-dot" aria-hidden="true" />
                <p>
                  Your words are the starting point. Your approval is the next
                  step.
                </p>
                <span>Local concept · no sending</span>
              </footer>
            </SuiteToolShell>
          </main>
        </div>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Workspace root is missing.");
createRoot(root).render(<Workspace />);
