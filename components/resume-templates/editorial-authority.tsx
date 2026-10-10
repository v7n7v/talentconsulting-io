'use client';

import { cleanResumeText, type CanonicalResume } from '@/lib/resume-normalizer';
import {
  getEditorialImpacts,
  isEditorialImpactAchievement,
} from './editorial-authority-impact';

interface EditorialAuthorityProps {
  resume: CanonicalResume;
  colors: { primary: string; accent: string; text: string };
}

function EditorialSectionTitle({
  children,
  inverse = false,
  colors,
}: {
  children: string;
  inverse?: boolean;
  colors: EditorialAuthorityProps['colors'];
}) {
  return (
    <div className="flex items-center gap-[1.6cqw]">
      <h2
        className="shrink-0 font-sans font-bold uppercase tracking-[0.18em]"
        style={{ color: inverse ? '#f8fafc' : colors.accent, fontSize: '1.45cqw' }}
      >
        {children}
      </h2>
      <span
        aria-hidden="true"
        className="h-px flex-1"
        style={{ backgroundColor: inverse ? 'rgba(255,255,255,.58)' : 'rgba(8,44,76,.46)' }}
      />
    </div>
  );
}

function RailSection({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: EditorialAuthorityProps['colors'];
}) {
  return (
    <section>
      <EditorialSectionTitle inverse colors={colors}>{title}</EditorialSectionTitle>
      <div className="mt-[1.45cqw]">{children}</div>
    </section>
  );
}

