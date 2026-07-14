'use client';

/**
 * ATS-Safe PDF Templates using @react-pdf/renderer
 * Template-aware: generates PDFs that match each preview layout.
 * All templates are single-column for maximum ATS compatibility.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { cleanResumeText, normalizeResume } from '@/lib/resume-normalizer';

// ============================================================
// FONT REGISTRATION — physical files for ATS compatibility
// ============================================================
Font.register({
  family: 'Inter',
  fonts: [
    { src: '/fonts/Inter-Regular.ttf', fontWeight: 'normal' },
    { src: '/fonts/Inter-Bold.ttf', fontWeight: 'bold' },
    { src: '/fonts/Inter-Italic.ttf', fontStyle: 'italic' },
  ],
});

// ============================================================
// TYPES
// ============================================================
interface TemplateColors {
  primary: string;
  accent: string;
  text: string;
}

interface PDFTemplateProps {
  resume: CanonicalResume;
  colors: TemplateColors;
}

type PDFHeaderDensity = 'hero' | 'standard' | 'compact';
type PDFHeaderLayout = 'authority' | 'band' | 'centered' | 'compact' | 'technical' | 'traditional' | 'creative' | 'product' | 'editorial' | 'systems';

interface PDFHeaderPreset {
  layout: PDFHeaderLayout;
  density: PDFHeaderDensity;
  eyebrow?: string;
  separator?: string;
}

function getPDFHeaderPreset(templateId: string): PDFHeaderPreset {
  const presets: Record<string, PDFHeaderPreset> = {
    executive: { layout: 'authority', density: 'hero', eyebrow: 'Executive Resume', separator: '•' },
    compact: { layout: 'compact', density: 'compact', eyebrow: 'Compact Resume', separator: '' },
    boardroom: { layout: 'authority', density: 'hero', eyebrow: 'Board Brief', separator: '•' },
    'finance-ledger': { layout: 'compact', density: 'standard', eyebrow: 'Finance Ledger', separator: '•' },
    modern: { layout: 'band', density: 'standard', eyebrow: 'Modern Profile', separator: '•' },
    infographic: { layout: 'band', density: 'standard', eyebrow: 'Metro Profile', separator: '•' },
    startup: { layout: 'editorial', density: 'hero', eyebrow: 'Builder Profile', separator: '/' },
    venture: { layout: 'editorial', density: 'hero', eyebrow: 'Venture-Ready Resume', separator: '/' },
    minimal: { layout: 'centered', density: 'standard', separator: '•' },
    nordic: { layout: 'centered', density: 'standard', eyebrow: 'Nordic Profile', separator: '' },
    elegant: { layout: 'centered', density: 'standard', eyebrow: 'Professional Profile', separator: '•' },
    technical: { layout: 'technical', density: 'compact', eyebrow: 'system.profile', separator: '|' },
    'data-signal': { layout: 'technical', density: 'compact', eyebrow: 'signal.profile', separator: '/' },
    operator: { layout: 'systems', density: 'compact', eyebrow: 'Operating System', separator: '•' },
    harvard: { layout: 'traditional', density: 'standard', separator: '|' },
    academic: { layout: 'traditional', density: 'standard', eyebrow: 'Academic Profile', separator: '|' },
    'ats-optimized': { layout: 'traditional', density: 'compact', eyebrow: 'ATS Resume', separator: '•' },
    federal: { layout: 'traditional', density: 'compact', eyebrow: 'Federal Resume', separator: '•' },
    creative: { layout: 'creative', density: 'standard', eyebrow: 'Creative Profile', separator: '•' },
    cascade: { layout: 'creative', density: 'compact', eyebrow: 'Career Flow', separator: '•' },
    'product-brief': { layout: 'product', density: 'standard', eyebrow: 'Product Narrative', separator: '•' },
    'double-column': { layout: 'product', density: 'compact', eyebrow: 'Competency Brief', separator: '•' },
    deloitte: { layout: 'authority', density: 'standard', eyebrow: 'Consultant Profile', separator: '•' },
    faang: { layout: 'systems', density: 'compact', eyebrow: 'Big Tech Profile', separator: '•' },
    storyline: { layout: 'editorial', density: 'standard', eyebrow: 'Career Story', separator: '•' },
  };
  return presets[templateId] || presets.executive;
}

function getPDFHeaderScale(name = '', title = '', density: PDFHeaderDensity = 'standard') {
  const longestNameToken = name.split(/\s+/).reduce((max, token) => Math.max(max, token.length), 0);
  const pressure = name.length + title.length * 0.35 + Math.max(0, longestNameToken - 12) * 1.4;
  if (density === 'hero') {
    if (pressure > 42) return { nameSize: 20, titleSize: 10.5 };
    if (pressure > 32) return { nameSize: 22, titleSize: 11 };
    return { nameSize: 25, titleSize: 12.5 };
  }
  if (density === 'compact') {
    if (pressure > 38) return { nameSize: 16, titleSize: 9 };
    return { nameSize: 18, titleSize: 9.5 };
  }
  if (pressure > 40) return { nameSize: 18, titleSize: 9.5 };
  if (pressure > 30) return { nameSize: 20, titleSize: 10 };
  return { nameSize: 22, titleSize: 11 };
}

function pdfInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

// ============================================================
// ATS TEXT NORMALIZATION
// Converts Unicode characters that ATS bots can't parse
// ============================================================
function atsNormalize(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2009\u200A\u200B\u202F\u205F]/g, ' ')
    .replace(/\u2122/g, '(TM)')
    .replace(/\u00AE/g, '(R)')
    .replace(/\u00A9/g, '(c)')
    .replace(/[\u2192\u2794\u27A4]/g, '->')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function atsNormalizeResume(resume: CanonicalResume): CanonicalResume {
  return {
    ...resume,
    name: atsNormalize(resume.name),
    title: atsNormalize(resume.title),
    email: resume.email,
    phone: resume.phone,
    location: atsNormalize(resume.location),
    linkedin: resume.linkedin,
    website: resume.website,
    summary: atsNormalize(resume.summary),
    experience: resume.experience.map(exp => ({
      ...exp,
      company: atsNormalize(exp.company),
      role: atsNormalize(exp.role),
      duration: atsNormalize(exp.duration),
      achievements: exp.achievements.map(a => atsNormalize(a)),
    })),
    education: resume.education.map(edu => ({
      ...edu,
      degree: atsNormalize(edu.degree),
      institution: atsNormalize(edu.institution),
      year: edu.year,
      details: edu.details ? atsNormalize(edu.details) : undefined,
    })),
    skills: resume.skills.map(cat => ({
      ...cat,
      category: atsNormalize(cat.category),
      items: cat.items.map(i => atsNormalize(i)),
    })),
    certifications: resume.certifications.map(c => atsNormalize(c)),
  };
}

// ============================================================
// SHARED PDF SECTION COMPONENTS
// ============================================================
function PDFSectionTitle({ children, color, borderColor, align, font }: {
  children: string; color: string; borderColor?: string; align?: 'center' | 'left'; font?: string;
}) {
  return (
    <Text style={{
      fontSize: 12, fontWeight: 'bold', color, textTransform: 'uppercase', letterSpacing: 1,
      marginTop: 14, marginBottom: 6,
      borderBottomWidth: borderColor ? 1 : 0, borderBottomColor: borderColor || '#e0e0e0',
      paddingBottom: 3, textAlign: align || 'left',
      fontFamily: font || 'Inter',
    }}>{children}</Text>
  );
}

function PDFContactRow({
  resume,
  separator = '|',
  color = '#555555',
  align = 'left',
}: {
  resume: CanonicalResume;
  separator?: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const items = [resume.email, resume.phone, resume.location, resume.linkedin, resume.website].filter(Boolean);
  return (
    <View style={{ flexDirection: 'row', gap: 8, fontSize: 9, flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }}>
      {items.map((item, i) => (
        <Text key={i} style={{ color }}>{i > 0 && separator ? `${separator}  ` : ''}{item}</Text>
      ))}
    </View>
  );
}

function PDFHeaderText({
  resume,
  colors,
  preset,
  inverse = false,
  uppercaseName = false,
  align = 'left',
}: {
  resume: CanonicalResume;
  colors: TemplateColors;
  preset: PDFHeaderPreset;
  inverse?: boolean;
  uppercaseName?: boolean;
  align?: 'left' | 'center' | 'right';
}) {
  const name = cleanResumeText(resume.name) || 'Your Name';
  const title = cleanResumeText(resume.title);
  const scale = getPDFHeaderScale(name, title, preset.density);
  const textAlign = align;

  return (
    <View>
      {preset.eyebrow && (
        <Text style={{ fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 1.5, color: inverse ? '#dbe4ef' : '#666666', marginBottom: 5, textAlign }}>
          {preset.eyebrow}
        </Text>
      )}
      <Text style={{ fontSize: scale.nameSize, fontWeight: 'bold', color: inverse ? '#f8fafc' : colors.primary, lineHeight: 1.12, textAlign }}>
        {uppercaseName ? name.toUpperCase() : name}
      </Text>
      {title && (
        <Text style={{ fontSize: scale.titleSize, color: inverse ? '#dbe4ef' : colors.accent, marginTop: 4, lineHeight: 1.25, textAlign }}>
          {uppercaseName ? title.toUpperCase() : title}
        </Text>
      )}
    </View>
  );
}

function PDFResumeHeader({ resume, colors, templateId }: PDFTemplateProps & { templateId: string }) {
  const preset = getPDFHeaderPreset(templateId);
  const separator = preset.separator;

  if (preset.layout === 'band') {
    return (
      <View style={{ marginBottom: 16, backgroundColor: colors.primary, padding: 18 }}>
        <PDFHeaderText resume={resume} colors={colors} preset={preset} inverse />
        <View style={{ marginTop: 8 }}>
          <PDFContactRow resume={resume} separator={separator} color="#dbe4ef" />
        </View>
      </View>
    );
  }

  if (preset.layout === 'centered') {
    return (
      <View style={{ marginBottom: 18, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: `${colors.accent}55`, paddingBottom: 12 }}>
        <PDFHeaderText resume={resume} colors={colors} preset={preset} align="center" uppercaseName={templateId === 'elegant'} />
        <View style={{ marginTop: 8 }}>
          <PDFContactRow resume={resume} separator={separator} align="center" color="#666666" />
        </View>
      </View>
    );
  }

  if (preset.layout === 'compact' || preset.layout === 'systems') {
    return (
      <View style={{ marginBottom: 14, borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 14 }}>
        <View style={{ flex: 1 }}>
          <PDFHeaderText resume={resume} colors={colors} preset={preset} />
        </View>
        <View style={{ width: 145, paddingTop: 2 }}>
          <PDFContactRow resume={resume} separator="" align="right" color="#666666" />
        </View>
      </View>
    );
  }

  if (preset.layout === 'technical' || preset.layout === 'product') {
    return (
      <View style={{ marginBottom: 16, borderWidth: 1, borderColor: `${colors.primary}40`, padding: 14, backgroundColor: preset.layout === 'product' ? '#f8fafc' : '#ffffff' }}>
        <PDFHeaderText resume={resume} colors={colors} preset={preset} />
        <View style={{ marginTop: 8 }}>
          <PDFContactRow resume={resume} separator={separator} color="#666666" />
        </View>
      </View>
    );
  }

  if (preset.layout === 'traditional') {
    return (
      <View style={{ marginBottom: 16, borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 12, alignItems: 'center' }}>
        <PDFHeaderText resume={resume} colors={colors} preset={preset} align="center" />
        <View style={{ marginTop: 8 }}>
          <PDFContactRow resume={resume} separator={separator} align="center" color="#555555" />
        </View>
      </View>
    );
  }

  if (preset.layout === 'creative') {
    return (
      <View style={{ marginBottom: 18, flexDirection: 'row', gap: 14 }}>
        <View style={{ width: 44, height: 44, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: 'bold' }}>{pdfInitials(resume.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <PDFHeaderText resume={resume} colors={colors} preset={preset} />
          <View style={{ marginTop: 7 }}>
            <PDFContactRow resume={resume} separator={separator} color="#666666" />
          </View>
        </View>
      </View>
    );
  }

  if (preset.layout === 'editorial') {
    return (
      <View style={{ marginBottom: 17 }}>
        <PDFHeaderText resume={resume} colors={colors} preset={preset} />
        <View style={{ marginTop: 8 }}>
          <PDFContactRow resume={resume} separator={separator} color="#666666" />
        </View>
        <View style={{ marginTop: 9, height: 2, width: 58, backgroundColor: colors.accent }} />
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 16, borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 12 }}>
      <PDFHeaderText resume={resume} colors={colors} preset={preset} />
      <View style={{ marginTop: 8 }}>
        <PDFContactRow resume={resume} separator={separator} color="#555555" />
      </View>
    </View>
  );
}

function PDFExperience({ entries, colors, companyFirst }: { entries: CanonicalResume['experience']; colors: TemplateColors; companyFirst?: boolean }) {
  return (
    <View>{entries.map((exp, i) => (
      <View key={i} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
          {companyFirst ? (
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.text }}>{exp.company}</Text>
              <Text style={{ fontSize: 10, color: '#555555' }}>,  </Text>
              <Text style={{ fontSize: 10, fontStyle: 'italic', color: '#555555' }}>{exp.role}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.text }}>{exp.role}</Text>
          )}
          <Text style={{ fontSize: 9, color: '#666666', fontStyle: 'italic' }}>{exp.duration}</Text>
        </View>
        {!companyFirst && <Text style={{ fontSize: 10, color: colors.accent, marginBottom: 3 }}>{exp.company}</Text>}
        {exp.achievements.map((a, j) => (
          <Text key={j} style={{ fontSize: 9.5, marginLeft: 12, marginBottom: 2, lineHeight: 1.5, color: '#333333' }}>•  {a}</Text>
        ))}
      </View>
    ))}</View>
  );
}

function PDFEducation({ entries, colors, companyFirst }: { entries: CanonicalResume['education']; colors: TemplateColors; companyFirst?: boolean }) {
  return (
    <View>{entries.map((edu, i) => {
      const degree = cleanResumeText(edu.degree);
      const institution = cleanResumeText(edu.institution);
      const year = cleanResumeText(edu.year);
      const details = cleanResumeText(edu.details);
      const primaryLine = companyFirst ? (institution || degree) : [degree, institution].filter(Boolean).join('  —  ');
      const secondaryLine = companyFirst && institution ? degree : '';
      const metaLine = [year, details].filter(Boolean).join(' | ');
      return (
        <View key={i} style={{ marginBottom: 6 }}>
          {primaryLine && <Text style={{ fontSize: 10, fontWeight: 'bold' }}>{primaryLine}</Text>}
          {secondaryLine && <Text style={{ fontSize: 9, fontStyle: 'italic', color: '#555555' }}>{secondaryLine}</Text>}
          {metaLine && <Text style={{ fontSize: 9, color: '#555555' }}>{metaLine}</Text>}
        </View>
      );
    })}</View>
  );
}

function PDFSkills({ skills, colors, layout = 'category' }: { skills: CanonicalResume['skills']; colors: TemplateColors; layout?: 'category' | 'inline' }) {
  if (layout === 'inline') {
    return (
      <View>{skills.map((cat, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
          <Text style={{ fontSize: 9.5, fontWeight: 'bold', color: colors.primary, marginRight: 6 }}>{cat.category}:</Text>
          <Text style={{ fontSize: 9.5, color: '#444444', flex: 1 }}>{cat.items.join(', ')}</Text>
        </View>
      ))}</View>
    );
  }

  return (
    <View>{skills.map((cat, i) => (
      <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
        <Text style={{ fontSize: 9.5, fontWeight: 'bold', color: colors.primary, marginRight: 6 }}>{cat.category}:</Text>
        <Text style={{ fontSize: 9.5, color: '#444444' }}>{cat.items.join(',  ')}</Text>
      </View>
    ))}</View>
  );
}

function PDFCertifications({ certs, colors }: { certs: string[]; colors: TemplateColors }) {
  if (!certs.length) return null;
  return (
    <View>
      {certs.map((cert, i) => (
        <Text key={i} style={{ fontSize: 9.5, marginBottom: 2, color: '#333333' }}>•  {cert}</Text>
      ))}
    </View>
  );
}

// ============================================================
// TEMPLATE-SPECIFIC PDF LAYOUTS
// ============================================================

// Executive: Professional serif, border-bottom header
function ExecutivePDF({ resume, colors }: PDFTemplateProps) {
  return (
    <Page size="A4" style={{ fontFamily: 'Inter', fontSize: 10, color: colors.text, padding: '40 50', lineHeight: 1.5 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId="executive" />
      {resume.summary && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Professional Summary</PDFSectionTitle><Text style={{ fontSize: 10, lineHeight: 1.6, color: '#333333' }}>{resume.summary}</Text></View>}
      {resume.experience.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} /></View>}
      {resume.education.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} /></View>}
      {resume.skills.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Skills</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} /></View>}
      <PDFCertifications certs={resume.certifications} colors={colors} />
    </Page>
  );
}

// Minimal: Light, centered header
function MinimalPDF({ resume, colors }: PDFTemplateProps) {
  return (
    <Page size="A4" style={{ fontFamily: 'Inter', fontSize: 10, color: colors.text, padding: '40 50', lineHeight: 1.5 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId="minimal" />
      {resume.summary && <View style={{ borderTopWidth: 1, borderTopColor: '#e0e0e0', paddingTop: 10 }}><Text style={{ fontSize: 10, lineHeight: 1.6, color: '#555555', textAlign: 'center' }}>{resume.summary}</Text></View>}
      {resume.experience.length > 0 && <View><PDFSectionTitle color="#999999">Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} /></View>}
      {resume.education.length > 0 && <View><PDFSectionTitle color="#999999">Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} /></View>}
      {resume.skills.length > 0 && <View><PDFSectionTitle color="#999999">Skills</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} layout="inline" /></View>}
    </Page>
  );
}

// Compact: Dense, small type
function CompactPDF({ resume, colors }: PDFTemplateProps) {
  return (
    <Page size="A4" style={{ fontFamily: 'Inter', fontSize: 9, color: colors.text, padding: '30 40', lineHeight: 1.4 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId="compact" />
      {resume.summary && <View style={{ marginBottom: 8, backgroundColor: `${colors.primary}08`, padding: 8, borderRadius: 4 }}><Text style={{ fontSize: 9, color: '#444444', lineHeight: 1.5 }}>{resume.summary}</Text></View>}
      {resume.skills.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Core Competencies</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} layout="inline" /></View>}
      {resume.experience.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Professional Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} /></View>}
      {resume.education.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} /></View>}
      <PDFCertifications certs={resume.certifications} colors={colors} />
    </Page>
  );
}

// Technical: Monospace style
function TechnicalPDF({ resume, colors }: PDFTemplateProps) {
  return (
    <Page size="A4" style={{ fontFamily: 'Inter', fontSize: 10, color: colors.text, padding: '40 50', lineHeight: 1.5 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId="technical" />
      {resume.summary && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Summary</PDFSectionTitle><Text style={{ fontSize: 10, lineHeight: 1.6, color: '#333333' }}>{resume.summary}</Text></View>}
      {resume.skills.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Technical Skills</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} /></View>}
      {resume.experience.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} /></View>}
      {resume.education.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} /></View>}
    </Page>
  );
}

// Harvard: Education-first, centered header
function HarvardPDF({ resume, colors }: PDFTemplateProps) {
  return (
    <Page size="A4" style={{ fontFamily: 'Inter', fontSize: 10, color: colors.text, padding: '40 50', lineHeight: 1.5 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId="harvard" />
      {resume.education.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} companyFirst /></View>}
      {resume.experience.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} companyFirst /></View>}
      {resume.skills.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Skills and Interests</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} layout="inline" /></View>}
      {resume.summary && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Summary</PDFSectionTitle><Text style={{ fontSize: 10, color: '#555555', lineHeight: 1.6 }}>{resume.summary}</Text></View>}
    </Page>
  );
}

// Generic single-column PDF for: Elegant, Nordic, Modern, Creative, Cascade, Columnist, Metro, Consultant, Startup, ATS Ultra, FAANG, Federal, Academic
function GenericSingleColumnPDF({ resume, colors, sectionOrder, templateId = 'executive' }: PDFTemplateProps & { sectionOrder?: string[]; templateId?: string }) {
  const order = sectionOrder || ['summary', 'experience', 'skills', 'education', 'certifications'];
  const sections: Record<string, JSX.Element | null> = {
    summary: resume.summary ? <View key="summary"><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Professional Summary</PDFSectionTitle><Text style={{ fontSize: 10, lineHeight: 1.6, color: '#333333' }}>{resume.summary}</Text></View> : null,
    experience: resume.experience.length > 0 ? <View key="experience"><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} /></View> : null,
    skills: resume.skills.length > 0 ? <View key="skills"><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Skills</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} /></View> : null,
    education: resume.education.length > 0 ? <View key="education"><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} /></View> : null,
    certifications: resume.certifications.length > 0 ? <View key="certifications"><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Certifications</PDFSectionTitle><PDFCertifications certs={resume.certifications} colors={colors} /></View> : null,
  };
  return (
    <Page size="A4" style={{ fontFamily: 'Inter', fontSize: 10, color: colors.text, padding: '40 50', lineHeight: 1.5 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId={templateId} />
      {order.map(s => sections[s]).filter(Boolean)}
    </Page>
  );
}

// ============================================================
// TEMPLATE MAP → PDF LAYOUT
// ============================================================
const PDF_TEMPLATE_MAP: Record<string, React.FC<PDFTemplateProps>> = {
  'executive': ExecutivePDF,
  'minimal': MinimalPDF,
  'compact': CompactPDF,
  'technical': TechnicalPDF,
  'boardroom': (p) => <GenericSingleColumnPDF {...p} templateId="boardroom" sectionOrder={['summary', 'experience', 'skills', 'education', 'certifications']} />,
  'product-brief': (p) => <GenericSingleColumnPDF {...p} templateId="product-brief" sectionOrder={['summary', 'skills', 'experience', 'education', 'certifications']} />,
  'harvard': HarvardPDF,
  // These use the generic single-column with different section orders:
  'elegant': (p) => <GenericSingleColumnPDF {...p} templateId="elegant" sectionOrder={['summary', 'experience', 'education', 'skills']} />,
  'nordic': (p) => <GenericSingleColumnPDF {...p} templateId="nordic" sectionOrder={['summary', 'experience', 'education', 'skills']} />,
  'modern': (p) => <GenericSingleColumnPDF {...p} templateId="modern" sectionOrder={['summary', 'experience', 'skills', 'education']} />,
  'creative': (p) => <GenericSingleColumnPDF {...p} templateId="creative" sectionOrder={['summary', 'experience', 'education', 'skills']} />,
  'cascade': (p) => <GenericSingleColumnPDF {...p} templateId="cascade" sectionOrder={['summary', 'experience', 'skills', 'education']} />,
  'double-column': (p) => <GenericSingleColumnPDF {...p} templateId="double-column" sectionOrder={['skills', 'summary', 'experience', 'education']} />,
  'infographic': (p) => <GenericSingleColumnPDF {...p} templateId="infographic" sectionOrder={['summary', 'experience', 'skills', 'education']} />,
  'deloitte': (p) => <GenericSingleColumnPDF {...p} templateId="deloitte" sectionOrder={['summary', 'skills', 'experience', 'education', 'certifications']} />,
  'ats-optimized': (p) => <GenericSingleColumnPDF {...p} templateId="ats-optimized" sectionOrder={['summary', 'skills', 'experience', 'education', 'certifications']} />,
  'faang': (p) => <GenericSingleColumnPDF {...p} templateId="faang" sectionOrder={['summary', 'experience', 'skills', 'education']} />,
  'startup': (p) => <GenericSingleColumnPDF {...p} templateId="startup" sectionOrder={['summary', 'experience', 'skills', 'education']} />,
  'federal': (p) => <GenericSingleColumnPDF {...p} templateId="federal" sectionOrder={['summary', 'experience', 'skills', 'education', 'certifications']} />,
  'academic': (p) => <GenericSingleColumnPDF {...p} templateId="academic" sectionOrder={['summary', 'education', 'experience', 'skills', 'certifications']} />,
  'operator': (p) => <GenericSingleColumnPDF {...p} templateId="operator" sectionOrder={['summary', 'skills', 'experience', 'education', 'certifications']} />,
  'data-signal': (p) => <GenericSingleColumnPDF {...p} templateId="data-signal" sectionOrder={['skills', 'summary', 'experience', 'education', 'certifications']} />,
  'finance-ledger': (p) => <GenericSingleColumnPDF {...p} templateId="finance-ledger" sectionOrder={['summary', 'experience', 'skills', 'education', 'certifications']} />,
  'storyline': (p) => <GenericSingleColumnPDF {...p} templateId="storyline" sectionOrder={['summary', 'experience', 'skills', 'education', 'certifications']} />,
  'venture': (p) => <GenericSingleColumnPDF {...p} templateId="venture" sectionOrder={['summary', 'experience', 'skills', 'education', 'certifications']} />,
};

// ============================================================
// MAIN PDF DOCUMENT — template-aware
// ============================================================
export function ResumePDFDocument({
  resume,
  templateId = 'executive',
  colors = { primary: '#1a365d', accent: '#2b6cb0', text: '#1a202c' },
}: {
  resume: CanonicalResume;
  templateId?: string;
  colors?: TemplateColors;
}) {
  const TemplateComponent = PDF_TEMPLATE_MAP[templateId] || ExecutivePDF;
  return (
    <Document>
      <TemplateComponent resume={resume} colors={colors} />
    </Document>
  );
}

// ============================================================
// JD PDF DOCUMENT (unchanged)
// ============================================================
const jdStyles = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 10, color: '#1a202c', padding: '40 50', lineHeight: 1.6 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#0369a1', marginBottom: 6 },
  mission: { fontSize: 11, fontStyle: 'italic', color: '#475569', marginBottom: 14, lineHeight: 1.5 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#0f172a', marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 3 },
  body: { fontSize: 10, lineHeight: 1.6, color: '#334155', marginBottom: 4 },
  bullet: { fontSize: 9.5, marginLeft: 12, marginBottom: 3, lineHeight: 1.5, color: '#334155' },
  subheading: { fontSize: 10, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 },
});

interface GeneratedJD {
  roleTitle: string;
  missionStatement: string;
  overview: string;
  first90Days: { day: string; milestone: string }[];
  coreRequirements: string[];
  niceToHave: string[];
  culturePulse: { trait: string; description: string }[];
  talentDensity: string;
  growthPath: string[];
  compensation?: string;
  benefits?: string[];
}

export function JDPDFDocument({ jd, editableText }: { jd?: GeneratedJD; editableText?: string }) {
  if (jd) {
    return (
      <Document>
        <Page size="A4" style={jdStyles.page}>
          <Text style={jdStyles.title}>{jd.roleTitle}</Text>
          <Text style={jdStyles.mission}>{jd.missionStatement}</Text>
          <Text style={jdStyles.sectionTitle}>About the Role</Text>
          <Text style={jdStyles.body}>{jd.overview}</Text>
          {jd.first90Days?.length > 0 && <View><Text style={jdStyles.sectionTitle}>First 90 Days</Text>{jd.first90Days.map((m, i) => <Text key={i} style={jdStyles.bullet}>•  {m.day}: {m.milestone}</Text>)}</View>}
          {jd.coreRequirements?.length > 0 && <View><Text style={jdStyles.sectionTitle}>What You'll Bring</Text>{jd.coreRequirements.map((r, i) => <Text key={i} style={jdStyles.bullet}>•  {r}</Text>)}</View>}
          {jd.niceToHave?.length > 0 && <View><Text style={jdStyles.sectionTitle}>Nice to Have</Text>{jd.niceToHave.map((r, i) => <Text key={i} style={jdStyles.bullet}>•  {r}</Text>)}</View>}
          {jd.culturePulse?.length > 0 && <View><Text style={jdStyles.sectionTitle}>Our Culture</Text>{jd.culturePulse.map((c, i) => <View key={i} style={{ marginBottom: 4 }}><Text style={jdStyles.subheading}>{c.trait}</Text><Text style={jdStyles.body}>{c.description}</Text></View>)}</View>}
          {jd.talentDensity && <View><Text style={jdStyles.sectionTitle}>What Exceptional Looks Like</Text><Text style={jdStyles.body}>{jd.talentDensity}</Text></View>}
          {jd.growthPath?.length > 0 && <View><Text style={jdStyles.sectionTitle}>Growth Path</Text>{jd.growthPath.map((g, i) => <Text key={i} style={jdStyles.bullet}>•  {g}</Text>)}</View>}
          {jd.compensation && <View><Text style={jdStyles.sectionTitle}>Compensation</Text><Text style={jdStyles.body}>{jd.compensation}</Text></View>}
          {jd.benefits && jd.benefits.length > 0 && <View><Text style={jdStyles.sectionTitle}>Benefits</Text>{jd.benefits.map((b, i) => <Text key={i} style={jdStyles.bullet}>•  {b}</Text>)}</View>}
        </Page>
      </Document>
    );
  }
  return <Document><Page size="A4" style={jdStyles.page}><Text style={jdStyles.body}>{editableText || ''}</Text></Page></Document>;
}

// ============================================================
// DOWNLOAD HELPERS — now template-aware
// ============================================================
export async function downloadResumePDF(
  resume: any,
  colors?: TemplateColors,
  filename?: string,
  templateId?: string
) {
  // Normalize + ATS-clean
  const normalized = atsNormalizeResume(normalizeResume(resume));
  const doc = <ResumePDFDocument resume={normalized} templateId={templateId || 'executive'} colors={colors} />;
  const blob = await pdf(doc).toBlob();
  saveAs(blob, `${filename || normalized.name?.replace(/\s+/g, '_') || 'resume'}.pdf`);
}

export async function downloadJDPDF(
  jd: GeneratedJD | undefined,
  editableText: string | undefined,
  filename?: string
) {
  const doc = <JDPDFDocument jd={jd} editableText={editableText} />;
  const blob = await pdf(doc).toBlob();
  saveAs(blob, `${filename || jd?.roleTitle?.replace(/\s+/g, '_') || 'job-description'}.pdf`);
}
