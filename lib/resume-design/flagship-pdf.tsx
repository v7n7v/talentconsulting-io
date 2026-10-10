import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { buildResumeDocumentPlan, getApplicationResumeDesign } from './index';
import { registerResumeDesignFonts, resumeFontFamily } from './fonts';
import { measureBundledText } from './font-metrics';
import { wrapContactLines, wrapLongTokens } from './text-layout';
import type { ResumeDesignConfig, ResumeDocumentPlan, ResumeDocumentSection, ResumeFontId } from './types';

export type ResumeFlagshipPDFMode = 'designed' | 'application';
export interface ResumeFlagshipPDFProps { resume: CanonicalResume; design: ResumeDesignConfig; mode?: ResumeFlagshipPDFMode }

const PT_PER_MM = 72 / 25.4;
const GUTTER_WIDTH_PT = 62;
const GUTTER_GAP_PT = 14;
const preservePdfWords = (token: string) => [token];
const pageWidthPt = (pageSize: ResumeDesignConfig['pageSize']) => pageSize === 'A4' ? 595.276 : 612;
const contentWidthPt = (design: ResumeDesignConfig) => Math.max(1, pageWidthPt(design.pageSize) - (design.layout.margins.left + design.layout.margins.right) * PT_PER_MM);

function fitted(value: string, width: number, size: number, font: ResumeFontId, weight: 400 | 700, tracking: number) {
  return wrapLongTokens(value, width, size, font, weight, tracking);
}

// Only short supporting records are indivisible. Long credentials and prose must
// remain able to flow even at the largest user-selected type and margins.
function supportingEntryHeight(section: ResumeDocumentSection, entry: ResumeDocumentSection['entries'][number], design: ResumeDesignConfig, width: number) {
  if (!['education', 'certifications', 'additional'].includes(section.kind)) return Infinity;
  const type = { ...design.typography, ...section.typography };
  const lineCount = (value: string, size: number, font: ResumeFontId, weight: 400 | 700) => {
    if (!value) return 0;
    let count = 0;
    for (const paragraph of fitted(value, width, size, font, weight, type.letterSpacing).split('\n')) {
      let advance = 0;
      count += 1;
      for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
        const token = measureBundledText(font, weight, word, size, type.letterSpacing);
        const space = advance ? measureBundledText(font, weight, ' ', size, type.letterSpacing) : 0;
        if (advance && advance + space + token > width) { count += 1; advance = token; }
        else advance += space + token;
      }
    }
    return count;
  };
  const bodyHeight = (value: string) => lineCount(value, type.bodySize, type.bodyFont, type.bodyWeight) * type.bodySize * Math.max(1.5, type.lineHeight);
  return lineCount(entry.title || '', type.roleSize, type.headingFont, 700) * type.roleSize * 1.5
    + bodyHeight(entry.subtitle || '') + bodyHeight(entry.date || '') + bodyHeight(entry.text || '')
    + entry.bullets.reduce((sum, bullet) => sum + bodyHeight(bullet) + design.layout.bulletGap, 0)
    + 9 + design.layout.entryGap + type.headingSize * 1.5 + 8;
}

function supportingGroupBudget(design: ResumeDesignConfig) {
  const pageHeight = design.pageSize === 'A4' ? 841.89 : 792;
  const printableHeight = pageHeight - (design.layout.margins.top + design.layout.margins.bottom) * PT_PER_MM - 36;
  return Math.min(180, printableHeight * 0.3);
}

