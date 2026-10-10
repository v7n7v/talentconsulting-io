'use client';

import { Fragment } from 'react';
import { cleanResumeText, type CanonicalResume } from '@/lib/resume-normalizer';

interface TechnicalSignalProps {
  resume: CanonicalResume;
  colors: { primary: string; accent: string; text: string };
}

const QUANTIFIED_SIGNAL =
  /(\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?\s?x|\$?\d[\d,.]*(?:\s?(?:k|m|b|thousand|million|billion))?)/gi;
const QUANTIFIED_SIGNAL_PART =
  /^(?:\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?\s?x|\$?\d[\d,.]*(?:\s?(?:k|m|b|thousand|million|billion))?)$/i;

function SignalText({ children, accent = '#0a9f36' }: { children: string; accent?: string }) {
  return (
    <>
      {children.split(QUANTIFIED_SIGNAL).map((part, index) => (
        QUANTIFIED_SIGNAL_PART.test(part)
          ? <strong key={`${part}-${index}`} style={{ color: accent }}>{part}</strong>
          : <Fragment key={`${part}-${index}`}>{part}</Fragment>
      ))}
    </>
  );
}

function SignalSectionTitle({
  children,
  colors,
}: {
  children: string;
  colors: TechnicalSignalProps['colors'];
}) {
  return (
    <div className="flex items-center gap-[1.6cqw]">
      <h2
        className="shrink-0 font-mono font-bold uppercase tracking-[0.025em]"
        style={{ color: colors.accent, fontSize: '1.18cqw' }}
      >
        {children}
      </h2>
      <span aria-hidden="true" className="h-px flex-1 bg-black/75" />
    </div>
  );
}

