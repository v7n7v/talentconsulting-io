import {
  Document,
  Page,
  StyleSheet,
  Text as PDFText,
  View,
} from '@react-pdf/renderer';
import type { ComponentProps, ComponentType, ReactElement } from 'react';
import type { CanonicalResume } from './resume-normalizer';
import {
  NEW_SIGNATURE_TEMPLATE_IDS,
  getRegisteredTemplate,
  type ResumeTemplateMetadata,
  type TemplateColors,
} from './resume-templates/catalog';

export type CuratedSignatureTemplateId = (typeof NEW_SIGNATURE_TEMPLATE_IDS)[number];

export interface CuratedSignaturePDFProps {
  resume: CanonicalResume;
  templateId: CuratedSignatureTemplateId;
  colors?: Partial<TemplateColors>;
  pageSize?: 'A4' | 'LETTER';
}

interface CuratedRendererProps {
  resume: CanonicalResume;
  colors: TemplateColors;
  metadata: ResumeTemplateMetadata;
  pageSize?: 'A4' | 'LETTER';
}

type PDFSectionTreatment = 'rule' | 'bar' | 'numbered' | 'boxed' | 'plain';
type PDFHeaderStructure =
  | 'executive-ledger'
  | 'strategy-memo'
  | 'product-banner'
  | 'engineering-spec'
  | 'data-abstract'
  | 'finance-statement'
  | 'legal-caption'
  | 'clinical-band'
  | 'academic-journal'
  | 'civic-record'
  | 'mission-impact'
  | 'career-bridge'
  | 'emerging-launch'
  | 'sales-scorecard'
  | 'creative-portfolio'
  | 'architectural-sheet'
  | 'editorial-byline';

const NO_HYPHENATION = (word: string): string[] => [word];
type FlowTextProps = Exclude<
  ComponentProps<typeof PDFText>,
  { x: string | number; y: string | number }
>;
type ResumeTextProps = Omit<FlowTextProps, 'hyphenationCallback'>;

/**
 * Resume text must not acquire punctuation that the candidate did not provide.
 * The omitted prop makes the invariant impossible to override at a call site,
 * while keeping this behavior local to the curated signature renderer.
 */
function Text(props: ResumeTextProps) {
  return <PDFText {...props} hyphenationCallback={NO_HYPHENATION} />;
}

export interface CuratedPDFStructuralProfile {
  structureKey: PDFHeaderStructure;
  header: PDFHeaderStructure;
  treatment: PDFSectionTreatment;
  fontFamily: 'Helvetica' | 'Times-Roman' | 'Courier';
  nameFont: 'Helvetica-Bold' | 'Times-Bold' | 'Courier-Bold';
  nameSize: number;
  pagePaddingTop: number;
  pagePaddingRight: number;
  pagePaddingLeft: number;
  companyFirst: boolean;
  skillsColumns: 1 | 2;
  supportingSplit: boolean;
  accentMotif: 'rail' | 'corner' | 'underline' | 'ticks' | 'index' | 'double-rule' | 'caption' | 'cross' | 'folio' | 'seal' | 'orbit' | 'bridge' | 'milestones' | 'momentum' | 'frame' | 'registration' | 'drop-cap';
}

/**
 * Each selectable signature owns a unique, frozen PDF profile. Shared primitives
 * keep content parity, while these profiles determine genuinely different page
 * geometry, header structure, section system, type system, and supporting layout.
 */
export const CURATED_SIGNATURE_PDF_PROFILES: Readonly<
  Record<CuratedSignatureTemplateId, CuratedPDFStructuralProfile>