function PDFEntry({ section, design, availableWidthPt, entryId, last }: { section: ResumeDocumentSection; design: ResumeDesignConfig; availableWidthPt: number; entryId: string; last:boolean }) {
  const typography = { ...design.typography, ...section.typography };
  const family = resumeFontFamily(typography.bodyFont);
  const headingFamily = resumeFontFamily(typography.headingFont);
  const sectionWidth = Math.max(1, availableWidthPt);
  const entries = section.entries.filter(entry => entry.id === entryId);
  const baseTextStyle = { fontFamily: family, fontSize: typography.bodySize, fontWeight: typography.bodyWeight, lineHeight: typography.lineHeight, letterSpacing: typography.letterSpacing, color: design.colors.ink };
  const dateStyle = { ...baseTextStyle, color: design.colors.accent, fontSize: typography.bodySize };

  if (section.kind === 'experience') return <>{entries.map(entry => <View key={entry.id} style={{ marginBottom: last ? 0 : design.layout.entryGap }}>
    {(() => {
      const hasInlineDate = Boolean(entry.date && design.layout.dates === 'inline');
      const measuredDate = hasInlineDate ? measureBundledText(typography.bodyFont, typography.bodyWeight, entry.date || '', typography.bodySize, typography.letterSpacing) : 0;
      const dateWidth = hasInlineDate ? Math.min(sectionWidth * 0.32, Math.max(54, measuredDate + 4)) : 0;
      const titleWidth = hasInlineDate ? Math.max(1, sectionWidth - dateWidth - 12) : sectionWidth;
      return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: hasInlineDate ? 12 : 0 }}>
      <View style={{ flexGrow: 1, flexBasis: 0 }}>
        {entry.title && <Text hyphenationCallback={preservePdfWords} minPresenceAhead={Math.max(42, typography.roleSize + typography.bodySize * typography.lineHeight * 2)} style={{ fontFamily: headingFamily, fontSize: typography.roleSize, fontWeight: 700, lineHeight: 1.22, letterSpacing: typography.letterSpacing, color: design.colors.heading }}>{fitted(entry.title, titleWidth, typography.roleSize, typography.headingFont, 700, typography.letterSpacing)}</Text>}
        {entry.subtitle && <Text hyphenationCallback={preservePdfWords} style={{ ...baseTextStyle, marginTop: 2 }}>{fitted(entry.subtitle, titleWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</Text>}
      </View>
      {hasInlineDate && <Text hyphenationCallback={preservePdfWords} style={{ ...dateStyle, width: dateWidth, flexShrink: 0, textAlign: 'right' }}>{fitted(entry.date || '', dateWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</Text>}
    </View>;
    })()}
    {entry.date && design.layout.dates === 'below' && <Text hyphenationCallback={preservePdfWords} style={{ ...dateStyle, marginTop: 2 }}>{fitted(entry.date, sectionWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</Text>}
    {entry.text && <Text hyphenationCallback={preservePdfWords} orphans={2} widows={2} style={{ ...baseTextStyle, marginTop: 4 }}>{fitted(entry.text, sectionWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</Text>}
    {entry.bullets.map((bullet, index) => <View key={`${entry.id}-bullet-${index}`} style={{ flexDirection: 'row', marginTop: design.layout.bulletGap, gap: 5 }}>
      {design.layout.bullet !== 'none' && <Text style={{ ...baseTextStyle, color: design.colors.accent, width: 8 }}>{design.layout.bullet === 'dash' ? '–' : '•'}</Text>}
      <Text hyphenationCallback={preservePdfWords} orphans={2} widows={2} style={{ ...baseTextStyle, flexGrow: 1, flexBasis: 0 }}>{fitted(bullet, sectionWidth - (design.layout.bullet === 'none' ? 0 : 13), typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</Text>
    </View>)}
  </View>)}</>;

  if (section.kind === 'summary') return <>{entries.map(entry => <View key={entry.id}>
    <Text hyphenationCallback={preservePdfWords} orphans={2} widows={2} style={baseTextStyle}>{fitted(entry.text || '', sectionWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</Text>
  </View>)}</>;

  if (section.kind === 'skills') return <>{entries.map(entry => <View key={entry.id} style={{ marginBottom: last ? 0 : design.layout.entryGap }}>
    <Text hyphenationCallback={preservePdfWords} style={baseTextStyle}>
      <Text hyphenationCallback={preservePdfWords} style={{ fontFamily: headingFamily, fontSize: typography.roleSize, fontWeight: 700, color: design.colors.heading }}>{fitted(`${entry.title}: `, sectionWidth, typography.roleSize, typography.headingFont, 700, typography.letterSpacing)}</Text>
      {fitted(entry.text || entry.bullets.join(' · '), sectionWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}
    </Text>
  </View>)}</>;

  return <>{entries.map(entry => <View key={entry.id} style={{ marginBottom: last ? 0 : design.layout.entryGap }}>
    {entry.title && <Text hyphenationCallback={preservePdfWords} minPresenceAhead={typography.bodySize * typography.lineHeight * 2 + 4} style={{ ...baseTextStyle, fontFamily: headingFamily, fontSize: typography.roleSize, fontWeight: 700, color: design.colors.heading }}>{fitted(entry.title, sectionWidth, typography.roleSize, typography.headingFont, 700, typography.letterSpacing)}</Text>}
    {entry.subtitle && <Text hyphenationCallback={preservePdfWords} style={{ ...baseTextStyle, marginTop: 2 }}>{fitted(entry.subtitle, sectionWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</Text>}
    {entry.date && <Text hyphenationCallback={preservePdfWords} style={{ ...dateStyle, marginTop: entry.title || entry.subtitle ? 2 : 0 }}>{fitted(entry.date, sectionWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</Text>}
    {entry.text && <Text hyphenationCallback={preservePdfWords} orphans={2} widows={2} style={{ ...baseTextStyle, marginTop: 3 }}>{fitted(entry.text, sectionWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</Text>}
    {entry.bullets.map((bullet, index) => <Text key={`${entry.id}-bullet-${index}`} hyphenationCallback={preservePdfWords} style={{ ...baseTextStyle, marginTop: design.layout.bulletGap }}>{fitted(bullet, sectionWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</Text>)}
  </View>)}</>;
}

function PDFSection({ section, design, number, mode, lastSection }: { section: ResumeDocumentSection; design: ResumeDesignConfig; number: number; mode: ResumeFlagshipPDFMode; lastSection:boolean }) {
  const typography = { ...design.typography, ...section.typography };
  const contentPt = contentWidthPt(design);
  const gutterTitle = `${design.layout.headingStyle === 'numbered' ? `${number}. ` : ''}${section.title}`;
  const headingText = typography.headingCase === 'uppercase' ? gutterTitle.toLocaleUpperCase() : gutterTitle;
  const labelTooLong = mode === 'designed' && measureBundledText(typography.headingFont, typography.headingWeight, headingText, typography.headingSize, typography.letterSpacing) > GUTTER_WIDTH_PT * 1.65;
  const bodyWidth = mode === 'application' || labelTooLong ? contentPt : Math.max(1, contentPt - GUTTER_WIDTH_PT - GUTTER_GAP_PT);
  const headingStyle = { fontFamily: resumeFontFamily(typography.headingFont), fontSize: typography.headingSize, fontWeight: typography.headingWeight, letterSpacing: typography.letterSpacing, lineHeight: 1.2, color: design.colors.heading };
  const heading = <Text hyphenationCallback={preservePdfWords} minPresenceAhead={Math.max(36, typography.roleSize * 1.3 + typography.bodySize * typography.lineHeight * 2)} style={{ ...headingStyle, marginBottom: mode === 'application' ? 3 : 5, borderBottomWidth: mode === 'application' ? 0 : 0.65, borderBottomColor: design.colors.accent, paddingBottom: mode === 'application' ? 0 : 3 }}>{fitted(headingText, labelTooLong || mode === 'application' ? contentPt : GUTTER_WIDTH_PT, typography.headingSize, typography.headingFont, typography.headingWeight, typography.letterSpacing)}</Text>;
  const isAdditional = section.kind === 'additional';
  const continuationLabel = <Text hyphenationCallback={preservePdfWords} style={{ fontFamily: resumeFontFamily(typography.headingFont), fontSize: 7.5, fontWeight: 400, lineHeight: 1.15, color: design.colors.accent, marginBottom: 3 }}>{fitted(section.title, labelTooLong || mode === 'application' ? contentPt : GUTTER_WIDTH_PT, 7.5, typography.headingFont, 400, 0.05)}</Text>;
  if (!section.entries.length) return <View key={section.id} break={section.breakBefore} style={{ marginBottom: design.layout.sectionGap }}>{heading}</View>;
  const keepSectionTogether = mode === 'application' && !section.breakBefore
    && !section.entries.some(entry => design.breakBeforeEntries.includes(entry.id))
    && section.entries.reduce((height, entry) => height + supportingEntryHeight(section, entry, design, bodyWidth), 0) <= supportingGroupBudget(design);
  const rows = section.entries.map((entry, index) => {
    const first = index === 0;
    const last = index === section.entries.length - 1;
    const rowBreak = (first && section.breakBefore) || design.breakBeforeEntries.includes(entry.id);
    const showContext = isAdditional && section.entries.length > 4 && !first;
    const keepEntryTogether = supportingEntryHeight(section, entry, design, bodyWidth) <= supportingGroupBudget(design);
    if (mode === 'application' || labelTooLong) return <View key={`${section.id}-${entry.id}`} break={rowBreak} wrap={!keepEntryTogether} style={{ marginBottom: last && !lastSection ? design.layout.sectionGap : 0 }}>
      {first && heading}
      {showContext && continuationLabel}
      <View style={{ width: bodyWidth }}><PDFEntry section={section} design={design} availableWidthPt={bodyWidth} entryId={entry.id} last={last} /></View>
    </View>;
    return <View key={`${section.id}-${entry.id}`} break={rowBreak} wrap={!keepEntryTogether} style={{ flexDirection: 'row', gap: GUTTER_GAP_PT, alignItems: 'flex-start', marginBottom: last && !lastSection ? design.layout.sectionGap : 0 }}>
      <View style={{ width: GUTTER_WIDTH_PT, flexShrink: 0 }}>{first ? heading : showContext && continuationLabel}</View>
      <View style={{ flexGrow: 1, flexBasis: 0 }}><PDFEntry section={section} design={design} availableWidthPt={bodyWidth} entryId={entry.id} last={last} /></View>
    </View>;
  });
  return keepSectionTogether ? <View wrap={false}>{rows}</View> : <>{rows}</>;
}

export function ResumeFlagshipPDFDocument({ resume, design, mode = 'designed' }: ResumeFlagshipPDFProps) {
  registerResumeDesignFonts();
  const plan = buildResumeDocumentPlan(resume, design) as ResumeDocumentPlan;
  const d = mode === 'application' ? getApplicationResumeDesign(plan.design) : plan.design;
  const contentWidth = contentWidthPt(d);
  const nameWrap = fitted(plan.name, contentWidth, d.typography.nameSize, d.typography.headingFont, d.typography.headingWeight, d.typography.letterSpacing);
  const titleWrap = plan.title ? fitted(plan.title, contentWidth, d.typography.headingSize, d.typography.headingFont, d.typography.headingWeight, d.typography.letterSpacing) : '';
  const contactLines = wrapContactLines(plan.contact, contentWidth, d.typography.contactSize, d.typography.bodyFont, d.typography.bodyWeight, d.typography.letterSpacing);
  const continuationText = plan.name;
  const continuationRoom = Math.max(1, contentWidth - 44);
  const continuationAdvance = measureBundledText(d.typography.headingFont, 400, continuationText, 7.5, 0.05);
  const continuationHeight = d.continuationHeader ? Math.max(18, Math.ceil((continuationAdvance + 46) / continuationRoom) * 10 + 5) : 0;
  const continuationWrapped = fitted(continuationText, continuationRoom, 7.5, d.typography.headingFont, 400, 0.05);
  const pageStyle = {
    paddingTop: d.layout.margins.top * PT_PER_MM + continuationHeight,
    paddingRight: d.layout.margins.right * PT_PER_MM,
    paddingBottom: d.layout.margins.bottom * PT_PER_MM + 8,
    paddingLeft: d.layout.margins.left * PT_PER_MM,
    backgroundColor: d.colors.paper,
    color: d.colors.ink,
    fontFamily: resumeFontFamily(d.typography.bodyFont),
    fontSize: d.typography.bodySize,
    fontWeight: d.typography.bodyWeight,
    lineHeight: d.typography.lineHeight,
  };
  const headerSize = d.typography.nameSize;
  const titleSize = d.typography.headingSize;
  const contentSections = plan.sections;
  return <Document title={plan.name || 'Résumé'} author={plan.name || 'Résumé author'} subject="Taco Signature résumé" keywords="résumé, experience, education" language="en-US">
    <Page size={d.pageSize} style={pageStyle} wrap>
      {d.continuationHeader && <Text fixed hyphenationCallback={preservePdfWords} render={({ pageNumber, totalPages }) => pageNumber > 1 ? `${continuationWrapped}  ·  ${pageNumber}/${totalPages}` : ''} style={{ position: 'absolute', top: d.layout.margins.top * PT_PER_MM, left: d.layout.margins.left * PT_PER_MM, right: d.layout.margins.right * PT_PER_MM, fontFamily: resumeFontFamily(d.typography.headingFont), fontWeight:400, fontSize: 7.5, letterSpacing:0.05, lineHeight: 1.2, color: d.colors.heading }} />}
      <View style={{ marginBottom: d.layout.sectionGap, paddingBottom: 12, borderBottomWidth: 0.75, borderBottomColor: d.colors.accent }}>
        <Text hyphenationCallback={preservePdfWords} style={{ fontFamily: resumeFontFamily(d.typography.headingFont), fontSize: headerSize, fontWeight: d.typography.headingWeight, lineHeight: 1.08, letterSpacing: d.typography.letterSpacing, color: d.colors.heading }}>{nameWrap}</Text>
        {titleWrap && <Text hyphenationCallback={preservePdfWords} style={{ marginTop: 5, fontFamily: resumeFontFamily(d.typography.headingFont), fontSize: titleSize, fontWeight: d.typography.headingWeight, lineHeight: 1.24, letterSpacing: d.typography.letterSpacing, color: d.colors.accent }}>{titleWrap}</Text>}
        {contactLines && <Text hyphenationCallback={preservePdfWords} style={{ marginTop: 8, fontFamily: resumeFontFamily(d.typography.bodyFont), fontSize: d.typography.contactSize, fontWeight: d.typography.bodyWeight, lineHeight: 1.35, letterSpacing: d.typography.letterSpacing, color: d.colors.ink }}>{contactLines}</Text>}
      </View>
      {contentSections.map((section, index) => <PDFSection key={section.id} section={section} design={d} number={index + 1} mode={mode} lastSection={index === contentSections.length - 1} />)}
    </Page>
  </Document>;
}