export function TechnicalSignalTemplate({ resume, colors }: TechnicalSignalProps) {
  const contact = [
    cleanResumeText(resume.email),
    cleanResumeText(resume.phone),
    cleanResumeText(resume.location),
    cleanResumeText(resume.linkedin),
    cleanResumeText(resume.website),
    ...(resume.links || []).map(cleanResumeText),
  ].filter(Boolean);
  const coreSystems = resume.skills.flatMap(group => group.items).slice(0, 14);
  const name = cleanResumeText(resume.name) || 'Resume';

  return (
    <article
      aria-label={`${name} resume in the Technical Signal template`}
      className="overflow-hidden"
      style={{
        backgroundColor: '#fbfbfa',
        color: colors.text,
        containerType: 'inline-size',
        minHeight: '297mm',
        fontFamily: '"Courier New", Courier, monospace',
      }}
    >
      <div className="px-[4.6cqw] pb-[4.8cqw] pt-[3.8cqw]">
        <header>
          <div className="flex items-center gap-[1.4cqw]">
            <p
              className="shrink-0 font-mono font-bold uppercase tracking-[0.045em]"
              style={{ color: colors.accent, fontSize: '1.05cqw' }}
            >
              Technical Signal //
            </p>
            <span aria-hidden="true" className="h-px flex-1" style={{ backgroundColor: colors.accent }} />
          </div>

          <h1
            className="mt-[1.15cqw] break-words font-sans font-black uppercase leading-[0.92] tracking-[-0.035em]"
            style={{
              color: colors.primary,
              fontFamily: 'Arial Narrow, Inter, Arial, sans-serif',
              fontSize: name.length > 24 ? '5.2cqw' : '6.25cqw',
            }}
          >
            {name}
          </h1>

          {cleanResumeText(resume.title) && (
            <p
              className="mt-[0.75cqw] break-words font-mono font-bold uppercase leading-tight"
              style={{ color: colors.accent, fontSize: '1.65cqw' }}
            >
              {cleanResumeText(resume.title)}
            </p>
          )}

          {contact.length > 0 && (
            <address className="mt-[0.95cqw] flex flex-wrap gap-x-[1.65cqw] gap-y-[0.35cqw] not-italic">
              {contact.map((item, index) => (
                <span
                  key={item}
                  className="break-all font-mono"
                  style={{ color: colors.text, fontSize: '1.05cqw' }}
                >
                  {item}{index < contact.length - 1 && (
                    <span aria-hidden="true" className="ml-[1.65cqw]" style={{ color: colors.accent }}>|</span>
                  )}
                </span>
              ))}
            </address>
          )}
        </header>

        {resume.skills.length > 0 && (
          <section className="mt-[2.45cqw]">
            <SignalSectionTitle colors={colors}>Technical Capabilities Index</SignalSectionTitle>
            <div className="mt-[1.15cqw]">
              {resume.skills.map((group, index) => (
                <div
                  key={group.id || `${group.category}-${index}`}
                  className="grid grid-cols-[19%_81%] border-b border-black/15 py-[0.45cqw] last:border-b-0"
                >
                  <h3
                    className="pr-[1cqw] font-mono font-bold uppercase"
                    style={{ color: colors.accent, fontSize: '0.95cqw' }}
                  >
                    {cleanResumeText(group.category)} /
                  </h3>
                  <p className="font-mono leading-[1.35]" style={{ fontSize: '0.96cqw' }}>
                    {group.items.map(item => cleanResumeText(item)).filter(Boolean).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {cleanResumeText(resume.summary) && (
          <section className="mt-[2.55cqw]">
            <SignalSectionTitle colors={colors}>Technical Summary</SignalSectionTitle>
            <p className="mt-[1.1cqw] font-mono leading-[1.62]" style={{ fontSize: '1cqw' }}>
              <SignalText>{cleanResumeText(resume.summary)}</SignalText>
            </p>
          </section>
        )}

        {coreSystems.length > 0 && (
          <section className="mt-[2.35cqw]">
            <SignalSectionTitle colors={colors}>Core Systems</SignalSectionTitle>
            <p className="mt-[1cqw] font-mono leading-[1.55]" style={{ fontSize: '0.98cqw' }}>
              {coreSystems.map((system, index) => (
                <Fragment key={`${system}-${index}`}>
                  {index > 0 && <span className="mx-[0.85cqw]" style={{ color: colors.accent }}>|</span>}
                  {system}
                </Fragment>
              ))}
            </p>
          </section>
        )}

        {resume.experience.length > 0 && (
          <section className="mt-[2.55cqw]">
            <SignalSectionTitle colors={colors}>Experience</SignalSectionTitle>
            <div className="mt-[1.25cqw] space-y-[2cqw]">
              {resume.experience.map((experience, experienceIndex) => (
                <article key={experience.id || `${experience.company}-${experience.role}-${experienceIndex}`} className="break-inside-avoid">
                  <div className="flex items-start justify-between gap-[2cqw]">
                    <div className="min-w-0">
                      <h3 className="font-mono font-bold uppercase" style={{ fontSize: '1.12cqw' }}>
                        {cleanResumeText(experience.company)}
                      </h3>
                      <p
                        className="mt-[0.22cqw] font-mono font-bold uppercase"
                        style={{ color: colors.accent, fontSize: '0.96cqw' }}
                      >
                        {cleanResumeText(experience.role)}
                      </p>
                    </div>
                    {cleanResumeText(experience.duration) && (
                      <p className="shrink-0 font-mono uppercase" style={{ fontSize: '0.9cqw' }}>
                        {cleanResumeText(experience.duration)}
                      </p>
                    )}
                  </div>
                  {experience.achievements.length > 0 && (
                    <ul className="mt-[0.65cqw] space-y-[0.28cqw]">
                      {experience.achievements.map((achievement, achievementIndex) => (
                        <li
                          key={`${achievement}-${achievementIndex}`}
                          className="grid grid-cols-[1.2cqw_1fr] font-mono leading-[1.42]"
                          style={{ fontSize: '0.9cqw' }}
                        >
                          <span aria-hidden="true" style={{ color: colors.accent }}>—</span>
                          <span><SignalText>{cleanResumeText(achievement)}</SignalText></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {resume.certifications.length > 0 && (
          <section className="mt-[2.55cqw]">
            <SignalSectionTitle colors={colors}>Selected Credentials</SignalSectionTitle>
            <div className="mt-[1cqw] grid grid-cols-2 gap-x-[3cqw] gap-y-[0.4cqw]">
              {resume.certifications.map((certification, index) => (
                <p key={`${certification}-${index}`} className="font-mono" style={{ fontSize: '0.92cqw' }}>
                  <span className="mr-[0.75cqw]" style={{ color: colors.accent }}>//</span>
                  {cleanResumeText(certification)}
                </p>
              ))}
            </div>
          </section>
        )}

        {resume.education.length > 0 && (
          <section className="mt-[2.55cqw]">
            <SignalSectionTitle colors={colors}>Education</SignalSectionTitle>
            <div className="mt-[1cqw] space-y-[0.45cqw]">
              {resume.education.map((education, index) => (
                <div
                  key={education.id || `${education.institution}-${index}`}
                  className="grid grid-cols-[32%_1fr_auto] gap-[1.4cqw] font-mono"
                  style={{ fontSize: '0.9cqw' }}
                >
                  <p className="font-bold uppercase">{cleanResumeText(education.degree)}</p>
                  <p className="uppercase">{cleanResumeText(education.institution)}</p>
                  <p className="uppercase">{cleanResumeText(education.year)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {(resume.additionalSections || []).map((section) => {
          const items = section.items.map(cleanResumeText).filter(Boolean);
          if (!cleanResumeText(section.title) && items.length === 0) return null;
          return <section key={section.id} className="mt-[2.55cqw]">
            <SignalSectionTitle colors={colors}>{cleanResumeText(section.title) || 'Additional information'}</SignalSectionTitle>
            <ul className="mt-[1cqw] space-y-[0.3cqw] font-mono" style={{ fontSize: '0.9cqw' }}>
              {items.map((item) => <li key={item}><span aria-hidden="true" style={{ color: colors.accent }}>—</span> {item}</li>)}
            </ul>
          </section>;
        })}

        <footer className="mt-[2.8cqw] flex items-center justify-between gap-[2cqw] border-t border-black/75 pt-[0.75cqw] font-mono uppercase">
          <p style={{ fontSize: '0.72cqw' }}>
            / Reliable systems. Measurable impact. /
          </p>
          <p style={{ color: colors.accent, fontSize: '0.72cqw' }}>Technical Signal // v1.0</p>
        </footer>
      </div>
    </article>
  );
}
