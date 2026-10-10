'use client';

import { cleanResumeText, type CanonicalResume } from '@/lib/resume-normalizer';
import { getEditorialImpacts } from './editorial-authority-impact';

interface BrutalistVoltageProps {
  resume: CanonicalResume;
  colors: { primary: string; accent: string; text: string };
}

function VoltageSectionTitle({
  children,
  inverse = false,
  color,
}: {
  children: string;
  inverse?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-end gap-[1.4cqw] border-b-[0.48cqw] border-current pb-[0.48cqw]">
      <h2
        className="font-sans font-black uppercase leading-none tracking-[-0.035em]"
        style={{
          color: color || (inverse ? '#ffffff' : '#0a0a0a'),
          fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
          fontSize: '2.2cqw',
        }}
      >
        {children}
      </h2>
    </div>
  );
}

export function BrutalistVoltageTemplate({ resume, colors }: BrutalistVoltageProps) {
  const impacts = getEditorialImpacts(resume);
  const name = cleanResumeText(resume.name) || 'Resume';
  const nameParts = name.split(/\s+/);
  const firstName = nameParts.shift() || name;
  const lastName = nameParts.join(' ');
  const contact = [
    cleanResumeText(resume.website),
    cleanResumeText(resume.email),
    cleanResumeText(resume.phone),
    cleanResumeText(resume.location),
    ...(resume.links || []).map(cleanResumeText),
  ].filter(Boolean);
  const engagements = resume.experience.slice(0, 6);

  return (
    <article
      aria-label={`${name} resume in the Brutalist Voltage template`}
      className="overflow-hidden"
      style={{
        backgroundColor: '#f7f0e3',
        color: colors.text,
        containerType: 'inline-size',
        minHeight: '297mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      <header className={cleanResumeText(resume.summary) ? 'grid grid-cols-[64%_36%]' : 'grid grid-cols-1'}>
        <div className="grid grid-cols-[15%_85%]">
          <div className="flex items-center justify-center overflow-hidden py-[2.4cqw]">
            <p
              className="whitespace-nowrap font-sans font-black uppercase leading-none"
              style={{
                color: colors.primary,
                fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
                fontSize: '5.7cqw',
                transform: 'rotate(-90deg)',
              }}
            >
              Brutalist Voltage
            </p>
          </div>
          <div className="px-[1.7cqw] pb-[2.2cqw] pt-[2.5cqw]">
            <h1
              className="break-words font-sans font-black uppercase leading-[0.78] tracking-[-0.055em]"
              style={{
                color: colors.text,
                fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
                fontSize: name.length > 24 ? '7.4cqw' : '9.4cqw',
              }}
            >
              <span className="block">{firstName}</span>
              {lastName && <span className="block">{lastName}</span>}
            </h1>
            <div className="mt-[1.45cqw] border-t-[0.55cqw] border-black pt-[1.2cqw]">
              {cleanResumeText(resume.title) && (
                <p
                  className="font-sans font-black uppercase leading-none"
                  style={{
                    color: colors.accent,
                    fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
                    fontSize: '3.15cqw',
                  }}
                >
                  {cleanResumeText(resume.title)}
                </p>
              )}
              <p className="mt-[0.5cqw] font-sans font-black uppercase tracking-[-0.02em]" style={{ fontSize: '1.25cqw' }}>
                Strategy. Clarity. Measurable impact.
              </p>
            </div>
          </div>
        </div>

        {cleanResumeText(resume.summary) && (
          <section className="px-[3.8cqw] py-[4.5cqw] text-white" style={{ backgroundColor: colors.primary }}>
            <VoltageSectionTitle inverse>Point of View</VoltageSectionTitle>
            <p className="mt-[2cqw] whitespace-pre-line font-sans leading-[1.5]" style={{ fontSize: '1.45cqw' }}>
              {cleanResumeText(resume.summary)}
            </p>
          </section>
        )}
      </header>

      {impacts.length > 0 && (
        <section className="bg-black px-[17.8cqw] py-[1.8cqw] text-white">
          <VoltageSectionTitle color="#dfff00">Signature Wins</VoltageSectionTitle>
          <div
            className="mt-[1cqw] grid"
            style={{ gridTemplateColumns: `repeat(${impacts.length}, minmax(0, 1fr))` }}
          >
            {impacts.map((impact, index) => (
              <div
                key={`${impact.experienceIndex}-${impact.achievementIndex}`}
                className="min-w-0 px-[1.45cqw] first:pl-0 last:pr-0"
                style={{ borderLeft: index > 0 ? '1px solid #dfff00' : undefined }}
              >
                <p
                  className="break-words font-sans font-black leading-none tracking-[-0.04em]"
                  style={{
                    color: '#dfff00',
                    fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
                    fontSize: impacts.length > 3 ? '4.2cqw' : '5cqw',
                  }}
                >
                  {impact.metric}
                </p>
                <p className="mt-[0.35cqw] font-sans font-bold uppercase" style={{ color: '#dfff00', fontSize: '0.95cqw' }}>
                  Measurable impact
                </p>
                <p className="mt-[0.25cqw] font-sans leading-[1.3] text-white" style={{ fontSize: '0.86cqw' }}>
                  {impact.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className={`grid ${resume.skills.length > 0 || engagements.length > 1 ? 'grid-cols-[64%_36%]' : 'grid-cols-1'}`}>
        <main className="border-r border-black px-[17.8cqw] py-[1.8cqw] pr-[2.2cqw]">
          {resume.experience.length > 0 && (
            <section>
              <VoltageSectionTitle>Experience</VoltageSectionTitle>
              <div className="mt-[1.2cqw]">
                {resume.experience.map((experience, experienceIndex) => (
                  <article
                    key={experience.id || `${experience.company}-${experience.role}-${experienceIndex}`}
                    className="break-inside-avoid border-b border-black py-[1.2cqw] first:pt-0 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-[1.5cqw]">
                      <div className="min-w-0">
                        <h3 className="font-sans font-black uppercase" style={{ fontSize: '1.15cqw' }}>
                          {cleanResumeText(experience.role)}
                        </h3>
                        <p className="mt-[0.22cqw] font-sans font-black uppercase" style={{ color: colors.primary, fontSize: '1.05cqw' }}>
                          {cleanResumeText(experience.company)}
                        </p>
                      </div>
                      {cleanResumeText(experience.duration) && (
                        <p className="shrink-0 font-sans font-black uppercase" style={{ fontSize: '0.96cqw' }}>
                          {cleanResumeText(experience.duration)}
                        </p>
                      )}
                    </div>
                    {experience.achievements.length > 0 && (
                      <ul className="mt-[0.55cqw] space-y-[0.24cqw]">
                        {experience.achievements.map((achievement, achievementIndex) => (
                          <li
                            key={`${achievement}-${achievementIndex}`}
                            className="grid grid-cols-[1.1cqw_1fr] font-sans leading-[1.33]"
                            style={{ fontSize: '0.84cqw' }}
                          >
                            <span aria-hidden="true">—</span>
                            <span>{cleanResumeText(achievement)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>

        {(resume.skills.length > 0 || engagements.length > 1 || resume.certifications.length > 0) && (
          <aside>
            {engagements.length > 1 && (
              <section className="px-[2.2cqw] py-[1.8cqw]">
                <VoltageSectionTitle>Selected Engagements</VoltageSectionTitle>
                <div className="mt-[0.8cqw]">
                  {engagements.map((experience, index) => (
                    <div key={`${experience.company}-${index}`} className="grid grid-cols-[46%_54%] border-b border-black py-[0.55cqw] last:border-b-0">
                      <p className="pr-[0.8cqw] font-sans font-black uppercase" style={{ color: colors.primary, fontSize: '0.92cqw' }}>
                        {cleanResumeText(experience.company)}
                      </p>
                      <p className="font-sans leading-[1.2]" style={{ fontSize: '0.82cqw' }}>
                        {cleanResumeText(experience.role)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {resume.skills.length > 0 && (
              <section className="px-[2.2cqw] py-[1.8cqw]" style={{ backgroundColor: '#dfff00' }}>
                <VoltageSectionTitle>Capabilities</VoltageSectionTitle>
                <div className="mt-[1cqw] grid grid-cols-2 gap-x-[1.4cqw] gap-y-[0.8cqw]">
                  {resume.skills.map((group, index) => (
                    <div key={group.id || `${group.category}-${index}`}>
                      <h3 className="font-sans font-black uppercase" style={{ fontSize: '0.92cqw' }}>
                        {cleanResumeText(group.category)}
                      </h3>
                      <p className="mt-[0.2cqw] font-sans leading-[1.35]" style={{ fontSize: '0.82cqw' }}>
                        {group.items.map(item => cleanResumeText(item)).filter(Boolean).join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {resume.certifications.length > 0 && (
              <section className="px-[2.2cqw] py-[1.8cqw]">
                <VoltageSectionTitle>Recognition</VoltageSectionTitle>
                <ul className="mt-[0.8cqw] space-y-[0.5cqw]">
                  {resume.certifications.map((certification, index) => (
                    <li key={`${certification}-${index}`} className="font-sans font-bold uppercase" style={{ fontSize: '0.84cqw' }}>
                      {cleanResumeText(certification)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>

      {resume.education.length > 0 && (
        <section className="grid grid-cols-[32%_68%] border-t border-black">
          <div className="px-[1.8cqw] py-[1.6cqw]" style={{ backgroundColor: colors.accent }}>
            <p
              className="font-sans font-black uppercase leading-[0.92]"
              style={{
                fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
                fontSize: '3cqw',
              }}
            >
              Strategy that hits.<br />Culture that sticks.
            </p>
          </div>
          <div className="px-[2.2cqw] py-[1.6cqw]">
            <VoltageSectionTitle>Education</VoltageSectionTitle>
            <div className="mt-[0.8cqw] grid grid-cols-2 gap-[1.5cqw]">
              {resume.education.map((education, index) => (
                <div key={education.id || `${education.institution}-${index}`}>
                  <h3 className="font-sans font-black uppercase" style={{ color: colors.primary, fontSize: '0.92cqw' }}>
                    {cleanResumeText(education.degree)}
                  </h3>
                  <p className="mt-[0.2cqw] font-sans font-bold uppercase" style={{ fontSize: '0.78cqw' }}>
                    {[cleanResumeText(education.institution), cleanResumeText(education.year)].filter(Boolean).join(' · ')}
                  </p>
                  {cleanResumeText(education.details) && (
                    <p className="mt-[0.15cqw] font-sans" style={{ fontSize: '0.76cqw' }}>
                      {cleanResumeText(education.details)}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {contact.length > 0 && (
              <address className="mt-[1.2cqw] flex flex-wrap justify-between gap-x-[1.2cqw] gap-y-[0.35cqw] border-t border-black pt-[0.6cqw] not-italic">
                {contact.map(item => (
                  <span key={item} className="break-all font-sans font-black uppercase" style={{ color: colors.primary, fontSize: '0.7cqw' }}>
                    {item}
                  </span>
                ))}
              </address>
            )}
          </div>
        </section>
      )}

      {(resume.additionalSections || []).map((section) => {
        const items = section.items.map(cleanResumeText).filter(Boolean);
        if (!cleanResumeText(section.title) && items.length === 0) return null;
        return <section key={section.id} className="border-t border-black px-[17.8cqw] py-[1.8cqw]">
          <VoltageSectionTitle>{cleanResumeText(section.title) || 'Additional information'}</VoltageSectionTitle>
          <ul className="mt-[0.8cqw] space-y-[0.35cqw] font-sans" style={{ fontSize: '0.9cqw' }}>
            {items.map((item) => <li key={item}>— {item}</li>)}
          </ul>
        </section>;
      })}
    </article>
  );
}
