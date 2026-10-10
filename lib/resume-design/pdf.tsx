import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import type { ResumeDesignConfig, ResumeDocumentPlan, ResumeDocumentSection } from './types';
import { buildResumeDocumentPlan, getApplicationResumeDesign, shouldUseStackedResumeHeader } from './index';
import { registerResumeDesignFonts, resumeFontFamily } from './fonts';
import { wrapLongTokens, wrapContactLines } from './text-layout';

type Mode = 'designed' | 'application';
const preservePdfWords = (token: string) => [token];

function Section({ section, design, isRail = false, sectionNumber = 1 }: { section: ResumeDocumentSection; design: ResumeDesignConfig; isRail?: boolean; sectionNumber?: number }) {
  const t = section.typography ? { ...design.typography, ...section.typography } : design.typography;
  const headingFont = resumeFontFamily(t.headingFont);
  const bodyFont = resumeFontFamily(t.bodyFont);
  const ink = isRail ? design.colors.railInk : design.colors.ink;
  const titleColor = isRail ? design.colors.railInk : design.colors.heading;
  const titleStyle = {
    fontFamily: headingFont, fontSize: t.headingSize, fontWeight: t.headingWeight,
    letterSpacing: t.letterSpacing, color: titleColor, marginBottom: 4,
    backgroundColor: design.layout.headingStyle === 'box' ? design.colors.rail : undefined,
    borderWidth: design.layout.headingStyle === 'box' ? design.layout.ruleWidth : 0,
    borderColor: design.colors.accent,
    padding: design.layout.headingStyle === 'box' ? 3 : 0,
    paddingBottom: design.layout.headingStyle === 'plain' ? 0 : 3,
    borderBottomWidth: design.layout.headingStyle === 'box' || design.layout.headingStyle === 'rule' || design.layout.headingStyle === 'numbered' ? design.layout.ruleWidth : 0,
    borderBottomColor: design.colors.accent,
    borderLeftWidth: design.layout.headingStyle === 'box' || design.layout.headingStyle === 'bar' ? design.layout.ruleWidth : 0,
    borderLeftColor: design.colors.accent,
    paddingLeft: design.layout.headingStyle === 'bar' ? 5.67 : 0,
    textTransform: t.headingCase === 'uppercase' ? 'uppercase' as const : 'none' as const,
  };
  const bodyStyle = { fontFamily: bodyFont, fontSize: t.bodySize, fontWeight: t.bodyWeight, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, color: ink };
  const pageWidth = design.pageSize === 'LETTER' ? 612 : 595.276;
  const railTextWidth = (pageWidth - (design.layout.margins.left + design.layout.margins.right) * 72 / 25.4) * design.layout.railWidth / 100 - 22.68;
  const mainTextWidth = design.layout.columns === 2
    ? (pageWidth - (design.layout.margins.left + design.layout.margins.right) * 72 / 25.4) * (1 - design.layout.railWidth / 100) - design.layout.columnGap
    : pageWidth - (design.layout.margins.left + design.layout.margins.right) * 72 / 25.4;
  const dateText = (value: string) => wrapLongTokens(value, isRail ? railTextWidth : mainTextWidth, t.bodySize, t.bodyFont, t.bodyWeight, t.letterSpacing);
  const sectionTextWidth = Math.max(1, isRail ? railTextWidth : mainTextWidth);
  const bodyText = (value: string, width = sectionTextWidth) => wrapLongTokens(value, width, t.bodySize, t.bodyFont, t.bodyWeight, t.letterSpacing);
  const inlineDateWidth = mainTextWidth * 0.4;
  const inlineDateText = (value: string) => wrapLongTokens(value, inlineDateWidth, t.bodySize, t.bodyFont, t.bodyWeight, t.letterSpacing);
  const inlineDateStyle = { ...bodyStyle, color: design.colors.accent, width: inlineDateWidth, flexShrink: 0 };
  const sectionPageBreak = section.breakBefore;
  const entryPageBreak = (id: string) => design.breakBeforeEntries.includes(id);
  const experience = section.kind === 'experience';
  const entry = (e: ResumeDocumentSection['entries'][number]) => {
    const textNodes = [e.text || '', ...e.bullets].filter(Boolean);
    const first = textNodes[0];
    const intro = experience ? <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text hyphenationCallback={preservePdfWords} style={[bodyStyle, { fontFamily: headingFont, fontSize: t.roleSize, fontWeight: 700, flexGrow: 1, flexShrink: 1, flexBasis: 0 }]}>{wrapLongTokens(e.title, isRail || !e.date || design.layout.dates !== 'inline' ? sectionTextWidth : Math.max(1, sectionTextWidth - inlineDateWidth - 8), t.roleSize, t.headingFont, 700, t.letterSpacing)}</Text>
        {design.layout.dates === 'inline' && !isRail && e.date && <Text hyphenationCallback={preservePdfWords} style={inlineDateStyle}>{inlineDateText(e.date)}</Text>}
      </View>
      {isRail && design.layout.dates === 'inline' && e.date && <Text hyphenationCallback={preservePdfWords} style={{ ...bodyStyle, color: design.colors.accent }}>{dateText(e.date)}</Text>}
      {e.subtitle && <Text hyphenationCallback={preservePdfWords} style={{ ...bodyStyle, color: design.colors.accent }}>{bodyText(e.subtitle)}</Text>}
      {design.layout.dates === 'below' && e.date && <Text hyphenationCallback={preservePdfWords} style={{ ...bodyStyle, color: design.colors.accent }}>{dateText(e.date)}</Text>}
      {first && <Text hyphenationCallback={preservePdfWords} style={{ ...bodyStyle, marginLeft: !e.text && design.layout.bullet !== 'none' ? 12 : 0, marginTop: !e.text ? design.layout.bulletGap : 0 }} orphans={2} widows={2}>{bodyText(e.text || `${design.layout.bullet === 'dash' ? '–  ' : design.layout.bullet === 'disc' ? '•  ' : ''}${first}`)}</Text>}
    </View> : null;
    const remaining = experience ? (e.text ? e.bullets : e.bullets.slice(1)) : [];
    const other = !experience ? <>
      {e.title && <><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text hyphenationCallback={preservePdfWords} style={{ ...bodyStyle, fontFamily: headingFont, fontSize: t.roleSize, fontWeight: 700, flexGrow: 1, flexShrink: 1, flexBasis: 0 }} orphans={2} widows={2}>{wrapLongTokens(e.title, isRail || !e.date || design.layout.dates !== 'inline' ? sectionTextWidth : Math.max(1, sectionTextWidth - inlineDateWidth - 8), t.roleSize, t.headingFont, 700, t.letterSpacing)}</Text>{design.layout.dates === 'inline' && !isRail && e.date && <Text hyphenationCallback={preservePdfWords} style={inlineDateStyle}>{inlineDateText(e.date)}</Text>}</View>{isRail && design.layout.dates === 'inline' && e.date && <Text hyphenationCallback={preservePdfWords} style={{ ...bodyStyle, color: design.colors.accent }}>{dateText(e.date)}</Text>}</>}
      {!e.title && design.layout.dates === 'inline' && e.date && <Text hyphenationCallback={preservePdfWords} style={{ ...bodyStyle, color: design.colors.accent }} orphans={2} widows={2}>{dateText(e.date)}</Text>}
      {e.subtitle && <Text hyphenationCallback={preservePdfWords} style={bodyStyle} orphans={2} widows={2}>{bodyText(e.subtitle)}</Text>}
      {design.layout.dates === 'below' && e.date && <Text hyphenationCallback={preservePdfWords} style={{ ...bodyStyle, color: design.colors.accent }} orphans={2} widows={2}>{dateText(e.date)}</Text>}
      {e.text && <Text hyphenationCallback={preservePdfWords} style={bodyStyle} orphans={2} widows={2}>{bodyText(e.text)}</Text>}
      {e.bullets.map((bullet, i) => <Text key={i} hyphenationCallback={preservePdfWords} style={bodyStyle} orphans={2} widows={2}>{bodyText(bullet)}</Text>)}
    </> : null;
    return <View key={e.id} style={{ marginBottom: design.layout.entryGap }} break={entryPageBreak(e.id)}>
      {intro}{other}
      {remaining.map((bullet, i) => <Text key={i} hyphenationCallback={preservePdfWords} style={{ ...bodyStyle, marginLeft: design.layout.bullet === 'none' ? 0 : 12, marginTop: design.layout.bulletGap }} orphans={2} widows={2}>{bodyText(`${design.layout.bullet === 'dash' ? '–  ' : design.layout.bullet === 'disc' ? '•  ' : ''}${bullet}`)}</Text>)}
    </View>;
  };
  return <View style={{ marginBottom: design.layout.sectionGap, color: ink }} break={sectionPageBreak}>
    <Text hyphenationCallback={preservePdfWords} style={titleStyle} minPresenceAhead={Math.max(18, t.bodySize * 2)}>{wrapLongTokens(`${design.layout.headingStyle === 'numbered' ? `${sectionNumber}. ` : ''}${section.title}`, sectionTextWidth, t.headingSize, t.headingFont, t.headingWeight, t.letterSpacing)}</Text>
    {section.kind === 'summary' && section.entries.map(e => <View key={e.id} wrap break={entryPageBreak(e.id)}><Text hyphenationCallback={preservePdfWords} style={bodyStyle} orphans={2} widows={2}>{bodyText(e.text || '')}</Text></View>)}
    {experience && section.entries.map(entry)}
    {section.kind === 'skills' && section.entries.map(e => <View key={e.id} wrap break={entryPageBreak(e.id)}><Text hyphenationCallback={preservePdfWords} style={{ ...bodyStyle, marginBottom: design.layout.bulletGap }} minPresenceAhead={12}><Text hyphenationCallback={preservePdfWords} style={{ fontFamily: headingFont, fontSize: t.roleSize, fontWeight: 700 }}>{wrapLongTokens(`${e.title}: `, sectionTextWidth, t.roleSize, t.headingFont, 700, t.letterSpacing)}</Text>{bodyText(e.text || e.bullets.join(' · '))}</Text></View>)}
    {['education', 'certifications', 'additional'].includes(section.kind) && section.entries.map(entry)}
  </View>;
}

