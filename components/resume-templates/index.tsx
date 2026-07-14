'use client';

/**
 * Resume Templates — 18 ATS-Safe Single-Column Designs
 * Every template is deterministic: same data → same output.
 * All single-column for maximum ATS compatibility.
 */

import { cleanResumeText, type CanonicalResume, type CanonicalSkillGroup, type CanonicalExperience, type CanonicalEducation } from '@/lib/resume-normalizer';
import { ResumeHeader, ResumeSectionTitle } from './header-system';

interface TemplateProps {
  resume: CanonicalResume;
  colors: { primary: string; accent: string; text: string };
}

// ============================================================
// SHARED SECTION RENDERERS
// ============================================================

function SkillsGrid({ skills, colors, layout = 'category' }: { skills: CanonicalSkillGroup[]; colors: TemplateProps['colors']; layout?: 'category' | 'pills' | 'inline' | 'compact' }) {
  if (!skills?.length) return null;

  if (layout === 'pills') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {skills.flatMap(s => s.items).map((skill, i) => (
          <span key={i} className="px-2 py-0.5 rounded text-xs border" style={{ borderColor: `${colors.primary}30`, color: colors.primary }}>{skill}</span>
        ))}
      </div>
    );
  }

  if (layout === 'inline') {
    return (
      <div>
        {skills.map((cat, i) => (
          <div key={i} className="flex gap-2 mb-1 text-sm">
            <span className="font-bold text-gray-700 min-w-[120px]">{cat.category}:</span>
            <span className="text-gray-600">{cat.items.join(', ')}</span>
          </div>
        ))}
      </div>
    );
  }

  if (layout === 'compact') {
    return (
      <div className="flex flex-wrap gap-2">
        {skills.flatMap(s => s.items).map((skill, i, arr) => (
          <span key={i} className="text-sm text-gray-600">{skill}{i < arr.length - 1 ? ',' : ''}</span>
        ))}
      </div>
    );
  }

  // Default: category grid
  return (
    <div className="space-y-2">
      {skills.map((cat, i) => (
        <div key={i}>
          <p className="text-sm font-semibold text-gray-700">{cat.category}</p>
          <p className="text-sm text-gray-600">{cat.items.join(' • ')}</p>
        </div>
      ))}
    </div>
  );
}

