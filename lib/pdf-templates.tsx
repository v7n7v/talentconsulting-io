'use client';
import { ResumeFlagshipPDFDocument } from './resume-design/flagship-pdf';

/**
 * Text-based PDF Templates using @react-pdf/renderer
 * Template-aware: generates PDFs that match each preview layout.
 * Most templates are single-column; human-first editorial templates are
 * explicitly labeled in the product instead of claiming universal ATS safety.
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
import type { ReactElement } from 'react';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { cleanResumeText, normalizeResume } from '@/lib/resume-normalizer';
import { assertResumeGlyphCoverage } from '@/lib/resume-design/glyph-coverage';
import { getEditorialImpacts, isEditorialImpactAchievement } from '@/components/resume-templates/editorial-authority-impact';
import {
  CURATED_SIGNATURE_PDF_MAP,
  type CuratedSignatureTemplateId,
} from '@/lib/resume-signature-pdf';
import {
  NEW_SIGNATURE_TEMPLATE_IDS,
  getRegisteredTemplate,
} from '@/lib/resume-templates/catalog';
import { requireResumeTemplateRegistryEntry } from '@/lib/resume-templates/registry';
import type { ResumeDesignConfig } from '@/lib/resume-design/types';
import { ResumeDesignPDFPage } from '@/lib/resume-design/pdf';

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
  pageSize?: 'A4' | 'LETTER';
}

type ResumeWithAdditionalSections = CanonicalResume & { additionalSections?: { id: string; title: string; items: string[] }[] };

function PDFAdditionalSections({ resume, colors }: { resume: CanonicalResume; colors: TemplateColors }) {
  const sections = [...((resume as ResumeWithAdditionalSections).additionalSections || []), ...(resume.links?.length ? [{ id: 'additional-links', title: 'Links', items: resume.links }] : [])];
  return <>{sections.map((section, index) => {
    const items = (section.items || []).filter((item) => cleanResumeText(item));
    if (!section.title && items.length === 0) return null;
    return <View key={section.id || `${section.title}-${index}`}><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">{cleanResumeText(section.title) || 'Additional information'}</PDFSectionTitle>{items.map((item, itemIndex) => <Text key={itemIndex} style={{ fontSize: 9.5, marginBottom: 2, color: '#333333' }}>•  {item}</Text>)}</View>;
  })}</>;
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
function ExecutivePDF({ resume, colors, pageSize = 'A4' }: PDFTemplateProps) {
  return (
    <Page size={pageSize} style={{ fontFamily: 'Inter', fontSize: 10, color: colors.text, padding: '40 50', lineHeight: 1.5 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId="executive" />
      {resume.summary && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Professional Summary</PDFSectionTitle><Text style={{ fontSize: 10, lineHeight: 1.6, color: '#333333' }}>{resume.summary}</Text></View>}
      {resume.experience.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} /></View>}
      {resume.education.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} /></View>}
      {resume.skills.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Skills</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} /></View>}
      <PDFCertifications certs={resume.certifications} colors={colors} />
      <PDFAdditionalSections resume={resume} colors={colors} />
    </Page>
  );
}

// Minimal: Light, centered header
function MinimalPDF({ resume, colors, pageSize = 'A4' }: PDFTemplateProps) {
  return (
    <Page size={pageSize} style={{ fontFamily: 'Inter', fontSize: 10, color: colors.text, padding: '40 50', lineHeight: 1.5 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId="minimal" />
      {resume.summary && <View style={{ borderTopWidth: 1, borderTopColor: '#e0e0e0', paddingTop: 10 }}><Text style={{ fontSize: 10, lineHeight: 1.6, color: '#555555', textAlign: 'center' }}>{resume.summary}</Text></View>}
      {resume.experience.length > 0 && <View><PDFSectionTitle color="#999999">Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} /></View>}
      {resume.education.length > 0 && <View><PDFSectionTitle color="#999999">Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} /></View>}
      {resume.skills.length > 0 && <View><PDFSectionTitle color="#999999">Skills</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} layout="inline" /></View>}
      <PDFAdditionalSections resume={resume} colors={colors} />
    </Page>
  );
}

// Compact: Dense, small type
function CompactPDF({ resume, colors, pageSize = 'A4' }: PDFTemplateProps) {
  return (
    <Page size={pageSize} style={{ fontFamily: 'Inter', fontSize: 9, color: colors.text, padding: '30 40', lineHeight: 1.4 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId="compact" />
      {resume.summary && <View style={{ marginBottom: 8, backgroundColor: `${colors.primary}08`, padding: 8, borderRadius: 4 }}><Text style={{ fontSize: 9, color: '#444444', lineHeight: 1.5 }}>{resume.summary}</Text></View>}
      {resume.skills.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Core Competencies</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} layout="inline" /></View>}
      {resume.experience.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Professional Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} /></View>}
      {resume.education.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} /></View>}
      <PDFCertifications certs={resume.certifications} colors={colors} />
      <PDFAdditionalSections resume={resume} colors={colors} />
    </Page>
  );
}

// Technical: Monospace style
function TechnicalPDF({ resume, colors, pageSize = 'A4' }: PDFTemplateProps) {
  return (
    <Page size={pageSize} style={{ fontFamily: 'Inter', fontSize: 10, color: colors.text, padding: '40 50', lineHeight: 1.5 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId="technical" />
      {resume.summary && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Summary</PDFSectionTitle><Text style={{ fontSize: 10, lineHeight: 1.6, color: '#333333' }}>{resume.summary}</Text></View>}
      {resume.skills.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Technical Skills</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} /></View>}
      {resume.experience.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} /></View>}
      {resume.education.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} /></View>}
      <PDFAdditionalSections resume={resume} colors={colors} />
    </Page>
  );
}

// Harvard: Education-first, centered header
function HarvardPDF({ resume, colors, pageSize = 'A4' }: PDFTemplateProps) {
  return (
    <Page size={pageSize} style={{ fontFamily: 'Inter', fontSize: 10, color: colors.text, padding: '40 50', lineHeight: 1.5 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId="harvard" />
      {resume.education.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} companyFirst /></View>}
      {resume.experience.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} companyFirst /></View>}
      {resume.skills.length > 0 && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Skills and Interests</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} layout="inline" /></View>}
      {resume.summary && <View><PDFSectionTitle color={colors.primary} borderColor={`${colors.primary}40`}>Summary</PDFSectionTitle><Text style={{ fontSize: 10, color: '#555555', lineHeight: 1.6 }}>{resume.summary}</Text></View>}
      <PDFAdditionalSections resume={resume} colors={colors} />
    </Page>
  );
}

function EditorialAuthorityPDF({ resume, colors, pageSize = 'A4' }: PDFTemplateProps) {
  const impacts = getEditorialImpacts(resume);
  const contact = [resume.email, resume.phone, resume.location, resume.linkedin, resume.website]
    .filter((item): item is string => Boolean(item));
  const railWidth = 210;
  const pageBackground = '#fbf8f1';
  const clipRailText = (value: string, limit: number) =>
    value.length > limit ? `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…` : value;
  const railContact = contact.map(item => clipRailText(item, 54));
  const railSkills = resume.skills.slice(0, 3).map(group => ({
    ...group,
    category: clipRailText(group.category, 34),
    items: group.items.slice(0, 7).map(item => clipRailText(item, 34)),
  }));
  const railEducation = resume.education.slice(0, 2).map(education => ({
    ...education,
    degree: clipRailText(education.degree, 48),
    institution: clipRailText(education.institution, 44),
  }));
  const railCertifications = resume.certifications.slice(0, 3).map(certification => clipRailText(certification, 58));
  const hasCredentialOverflow =
    contact.some((item, index) => item !== railContact[index])
    || resume.skills.length > railSkills.length
    || resume.skills.some((group, index) => group.items.length > (railSkills[index]?.items.length || 0))
    || resume.skills.some((group, index) =>
      group.category !== railSkills[index]?.category
      || group.items.some((item, itemIndex) => item !== railSkills[index]?.items[itemIndex]))
    || resume.education.length > railEducation.length
    || resume.education.some((education, index) =>
      education.degree !== railEducation[index]?.degree
      || education.institution !== railEducation[index]?.institution)
    || resume.certifications.length > railCertifications.length
    || resume.certifications.some((certification, index) => certification !== railCertifications[index]);

  return (
    <Page
      size={pageSize}
      wrap
      style={{
        fontFamily: 'Inter',
        fontSize: 9.5,
        color: colors.text,
        backgroundColor: pageBackground,
        paddingTop: 62,
        paddingRight: 40,
        paddingBottom: 42,
        paddingLeft: railWidth + 32,
        lineHeight: 1.45,
      }}
    >
      <View fixed style={{ position: 'absolute', left: 0, top: 0, width: railWidth }}>
        <View style={{ width: railWidth, height: pageSize === 'LETTER' ? 792 : 841.89, flexDirection: 'column' }}>
          <View style={{ flexShrink: 0, paddingLeft: 38, paddingTop: 42, paddingBottom: 24, paddingRight: 22, width: railWidth }}>
            <Text style={{ fontFamily: 'Times-Roman', fontSize: resume.name.length > 24 ? 31 : 39, lineHeight: 0.9, color: colors.primary, textTransform: 'uppercase' }}>
              {resume.name || 'Resume'}
            </Text>
            <View style={{ width: 34, height: 1.5, backgroundColor: '#c88718', marginTop: 16, marginBottom: 12 }} />
            {resume.title ? (
              <Text style={{ fontSize: 8.8, fontWeight: 'bold', color: colors.accent, textTransform: 'uppercase', letterSpacing: 1.5, lineHeight: 1.35 }}>
                {resume.title}
              </Text>
            ) : null}
            {contact.length > 0 ? <View style={{ marginTop: 22 }}>
              <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.primary, textTransform: 'uppercase', letterSpacing: 1.3, marginBottom: 6 }}>Contact</Text>
              {railContact.map((item, index) => <Text key={`${item}-${index}`} style={{ fontSize: 7.6, color: colors.text, marginBottom: 3 }}>{item}</Text>)}
            </View> : null}
          </View>
          <View style={{ flexGrow: 1, flexShrink: 0, backgroundColor: colors.primary, paddingTop: 27, paddingHorizontal: 38, color: '#ffffff' }}>
            {railSkills.length > 0 ? (
              <View style={{ marginBottom: 19 }}>
                <Text style={{ fontSize: 8.4, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.3, paddingBottom: 5, borderBottomWidth: 0.6, borderBottomColor: '#94a3b8' }}>
                  Areas of Expertise
                </Text>
                {railSkills.map((group, index) => (
                  <View key={`${group.category}-${index}`} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 7.2, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.4 }}>{group.category}</Text>
                    <Text style={{ marginTop: 2, fontSize: 6.9, lineHeight: 1.38, color: '#dbe4ef' }}>{group.items.join(' · ')}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {railEducation.length > 0 ? (
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 8.4, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.3, paddingBottom: 5, borderBottomWidth: 0.6, borderBottomColor: '#94a3b8' }}>Education</Text>
                {railEducation.map((education, index) => (
                  <View key={`${education.institution}-${index}`} style={{ marginTop: 8 }}>
                    {education.degree ? <Text style={{ fontSize: 7.2, fontWeight: 'bold', textTransform: 'uppercase' }}>{education.degree}</Text> : null}
                    <Text style={{ marginTop: 2, fontSize: 6.9, lineHeight: 1.38, color: '#dbe4ef' }}>{[education.institution, education.year].filter(Boolean).join(' · ')}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {railCertifications.length > 0 ? (
              <View>
                <Text style={{ fontSize: 8.4, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.3, paddingBottom: 5, borderBottomWidth: 0.6, borderBottomColor: '#94a3b8' }}>Certifications</Text>
                {railCertifications.map((certification, index) => (
                  <Text key={`${certification}-${index}`} style={{ marginTop: 6, fontSize: 6.9, lineHeight: 1.38, color: '#dbe4ef' }}>{certification}</Text>
                ))}
                {hasCredentialOverflow ? (
                  <Text style={{ marginTop: 10, fontSize: 6.4, lineHeight: 1.35, color: '#dbe4ef', fontStyle: 'italic' }}>
                    Full credential details continue in the main document.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {resume.summary ? (
        <View>
          <Text style={{ fontSize: 9.2, fontWeight: 'bold', color: colors.accent, textTransform: 'uppercase', letterSpacing: 1.6, paddingBottom: 5, borderBottomWidth: 0.7, borderBottomColor: '#718096' }}>
            Executive Profile
          </Text>
          <Text style={{ marginTop: 9, fontFamily: 'Times-Roman', fontSize: 10.2, lineHeight: 1.55, color: colors.text }}>
            {resume.summary}
          </Text>
        </View>
      ) : null}

      {impacts.length > 0 ? (
        <View style={{ marginTop: 22 }}>
          <Text style={{ fontSize: 9.2, fontWeight: 'bold', color: colors.accent, textTransform: 'uppercase', letterSpacing: 1.6, paddingBottom: 5, borderBottomWidth: 0.7, borderBottomColor: '#718096' }}>
            Selected Impact
          </Text>
          <View style={{ marginTop: 10, flexDirection: 'row' }}>
            {impacts.map((impact, index) => (
              <View
                key={`${impact.experienceIndex}-${impact.achievementIndex}`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  paddingHorizontal: 6,
                  borderLeftWidth: index > 0 ? 0.7 : 0,
                  borderLeftColor: '#94a3b8',
                  textAlign: 'center',
                }}
              >
                <Text style={{ fontFamily: 'Times-Roman', fontSize: impacts.length > 3 ? 19 : 22, lineHeight: 1, color: colors.accent }}>
                  {impact.metric}
                </Text>
                <Text style={{ marginTop: 5, fontSize: 6.7, lineHeight: 1.35, color: colors.text }}>
                  {impact.text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {resume.experience.length > 0 ? (
        <View style={{ marginTop: 28 }}>
          <Text style={{ fontSize: 9.2, fontWeight: 'bold', color: colors.accent, textTransform: 'uppercase', letterSpacing: 1.6, paddingBottom: 5, borderBottomWidth: 0.7, borderBottomColor: '#718096' }}>
            Experience
          </Text>
          {resume.experience.map((experience, experienceIndex) => {
            const achievements = experience.achievements.filter(
              achievement => !isEditorialImpactAchievement(achievement, impacts),
            );
            return (
              <View key={`${experience.company}-${experience.role}-${experienceIndex}`} style={{ paddingTop: 12, paddingBottom: 10, borderBottomWidth: experienceIndex < resume.experience.length - 1 ? 0.5 : 0, borderBottomColor: '#cbd5e1' }}>
                <View wrap={false}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ flex: 1, fontSize: 9.3, fontWeight: 'bold', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      {experience.company}
                    </Text>
                    {experience.duration ? (
                      <Text style={{ fontSize: 7.3, fontWeight: 'bold', color: colors.text, textTransform: 'uppercase' }}>
                        {experience.duration}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ marginTop: 2, marginBottom: 5, fontFamily: 'Times-Italic', fontSize: 10.6, color: colors.text }}>
                    {experience.role}
                  </Text>
                  {achievements[0] ? (
                    <Text style={{ marginLeft: 10, marginBottom: 3, fontSize: 8.2, lineHeight: 1.45, color: colors.text }}>
                      •  {achievements[0]}
                    </Text>
                  ) : null}
                </View>
                {achievements.slice(1).map((achievement, achievementIndex) => (
                  <Text key={`${achievement}-${achievementIndex}`} style={{ marginLeft: 10, marginBottom: 3, fontSize: 8.2, lineHeight: 1.45, color: colors.text }}>
                    •  {achievement}
                  </Text>
                ))}
              </View>
            );
          })}
        </View>
      ) : null}

      {resume.education.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 9.2, fontWeight: 'bold', color: colors.accent, textTransform: 'uppercase', letterSpacing: 1.6, paddingBottom: 5, borderBottomWidth: 0.7, borderBottomColor: '#718096' }}>Education</Text>
          {resume.education.map((education, index) => <Text key={`${education.institution}-${index}`} style={{ marginTop: 5, fontSize: 8.2, color: colors.text }}>{[education.degree, education.institution, education.year, education.details].filter(Boolean).join(' · ')}</Text>)}
        </View>
      ) : null}

      {hasCredentialOverflow ? (
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 9.2, fontWeight: 'bold', color: colors.accent, textTransform: 'uppercase', letterSpacing: 1.6, paddingBottom: 5, borderBottomWidth: 0.7, borderBottomColor: '#718096' }}>
            Additional Credentials
          </Text>
          {contact.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 8.2, fontWeight: 'bold', color: colors.text, textTransform: 'uppercase' }}>Contact</Text>
              <Text style={{ marginTop: 4, fontSize: 8, lineHeight: 1.45, color: colors.text }}>
                {contact.join(' · ')}
              </Text>
            </View>
          ) : null}
          {resume.skills.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 8.2, fontWeight: 'bold', color: colors.text, textTransform: 'uppercase' }}>Areas of Expertise</Text>
              {resume.skills.map((group, index) => (
                <Text key={`${group.category}-${index}`} style={{ marginTop: 4, fontSize: 8, lineHeight: 1.45, color: colors.text }}>
                  {group.category}: {group.items.join(' · ')}
                </Text>
              ))}
            </View>
          ) : null}
          {resume.education.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 8.2, fontWeight: 'bold', color: colors.text, textTransform: 'uppercase' }}>Education</Text>
              {resume.education.map((education, index) => (
                <Text key={`${education.institution}-${index}`} style={{ marginTop: 4, fontSize: 8, lineHeight: 1.45, color: colors.text }}>
                  {[education.degree, education.institution, education.year, education.details].filter(Boolean).join(' · ')}
                </Text>
              ))}
            </View>
          ) : null}
          {resume.certifications.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 8.2, fontWeight: 'bold', color: colors.text, textTransform: 'uppercase' }}>Certifications</Text>
              {resume.certifications.map((certification, index) => (
                <Text key={`${certification}-${index}`} style={{ marginTop: 4, fontSize: 8, lineHeight: 1.45, color: colors.text }}>
                  {certification}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <PDFAdditionalSections resume={resume} colors={colors} />
    </Page>
  );
}

function TechnicalSignalPDF({ resume, colors, pageSize = 'A4' }: PDFTemplateProps) {
  const contact = [resume.email, resume.phone, resume.location, resume.linkedin, resume.website]
    .filter((item): item is string => Boolean(item));
  const signalGreen = '#0a9f36';
  const sectionTitle = (label: string) => (
    <View style={{ marginTop: 17, marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontFamily: 'Courier-Bold', fontSize: 8.5, color: colors.accent, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ height: 0.7, flex: 1, backgroundColor: '#111111' }} />
    </View>
  );

  return (
    <Page
      size={pageSize}
      wrap
      style={{
        backgroundColor: '#fbfbfa',
        color: colors.text,
        fontFamily: 'Courier',
        fontSize: 8,
        lineHeight: 1.42,
        paddingTop: 30,
        paddingRight: 34,
        paddingBottom: 28,
        paddingLeft: 34,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: 'Courier-Bold', fontSize: 8.5, color: colors.accent, textTransform: 'uppercase' }}>
          Technical Signal //
        </Text>
        <View style={{ height: 0.7, flex: 1, backgroundColor: colors.accent }} />
      </View>
      <Text style={{ marginTop: 7, fontFamily: 'Helvetica-Bold', fontSize: resume.name.length > 24 ? 28 : 34, lineHeight: 0.94, color: colors.primary, textTransform: 'uppercase', letterSpacing: -0.7 }}>
        {resume.name || 'Resume'}
      </Text>
      {resume.title ? (
        <Text style={{ marginTop: 5, fontFamily: 'Courier-Bold', fontSize: 11, color: colors.accent, textTransform: 'uppercase' }}>
          {resume.title}
        </Text>
      ) : null}
      {contact.length > 0 ? (
        <Text style={{ marginTop: 6, fontSize: 7.5, color: colors.text }}>
          {contact.join('  |  ')}
        </Text>
      ) : null}

      {resume.skills.length > 0 ? (
        <View>
          {sectionTitle('Technical Capabilities Index')}
          {resume.skills.map((group, index) => (
            <View key={`${group.category}-${index}`} style={{ flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: '#d4d4d4', paddingVertical: 3 }}>
              <Text style={{ width: '22%', paddingRight: 8, fontFamily: 'Courier-Bold', fontSize: 7, color: colors.accent, textTransform: 'uppercase' }}>
                {group.category} /
              </Text>
              <Text style={{ flex: 1, fontSize: 7.1 }}>{group.items.join(', ')}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {resume.summary ? (
        <View>
          {sectionTitle('Technical Summary')}
          <Text style={{ fontSize: 8.2, lineHeight: 1.55 }}>{resume.summary}</Text>
        </View>
      ) : null}

      {resume.experience.length > 0 ? (
        <View>
          {sectionTitle('Experience')}
          {resume.experience.map((experience, experienceIndex) => (
            <View key={`${experience.company}-${experienceIndex}`} style={{ marginBottom: 11 }}>
              <View wrap={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ flex: 1, fontFamily: 'Courier-Bold', fontSize: 8.4, textTransform: 'uppercase' }}>{experience.company}</Text>
                  {experience.duration ? <Text style={{ fontSize: 7.2, textTransform: 'uppercase' }}>{experience.duration}</Text> : null}
                </View>
                <Text style={{ marginTop: 2, marginBottom: 3, fontFamily: 'Courier-Bold', fontSize: 7.4, color: colors.accent, textTransform: 'uppercase' }}>{experience.role}</Text>
                {experience.achievements[0] ? (
                  <Text style={{ marginBottom: 2, fontSize: 7.3, lineHeight: 1.42 }}>
                    <Text style={{ color: colors.accent }}>—  </Text>{experience.achievements[0]}
                  </Text>
                ) : null}
              </View>
              {experience.achievements.slice(1).map((achievement, achievementIndex) => (
                <Text key={`${achievement}-${achievementIndex}`} style={{ marginBottom: 2, fontSize: 7.3, lineHeight: 1.42 }}>
                  <Text style={{ color: colors.accent }}>—  </Text>
                  <Text>{achievement}</Text>
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {resume.certifications.length > 0 ? (
        <View>
          {sectionTitle('Selected Credentials')}
          {resume.certifications.map((certification, index) => (
            <Text key={`${certification}-${index}`} style={{ marginBottom: 3, fontSize: 7.3 }}>
              <Text style={{ color: signalGreen }}>{'//  '}</Text>{certification}
            </Text>
          ))}
        </View>
      ) : null}

      {resume.education.length > 0 ? (
        <View>
          {sectionTitle('Education')}
          {resume.education.map((education, index) => (
            <View key={`${education.institution}-${index}`} style={{ marginBottom: 4, flexDirection: 'row', gap: 10 }}>
              <Text style={{ width: '32%', fontFamily: 'Courier-Bold', fontSize: 7.4, textTransform: 'uppercase' }}>{education.degree}</Text>
              <Text style={{ flex: 1, fontSize: 7.4, textTransform: 'uppercase' }}>{education.institution}</Text>
              <Text style={{ fontSize: 7.4, textTransform: 'uppercase' }}>{education.year}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <PDFAdditionalSections resume={resume} colors={colors} />
      <View fixed style={{ position: 'absolute', left: 34, right: 34, bottom: 14, borderTopWidth: 0.6, borderTopColor: '#111111', paddingTop: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 5.8, textTransform: 'uppercase' }}>{'/ Reliable systems. Measurable impact. /'}</Text>
        <Text style={{ fontSize: 5.8, color: colors.accent, textTransform: 'uppercase' }}>Technical Signal {'//'} v1.0</Text>
      </View>
    </Page>
  );
}

function BrutalistVoltagePDF({ resume, colors, pageSize = 'A4' }: PDFTemplateProps) {
  const impacts = getEditorialImpacts(resume);
  const contact = [resume.website, resume.linkedin, resume.email, resume.phone, resume.location]
    .filter((item): item is string => Boolean(item));
  const lime = '#dfff00';
  const cream = '#f7f0e3';
  const sectionTitle = (label: string, color = '#090909') => (
    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 12, color, textTransform: 'uppercase', paddingBottom: 4, borderBottomWidth: 2.2, borderBottomColor: color }}>
      {label}
    </Text>
  );

  return (
    <Page size={pageSize} wrap style={{ backgroundColor: cream, color: colors.text, fontFamily: 'Helvetica', fontSize: 8, lineHeight: 1.35 }}>
      <View wrap={false} style={{ flexDirection: 'row' }}>
        <View style={{ width: '64%', flexDirection: 'row', paddingTop: 22, paddingBottom: 18 }}>
          <View style={{ width: 56, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 13, color: colors.primary, textTransform: 'uppercase', lineHeight: 0.95, textAlign: 'center' }}>
              BRUTALIST{'\n'}VOLTAGE
            </Text>
          </View>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: resume.name.length > 24 ? 34 : 43, lineHeight: 0.82, color: colors.text, textTransform: 'uppercase', letterSpacing: -1.5 }}>
              {resume.name || 'Resume'}
            </Text>
            <View style={{ marginTop: 10, borderTopWidth: 3, borderTopColor: '#090909', paddingTop: 8 }}>
              {resume.title ? <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 14, lineHeight: 1, color: colors.accent, textTransform: 'uppercase' }}>{resume.title}</Text> : null}
              <Text style={{ marginTop: 3, fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase' }}>Strategy. Clarity. Measurable impact.</Text>
            </View>
          </View>
        </View>
        {resume.summary ? (
          <View style={{ width: '36%', backgroundColor: colors.primary, color: '#ffffff', paddingHorizontal: 22, paddingVertical: 25 }}>
            {sectionTitle('Point of View', '#ffffff')}
            <Text style={{ marginTop: 13, fontSize: 10, lineHeight: 1.5 }}>{resume.summary}</Text>
          </View>
        ) : null}
      </View>

      {impacts.length > 0 ? (
        <View wrap={false} style={{ backgroundColor: '#090909', color: '#ffffff', paddingHorizontal: 58, paddingVertical: 14 }}>
          {sectionTitle('Signature Wins', lime)}
          <View style={{ marginTop: 8, flexDirection: 'row' }}>
            {impacts.map((impact, index) => (
              <View key={`${impact.experienceIndex}-${impact.achievementIndex}`} style={{ flex: 1, paddingHorizontal: 8, borderLeftWidth: index > 0 ? 0.8 : 0, borderLeftColor: lime }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: impacts.length > 3 ? 22 : 26, lineHeight: 1, color: lime }}>{impact.metric}</Text>
                <Text style={{ marginTop: 3, fontFamily: 'Helvetica-Bold', fontSize: 6.4, color: lime, textTransform: 'uppercase' }}>Measurable impact</Text>
                <Text style={{ marginTop: 2, fontSize: 6.2, lineHeight: 1.25 }}>{impact.text}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: '64%', paddingLeft: 58, paddingRight: 16, paddingVertical: 16, borderRightWidth: 0.7, borderRightColor: '#090909' }}>
          {resume.experience.length > 0 ? (
            <View>
              {sectionTitle('Experience')}
              {resume.experience.map((experience, experienceIndex) => (
                <View key={`${experience.company}-${experienceIndex}`} style={{ paddingVertical: 8, borderBottomWidth: experienceIndex < resume.experience.length - 1 ? 0.7 : 0, borderBottomColor: '#090909' }}>
                  <View wrap={false}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 8.3, textTransform: 'uppercase' }}>{experience.role}</Text>
                      {experience.duration ? <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.1, textTransform: 'uppercase' }}>{experience.duration}</Text> : null}
                    </View>
                    <Text style={{ marginTop: 2, marginBottom: 3, fontFamily: 'Helvetica-Bold', fontSize: 7.4, color: colors.primary, textTransform: 'uppercase' }}>{experience.company}</Text>
                    {experience.achievements[0] ? <Text style={{ fontSize: 6.8, lineHeight: 1.35 }}>—  {experience.achievements[0]}</Text> : null}
                  </View>
                  {experience.achievements.slice(1).map((achievement, achievementIndex) => (
                    <Text key={`${achievement}-${achievementIndex}`} style={{ marginTop: 2, fontSize: 6.8, lineHeight: 1.35 }}>—  {achievement}</Text>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ width: '36%' }}>
          {resume.experience.length > 1 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
              {sectionTitle('Selected Engagements')}
              {resume.experience.slice(0, 6).map((experience, index) => (
                <View key={`${experience.company}-${index}`} style={{ paddingVertical: 5, borderBottomWidth: index < Math.min(resume.experience.length, 6) - 1 ? 0.6 : 0, borderBottomColor: '#090909' }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, color: colors.primary, textTransform: 'uppercase' }}>{experience.company}</Text>
                  <Text style={{ marginTop: 1, fontSize: 6.5 }}>{experience.role}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {resume.skills.length > 0 ? (
            <View style={{ backgroundColor: lime, paddingHorizontal: 16, paddingVertical: 16 }}>
              {sectionTitle('Capabilities')}
              {resume.skills.map((group, index) => (
                <View key={`${group.category}-${index}`} style={{ marginTop: 7 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, textTransform: 'uppercase' }}>{group.category}</Text>
                  <Text style={{ marginTop: 2, fontSize: 6.4, lineHeight: 1.32 }}>{group.items.join(', ')}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {resume.certifications.length > 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
              {sectionTitle('Recognition')}
              {resume.certifications.map((certification, index) => (
                <Text key={`${certification}-${index}`} style={{ marginTop: 6, fontFamily: 'Helvetica-Bold', fontSize: 6.8, textTransform: 'uppercase' }}>{certification}</Text>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {resume.education.length > 0 ? (
        <View wrap={false} style={{ flexDirection: 'row', borderTopWidth: 0.7, borderTopColor: '#090909' }}>
          <View style={{ width: '32%', backgroundColor: colors.accent, padding: 14 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 15, lineHeight: 0.95, textTransform: 'uppercase' }}>Strategy that hits.{'\n'}Culture that sticks.</Text>
          </View>
          <View style={{ width: '68%', padding: 14 }}>
            {sectionTitle('Education')}
            <View style={{ marginTop: 7, flexDirection: 'row', gap: 14 }}>
              {resume.education.map((education, index) => (
                <View key={`${education.institution}-${index}`} style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 6.9, color: colors.primary, textTransform: 'uppercase' }}>{education.degree}</Text>
                  <Text style={{ marginTop: 2, fontFamily: 'Helvetica-Bold', fontSize: 6.2, textTransform: 'uppercase' }}>{[education.institution, education.year].filter(Boolean).join(' · ')}</Text>
                </View>
              ))}
            </View>
            {contact.length > 0 ? <Text style={{ marginTop: 9, paddingTop: 4, borderTopWidth: 0.6, borderTopColor: '#090909', fontFamily: 'Helvetica-Bold', fontSize: 5.7, color: colors.primary, textTransform: 'uppercase' }}>{contact.join('   |   ')}</Text> : null}
          </View>
        </View>
      ) : null}

      <PDFAdditionalSections resume={resume} colors={colors} />
      <View
        fixed
        render={({ pageNumber }) => pageNumber > 1 ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 24, backgroundColor: colors.primary, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#ffffff', textTransform: 'uppercase' }}>{resume.name || 'Resume'}</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 6, color: lime, textTransform: 'uppercase' }}>Brutalist Voltage</Text>
          </View>
        ) : null}
      />
    </Page>
  );
}

// Generic single-column PDF for: Elegant, Nordic, Modern, Creative, Cascade, Columnist, Metro, Consultant, Startup, ATS Ultra, FAANG, Federal, Academic
function GenericSingleColumnPDF({ resume, colors, pageSize = 'A4', sectionOrder, templateId = 'executive' }: PDFTemplateProps & { sectionOrder?: string[]; templateId?: string }) {
  const order = sectionOrder || ['summary', 'experience', 'skills', 'education', 'certifications'];
  const sections: Record<string, ReactElement | null> = {
    summary: resume.summary ? <View key="summary"><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Professional Summary</PDFSectionTitle><Text style={{ fontSize: 10, lineHeight: 1.6, color: '#333333' }}>{resume.summary}</Text></View> : null,
    experience: resume.experience.length > 0 ? <View key="experience"><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Experience</PDFSectionTitle><PDFExperience entries={resume.experience} colors={colors} /></View> : null,
    skills: resume.skills.length > 0 ? <View key="skills"><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Skills</PDFSectionTitle><PDFSkills skills={resume.skills} colors={colors} /></View> : null,
    education: resume.education.length > 0 ? <View key="education"><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Education</PDFSectionTitle><PDFEducation entries={resume.education} colors={colors} /></View> : null,
    certifications: resume.certifications.length > 0 ? <View key="certifications"><PDFSectionTitle color={colors.primary} borderColor="#e0e0e0">Certifications</PDFSectionTitle><PDFCertifications certs={resume.certifications} colors={colors} /></View> : null,
    additional: <PDFAdditionalSections key="additional" resume={resume} colors={colors} />,
  };
  return (
    <Page size={pageSize} style={{ fontFamily: 'Inter', fontSize: 10, color: colors.text, padding: '40 50', lineHeight: 1.5 }}>
      <PDFResumeHeader resume={resume} colors={colors} templateId={templateId} />
      {order.map(s => sections[s]).filter(Boolean)}
      <PDFAdditionalSections resume={resume} colors={colors} />
    </Page>
  );
}

// ============================================================
// TEMPLATE MAP → PDF LAYOUT
// ============================================================
function createCuratedPDFPage(templateId: CuratedSignatureTemplateId): React.FC<PDFTemplateProps> {
  const CuratedPage = CURATED_SIGNATURE_PDF_MAP[templateId];
  const metadata = getRegisteredTemplate(templateId);
  if (!metadata) throw new Error(`Missing curated PDF metadata for "${templateId}".`);

  return function CuratedPDFPage({ resume, colors, pageSize = 'A4' }: PDFTemplateProps) {
    return (
      <CuratedPage
        resume={resume}
        colors={{ ...metadata.colors, ...colors }}
        metadata={metadata}
        pageSize={pageSize}
      />
    );
  };
}

const CURATED_PDF_PAGE_MAP = Object.fromEntries(
  NEW_SIGNATURE_TEMPLATE_IDS.map(templateId => [templateId, createCuratedPDFPage(templateId)]),
) as Record<CuratedSignatureTemplateId, React.FC<PDFTemplateProps>>;

const PDF_TEMPLATE_MAP: Record<string, React.FC<PDFTemplateProps>> = {
  'editorial-authority': EditorialAuthorityPDF,
  'technical-signal': TechnicalSignalPDF,
  'brutalist-voltage': BrutalistVoltagePDF,
  ...CURATED_PDF_PAGE_MAP,
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
  pageSize = 'A4',
  design,
  mode = 'designed',
  composition = 'standard',
}: {
  resume: CanonicalResume;
  templateId?: string;
  colors?: TemplateColors;
  pageSize?: 'A4' | 'LETTER';
  design?: ResumeDesignConfig;
  mode?: 'designed' | 'application';
  composition?: 'standard' | 'flagship-experiment';
}) {
  if (composition === 'flagship-experiment' || (design?.rendererVersion === 3 && design.composition === 'taco-signature')) {
    if (!design) throw new Error('The Signature experiment requires a current design.');
    return <ResumeFlagshipPDFDocument resume={resume} design={design} mode={mode} />;
  }
  if (design) return <ResumeDesignPDFPage resume={resume} design={design} mode={mode} />;
  const TemplateComponent = requireResumeTemplateRegistryEntry(PDF_TEMPLATE_MAP, templateId, 'pdf');
  const templateMetadata = getRegisteredTemplate(templateId);
  const documentTitle = [cleanResumeText(resume.name), cleanResumeText(resume.title)].filter(Boolean).join(' — ') || 'Resume';
  return (
    <Document
      title={documentTitle}
      author={cleanResumeText(resume.name) || 'Resume author'}
      subject={
        templateId === 'editorial-authority'
          ? 'Editorial Authority executive resume'
          : templateId === 'technical-signal'
            ? 'Technical Signal engineering resume'
            : templateId === 'brutalist-voltage'
              ? 'Brutalist Voltage creative resume'
              : templateMetadata
                ? `${templateMetadata.name} professional resume`
                : 'Professional resume'
      }
      keywords="resume, experience, education, skills"
      language="en-US"
    >
      {/* eslint-disable-next-line react-hooks/static-components */}
      <TemplateComponent resume={resume} colors={colors} pageSize={pageSize} />
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
          {jd.coreRequirements?.length > 0 && <View><Text style={jdStyles.sectionTitle}>What You&apos;ll Bring</Text>{jd.coreRequirements.map((r, i) => <Text key={i} style={jdStyles.bullet}>•  {r}</Text>)}</View>}
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
  templateId?: string,
  shouldDownload: () => boolean = () => true,
  pageSize: 'A4' | 'LETTER' = 'A4',
  design?: ResumeDesignConfig,
  mode: 'designed' | 'application' = 'designed',
) {
  const { blob } = await buildResumePDFArtifact(resume, colors, templateId, pageSize, design, mode);
  const normalized = normalizeResume(resume);
  if (!shouldDownload()) return;
  saveAs(blob, `${filename || normalized.name?.replace(/\s+/g, '_') || 'resume'}.pdf`);
}