export function EditorialAuthorityTemplate({ resume, colors }: EditorialAuthorityProps) {
  const impacts = getEditorialImpacts(resume);
  const contactItems = [
    cleanResumeText(resume.email),
    cleanResumeText(resume.phone),
    cleanResumeText(resume.location),
    cleanResumeText(resume.linkedin),
    cleanResumeText(resume.website),
    ...(resume.links || []).map(cleanResumeText),
  ].filter(Boolean);
  const hasRail = contactItems.length > 0
    || resume.skills.length > 0
    || resume.education.length > 0
    || resume.certifications.length > 0
    || (resume.additionalSections || []).some(section => section.title || section.items.length);

  const name = cleanResumeText(resume.name) || 'Resume';
  const title = cleanResumeText(resume.title);

  return (
    <article
      aria-label={`${name} resume in the Editorial Authority template`}
      className="overflow-hidden bg-[#fbf8f1]"
      style={{
        backgroundColor: '#fbf8f1',
        containerType: 'inline-size',
        color: colors.text,
        minHeight: '297mm',
        fontFamily: 'Georgia, Cambria, "Times New Roman", serif',
      }}
    >
      <header className="grid grid-cols-[36%_64%]">
        <div className="px-[5.3cqw] pb-[4.5cqw] pt-[5.8cqw]">
          <p
            className="break-words font-normal uppercase leading-[0.84] tracking-[-0.055em]"
            style={{
              color: colors.primary,
              fontFamily: '"Bodoni MT", "Bodoni 72", Didot, Georgia, serif',
              fontSize: name.length > 24 ? '5.8cqw' : name.length > 16 ? '7cqw' : '8.2cqw',
            }}
          >
            {name}
          </p>
          <span
            aria-hidden="true"
            className="mt-[2.5cqw] block h-[0.18cqw] w-[5.2cqw]"
            style={{ backgroundColor: '#c88718' }}
          />
          {title && (
            <p
              className="mt-[2.4cqw] break-words font-sans font-bold uppercase tracking-[0.16em]"
              style={{ color: colors.accent, fontSize: '1.55cqw' }}
            >
              {title}
            </p>
          )}
        </div>

        <div className="px-[4.8cqw] pb-[4.5cqw] pt-[6cqw]">
          {resume.summary && (
            <section>
              <EditorialSectionTitle colors={colors}>Executive Profile</EditorialSectionTitle>
              <p
                className="mt-[1.8cqw] leading-[1.55]"
                style={{ color: colors.text, fontSize: '1.42cqw' }}
              >
                {resume.summary}
              </p>
            </section>
          )}

          {impacts.length > 0 && (
            <section className={resume.summary ? 'mt-[4.2cqw]' : ''}>
              <EditorialSectionTitle colors={colors}>Selected Impact</EditorialSectionTitle>
              <div
                className="mt-[2.1cqw] grid"
                style={{ gridTemplateColumns: `repeat(${impacts.length}, minmax(0, 1fr))` }}
              >
                {impacts.map((impact, index) => (
                  <div
                    key={`${impact.experienceIndex}-${impact.achievementIndex}`}
                    className="min-w-0 px-[1.25cqw] text-center first:pl-0 last:pr-0"
                    style={{ borderLeft: index > 0 ? '1px solid rgba(8,44,76,.35)' : undefined }}
                  >
                    <p
                      className="break-words leading-none"
                      style={{
                        color: colors.accent,
                        fontFamily: '"Bodoni MT", "Bodoni 72", Didot, Georgia, serif',
                        fontSize: impacts.length > 3 ? '3.45cqw' : '4.2cqw',
                      }}
                    >
                      {impact.metric}
                    </p>
                    <p
                      className="mt-[0.85cqw] break-words font-sans leading-[1.45]"
                      style={{ color: colors.text, fontSize: '1.05cqw' }}
                    >
                      {impact.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </header>

      <div className={`grid ${hasRail ? 'grid-cols-[36%_64%]' : 'grid-cols-1'}`}>
        {hasRail && (
          <aside
            aria-label="Contact, expertise, education, and certifications"
            className="space-y-[3.4cqw] px-[5.3cqw] py-[4.5cqw] text-white"
            style={{ backgroundColor: colors.primary }}
          >
            {contactItems.length > 0 && (
              <RailSection title="Contact" colors={colors}>
                <address className="not-italic">
                  {contactItems.map(item => (
                    <p
                      key={item}
                      className="mb-[0.8cqw] break-all font-sans leading-[1.45] text-slate-100"
                      style={{ fontSize: '1.14cqw' }}
                    >
                      {item}
                    </p>
                  ))}
                </address>
              </RailSection>
            )}

            {resume.skills.length > 0 && (
              <RailSection title="Areas of Expertise" colors={colors}>
                <div className="space-y-[1.35cqw]">
                  {resume.skills.map(group => (
                    <div key={group.category}>
                      <h3
                        className="font-sans font-bold uppercase tracking-[0.08em] text-white"
                        style={{ fontSize: '1.05cqw' }}
                      >
                        {group.category}
                      </h3>
                      <p
                        className="mt-[0.35cqw] font-sans leading-[1.48] text-slate-200"
                        style={{ fontSize: '1.08cqw' }}
                      >
                        {group.items.join(' · ')}
                      </p>
                    </div>
                  ))}
                </div>
              </RailSection>
            )}

            {resume.education.length > 0 && (
              <RailSection title="Education" colors={colors}>
                <div className="space-y-[1.5cqw]">
                  {resume.education.map((education, index) => (
                    <div key={`${education.institution}-${index}`}>
                      {cleanResumeText(education.degree) && (
                        <h3 className="font-sans font-bold uppercase tracking-[0.07em] text-white" style={{ fontSize: '1.02cqw' }}>
                          {cleanResumeText(education.degree)}
                        </h3>
                      )}
                      <p className="mt-[0.28cqw] font-sans leading-[1.45] text-slate-200" style={{ fontSize: '1.08cqw' }}>
                        {[cleanResumeText(education.institution), cleanResumeText(education.year)].filter(Boolean).join(' · ')}
                      </p>
                      {cleanResumeText(education.details) && (
                        <p className="mt-[0.2cqw] font-sans italic leading-[1.4] text-slate-300" style={{ fontSize: '1cqw' }}>
                          {cleanResumeText(education.details)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </RailSection>
            )}

            {resume.certifications.length > 0 && (
              <RailSection title="Certifications" colors={colors}>
                <ul className="space-y-[0.65cqw]">
                  {resume.certifications.map(certification => (
                    <li key={certification} className="font-sans leading-[1.45] text-slate-200" style={{ fontSize: '1.08cqw' }}>
                      {certification}
                    </li>
                  ))}
                </ul>
              </RailSection>
            )}
            {(resume.additionalSections || []).map((section) => (
              <RailSection key={section.id} title={cleanResumeText(section.title) || 'Additional information'} colors={colors}>
                <ul className="space-y-[0.65cqw]">
                  {section.items.map((item) => <li key={item} className="font-sans leading-[1.45] text-slate-200" style={{ fontSize: '1.08cqw' }}>{item}</li>)}
                </ul>
              </RailSection>
            ))}
          </aside>
        )}

        <main className={`px-[4.8cqw] py-[4.5cqw] ${hasRail ? '' : 'mx-auto w-full max-w-[72%]'}`}>
          {resume.experience.length > 0 && (
            <section>
              <EditorialSectionTitle colors={colors}>Experience</EditorialSectionTitle>
              <div className="mt-[2.2cqw]">
                {resume.experience.map((experience, experienceIndex) => {
                  const visibleAchievements = experience.achievements.filter(
                    achievement => !isEditorialImpactAchievement(achievement, impacts),
                  );
                  return (
                    <article
                      key={experience.id || `${experience.company}-${experience.role}-${experienceIndex}`}
                      className="break-inside-avoid border-b border-[#0b2e4a]/25 py-[2.2cqw] first:pt-0 last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-[2cqw]">
                        <div className="min-w-0">
                          <h3 className="break-words font-sans font-bold uppercase tracking-[0.08em]" style={{ color: colors.text, fontSize: '1.35cqw' }}>
                            {experience.company}
                          </h3>
                          <p className="mt-[0.35cqw] italic leading-tight" style={{ color: colors.text, fontSize: '1.55cqw' }}>
                            {experience.role}
                          </p>
                        </div>
                        {experience.duration && (
                          <p className="shrink-0 whitespace-nowrap pt-[0.12cqw] font-sans font-semibold uppercase tracking-[0.08em]" style={{ color: colors.text, fontSize: '0.96cqw' }}>
                            {experience.duration}
                          </p>
                        )}
                      </div>
                      {visibleAchievements.length > 0 && (
                        <ul className="mt-[1.25cqw] list-disc space-y-[0.65cqw] pl-[1.45cqw]">
                          {visibleAchievements.map((achievement, achievementIndex) => (
                            <li
                              key={`${achievement}-${achievementIndex}`}
                              className="font-sans leading-[1.45]"
                              style={{ color: colors.text, fontSize: '1.12cqw' }}
                            >
                              {achievement}
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>
    </article>
  );
}