> = Object.freeze({
  'executive-ledger': Object.freeze({ structureKey: 'executive-ledger', header: 'executive-ledger', treatment: 'rule', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 24, pagePaddingTop: 38, pagePaddingRight: 44, pagePaddingLeft: 58, companyFirst: true, skillsColumns: 1, supportingSplit: false, accentMotif: 'rail' }),
  'strategy-brief': Object.freeze({ structureKey: 'strategy-memo', header: 'strategy-memo', treatment: 'boxed', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 23, pagePaddingTop: 34, pagePaddingRight: 46, pagePaddingLeft: 46, companyFirst: false, skillsColumns: 1, supportingSplit: false, accentMotif: 'corner' }),
  'product-signal': Object.freeze({ structureKey: 'product-banner', header: 'product-banner', treatment: 'bar', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 25, pagePaddingTop: 0, pagePaddingRight: 44, pagePaddingLeft: 44, companyFirst: false, skillsColumns: 1, supportingSplit: false, accentMotif: 'underline' }),
  'engineering-core': Object.freeze({ structureKey: 'engineering-spec', header: 'engineering-spec', treatment: 'numbered', fontFamily: 'Courier', nameFont: 'Courier-Bold', nameSize: 21, pagePaddingTop: 32, pagePaddingRight: 42, pagePaddingLeft: 42, companyFirst: false, skillsColumns: 1, supportingSplit: false, accentMotif: 'ticks' }),
  'data-evidence': Object.freeze({ structureKey: 'data-abstract', header: 'data-abstract', treatment: 'numbered', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 22, pagePaddingTop: 36, pagePaddingRight: 48, pagePaddingLeft: 48, companyFirst: false, skillsColumns: 1, supportingSplit: false, accentMotif: 'index' }),
  'finance-standard': Object.freeze({ structureKey: 'finance-statement', header: 'finance-statement', treatment: 'plain', fontFamily: 'Times-Roman', nameFont: 'Times-Bold', nameSize: 22, pagePaddingTop: 38, pagePaddingRight: 50, pagePaddingLeft: 50, companyFirst: false, skillsColumns: 1, supportingSplit: false, accentMotif: 'double-rule' }),
  'legal-brief': Object.freeze({ structureKey: 'legal-caption', header: 'legal-caption', treatment: 'boxed', fontFamily: 'Times-Roman', nameFont: 'Times-Bold', nameSize: 21, pagePaddingTop: 34, pagePaddingRight: 44, pagePaddingLeft: 52, companyFirst: false, skillsColumns: 1, supportingSplit: false, accentMotif: 'caption' }),
  'healthcare-precision': Object.freeze({ structureKey: 'clinical-band', header: 'clinical-band', treatment: 'bar', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 23, pagePaddingTop: 34, pagePaddingRight: 44, pagePaddingLeft: 44, companyFirst: false, skillsColumns: 1, supportingSplit: false, accentMotif: 'cross' }),
  'academic-profile': Object.freeze({ structureKey: 'academic-journal', header: 'academic-journal', treatment: 'rule', fontFamily: 'Times-Roman', nameFont: 'Times-Bold', nameSize: 25, pagePaddingTop: 40, pagePaddingRight: 50, pagePaddingLeft: 50, companyFirst: false, skillsColumns: 2, supportingSplit: false, accentMotif: 'folio' }),
  'public-service': Object.freeze({ structureKey: 'civic-record', header: 'civic-record', treatment: 'plain', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 22, pagePaddingTop: 30, pagePaddingRight: 46, pagePaddingLeft: 46, companyFirst: true, skillsColumns: 1, supportingSplit: false, accentMotif: 'seal' }),
  'mission-impact': Object.freeze({ structureKey: 'mission-impact', header: 'mission-impact', treatment: 'bar', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 23, pagePaddingTop: 36, pagePaddingRight: 48, pagePaddingLeft: 48, companyFirst: false, skillsColumns: 1, supportingSplit: false, accentMotif: 'orbit' }),
  'career-pivot': Object.freeze({ structureKey: 'career-bridge', header: 'career-bridge', treatment: 'bar', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 23, pagePaddingTop: 36, pagePaddingRight: 44, pagePaddingLeft: 44, companyFirst: false, skillsColumns: 2, supportingSplit: false, accentMotif: 'bridge' }),
  'emerging-professional': Object.freeze({ structureKey: 'emerging-launch', header: 'emerging-launch', treatment: 'boxed', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 22, pagePaddingTop: 36, pagePaddingRight: 44, pagePaddingLeft: 52, companyFirst: false, skillsColumns: 1, supportingSplit: false, accentMotif: 'milestones' }),
  'sales-momentum': Object.freeze({ structureKey: 'sales-scorecard', header: 'sales-scorecard', treatment: 'rule', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 24, pagePaddingTop: 32, pagePaddingRight: 42, pagePaddingLeft: 42, companyFirst: false, skillsColumns: 1, supportingSplit: false, accentMotif: 'momentum' }),
  'creative-director': Object.freeze({ structureKey: 'creative-portfolio', header: 'creative-portfolio', treatment: 'bar', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 28, pagePaddingTop: 0, pagePaddingRight: 38, pagePaddingLeft: 38, companyFirst: false, skillsColumns: 2, supportingSplit: true, accentMotif: 'frame' }),
  'architectural-grid': Object.freeze({ structureKey: 'architectural-sheet', header: 'architectural-sheet', treatment: 'boxed', fontFamily: 'Helvetica', nameFont: 'Helvetica-Bold', nameSize: 21, pagePaddingTop: 28, pagePaddingRight: 34, pagePaddingLeft: 34, companyFirst: false, skillsColumns: 2, supportingSplit: true, accentMotif: 'registration' }),
  'editorial-signature': Object.freeze({ structureKey: 'editorial-byline', header: 'editorial-byline', treatment: 'plain', fontFamily: 'Times-Roman', nameFont: 'Times-Bold', nameSize: 27, pagePaddingTop: 34, pagePaddingRight: 42, pagePaddingLeft: 42, companyFirst: false, skillsColumns: 2, supportingSplit: true, accentMotif: 'drop-cap' }),
});

export const CURATED_SIGNATURE_FAMILY_BRANCHES: Readonly<
  Record<CuratedSignatureTemplateId, PDFHeaderStructure>
> = Object.freeze(Object.fromEntries(
  Object.entries(CURATED_SIGNATURE_PDF_PROFILES).map(([id, profile]) => [id, profile.structureKey]),
) as Record<CuratedSignatureTemplateId, PDFHeaderStructure>);

export const PDF_CONTENT_INVENTORY = Object.freeze({
  canonicalFields: Object.freeze([
    'name',
    'title',
    'email',
    'phone',
    'location',
    'linkedin',
    'website',
    'summary',
    'experience.company',
    'experience.role',
    'experience.duration',
    'experience.achievements',
    'skills.category',
    'skills.items',
    'education.degree',
    'education.institution',
    'education.year',
    'education.details',
    'certifications',
  ]),
  standardHeadings: Object.freeze([
    'Professional Summary',
    'Experience',
    'Skills',
    'Education',
    'Certifications',
  ]),
  essentialContentPrimitive: 'Text',
  pageSize: 'A4',
  usesImages: false,
  usesFixedEssentialContent: false,
});