export async function buildResumePDFArtifact(
  resume: CanonicalResume,
  colors?: TemplateColors,
  templateId = 'executive',
  pageSize: 'A4' | 'LETTER' = 'A4',
  design?: ResumeDesignConfig,
  mode: 'designed' | 'application' = 'designed',
  composition: 'standard' | 'flagship-experiment' = 'standard',
): Promise<{ blob: Blob; pageCount: number | null }> {
  const normalized = normalizeResume(resume);
  const withAdditional = {
    ...normalized,
    additionalSections: (resume as CanonicalResume & { additionalSections?: unknown }).additionalSections
      ?? (normalized as CanonicalResume & { additionalSections?: unknown }).additionalSections,
  } as CanonicalResume;
  if (composition === 'flagship-experiment' && !design) throw new Error('The Signature experiment requires a current design.');
  if (design) await assertResumeGlyphCoverage(withAdditional, design, mode);
  const doc = <ResumePDFDocument resume={withAdditional} templateId={templateId} colors={colors} pageSize={pageSize} design={design} mode={mode} composition={composition} />;
  const blob = await pdf(doc).toBlob();
  let pageCount: number | null = null;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    }
    const loadingTask = pdfjs.getDocument({ data: await blob.arrayBuffer() });
    const document = await loadingTask.promise;
    pageCount = document.numPages;
    await document.destroy();
  } catch {
    pageCount = null;
  }
  return { blob, pageCount };
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
