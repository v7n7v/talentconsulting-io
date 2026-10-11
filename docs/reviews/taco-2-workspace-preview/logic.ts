export type SourceKind = "" | "Resume" | "Project evidence" | "Other evidence";

export interface WorkspaceInputs {
  sourceName: string;
  sourceKind: SourceKind;
  sourceText: string;
  sourceAdded: boolean;
  sourceConfirmed: boolean;
  targetRole: string;
  constraints: string;
  postingTitle: string;
  postingUrl: string;
  postingText: string;
  postingAdded: boolean;
  applicationNotes: string;
}

export interface ReviewNote {
  snapshot: string;
  text: string;
}

/** Exact inputs bind the note and its approval; this is a local review artifact. */
export function inputSnapshot(inputs: WorkspaceInputs): string {
  return JSON.stringify(inputs);
}

export function postingUrlIsValid(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** No rewriting, inference, scoring, or additional claims about the person. */
export function prepareReviewNote(inputs: WorkspaceInputs): ReviewNote {
  const text = [
    "REVIEW NOTE",
    "Taco 2.0 · local concept",
    "",
    "This note collects the text and context you entered. It is not a tailored resume or cover letter.",
    "",
    "YOUR DIRECTION",
    `Target role: ${inputs.targetRole || "Not provided"}`,
    `Constraints: ${inputs.constraints || "Not provided"}`,
    "",
    "POSTING ADDED BY YOU",
    `Title: ${inputs.postingTitle}`,
    `Source URL: ${inputs.postingUrl || "Not provided"}`,
    "Fit: Not assessed",
    "Freshness: Not verified",
    "",
    "Posting text (verbatim):",
    inputs.postingText,
    "",
    "YOUR SOURCE",
    `Source name: ${inputs.sourceName}`,
    `Source type: ${inputs.sourceKind || "Not specified"}`,
    `Source confirmation: ${inputs.sourceConfirmed ? "Confirmed by you; not independently verified" : "Not confirmed by you; not independently verified"}`,
    "",
    "Source text (verbatim):",
    inputs.sourceText,
    "",
    "YOUR APPLICATION NOTES (VERBATIM)",
    inputs.applicationNotes || "Not provided",
    "",
    "LOCAL REVIEW",
    "Review this exact note before approving it. Changes to this note’s inputs clear approval. Nothing is sent from this concept.",
  ].join("\n");

  return { snapshot: inputSnapshot(inputs), text };
}