export function getPDFContentInventory(resume: CanonicalResume) {
  const headings: string[] = [];
  if (clean(resume.summary)) headings.push('Professional Summary');
  if (resume.experience.length > 0) headings.push('Experience');
  if (resume.skills.some((group) => group.items.some(clean))) headings.push('Skills');
  if (resume.education.length > 0) headings.push('Education');
  if (resume.certifications.some(clean)) headings.push('Certifications');
  return {
    headings,
    contactValues: [
      resume.email,
      resume.phone,
      resume.location,
      resume.linkedin,
      resume.website,
    ].map(clean).filter(Boolean),
    experienceCount: resume.experience.length,
    educationCount: resume.education.length,
    skillItemCount: resume.skills.reduce(
      (total, group) => total + group.items.filter((item) => Boolean(clean(item))).length,
      0,
    ),
    certificationCount: resume.certifications.filter((item) => Boolean(clean(item))).length,
  };
}

const common = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: '#172033',
    backgroundColor: '#ffffff',
    paddingTop: 38,
    paddingRight: 44,
    paddingBottom: 40,
    paddingLeft: 44,
    lineHeight: 1.42,
  },
  name: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 24,
    lineHeight: 1.06,
  },
  title: {
    fontSize: 10.5,
    marginTop: 4,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  contactItem: {
    fontSize: 8.5,
    marginRight: 9,
    marginBottom: 2,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingBottom: 3,
    marginBottom: 6,
    borderBottomWidth: 0.8,
  },
  body: {
    fontSize: 9.5,
    lineHeight: 1.48,
  },
  entry: {
    marginBottom: 9,
  },
  entryHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  entryLead: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 10,
  },
  role: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
  },
  company: {
    fontSize: 9,
    marginTop: 1,
  },
  date: {
    fontSize: 8.5,
    textAlign: 'right',
    maxWidth: 130,
  },
  bulletRow: {
    flexDirection: 'row',
    marginTop: 3,
    paddingLeft: 4,
  },
  bulletMark: {
    width: 10,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
  },
  bulletText: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 1.43,
  },
  skillGroup: {
    marginBottom: 4,
  },
  skillCategory: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  skillItems: {
    fontSize: 9,
    lineHeight: 1.42,
    marginTop: 1,
  },
  educationDetails: {
    fontSize: 8.7,
    marginTop: 2,
  },
});

/**
 * The built-in PDF fonts do not cover most supplementary-plane scripts.
 * Preserve those scalar values as a reversible ASCII escape instead of
 * silently deleting part of a candidate's name. Literal backslashes are
 * doubled first so decoding is unambiguous.
 */
export function encodeUnsupportedAstralForPDF(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(
      /[\u{10000}-\u{10ffff}]/gu,
      (character) => `\\u{${character.codePointAt(0)!.toString(16).toUpperCase()}}`,
    );
}

export function decodeUnsupportedAstralFromPDF(value: string): string {
  return value.replace(
    /\\\\|\\u\{([0-9A-F]{5,6})\}/g,
    (token, codePoint: string | undefined) => (
      codePoint ? String.fromCodePoint(Number.parseInt(codePoint, 16)) : token.slice(1)
    ),
  );
}

