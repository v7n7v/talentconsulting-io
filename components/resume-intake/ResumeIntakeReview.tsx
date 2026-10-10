"use client";

import "./resume-intake-review.css";

import type { CanonicalResume } from "@/lib/resume-normalizer";

export interface ResumeIntakeReviewProps {
  resume: CanonicalResume;
  fileName: string;
  onChange: (resume: CanonicalResume) => void;
  onConfirm: () => void;
  onReplace: () => void;
  confirming?: boolean;
  error?: string;
  confirmLabel?: string;
}

export function ResumeIntakeReview({
  resume,
  fileName,
  onChange,
  onConfirm,
  onReplace,
  confirming = false,
  error,
  confirmLabel = "Confirm and save source",
}: ResumeIntakeReviewProps) {
  const update = (patch: Partial<CanonicalResume>) =>
    onChange({ ...resume, ...patch });
  return (
    <section
      className="resume-intake-review"
      aria-label="Review extracted resume facts"
    >
      <header className="resume-intake-review__header">
        <div>
          <p className="resume-intake-review__eyebrow">
            Extracted source · {fileName}
          </p>
          <h2>Review your source facts before continuing.</h2>
          <p>
            Parser output is a draft for your correction. Confirm only when the
            source reads like your resume.
          </p>
        </div>
        <button
          type="button"
          onClick={onReplace}
          disabled={confirming}
          className="resume-intake-review__secondary"
        >
          Replace
        </button>
      </header>
      <div className="resume-intake-review__fields">
        <label>
          Name
          <input
            value={resume.name}
            disabled={confirming}
            onChange={(event) => update({ name: event.target.value })}
          />
        </label>
        <label>
          Headline
          <input
            value={resume.title}
            disabled={confirming}
            onChange={(event) => update({ title: event.target.value })}
          />
        </label>
        <label className="resume-intake-review__wide">
          Summary
          <textarea
            value={resume.summary}
            disabled={confirming}
            onChange={(event) => update({ summary: event.target.value })}
            rows={4}
          />
        </label>
        {(["email", "phone", "location"] as const).map((field) => (
          <label key={field}>
            {field[0].toUpperCase() + field.slice(1)}
            <input
              value={resume[field]}
              disabled={confirming}
              onChange={(event) => update({ [field]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="resume-intake-review__facts">
        <h3>Experience</h3>
        {resume.experience.map((entry, index) => (
          <fieldset key={index}>
            <legend>
              {entry.role || "Experience entry"} · {entry.company || "Company"}
            </legend>
            <input
              aria-label={`Company ${index + 1}`}
              value={entry.company}
              disabled={confirming}
              onChange={(event) => {
                const experience = [...resume.experience];
                experience[index] = { ...entry, company: event.target.value };
                update({ experience });
              }}
            />
            <input
              aria-label={`Role ${index + 1}`}
              value={entry.role}
              disabled={confirming}
              onChange={(event) => {
                const experience = [...resume.experience];
                experience[index] = { ...entry, role: event.target.value };
                update({ experience });
              }}
            />
            <input
              aria-label={`Duration ${index + 1}`}
              value={entry.duration}
              disabled={confirming}
              onChange={(event) => {
                const experience = [...resume.experience];
                experience[index] = { ...entry, duration: event.target.value };
                update({ experience });
              }}
            />
            <textarea
              aria-label={`Achievements ${index + 1}`}
              value={entry.achievements.join("\n")}
              disabled={confirming}
              rows={Math.max(2, entry.achievements.length)}
              onChange={(event) => {
                const experience = [...resume.experience];
                experience[index] = {
                  ...entry,
                  achievements: event.target.value.split("\n"),
                };
                update({ experience });
              }}
            />
            <button
              type="button"
              disabled={confirming}
              onClick={() => update({ experience: resume.experience.filter((_, itemIndex) => itemIndex !== index) })}
            >
              Remove experience
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={confirming}
          onClick={() => update({ experience: [...resume.experience, { company: "", role: "", duration: "", achievements: [""] }] })}
        >
          Add experience
        </button>
      </div>
      <div className="resume-intake-review__facts">
        <h3>Skills and education</h3>
        {resume.skills.map((group, index) => (
          <fieldset key={index}>
            <legend>Skill group {index + 1}</legend>
            <input value={group.category} disabled={confirming} aria-label={`Skill category ${index + 1}`} onChange={(event) => {
              const skills = [...resume.skills]; skills[index] = { ...group, category: event.target.value }; update({ skills });
            }} />
            <textarea value={group.items.join("\n")} disabled={confirming} aria-label={`Skills ${index + 1}`} onChange={(event) => {
              const skills = [...resume.skills]; skills[index] = { ...group, items: event.target.value.split("\n") }; update({ skills });
            }} rows={Math.max(2, group.items.length)} />
          </fieldset>
        ))}
        <button type="button" disabled={confirming} onClick={() => update({ skills: [...resume.skills, { category: "", items: [""] }] })}>Add skill group</button>
        {resume.education.map((entry, index) => (
          <fieldset key={index}>
            <legend>Education {index + 1}</legend>
            <input value={entry.degree} disabled={confirming} aria-label={`Degree ${index + 1}`} onChange={(event) => {
              const education = [...resume.education]; education[index] = { ...entry, degree: event.target.value }; update({ education });
            }} />
            <input value={entry.institution} disabled={confirming} aria-label={`Institution ${index + 1}`} onChange={(event) => {
              const education = [...resume.education]; education[index] = { ...entry, institution: event.target.value }; update({ education });
            }} />
            <input value={entry.year} disabled={confirming} aria-label={`Year ${index + 1}`} onChange={(event) => {
              const education = [...resume.education]; education[index] = { ...entry, year: event.target.value }; update({ education });
            }} />
          </fieldset>
        ))}
        <button type="button" disabled={confirming} onClick={() => update({ education: [...resume.education, { degree: "", institution: "", year: "" }] })}>Add education</button>
      </div>
      {error && (
        <p role="alert" className="resume-intake-review__error">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirming}
        className="resume-intake-review__primary"
      >
        {confirming ? "Saving source…" : confirmLabel}
      </button>
    </section>
  );
}