function ExperienceList({ experience, colors, style = 'default', companyFirst = false }: {
  experience: CanonicalExperience[];
  colors: TemplateProps['colors'];
  style?: 'default' | 'timeline' | 'boxed' | 'minimal' | 'compact';
  companyFirst?: boolean;
}) {
  if (!experience?.length) return null;

  return (
    <div>
      {experience.map((exp, i) => (
        <div key={i} className={`mb-4 ${style === 'timeline' ? 'pl-4 border-l-2' : ''} ${style === 'boxed' ? 'p-4 bg-gray-50 rounded-xl' : ''}`} style={style === 'timeline' ? { borderColor: colors.accent } : {}}>
          <div className="flex justify-between items-baseline">
            <div>
              {companyFirst ? (
                <><span className="font-bold text-gray-900">{exp.company}</span><span className="text-gray-500">, </span><span className="italic text-gray-700">{exp.role}</span></>
              ) : (
                <h3 className="font-bold text-gray-900">{exp.role}</h3>
              )}
            </div>
            <span className={`text-sm text-gray-500 ml-2 whitespace-nowrap ${style === 'boxed' ? 'px-3 py-1 rounded-full bg-white' : ''}`}>{exp.duration}</span>
          </div>
          {!companyFirst && <p className="text-sm text-gray-600" style={{ color: colors.accent }}>{exp.company}</p>}
          <ul className={`mt-2 space-y-1 ${style === 'compact' ? 'columns-1' : ''}`}>
            {exp.achievements.map((a, j) => (
              <li key={j} className="text-sm text-gray-700 pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-gray-400">{a}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EducationList({ education, colors, layout = 'default' }: {
  education: CanonicalEducation[];
  colors: TemplateProps['colors'];
  layout?: 'default' | 'compact' | 'center';
}) {
  if (!education?.length) return null;

  return (
    <div>
      {education.map((edu, i) => {
        const degree = cleanResumeText(edu.degree);
        const institution = cleanResumeText(edu.institution);
        const year = cleanResumeText(edu.year);
        const details = cleanResumeText(edu.details);
        const meta = [institution, year].filter(Boolean).join(' • ');
        return (
          <div key={i} className={`mb-2 ${layout === 'center' ? 'text-center' : ''}`}>
            {degree && <p className="font-semibold text-gray-900">{degree}</p>}
            {meta && <p className="text-sm text-gray-500">{meta}</p>}
            {details && <p className="text-xs text-gray-400 mt-0.5">{details}</p>}
          </div>
        );
      })}
    </div>
  );
}

function EducationInstitutionFirst({ edu, withDetails = false }: { edu: CanonicalEducation; withDetails?: boolean }) {
  const institution = cleanResumeText(edu.institution);
  const degree = cleanResumeText(edu.degree);
  const year = cleanResumeText(edu.year);
  const details = cleanResumeText(edu.details);
  return (
    <div className="flex justify-between mb-2">
      <div>
        {institution && <p className="font-bold text-gray-900">{institution}</p>}
        {degree && <p className="text-sm italic text-gray-700">{degree}</p>}
        {withDetails && details && <p className="text-xs text-gray-500 mt-0.5">{details}</p>}
      </div>
      {year && <span className="text-sm text-gray-500">{year}</span>}
    </div>
  );
}

function SectionTitle({ children, colors, style = 'default' }: {
  children: React.ReactNode;
  colors: TemplateProps['colors'];
  style?: 'default' | 'border' | 'uppercase' | 'center' | 'tracked' | 'mono';
}) {
  return <ResumeSectionTitle colors={colors} style={style}>{children}</ResumeSectionTitle>;
}

// ============================================================
// TEMPLATE 1: EXECUTIVE — Clean professional for senior roles
// ============================================================
function ExecutiveTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10 font-serif" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="executive" />
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors}>Professional Summary</SectionTitle><p className="text-gray-700 leading-relaxed">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors}>Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} /></div>}
      <div className="grid grid-cols-2 gap-6">
        {resume.education.length > 0 && <div><SectionTitle colors={colors}>Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
        {resume.skills.length > 0 && <div><SectionTitle colors={colors}>Skills</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} /></div>}
      </div>
    </div>
  );
}

// ============================================================
// TEMPLATE 2: MINIMAL — Centered, lots of whitespace
// ============================================================
function MinimalTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="minimal" />
      {resume.summary && <div className="border-t border-gray-200 pt-6 mb-6"><p className="text-gray-700 text-center max-w-2xl mx-auto">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-8"><SectionTitle colors={colors} style="uppercase">Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="minimal" /></div>}
      <div className="grid grid-cols-2 gap-8">
        {resume.education.length > 0 && <div><SectionTitle colors={colors} style="uppercase">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
        {resume.skills.length > 0 && <div><SectionTitle colors={colors} style="uppercase">Skills</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="compact" /></div>}
      </div>
    </div>
  );
}

// ============================================================
// TEMPLATE 3: COMPACT — Dense one-page, small type
// ============================================================
function CompactTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-6 text-xs" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="compact" className="mb-4" />
      {resume.summary && <div className="mb-3 p-2.5 rounded" style={{ backgroundColor: `${colors.primary}08` }}><p className="text-gray-700 leading-relaxed">{resume.summary}</p></div>}
      {resume.skills.length > 0 && <div className="mb-3"><SectionTitle colors={colors} style="border">Core Competencies</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="pills" /></div>}
      {resume.experience.length > 0 && <div className="mb-3"><SectionTitle colors={colors} style="border">Professional Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="compact" /></div>}
      <div className="grid grid-cols-2 gap-4">
        {resume.education.length > 0 && <div><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} layout="compact" /></div>}
        {resume.certifications.length > 0 && <div><SectionTitle colors={colors} style="border">Certifications</SectionTitle><ul>{resume.certifications.map((c, i) => <li key={i} className="text-gray-600 mb-1">• {c}</li>)}</ul></div>}
      </div>
    </div>
  );
}