function clean(value: unknown): string {
  return encodeUnsupportedAstralForPDF(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\ud800-\udfff]/g, '')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/gi, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHex(color: string | undefined): string | null {
  if (!color) return null;
  const value = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value.slice(1).split('').map((channel) => channel.repeat(2)).join('')}`.toLowerCase();
  }
  return null;
}

function relativeLuminance(color: string): number {
  const hex = normalizeHex(color) ?? '#000000';
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function getPDFContrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function ensureReadableTextColor(
  candidate: string | undefined,
  background: string,
  fallback: string,
): string {
  const normalizedCandidate = normalizeHex(candidate);
  if (normalizedCandidate && getPDFContrastRatio(normalizedCandidate, background) >= 4.5) {
    return normalizedCandidate;
  }
  const normalizedFallback = normalizeHex(fallback) ?? '#172033';
  if (getPDFContrastRatio(normalizedFallback, background) >= 4.5) return normalizedFallback;
  return getPDFContrastRatio('#111827', background) >= getPDFContrastRatio('#ffffff', background)
    ? '#111827'
    : '#ffffff';
}

function readableTextColor(background: string): string {
  return getPDFContrastRatio('#111827', background) >= getPDFContrastRatio('#ffffff', background)
    ? '#111827'
    : '#ffffff';
}

export function resolveCuratedPDFColors(
  metadata: ResumeTemplateMetadata,
  colorOverrides?: Partial<TemplateColors>,
): TemplateColors {
  const background = normalizeHex(colorOverrides?.background)
    ?? normalizeHex(metadata.colors.background)
    ?? '#ffffff';
  const primary = ensureReadableTextColor(
    colorOverrides?.primary,
    background,
    metadata.colors.primary,
  );
  const text = ensureReadableTextColor(
    colorOverrides?.text,
    background,
    metadata.colors.text,
  );
  const accent = normalizeHex(colorOverrides?.accent)
    ?? normalizeHex(metadata.colors.accent)
    ?? '#64748b';
  return { primary, accent, text, background };
}

function ContactLine({ resume, color }: { resume: CanonicalResume; color?: string }) {
  const items = [
    resume.email,
    resume.phone,
    resume.location,
    resume.linkedin,
    resume.website,
  ].map(clean).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <View style={common.contactRow}>
      {items.map((item, index) => (
        <Text key={`${item}-${index}`} style={[common.contactItem, color ? { color } : {}]}>
          {index > 0 ? ' | ' : ''}{item}
        </Text>
      ))}
    </View>
  );
}

function StandardHeader({
  resume,
  colors,
  metadata,
  align = 'left',
}: CuratedRendererProps & { align?: 'left' | 'center' }) {
  return (
    <View style={{ textAlign: align }}>
      <Text style={{ fontSize: 7.5, letterSpacing: 1.4, color: colors.primary, textTransform: 'uppercase' }}>
        {metadata.name}
      </Text>
      {clean(resume.name) ? (
        <Text style={[common.name, { color: colors.primary }]}>{clean(resume.name)}</Text>
      ) : null}
      {clean(resume.title) ? (
        <Text style={[common.title, { color: colors.text }]}>{clean(resume.title)}</Text>
      ) : null}
      <ContactLine resume={resume} color={colors.text} />
    </View>
  );
}

function SectionTitle({
  children,
  colors,
  treatment = 'rule',
  index,
}: {
  children: string;
  colors: TemplateColors;
  treatment?: 'rule' | 'bar' | 'numbered' | 'boxed' | 'plain';
  index?: number;
}) {
  if (treatment === 'bar') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <View style={{ width: 5, height: 12, backgroundColor: colors.accent, marginRight: 7 }} />
        <Text style={[common.sectionTitle, { color: colors.primary, borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
          {children}
        </Text>
      </View>
    );
  }
  if (treatment === 'numbered') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
        <Text style={{ width: 24, fontFamily: 'Courier-Bold', fontSize: 8, color: colors.primary }}>
          {String(index ?? 1).padStart(2, '0')}
        </Text>
        <Text style={[common.sectionTitle, { color: colors.primary, borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
          {children}
        </Text>
      </View>
    );
  }
  if (treatment === 'boxed') {
    return (
      <Text style={[common.sectionTitle, {
        color: colors.primary,
        borderWidth: 0.8,
        borderColor: colors.primary,
        paddingTop: 3,
        paddingRight: 5,
        paddingBottom: 3,
        paddingLeft: 5,
      }]}>
        {children}
      </Text>
    );
  }
  return (
    <Text style={[common.sectionTitle, {
      color: colors.primary,
      borderBottomColor: colors.accent,
      borderBottomWidth: treatment === 'plain' ? 0 : 0.8,
    }]}>
      {children}
    </Text>
  );
}

function SummarySection({
  resume,
  colors,
  treatment,
  index,
}: CuratedRendererProps & { treatment?: Parameters<typeof SectionTitle>[0]['treatment']; index?: number }) {
  if (!clean(resume.summary)) return null;
  return (
    <View style={common.section}>
      <SectionTitle colors={colors} treatment={treatment} index={index}>Professional Summary</SectionTitle>
      <Text style={[common.body, { color: colors.text }]}>{clean(resume.summary)}</Text>
    </View>
  );
}

function ExperienceSection({
  resume,
  colors,
  treatment,
  index,
  companyFirst = false,
}: CuratedRendererProps & {
  treatment?: Parameters<typeof SectionTitle>[0]['treatment'];
  index?: number;
  companyFirst?: boolean;
}) {
  if (resume.experience.length === 0) return null;
  return (
    <View style={common.section}>
      <SectionTitle colors={colors} treatment={treatment} index={index}>Experience</SectionTitle>
      {resume.experience.map((entry, entryIndex) => (
        <View key={`${entry.company}-${entry.role}-${entryIndex}`} style={common.entry} minPresenceAhead={28}>
          <View style={common.entryHeading}>
            <View style={common.entryLead}>
              {companyFirst ? (
                <>
                  {clean(entry.company) ? <Text style={[common.role, { color: colors.primary }]}>{clean(entry.company)}</Text> : null}
                  {clean(entry.role) ? <Text style={common.company}>{clean(entry.role)}</Text> : null}
                </>
              ) : (
                <>
                  {clean(entry.role) ? <Text style={[common.role, { color: colors.primary }]}>{clean(entry.role)}</Text> : null}
                  {clean(entry.company) ? <Text style={common.company}>{clean(entry.company)}</Text> : null}
                </>
              )}
            </View>
            {clean(entry.duration) ? <Text style={[common.date, { color: colors.text }]}>{clean(entry.duration)}</Text> : null}
          </View>
          {entry.achievements.map(clean).filter(Boolean).map((achievement, achievementIndex) => (
            <View key={`${achievement}-${achievementIndex}`} style={common.bulletRow}>
              <Text style={[common.bulletMark, { color: colors.primary }]}>-</Text>
              <Text style={[common.bulletText, { color: colors.text }]}>{achievement}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function SkillsSection({
  resume,
  colors,
  treatment,
  index,
  columns = 1,
}: CuratedRendererProps & {
  treatment?: Parameters<typeof SectionTitle>[0]['treatment'];
  index?: number;
  columns?: 1 | 2;
}) {
  const groups = resume.skills
    .map((group) => ({ category: clean(group.category), items: group.items.map(clean).filter(Boolean) }))
    .filter((group) => group.items.length > 0);
  if (groups.length === 0) return null;
  return (
    <View style={common.section}>
      <SectionTitle colors={colors} treatment={treatment} index={index}>Skills</SectionTitle>
      <View style={columns === 2 ? { flexDirection: 'row', flexWrap: 'wrap' } : {}}>
        {groups.map((group, groupIndex) => (
          <View
            key={`${group.category}-${groupIndex}`}
            style={[common.skillGroup, columns === 2 ? { width: '50%', paddingRight: 10 } : {}]}
            minPresenceAhead={14}
          >
            {group.category ? <Text style={[common.skillCategory, { color: colors.primary }]}>{group.category}</Text> : null}
            <Text style={[common.skillItems, { color: colors.text }]}>{group.items.join(', ')}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EducationSection({
  resume,
  colors,
  treatment,
  index,
}: CuratedRendererProps & { treatment?: Parameters<typeof SectionTitle>[0]['treatment']; index?: number }) {
  if (resume.education.length === 0) return null;
  return (
    <View style={common.section}>
      <SectionTitle colors={colors} treatment={treatment} index={index}>Education</SectionTitle>
      {resume.education.map((entry, entryIndex) => (
        <View key={`${entry.institution}-${entry.degree}-${entryIndex}`} style={common.entry} minPresenceAhead={18}>
          <View style={common.entryHeading}>
            <View style={common.entryLead}>
              {clean(entry.degree) ? <Text style={[common.role, { color: colors.primary }]}>{clean(entry.degree)}</Text> : null}
              {clean(entry.institution) ? <Text style={common.company}>{clean(entry.institution)}</Text> : null}
            </View>
            {clean(entry.year) ? <Text style={common.date}>{clean(entry.year)}</Text> : null}
          </View>
          {clean(entry.details) ? <Text style={[common.educationDetails, { color: colors.text }]}>{clean(entry.details)}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function CertificationsSection({
  resume,
  colors,
  treatment,
  index,
}: CuratedRendererProps & { treatment?: Parameters<typeof SectionTitle>[0]['treatment']; index?: number }) {
  const certifications = resume.certifications.map(clean).filter(Boolean);
  if (certifications.length === 0) return null;
  return (
    <View style={common.section}>
      <SectionTitle colors={colors} treatment={treatment} index={index}>Certifications</SectionTitle>
      {certifications.map((certification, certificationIndex) => (
        <View key={`${certification}-${certificationIndex}`} style={common.bulletRow}>
          <Text style={[common.bulletMark, { color: colors.primary }]}>-</Text>
          <Text style={[common.bulletText, { color: colors.text }]}>{certification}</Text>
        </View>
      ))}
    </View>
  );
}

type TitleTreatment = Parameters<typeof SectionTitle>[0]['treatment'];

function OrderedSections({
  resume,
  colors,
  metadata,
  treatment = 'rule',
  skillsColumns = 1,
  companyFirst = false,
}: CuratedRendererProps & {
  treatment?: TitleTreatment;
  skillsColumns?: 1 | 2;
  companyFirst?: boolean;
}) {
  const props = { resume, colors, metadata };
  const renderers: Record<string, (index: number) => ReactElement | null> = {
    Summary: (index) => <SummarySection {...props} treatment={treatment} index={index} />,
    Experience: (index) => <ExperienceSection {...props} treatment={treatment} index={index} companyFirst={companyFirst} />,
    Skills: (index) => <SkillsSection {...props} treatment={treatment} index={index} columns={skillsColumns} />,
    Education: (index) => <EducationSection {...props} treatment={treatment} index={index} />,
  };
  return (
    <>
      {metadata.structure.sectionOrder.map((sectionName, index) => (
        <View key={sectionName}>{renderers[sectionName]?.(index + 1) ?? null}</View>
      ))}
      <CertificationsSection {...props} treatment={treatment} index={metadata.structure.sectionOrder.length + 1} />
    </>
  );
}

function ProfileIdentity({
  resume,
  colors,
  profile,
  textColor,
  align = 'left',
}: CuratedRendererProps & {
  profile: CuratedPDFStructuralProfile;
  textColor?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const color = textColor ?? colors.primary;
  return (
    <View style={{ textAlign: align }}>
      {clean(resume.name) ? (
        <Text style={{ fontFamily: profile.nameFont, fontSize: profile.nameSize, lineHeight: 1.06, color }}>
          {clean(resume.name)}
        </Text>
      ) : null}
      {clean(resume.title) ? (
        <Text style={[common.title, { color: textColor ?? colors.text }]}>{clean(resume.title)}</Text>
      ) : null}
      <ContactLine resume={resume} color={textColor ?? colors.text} />
    </View>
  );
}

function ProfileHeader({
  resume,
  colors,
  metadata,
  profile,
}: CuratedRendererProps & { profile: CuratedPDFStructuralProfile }) {
  const props = { resume, colors, metadata, profile };
  const label = (
    <Text style={{ fontFamily: profile.nameFont, fontSize: 7.5, letterSpacing: 1.5, color: colors.primary, textTransform: 'uppercase' }}>
      {metadata.name}
    </Text>
  );
  switch (profile.header) {
    case 'executive-ledger':
      return (
        <View style={{ borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 15, paddingBottom: 6 }}>
          {label}<ProfileIdentity {...props} />
        </View>
      );
    case 'strategy-memo':
      return (
        <View style={{ borderWidth: 1, borderColor: colors.primary, padding: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {label}
            <Text style={{ fontFamily: 'Courier-Bold', fontSize: 7, color: colors.primary }}>MEMORANDUM</Text>
          </View>
          <View style={{ marginTop: 6 }}><ProfileIdentity {...props} /></View>
        </View>
      );
    case 'product-banner': {
      const contrast = readableTextColor(colors.primary);
      return (
        <View style={{ backgroundColor: colors.primary, marginLeft: -profile.pagePaddingLeft, marginRight: -profile.pagePaddingRight, paddingTop: 30, paddingRight: profile.pagePaddingRight, paddingBottom: 18, paddingLeft: profile.pagePaddingLeft }}>
          <Text style={{ fontSize: 7.5, color: contrast, letterSpacing: 1.3, textTransform: 'uppercase' }}>{metadata.name}</Text>
          <ProfileIdentity {...props} textColor={contrast} />
        </View>
      );
    }
    case 'engineering-spec':
      return (
        <View style={{ borderTopWidth: 2, borderTopColor: colors.primary, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {label}
            <Text style={{ fontFamily: 'Courier-Bold', fontSize: 7, color: colors.primary }}>REV. 2026 / PROFILE</Text>
          </View>
          <View style={{ marginTop: 5 }}><ProfileIdentity {...props} /></View>
        </View>
      );
    case 'data-abstract':
      return (
        <View style={{ textAlign: 'center', borderBottomWidth: 1, borderBottomColor: colors.primary, paddingBottom: 10 }}>
          <Text style={{ fontFamily: 'Courier-Bold', fontSize: 7, color: colors.primary }}>ABSTRACT / EVIDENCE INDEX</Text>
          <View style={{ marginTop: 4 }}><ProfileIdentity {...props} align="center" /></View>
          {label}
        </View>
      );
    case 'finance-statement':
      return (
        <View style={{ textAlign: 'center', borderTopWidth: 2.2, borderTopColor: colors.primary, borderBottomWidth: 2.2, borderBottomColor: colors.primary, paddingTop: 8, paddingBottom: 9 }}>
          {label}<ProfileIdentity {...props} align="center" />
        </View>
      );
    case 'legal-caption':
      return (
        <View style={{ flexDirection: 'row', borderBottomWidth: 1.2, borderBottomColor: colors.primary, paddingBottom: 9 }}>
          <View style={{ width: 82, borderRightWidth: 0.8, borderRightColor: colors.accent, paddingRight: 9 }}>
            <Text style={{ fontFamily: 'Times-Bold', fontSize: 7, lineHeight: 1.5, color: colors.primary }}>PROFESSIONAL{'\n'}BRIEF{'\n'}COUNSEL</Text>
          </View>
          <View style={{ flexGrow: 1, paddingLeft: 12 }}>{label}<ProfileIdentity {...props} /></View>
        </View>
      );
    case 'clinical-band':
      return (
        <View style={{ borderTopWidth: 6, borderTopColor: colors.primary, borderRightWidth: 1, borderRightColor: colors.accent, paddingTop: 9, paddingRight: 11, paddingBottom: 5 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {label}
            <View style={{ width: 13, height: 13, borderWidth: 1.5, borderColor: colors.accent }} />
          </View>
          <ProfileIdentity {...props} />
        </View>
      );
    case 'academic-journal':
      return (
        <View style={{ textAlign: 'center', borderTopWidth: 0.8, borderTopColor: colors.primary, borderBottomWidth: 0.8, borderBottomColor: colors.primary, paddingTop: 8, paddingBottom: 10 }}>
          {label}<ProfileIdentity {...props} align="center" />
          <Text style={{ marginTop: 5, fontFamily: 'Times-Italic', fontSize: 7.5, color: colors.primary }}>Research / Teaching / Service</Text>
        </View>
      );
    case 'civic-record':
      return (
        <View style={{ borderTopWidth: 9, borderTopColor: colors.primary, paddingTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flexGrow: 1 }}>{label}<ProfileIdentity {...props} /></View>
            <View style={{ width: 26, height: 26, borderWidth: 2, borderColor: colors.accent, borderRadius: 13 }} />
          </View>
        </View>
      );
    case 'mission-impact':
      return (
        <View style={{ borderLeftWidth: 8, borderLeftColor: colors.accent, borderBottomWidth: 0.8, borderBottomColor: colors.primary, paddingLeft: 13, paddingBottom: 10 }}>
          <Text style={{ fontFamily: profile.nameFont, fontSize: 8, color: colors.primary, textTransform: 'uppercase' }}>Mission / Programs / Community</Text>
          <ProfileIdentity {...props} />
          {label}
        </View>
      );
    case 'career-bridge':
      return (
        <View style={{ textAlign: 'center', paddingBottom: 8 }}>
          {label}<ProfileIdentity {...props} align="center" />
          <View style={{ flexDirection: 'row', height: 5, marginTop: 9, marginRight: 65, marginLeft: 65 }}>
            <View style={{ width: '50%', backgroundColor: colors.primary }} />
            <View style={{ width: '50%', backgroundColor: colors.accent }} />
          </View>
        </View>
      );
    case 'emerging-launch':
      return (
        <View style={{ borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: 15 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, marginRight: 7 }} />
            {label}
          </View>
          <ProfileIdentity {...props} />
        </View>
      );
    case 'sales-scorecard':
      return (
        <View style={{ borderWidth: 2.4, borderColor: colors.primary, padding: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {label}
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8, color: colors.primary }}>QUOTA / PIPELINE / GROWTH</Text>
          </View>
          <ProfileIdentity {...props} />
        </View>
      );
    case 'creative-portfolio': {
      const contrast = readableTextColor(colors.primary);
      return (
        <View style={{ backgroundColor: colors.primary, marginLeft: -profile.pagePaddingLeft, marginRight: -profile.pagePaddingRight, paddingTop: 28, paddingRight: profile.pagePaddingRight, paddingBottom: 20, paddingLeft: profile.pagePaddingLeft }}>
          <Text style={{ fontFamily: profile.nameFont, fontSize: 8, color: contrast, letterSpacing: 2, textTransform: 'uppercase' }}>Selected Career Portfolio</Text>
          <ProfileIdentity {...props} textColor={contrast} />
        </View>
      );
    }
    case 'architectural-sheet':
      return (
        <View style={{ borderWidth: 1.2, borderColor: colors.primary, padding: 10 }}>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: '68%', paddingRight: 10 }}><ProfileIdentity {...props} /></View>
            <View style={{ width: '32%', borderLeftWidth: 0.8, borderLeftColor: colors.primary, paddingLeft: 9 }}>
              <Text style={{ fontFamily: 'Courier-Bold', fontSize: 7, lineHeight: 1.5, color: colors.primary, textTransform: 'uppercase' }}>
                {metadata.name}{'\n'}TITLE BLOCK{'\n'}A-01
              </Text>
            </View>
          </View>
        </View>
      );
    case 'editorial-byline':
      return (
        <View style={{ borderTopWidth: 2, borderTopColor: colors.primary, borderBottomWidth: 2, borderBottomColor: colors.primary, paddingTop: 7, paddingBottom: 9 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ width: '76%' }}><ProfileIdentity {...props} /></View>
            <Text style={{ width: '24%', fontFamily: 'Times-Italic', fontSize: 8, color: colors.primary, textAlign: 'right' }}>Editorial Profile{'\n'}Vol. 2026</Text>
          </View>
          <View style={{ marginTop: 5 }}>{label}</View>
        </View>
      );
  }
}

function DecorativeMotif({
  colors,
  profile,
}: {
  colors: TemplateColors;
  profile: CuratedPDFStructuralProfile;
}) {
  switch (profile.accentMotif) {
    case 'rail':
      return <View style={{ height: 1, width: 62, backgroundColor: colors.accent, marginTop: 7 }} />;
    case 'corner':
      return <View style={{ alignSelf: 'flex-end', height: 4, width: 26, backgroundColor: colors.accent, marginTop: 7 }} />;
    case 'underline':
      return <View style={{ height: 4, width: 82, backgroundColor: colors.accent, marginTop: 9 }} />;
    case 'ticks':
      return <View style={{ flexDirection: 'row', marginTop: 7 }}>{[0, 1, 2, 3, 4, 5].map((item) => <View key={item} style={{ width: 11 + item * 2, height: 2, backgroundColor: colors.accent, marginRight: 4 }} />)}</View>;
    case 'index':
      return <View style={{ alignSelf: 'center', width: 24, height: 3, backgroundColor: colors.accent, marginTop: 8 }} />;
    case 'double-rule':
      return <View style={{ marginTop: 5 }}><View style={{ height: 1, backgroundColor: colors.accent }} /><View style={{ height: 1, backgroundColor: colors.accent, marginTop: 3 }} /></View>;
    case 'caption':
      return <View style={{ width: 38, height: 2, backgroundColor: colors.accent, marginTop: 6, marginLeft: 94 }} />;
    case 'cross':
      return <View style={{ flexDirection: 'row', alignSelf: 'flex-end', marginTop: 5 }}><View style={{ width: 22, height: 2, backgroundColor: colors.accent }} /><View style={{ width: 2, height: 8, backgroundColor: colors.accent, marginTop: -3, marginLeft: -12 }} /></View>;
    case 'folio':
      return <View style={{ alignSelf: 'center', width: 46, height: 1, backgroundColor: colors.accent, marginTop: 7 }} />;
    case 'seal':
      return <View style={{ alignSelf: 'flex-end', width: 16, height: 16, borderWidth: 3, borderColor: colors.accent, borderRadius: 8, marginTop: 4 }} />;
    case 'orbit':
      return <View style={{ width: 54, height: 8, borderWidth: 2, borderColor: colors.accent, borderRadius: 8, marginTop: 7 }} />;
    case 'bridge':
      return <View style={{ alignSelf: 'center', width: 90, height: 2, backgroundColor: colors.accent, marginTop: 5 }} />;
    case 'milestones':
      return <View style={{ flexDirection: 'row', marginTop: 7 }}>{[0, 1, 2, 3].map((item) => <View key={item} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginRight: 16 }} />)}</View>;
    case 'momentum':
      return <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 }}>{[5, 9, 13, 17].map((height) => <View key={height} style={{ width: 13, height, backgroundColor: colors.accent, marginRight: 4 }} />)}</View>;
    case 'frame':
      return <View style={{ alignSelf: 'flex-end', width: 72, height: 10, borderWidth: 2, borderColor: colors.accent, marginTop: 7 }} />;
    case 'registration':
      return <View style={{ flexDirection: 'row', alignSelf: 'flex-end', marginTop: 6 }}><View style={{ width: 22, height: 1, backgroundColor: colors.accent }} /><View style={{ width: 1, height: 22, backgroundColor: colors.accent, marginTop: -10, marginLeft: -11 }} /></View>;
    case 'drop-cap':
      return <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, marginTop: 6 }} />;
  }
}

function ProfileSections({
  resume,
  colors,
  metadata,
  profile,
}: CuratedRendererProps & { profile: CuratedPDFStructuralProfile }) {
  const props = { resume, colors, metadata };
  if (!profile.supportingSplit) {
    return (
      <OrderedSections
        {...props}
        treatment={profile.treatment}
        skillsColumns={profile.skillsColumns}
        companyFirst={profile.companyFirst}
      />
    );
  }
  return (
    <>
      <SummarySection {...props} treatment={profile.treatment} index={1} />
      <ExperienceSection {...props} treatment={profile.treatment} index={2} companyFirst={profile.companyFirst} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ width: '47%', paddingRight: 10 }}>
          <SkillsSection {...props} treatment="plain" index={3} columns={profile.skillsColumns} />
        </View>
        <View style={{ width: '53%', paddingLeft: 10, borderLeftWidth: 0.8, borderLeftColor: colors.accent }}>
          <EducationSection {...props} treatment="plain" index={4} />
          <CertificationsSection {...props} treatment="plain" index={5} />
        </View>
      </View>
    </>
  );
}

function SignatureProfilePage(
  props: CuratedRendererProps,
  profile: CuratedPDFStructuralProfile,
) {
  const hasMaterialSplit = profile.skillsColumns === 2 || profile.supportingSplit;
  const actualColumns = hasMaterialSplit ? 2 : 1;
  const actualExportMode = hasMaterialSplit ? 'designed' : 'linear';
  if (
    props.metadata.structure.columns !== actualColumns
    || props.metadata.exportProfile.pdf !== actualExportMode
  ) {
    throw new Error(
      `PDF profile "${profile.structureKey}" does not match its catalog structure/export label.`,
    );
  }
  if (
    props.metadata.atsClassification === 'ATS-first'
    && (profile.skillsColumns !== 1 || profile.supportingSplit)
  ) {
    throw new Error(`ATS-first PDF profile "${profile.structureKey}" must remain one-column.`);
  }
  return (
    <Page
      size={props.pageSize || 'A4'}
      style={[
        common.page,
        {
          color: props.colors.text,
          backgroundColor: props.colors.background,
          fontFamily: profile.fontFamily,
          paddingTop: profile.pagePaddingTop,
          paddingRight: profile.pagePaddingRight,
          paddingLeft: profile.pagePaddingLeft,
        },
      ]}
    >
      <ProfileHeader {...props} profile={profile} />
      <DecorativeMotif colors={props.colors} profile={profile} />
      <ProfileSections {...props} profile={profile} />
    </Page>
  );
}

function ExecutiveLedgerPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['executive-ledger']); }
function StrategyBriefPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['strategy-brief']); }
function ProductSignalPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['product-signal']); }
function EngineeringCorePDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['engineering-core']); }
function DataEvidencePDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['data-evidence']); }
function FinanceStandardPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['finance-standard']); }
function LegalBriefPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['legal-brief']); }
function HealthcarePrecisionPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['healthcare-precision']); }
function AcademicProfilePDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['academic-profile']); }
function PublicServicePDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['public-service']); }
function MissionImpactPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['mission-impact']); }
function CareerPivotPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['career-pivot']); }
function EmergingProfessionalPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['emerging-professional']); }
function SalesMomentumPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['sales-momentum']); }
function CreativeDirectorPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['creative-director']); }
function ArchitecturalGridPDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['architectural-grid']); }
function EditorialSignaturePDF(props: CuratedRendererProps) { return SignatureProfilePage(props, CURATED_SIGNATURE_PDF_PROFILES['editorial-signature']); }

export const CURATED_SIGNATURE_PDF_MAP: Readonly<
  Record<CuratedSignatureTemplateId, ComponentType<CuratedRendererProps>>
> = Object.freeze({
  'executive-ledger': ExecutiveLedgerPDF,
  'strategy-brief': StrategyBriefPDF,
  'product-signal': ProductSignalPDF,
  'engineering-core': EngineeringCorePDF,
  'data-evidence': DataEvidencePDF,
  'finance-standard': FinanceStandardPDF,
  'legal-brief': LegalBriefPDF,
  'healthcare-precision': HealthcarePrecisionPDF,
  'academic-profile': AcademicProfilePDF,
  'public-service': PublicServicePDF,
  'mission-impact': MissionImpactPDF,
  'career-pivot': CareerPivotPDF,
  'emerging-professional': EmergingProfessionalPDF,
  'sales-momentum': SalesMomentumPDF,
  'creative-director': CreativeDirectorPDF,
  'architectural-grid': ArchitecturalGridPDF,
  'editorial-signature': EditorialSignaturePDF,
});

export function CuratedSignaturePDF({
  resume,
  templateId,
  colors: colorOverrides,
  pageSize = 'A4',
}: CuratedSignaturePDFProps) {
  if (!Object.prototype.hasOwnProperty.call(CURATED_SIGNATURE_PDF_MAP, templateId)) {
    throw new Error(`No curated signature PDF renderer registered for "${String(templateId)}".`);
  }
  const metadata = getRegisteredTemplate(templateId);
  if (!metadata || !NEW_SIGNATURE_TEMPLATE_IDS.includes(templateId)) {
    throw new Error(`No catalog metadata registered for curated signature "${String(templateId)}".`);
  }
  const colors = resolveCuratedPDFColors(metadata, colorOverrides);
  const Renderer = CURATED_SIGNATURE_PDF_MAP[templateId];
  const documentTitle = [clean(resume.name), clean(resume.title)].filter(Boolean).join(' - ') || 'Resume';
  return (
    <Document
      title={documentTitle}
      author={clean(resume.name) || 'Resume author'}
      subject={`${metadata.name} ${metadata.atsClassification} resume`}
      keywords="resume, experience, skills, education, certifications"
      language="en-US"
    >
      <Renderer resume={resume} colors={colors} metadata={metadata} pageSize={pageSize} />
    </Document>
  );
}