export function ResumeDesignPDFPage({ resume, design, mode = 'designed' }: { resume: CanonicalResume; design: ResumeDesignConfig; mode?: Mode }) {
  registerResumeDesignFonts();
  const plan = buildResumeDocumentPlan(resume, design) as ResumeDocumentPlan;
  const resolved = plan.design;
  const app = mode === 'application';
  const d = app ? getApplicationResumeDesign(resolved) : resolved;
  const pageStyle = {
    paddingTop: d.layout.margins.top * 72 / 25.4, paddingRight: d.layout.margins.right * 72 / 25.4,
    paddingBottom: d.layout.margins.bottom * 72 / 25.4, paddingLeft: d.layout.margins.left * 72 / 25.4,
    backgroundColor: d.colors.paper, color: d.colors.ink,
    fontFamily: resumeFontFamily(d.typography.bodyFont), fontSize: d.typography.bodySize, fontWeight: d.typography.bodyWeight, lineHeight: d.typography.lineHeight,
  };
  const pageWidthPt = d.pageSize === 'LETTER' ? 612 : 595.276;
  const contentWidthPt = pageWidthPt - (d.layout.margins.left + d.layout.margins.right) * 72 / 25.4;
  const band = !app && d.layout.headerStyle === 'band';
  const centered = !app && d.layout.headerStyle === 'center';
  const split = !app && d.layout.headerStyle === 'split' && !shouldUseStackedResumeHeader(d, plan.name, plan.contact);
  const headerContentWidthPt = Math.max(0, contentWidthPt - (band ? 28.34 : 0));
  const nameWidthPt = Math.max(0, headerContentWidthPt - (split ? headerContentWidthPt * 0.4 + 11.34 : 0));
  const contactWidthPt = split ? headerContentWidthPt * 0.4 : headerContentWidthPt;
  const aligned = centered ? 'center' as const : 'left' as const;
  const headerInk = band ? d.colors.paper : d.colors.heading;
  const contactInk = band ? d.colors.paper : d.colors.ink;
  const identity = <View style={split ? { flexGrow: 1, flexBasis: 0, minWidth: 0 } : undefined}>
    <Text hyphenationCallback={(token) => [token]} style={{ fontFamily: resumeFontFamily(d.typography.headingFont), fontSize: d.typography.nameSize, lineHeight: 1.12, fontWeight: d.typography.headingWeight, letterSpacing: d.typography.letterSpacing, color: headerInk, marginBottom:3, textAlign:aligned }} orphans={1} widows={1}>{wrapLongTokens(plan.name, nameWidthPt, d.typography.nameSize, d.typography.headingFont, d.typography.headingWeight, d.typography.letterSpacing)}</Text>
    {plan.title && <Text hyphenationCallback={preservePdfWords} style={{ fontFamily: resumeFontFamily(d.typography.headingFont), fontSize: d.typography.headingSize, lineHeight: 1.25, marginBottom: 4.25, fontWeight: d.typography.headingWeight, letterSpacing: d.typography.letterSpacing, color: band ? d.colors.paper : d.colors.accent, textAlign: aligned }}>{wrapLongTokens(plan.title, headerContentWidthPt, d.typography.headingSize, d.typography.headingFont, d.typography.headingWeight, d.typography.letterSpacing)}</Text>}
    {d.layout.showMotif && !split && <View style={{ width: 51, height: 3.4, marginTop: 5.67, backgroundColor: d.colors.accent }} />}
  </View>;
  const contacts = plan.contact.length > 0 && <Text hyphenationCallback={(token) => [token]} style={{ width:split ? '40%' : undefined, flexShrink:1, fontSize:d.typography.contactSize, fontWeight:d.typography.bodyWeight, lineHeight:1.3, letterSpacing:d.typography.letterSpacing, color:contactInk, textAlign:split ? 'right' : aligned }} orphans={1} widows={1}>{wrapContactLines(plan.contact, contactWidthPt, d.typography.contactSize, d.typography.bodyFont, d.typography.bodyWeight, d.typography.letterSpacing)}</Text>;
  const header = <View style={{ marginBottom: d.layout.sectionGap, padding: band ? 14.17 : 0, backgroundColor: band ? d.colors.heading : 'transparent', flexDirection: split ? 'row' : 'column', alignItems: split ? 'flex-start' : undefined, gap: split ? 11.34 : 0 }} wrap>
    {identity}{split && contacts}
    {!split && contacts}
    {split && d.layout.showMotif && <View style={{ position: 'absolute', left: 0, bottom: -5.67, width: 51, height: 3.4, backgroundColor: d.colors.accent }} />}
  </View>;
  const main = app || d.layout.columns === 1 ? plan.sections : plan.sections.filter(s => s.region === 'main' && s.visible);
  const rail = app || d.layout.columns === 1 ? [] : plan.sections.filter(s => s.region === 'rail' && s.visible);
  const ordered = app ? plan.sections : d.layout.railSide === 'left' ? [...rail, ...main] : [...main, ...rail];
  const railIds = new Set(app ? [] : rail.map(s => s.id));
  const sectionNumber = new Map(ordered.map((s, i) => [s.id, i + 1]));
  const railWidth = `${d.layout.railWidth}%`;
  const gap = d.layout.columnGap;
  return <Document title={plan.name || 'Resume'} author={plan.name || 'Resume author'} subject={`${d.templateId} resume`} keywords="resume, experience, education, skills" language="en-US">
    <Page size={d.pageSize} style={pageStyle} wrap>
      {header}
      {d.continuationHeader && <Text fixed render={({ pageNumber }) => pageNumber > 1 ? `${plan.name}${plan.title ? `  |  ${plan.title}` : ''}` : ''} style={{ position: 'absolute', top: 12, left: d.layout.margins.left * 72 / 25.4, right: d.layout.margins.right * 72 / 25.4, fontFamily: resumeFontFamily(d.typography.headingFont), fontSize: 8, color: d.colors.heading }} />}
      <View style={{ flexDirection: 'row', gap, alignItems: 'flex-start' }}>
        {d.layout.columns === 2 && !app && d.layout.railSide === 'left' && rail.length > 0 && <View style={{ width: railWidth, backgroundColor: d.colors.rail, padding: 11.34 }}>{rail.map(s => <Section key={s.id} section={s} design={d} isRail sectionNumber={sectionNumber.get(s.id)} />)}</View>}
        <View style={{ flexGrow: 1, flexBasis: 0 }}>{ordered.filter(s => !railIds.has(s.id)).map(s => <Section key={s.id} section={s} design={d} sectionNumber={sectionNumber.get(s.id)} />)}</View>
        {d.layout.columns === 2 && !app && d.layout.railSide === 'right' && rail.length > 0 && <View style={{ width: railWidth, backgroundColor: d.colors.rail, padding: 11.34 }}>{rail.map(s => <Section key={s.id} section={s} design={d} isRail sectionNumber={sectionNumber.get(s.id)} />)}</View>}
      </View>
    </Page>
  </Document>;
}