// ============================================================
// TEMPLATE 4: TECHNICAL — Monospace code-style
// ============================================================
function TechnicalTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-8 font-mono text-sm" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="technical" />
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="mono">Summary</SectionTitle><p className="text-gray-700 bg-gray-50 p-3 rounded border-l-4" style={{ borderColor: colors.accent }}>{resume.summary}</p></div>}
      {resume.skills.length > 0 && (
        <div className="mb-6">
          <SectionTitle colors={colors} style="mono">Technical Skills</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {resume.skills.map((cat, i) => <div key={i} className="p-3 bg-gray-50 rounded"><p className="font-bold text-gray-700 mb-1">{cat.category}:</p><p className="text-gray-600">{cat.items.join(', ')}</p></div>)}
          </div>
        </div>
      )}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="mono">Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="boxed" /></div>}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="mono">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 5: HARVARD — Education-first, traditional academic
// ============================================================
function HarvardTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10 font-serif" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="harvard" />
      {resume.education.length > 0 && <div className="mb-5"><SectionTitle colors={colors} style="border">Education</SectionTitle>{resume.education.map((edu, i) => <EducationInstitutionFirst key={i} edu={edu} />)}</div>}
      {resume.experience.length > 0 && <div className="mb-5"><SectionTitle colors={colors} style="border">Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} companyFirst /></div>}
      {resume.skills.length > 0 && <div className="mb-5"><SectionTitle colors={colors} style="border">Skills &amp; Interests</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="inline" /></div>}
      {resume.summary && <div><SectionTitle colors={colors} style="border">Summary</SectionTitle><p className="text-sm text-gray-700 leading-relaxed">{resume.summary}</p></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 6: ELEGANT — Serif with decorative dividers
// ============================================================
function ElegantTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10 font-serif" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="elegant" />
      {resume.summary && <div className="mb-8 max-w-xl mx-auto text-center"><p className="text-sm text-gray-600 leading-relaxed italic">&ldquo;{resume.summary}&rdquo;</p></div>}
      {resume.experience.length > 0 && <div className="mb-8"><SectionTitle colors={colors} style="center">Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} /></div>}
      <div className="grid grid-cols-2 gap-8">
        {resume.education.length > 0 && <div><SectionTitle colors={colors} style="center">Education</SectionTitle><EducationList education={resume.education} colors={colors} layout="center" /></div>}
        {resume.skills.length > 0 && <div><SectionTitle colors={colors} style="center">Expertise</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="compact" /></div>}
      </div>
    </div>
  );
}

// ============================================================
// TEMPLATE 7: NORDIC — Wide margins, grid dates
// ============================================================
function NordicTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-12" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="nordic" className="mb-10" />
      {resume.summary && <div className="mb-10"><p className="text-sm leading-7 max-w-[85%]" style={{ color: `${colors.text}cc` }}>{resume.summary}</p></div>}
      {resume.experience.length > 0 && (
        <div className="mb-10">
          <SectionTitle colors={colors} style="tracked">Experience</SectionTitle>
          {resume.experience.map((exp, i) => (
            <div key={i} className="mb-6 grid grid-cols-[140px_1fr] gap-6">
              <div className="text-sm" style={{ color: colors.accent }}><p>{exp.duration}</p><p className="text-xs mt-0.5">{exp.company}</p></div>
              <div><h3 className="font-medium text-gray-900 mb-2">{exp.role}</h3><ul className="space-y-1.5">{exp.achievements.map((a, j) => <li key={j} className="text-sm text-gray-600 leading-relaxed">{a}</li>)}</ul></div>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[140px_1fr] gap-6">
        {resume.education.length > 0 && <><div><SectionTitle colors={colors} style="tracked">Education</SectionTitle></div><div className="space-y-3">{resume.education.map((edu, i) => {
          const degree = cleanResumeText(edu.degree);
          const meta = [cleanResumeText(edu.institution), cleanResumeText(edu.year)].filter(Boolean).join(' — ');
          return <div key={i}>{degree && <p className="font-medium text-gray-900">{degree}</p>}{meta && <p className="text-sm text-gray-500">{meta}</p>}</div>;
        })}</div></>}
      </div>
      {resume.skills.length > 0 && <div className="mt-8 grid grid-cols-[140px_1fr] gap-6"><div><SectionTitle colors={colors} style="tracked">Skills</SectionTitle></div><SkillsGrid skills={resume.skills} colors={colors} layout="compact" /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 8: ATS ULTRA — Maximum ATS compliance
// ============================================================
function ATSUltraTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="ats-optimized" />
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="border">Summary</SectionTitle><p className="text-sm text-gray-600 leading-relaxed">{resume.summary}</p></div>}
      {resume.skills.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Core Competencies</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="inline" /></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Professional Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} /></div>}
      {resume.education.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
      {resume.certifications.length > 0 && <div><SectionTitle colors={colors} style="border">Certifications</SectionTitle><ul>{resume.certifications.map((c, i) => <li key={i} className="text-sm text-gray-700 mb-1">• {c}</li>)}</ul></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 9: FAANG — Big Tech with timeline
// ============================================================
function FAANGTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="faang" />
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="border">Summary</SectionTitle><p className="text-sm text-gray-600 leading-relaxed">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="timeline" /></div>}
      {resume.skills.length > 0 && (
        <div className="mb-6">
          <SectionTitle colors={colors} style="border">Skills</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {resume.skills.map((cat, i) => (
              <div key={i} className="p-3 rounded" style={{ backgroundColor: `${colors.primary}08` }}>
                <p className="text-xs font-bold mb-1" style={{ color: colors.primary }}>{cat.category}</p>
                <p className="text-xs text-gray-600">{cat.items.join(' • ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 10: FEDERAL — Government with clearance section
// ============================================================
function FederalTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="federal" />
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="border">Professional Summary</SectionTitle><p className="text-sm text-gray-600 leading-relaxed">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Professional Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} /></div>}
      {resume.skills.length > 0 && (
        <div className="mb-6">
          <SectionTitle colors={colors} style="border">Skills</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {resume.skills.map((cat, i) => (
              <div key={i} className="p-3 rounded" style={{ backgroundColor: `${colors.primary}08` }}>
                <p className="text-xs font-bold mb-1" style={{ color: colors.primary }}>{cat.category}</p>
                <p className="text-xs text-gray-600">{cat.items.join(' • ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {resume.education.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
      {resume.certifications.length > 0 && <div><SectionTitle colors={colors} style="border">Certifications &amp; Clearances</SectionTitle><ul>{resume.certifications.map((c, i) => <li key={i} className="text-sm text-gray-700 mb-1">✓ {c}</li>)}</ul></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 11: MODERN — Rich teal header band (reworked from sidebar)
// ============================================================
function ModernTemplate({ resume, colors }: TemplateProps) {
  return (
    <div style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="modern" />
      <div className="p-8 pt-6">
        {resume.summary && <div className="mb-6"><SectionTitle colors={colors}>About Me</SectionTitle><p className="text-gray-700 leading-relaxed">{resume.summary}</p></div>}
        {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors}>Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="timeline" /></div>}
        {resume.skills.length > 0 && <div className="mb-6"><SectionTitle colors={colors}>Skills</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="pills" /></div>}
        {resume.education.length > 0 && <div><SectionTitle colors={colors}>Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
      </div>
    </div>
  );
}

// ============================================================
// TEMPLATE 12: CREATIVE — Initials badge, colored chips
// ============================================================
function CreativeTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-8" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="creative" />
      {resume.summary && <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: `${colors.primary}10` }}><p className="text-gray-700">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors}>Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="boxed" /></div>}
      <div className="grid grid-cols-2 gap-6">
        {resume.education.length > 0 && <div><SectionTitle colors={colors}>Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
        {resume.skills.length > 0 && <div><SectionTitle colors={colors}>Skills</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="pills" /></div>}
      </div>
    </div>
  );
}

// ============================================================
// TEMPLATE 13: CASCADE — Timeline dots, single column
// ============================================================
function CascadeTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="cascade" />
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="border">Profile</SectionTitle><p className="text-sm text-gray-600 leading-relaxed">{resume.summary}</p></div>}
      {resume.experience.length > 0 && (
        <div className="mb-6">
          <SectionTitle colors={colors} style="border">Work Experience</SectionTitle>
          {resume.experience.map((exp, i) => (
            <div key={i} className="mb-5 relative pl-5">
              <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full" style={{ backgroundColor: colors.accent }} />
              {i < resume.experience.length - 1 && <div className="absolute left-[3px] top-4 bottom-0 w-px bg-gray-200" />}
              <div className="flex justify-between items-baseline"><h3 className="font-bold text-gray-900">{exp.role}</h3><span className="text-xs text-gray-400 ml-2 whitespace-nowrap">{exp.duration}</span></div>
              <p className="text-sm mb-1.5" style={{ color: colors.accent }}>{exp.company}</p>
              <ul className="space-y-1">{exp.achievements.map((a, j) => <li key={j} className="text-sm text-gray-600">• {a}</li>)}</ul>
            </div>
          ))}
        </div>
      )}
      {resume.skills.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Skills</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} /></div>}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 14: COLUMNIST — Skills pills at top
// ============================================================
function ColumnistTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="double-column" />
      {resume.skills.length > 0 && (
        <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: `${colors.primary}06` }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.primary }}>Key Competencies</p>
          <SkillsGrid skills={resume.skills} colors={colors} layout="pills" />
        </div>
      )}
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="border">Profile</SectionTitle><p className="text-sm text-gray-600 leading-relaxed">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="timeline" /></div>}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 15: METRO — Bold section headers with color blocks
// ============================================================
function MetroTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-8" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="infographic" />
      {resume.summary && <div className="mb-6"><div className="flex items-center gap-3 mb-3"><div className="w-1 h-6 rounded-full" style={{ backgroundColor: colors.accent }} /><h2 className="text-lg font-bold" style={{ color: colors.primary }}>Summary</h2></div><p className="text-sm text-gray-600 leading-relaxed pl-4">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><div className="flex items-center gap-3 mb-3"><div className="w-1 h-6 rounded-full" style={{ backgroundColor: colors.accent }} /><h2 className="text-lg font-bold" style={{ color: colors.primary }}>Experience</h2></div><div className="pl-4"><ExperienceList experience={resume.experience} colors={colors} /></div></div>}
      {resume.skills.length > 0 && <div className="mb-6"><div className="flex items-center gap-3 mb-3"><div className="w-1 h-6 rounded-full" style={{ backgroundColor: colors.accent }} /><h2 className="text-lg font-bold" style={{ color: colors.primary }}>Skills</h2></div><div className="pl-4"><SkillsGrid skills={resume.skills} colors={colors} layout="pills" /></div></div>}
      {resume.education.length > 0 && <div><div className="flex items-center gap-3 mb-3"><div className="w-1 h-6 rounded-full" style={{ backgroundColor: colors.accent }} /><h2 className="text-lg font-bold" style={{ color: colors.primary }}>Education</h2></div><div className="pl-4"><EducationList education={resume.education} colors={colors} /></div></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 16: CONSULTANT — Impact metrics first
// ============================================================
function ConsultantTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="deloitte" />
      {resume.summary && <div className="mb-6 p-4 border-l-4 bg-gray-50 rounded-r" style={{ borderColor: colors.accent }}><p className="text-sm text-gray-700 leading-relaxed italic">{resume.summary}</p></div>}
      {resume.skills.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Areas of Expertise</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="inline" /></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Professional Impact</SectionTitle><ExperienceList experience={resume.experience} colors={colors} /></div>}
      <div className="grid grid-cols-2 gap-6">
        {resume.education.length > 0 && <div><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
        {resume.certifications.length > 0 && <div><SectionTitle colors={colors} style="border">Credentials</SectionTitle><ul>{resume.certifications.map((c, i) => <li key={i} className="text-sm text-gray-700 mb-1">• {c}</li>)}</ul></div>}
      </div>
    </div>
  );
}

// ============================================================
// TEMPLATE 17: STARTUP — Bold, energetic, orange accents
// ============================================================
function StartupTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-8" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="startup" />
      {resume.summary && <div className="mb-6"><p className="text-gray-700 leading-relaxed font-medium">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">What I&apos;ve Built</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="timeline" /></div>}
      {resume.skills.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Stack</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="pills" /></div>}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 18: ACADEMIC — Research-focused with publications
// ============================================================
function AcademicTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10 font-serif" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="academic" />
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="border">Research Statement</SectionTitle><p className="text-sm text-gray-700 leading-relaxed">{resume.summary}</p></div>}
      {resume.education.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Education</SectionTitle>{resume.education.map((edu, i) => <EducationInstitutionFirst key={i} edu={edu} withDetails />)}</div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Academic Positions</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="timeline" /></div>}
      {resume.skills.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Research Areas &amp; Methods</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="inline" /></div>}
      {resume.certifications.length > 0 && <div><SectionTitle colors={colors} style="border">Publications &amp; Grants</SectionTitle><ul>{resume.certifications.map((c, i) => <li key={i} className="text-sm text-gray-700 mb-2">{c}</li>)}</ul></div>}
    </div>
  );
}

function impactSnippets(resume: CanonicalResume) {
  const achievements = resume.experience.flatMap(exp => exp.achievements || []);
  const withNumbers = achievements.filter(item => /(\$|%|\d)/.test(item)).slice(0, 3);
  return (withNumbers.length ? withNumbers : achievements.slice(0, 3)).map(item => {
    const metric = item.match(/(\$[\d,.]+[kKmMbB]?|\d+[%xX]?|\d+[,.]\d+)/)?.[0] || 'Impact';
    return { metric, text: item };
  });
}

// ============================================================
// TEMPLATE 19: BOARDROOM — Executive memo with impact signals
// ============================================================
function BoardroomTemplate({ resume, colors }: TemplateProps) {
  const impacts = impactSnippets(resume);
  return (
    <div className="p-10" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="boardroom" />
      {impacts.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {impacts.map((impact, i) => (
            <div key={i} className="border border-gray-200 p-3">
              <p className="text-xl font-semibold" style={{ color: colors.accent }}>{impact.metric}</p>
              <p className="text-[11px] text-gray-600 mt-1 leading-snug">{impact.text}</p>
            </div>
          ))}
        </div>
      )}
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="tracked">Board Brief</SectionTitle><p className="text-sm leading-relaxed text-gray-700">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="tracked">Leadership Record</SectionTitle><ExperienceList experience={resume.experience} colors={colors} /></div>}
      {resume.skills.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="tracked">Operating Strengths</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="inline" /></div>}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="tracked">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 20: PRODUCT BRIEF — Product/program leadership
// ============================================================
function ProductBriefTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-9" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="product-brief" />
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="border">Positioning</SectionTitle><p className="text-sm text-gray-700 leading-relaxed">{resume.summary}</p></div>}
      {resume.skills.length > 0 && (
        <div className="mb-6">
          <SectionTitle colors={colors} style="border">Discovery, Delivery, Scale</SectionTitle>
          <SkillsGrid skills={resume.skills} colors={colors} layout="pills" />
        </div>
      )}
      {resume.experience.length > 0 && (
        <div className="mb-6">
          <SectionTitle colors={colors} style="border">Product Outcomes</SectionTitle>
          <ExperienceList experience={resume.experience} colors={colors} style="boxed" />
        </div>
      )}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 21: OPERATOR — Operations command sheet
// ============================================================
function OperatorTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-8" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="operator" className="mb-5" />
      {resume.summary && <div className="mb-5 p-3 border border-gray-200"><p className="text-sm leading-relaxed text-gray-700">{resume.summary}</p></div>}
      {resume.skills.length > 0 && <div className="mb-5"><SectionTitle colors={colors} style="border">Systems and Levers</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="inline" /></div>}
      {resume.experience.length > 0 && <div className="mb-5"><SectionTitle colors={colors} style="border">Execution Record</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="compact" /></div>}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="border">Credentials</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 22: DATA SIGNAL — Analytics, AI, and technical strategy
// ============================================================
function DataSignalTemplate({ resume, colors }: TemplateProps) {
  const coreSkills = resume.skills.flatMap(group => group.items).slice(0, 12);
  return (
    <div className="p-9 font-mono" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="data-signal" />
      {coreSkills.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-6">
          {coreSkills.map((skill, i) => (
            <span key={i} className="text-[10px] border border-gray-200 px-2 py-1 text-center text-gray-700">{skill}</span>
          ))}
        </div>
      )}
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="mono">Signal Summary</SectionTitle><p className="text-sm font-sans text-gray-700 leading-relaxed">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="mono">Models Shipped / Systems Improved</SectionTitle><ExperienceList experience={resume.experience} colors={colors} /></div>}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="mono">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 23: FINANCE LEDGER — Precise finance/consulting
// ============================================================
function FinanceLedgerTemplate({ resume, colors }: TemplateProps) {
  const impacts = impactSnippets(resume);
  return (
    <div className="p-10" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="finance-ledger" />
      {impacts.length > 0 && <div className="mb-6 border-y border-gray-200 py-3 grid grid-cols-3 gap-4">{impacts.map((impact, i) => <div key={i}><p className="text-lg font-semibold" style={{ color: colors.accent }}>{impact.metric}</p><p className="text-[10px] text-gray-500 mt-1 leading-snug">{impact.text}</p></div>)}</div>}
      {resume.summary && <div className="mb-6"><SectionTitle colors={colors} style="border">Investment Thesis</SectionTitle><p className="text-sm leading-relaxed text-gray-700">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Measured Experience</SectionTitle><ExperienceList experience={resume.experience} colors={colors} /></div>}
      {resume.skills.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Analytical Toolkit</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="inline" /></div>}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 24: STORYLINE — Editorial strategy narrative
// ============================================================
function StorylineTemplate({ resume, colors }: TemplateProps) {
  return (
    <div className="p-10" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="storyline" />
      {resume.summary && <div className="mb-8 max-w-[86%]"><p className="text-lg leading-relaxed text-gray-700">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-8"><SectionTitle colors={colors} style="tracked">Chapters of Impact</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="minimal" /></div>}
      {resume.skills.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="tracked">Recurring Themes</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="compact" /></div>}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="tracked">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE 25: VENTURE — Startup traction and scope
// ============================================================
function VentureTemplate({ resume, colors }: TemplateProps) {
  const impacts = impactSnippets(resume);
  return (
    <div className="p-8" style={{ color: colors.text }}>
      <ResumeHeader resume={resume} colors={colors} templateId="venture" />
      {impacts.length > 0 && <div className="mb-6 grid grid-cols-3 gap-2">{impacts.map((impact, i) => <div key={i} className="border-l-4 pl-3" style={{ borderColor: colors.accent }}><p className="text-xl font-bold" style={{ color: colors.primary }}>{impact.metric}</p><p className="text-[10px] text-gray-600 mt-1">{impact.text}</p></div>)}</div>}
      {resume.summary && <div className="mb-6"><p className="text-sm text-gray-700 leading-relaxed font-medium">{resume.summary}</p></div>}
      {resume.experience.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Traction Built</SectionTitle><ExperienceList experience={resume.experience} colors={colors} style="timeline" /></div>}
      {resume.skills.length > 0 && <div className="mb-6"><SectionTitle colors={colors} style="border">Founder-Mode Stack</SectionTitle><SkillsGrid skills={resume.skills} colors={colors} layout="pills" /></div>}
      {resume.education.length > 0 && <div><SectionTitle colors={colors} style="border">Education</SectionTitle><EducationList education={resume.education} colors={colors} /></div>}
    </div>
  );
}

// ============================================================
// TEMPLATE MAP & ROUTER
// ============================================================
const TEMPLATE_MAP: Record<string, React.FC<TemplateProps>> = {
  'executive': ExecutiveTemplate,
  'minimal': MinimalTemplate,
  'compact': CompactTemplate,
  'technical': TechnicalTemplate,
  'boardroom': BoardroomTemplate,
  'product-brief': ProductBriefTemplate,
  'harvard': HarvardTemplate,
  'elegant': ElegantTemplate,
  'nordic': NordicTemplate,
  'ats-optimized': ATSUltraTemplate,
  'faang': FAANGTemplate,
  'federal': FederalTemplate,
  'modern': ModernTemplate,
  'creative': CreativeTemplate,
  'cascade': CascadeTemplate,
  'double-column': ColumnistTemplate,
  'infographic': MetroTemplate,
  'deloitte': ConsultantTemplate,
  'startup': StartupTemplate,
  'academic': AcademicTemplate,
  'operator': OperatorTemplate,
  'data-signal': DataSignalTemplate,
  'finance-ledger': FinanceLedgerTemplate,
  'storyline': StorylineTemplate,
  'venture': VentureTemplate,
};

export function ResumeTemplate({ resume, templateId, colors }: {
  resume: CanonicalResume;
  templateId: string;
  colors: { primary: string; accent: string; text: string };
}) {
  const Component = TEMPLATE_MAP[templateId] || ExecutiveTemplate;
  return (
    <div
      className="resume-page bg-white"
      style={{
        width: '100%',
        maxWidth: '210mm',
        minHeight: '297mm',
        position: 'relative',
      }}
    >
      <Component resume={resume} colors={colors} />
    </div>
  );
}

export default ResumeTemplate;
