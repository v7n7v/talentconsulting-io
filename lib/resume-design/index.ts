import { measureBundledText } from './font-metrics';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { getRegisteredTemplate, getContrastRatio, type TemplateColors } from '@/lib/resume-templates/catalog';
import { RESUME_FONTS, type ResumeDesignConfig, type ResumeDesignSection, type ResumeDesignTypography, type ResumeDocumentPlan, type ResumeDocumentSection, type ResumeTemplateFamily } from './types';
export * from './types';

type Preset = { family: ResumeTemplateFamily; order: string[]; columns: 1 | 2; header: ResumeDesignConfig['layout']['headerStyle']; heading: ResumeDesignConfig['layout']['headingStyle']; font?: ResumeDesignTypography['headingFont']; companyFirst?: boolean; rail?: string[]; margin?: number; nameSize?: number; gap?: number };
export const RESUME_DESIGN_PRESETS: Readonly<Record<string, Preset>> = {
  'technical-signal': { family: 'foundation', order: ['summary','experience','projects','skills','education','certifications'], columns: 1, header: 'left', heading: 'rule', font: 'liberation-mono', margin: 16 },
  'executive-ledger': { family: 'foundation', order: ['summary','experience','advisory','skills','education','certifications'], columns: 1, header: 'split', heading: 'rule', font: 'liberation-serif', companyFirst: true, nameSize: 29 },
  'strategy-brief': { family: 'foundation', order: ['summary','experience','engagements','projects','skills','education','certifications'], columns: 1, header: 'left', heading: 'box', margin: 18, gap: 7 },
  'finance-standard': { family: 'foundation', order: ['summary','experience','certifications','skills','education'], columns: 1, header: 'center', heading: 'plain', font: 'liberation-serif', margin: 19 },
  'legal-brief': { family: 'foundation', order: ['summary','experience','admissions','certifications','education','skills'], columns: 1, header: 'center', heading: 'rule', font: 'dejavu-serif', margin: 19 },
  'engineering-core': { family: 'outcomes', order: ['summary','experience','projects','skills','education','certifications'], columns: 2, header: 'split', heading: 'numbered', font: 'liberation-mono', rail: ['skills','certifications','education'], margin: 15 },
  'product-signal': { family: 'outcomes', order: ['summary','experience','projects','skills','education','certifications'], columns: 2, header: 'band', heading: 'bar', rail: ['skills','education','certifications'], nameSize: 29 },
  'data-evidence': { family: 'outcomes', order: ['summary','experience','projects','methods','skills','education','certifications'], columns: 1, header: 'split', heading: 'numbered', font: 'dejavu-sans', margin: 18 },
  'sales-momentum': { family: 'outcomes', order: ['summary','experience','accounts','projects','skills','education','certifications'], columns: 1, header: 'band', heading: 'bar', nameSize: 30, gap: 7 },
  'mission-impact': { family: 'outcomes', order: ['summary','experience','programs','grants','service','skills','education','certifications'], columns: 2, header: 'left', heading: 'bar', rail: ['skills','education','certifications'], font: 'dejavu-sans' },
  'emerging-professional': { family: 'specialized', order: ['education','projects','experience','skills','summary','certifications'], columns: 1, header: 'left', heading: 'box', margin: 18, gap: 7 },
  'career-pivot': { family: 'specialized', order: ['summary','skills','experience','projects','education','certifications'], columns: 1, header: 'center', heading: 'bar', margin: 18 },
  'healthcare-precision': { family: 'specialized', order: ['licenses','certifications','summary','experience','education','skills'], columns: 1, header: 'split', heading: 'rule', font: 'liberation-sans', margin: 17 },
  'public-service': { family: 'specialized', order: ['summary','experience','service','education','certifications','skills'], columns: 1, header: 'left', heading: 'plain', companyFirst: true, margin: 18, gap: 7 },
  'academic-profile': { family: 'specialized', order: ['education','research','publications','teaching','grants','service','experience','certifications','skills','summary'], columns: 1, header: 'center', heading: 'numbered', font: 'dejavu-serif', margin: 20, gap: 7 },
  'editorial-authority': { family: 'editorial', order: ['summary','experience','projects','skills','education','certifications'], columns: 2, header: 'split', heading: 'rule', font: 'liberation-serif', rail: ['skills','education','certifications'], nameSize: 32, margin: 16 },
  'editorial-signature': { family: 'editorial', order: ['summary','experience','publications','skills','education','certifications'], columns: 1, header: 'left', heading: 'plain', font: 'dejavu-serif', nameSize: 31, margin: 20, gap: 7 },
  'creative-director': { family: 'editorial', order: ['summary','experience','projects','skills','education','certifications'], columns: 2, header: 'band', heading: 'plain', font: 'dejavu-sans', rail: ['skills','education','certifications'], nameSize: 33, margin: 16 },
  'architectural-grid': { family: 'editorial', order: ['summary','experience','projects','skills','education','certifications'], columns: 2, header: 'split', heading: 'box', font: 'liberation-sans', rail: ['skills','education','certifications'], companyFirst: true, margin: 16 },
  'brutalist-voltage': { family: 'editorial', order: ['summary','experience','projects','skills','education','certifications'], columns: 1, header: 'band', heading: 'bar', font: 'dejavu-sans', nameSize: 36, margin: 16, gap: 7 },
};
export const RESUME_DESIGN_FAMILIES = { foundation: 'Professional foundation', outcomes: 'Work and outcomes', specialized: 'Career stages & specialized records', editorial: 'Editorial & portfolio' } as const;

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const choice = <T extends string | number>(value: unknown, options: readonly T[], fallback: T): T => options.includes(value as T) ? value as T : fallback;
const hex = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const EMPTY_RESUME: CanonicalResume = { name:'', title:'', email:'', phone:'', location:'', summary:'', experience:[], education:[], skills:[], certifications:[] };

function sectionHint(title: string): string {
  const lower = title.toLowerCase();
  const hints: [string, RegExp][] = [['publications',/publication|byline|bibliograph/],['research',/research/],['teaching',/teaching|course/],['grants',/grant|funding/],['licenses',/licen[cs]|admission|jurisdiction/],['service',/service|volunteer|community/],['projects',/project|portfolio|selected work|launch/],['methods',/method/],['programs',/program/],['advisory',/board|advisory/],['accounts',/account|territor/],['engagements',/engagement|client/]];
  return hints.find(([, pattern]) => pattern.test(lower))?.[0] || lower;
}

function defaultSections(resume: CanonicalResume, preset: Preset): ResumeDesignSection[] {
  const base = ['summary','experience','skills','education','certifications'].map(id => ({ id, title: id[0].toUpperCase()+id.slice(1), visible:true, region: preset.rail?.includes(id) ? 'rail' as const : 'main' as const, breakBefore:false }));
  const ids = new Set(base.map(s => s.id));
  const extra = (resume.additionalSections || []).map((s, index) => {
    const raw = `additional:${s.id || index}`;
    const id = ids.has(raw) ? `${raw}:${index}` : raw;
    ids.add(id);
    return { id, title:text(s.title) || 'Additional information', visible:true, region:'main' as const, breakBefore:false };
  });
  const rank = (s: ResumeDesignSection) => {
    const index = preset.order.indexOf(s.id.startsWith('additional:') ? sectionHint(s.title) : s.id);
    return index < 0 ? preset.order.length : index;
  };
  return [...base,...extra].sort((a,b) => rank(a)-rank(b));
}

export function createResumeDesign(templateId: string, resume: CanonicalResume = EMPTY_RESUME, colors?: Partial<TemplateColors>, pageSize: 'A4' | 'LETTER' = 'A4'): ResumeDesignConfig {
  const preset = RESUME_DESIGN_PRESETS[templateId];
  if (!preset) throw new Error(`No version 2 resume design for ${templateId}`);
  const palette = { ...getRegisteredTemplate(templateId)?.colors, ...colors };
  const margin = preset.margin || 17;
  const heading = hex(palette.primary, '#18354d');
  return {
    schemaVersion:1, rendererVersion:2, templateId, pageSize,
    typography:{ bodyFont: preset.family==='foundation' && preset.font==='liberation-serif' ? 'liberation-serif' : 'inter', headingFont:preset.font || 'inter', bodySize:10.5, headingSize:12, roleSize:10.5, bodyWeight:400, headingWeight:700, nameSize:preset.nameSize || 27, contactSize:9.5, lineHeight:1.3, letterSpacing:0, headingCase:'uppercase' },
    colors:{ paper:hex(palette.background,'#ffffff'), ink:hex(palette.text,'#17212b'), heading, accent:hex(palette.accent,'#64748b'), rail:'#f0f2f4', railInk:hex(palette.text,'#17212b') },
    layout:{ columns:preset.columns, railSide:'right', railWidth:28, margins:{ top:margin, right:margin, bottom:margin, left:margin }, columnGap:16, sectionGap:preset.gap || 6, entryGap:4, bulletGap:2, headerStyle:preset.header, headingStyle:preset.heading, companyFirst:preset.companyFirst || false, dates:'inline', bullet:'disc', ruleWidth:1, showMotif:true },
    sections:defaultSections(resume,preset), breakBeforeEntries:[], continuationHeader:true,
  };
}

function normalizeTypography(value: unknown, defaults: ResumeDesignTypography): ResumeDesignTypography {
  const s = obj(value);
  const fonts = RESUME_FONTS.map(font => font.id);
  return { bodyFont:choice(s.bodyFont,fonts,defaults.bodyFont), headingFont:choice(s.headingFont,fonts,defaults.headingFont), bodySize:number(s.bodySize,defaults.bodySize,6,24), headingSize:number(s.headingSize,defaults.headingSize,7,30), roleSize:number(s.roleSize,defaults.roleSize,6,24), bodyWeight:choice(s.bodyWeight,[400,700],defaults.bodyWeight), headingWeight:choice(s.headingWeight,[400,700],defaults.headingWeight), nameSize:number(s.nameSize,defaults.nameSize,12,60), contactSize:number(s.contactSize,defaults.contactSize,6,18), lineHeight:number(s.lineHeight,defaults.lineHeight,1,2.2), letterSpacing:number(s.letterSpacing,defaults.letterSpacing,-.3,3), headingCase:choice(s.headingCase,['normal','uppercase'],defaults.headingCase) };
}

export function isResumeDesignConfig(value: unknown): value is ResumeDesignConfig {
  const d=obj(value);
  return d.schemaVersion===1 && typeof d.templateId==='string' && Boolean(RESUME_DESIGN_PRESETS[d.templateId])
    && ((d.rendererVersion===2 && d.composition===undefined) || (d.rendererVersion===3 && d.composition==='taco-signature'));
}

/** Validated presentation only; old records without a version marker remain on v1. */
export function readResumeDesign(value: unknown, resume?: CanonicalResume): ResumeDesignConfig | null {
  return isResumeDesignConfig(value) ? normalizeResumeDesign(value,value.templateId,resume) : null;
}

export function normalizeResumeDesign(value: unknown, templateId?: string, resume: CanonicalResume = EMPTY_RESUME): ResumeDesignConfig {
  const d=obj(value);
  const id = templateId || (typeof d.templateId==='string' && RESUME_DESIGN_PRESETS[d.templateId] ? d.templateId : 'technical-signal');
  const defaults=createResumeDesign(id,resume);
  const signatureComposition=d.rendererVersion===3 && d.composition==='taco-signature' && d.templateId===id;
  const t=normalizeTypography(d.typography,defaults.typography), c=obj(d.colors), l=obj(d.layout), m=obj(l.margins);
  const seen=new Set<string>();
  const sections:ResumeDesignSection[]=[];
  // Preserve saved custom references even when an editor temporarily omits their content.
  for (const raw of Array.isArray(d.sections) ? d.sections.slice(0,150) : []) {
    const s=obj(raw); const sid=typeof s.id==='string' ? s.id.slice(0,180) : '';
    if (!sid || seen.has(sid) || (!['summary','experience','education','skills','certifications'].includes(sid) && !sid.startsWith('additional:'))) continue;
    seen.add(sid);
    const fallback=defaults.sections.find(section => section.id===sid);
    const overrides=obj(s.typography);
    const validOverrides=normalizeTypography(overrides,t);
    const typography=Object.fromEntries(Object.keys(overrides).filter(key => overrides[key] !== undefined && key in validOverrides).map(key => [key,validOverrides[key as keyof ResumeDesignTypography]]));
    sections.push({ id:sid, title:text(s.title).slice(0,120) || fallback?.title || 'Additional information', visible:bool(s.visible,true), region:choice(s.region,['main','rail'],fallback?.region || 'main'), breakBefore:bool(s.breakBefore,false), ...(Object.keys(typography).length ? { typography } : {}) });
  }
  for (const section of defaults.sections) if (!seen.has(section.id)) sections.push(section);
  const normalized:ResumeDesignConfig = { ...defaults, typography:t,
    pageSize:choice(d.pageSize,['A4','LETTER'],defaults.pageSize),
    colors:{ paper:hex(c.paper,defaults.colors.paper), ink:hex(c.ink,defaults.colors.ink), heading:hex(c.heading,defaults.colors.heading), accent:hex(c.accent,defaults.colors.accent), rail:hex(c.rail,defaults.colors.rail), railInk:hex(c.railInk,defaults.colors.railInk) },
    layout:{ columns:choice(l.columns,[1,2],defaults.layout.columns), railSide:choice(l.railSide,['left','right'],defaults.layout.railSide), railWidth:number(l.railWidth,defaults.layout.railWidth,20,45), margins:{ top:number(m.top,defaults.layout.margins.top,5,40), right:number(m.right,defaults.layout.margins.right,5,40), bottom:number(m.bottom,defaults.layout.margins.bottom,5,40), left:number(m.left,defaults.layout.margins.left,5,40) }, columnGap:number(l.columnGap,defaults.layout.columnGap,6,36), sectionGap:number(l.sectionGap,defaults.layout.sectionGap,0,30), entryGap:number(l.entryGap,defaults.layout.entryGap,0,24), bulletGap:number(l.bulletGap,defaults.layout.bulletGap,0,12), headerStyle:choice(l.headerStyle,['left','center','split','band'],defaults.layout.headerStyle), headingStyle:choice(l.headingStyle,['plain','rule','box','bar','numbered'],defaults.layout.headingStyle), companyFirst:bool(l.companyFirst,defaults.layout.companyFirst), dates:choice(l.dates,['inline','below'],defaults.layout.dates), bullet:choice(l.bullet,['disc','dash','none'],defaults.layout.bullet), ruleWidth:number(l.ruleWidth,defaults.layout.ruleWidth,0,4), showMotif:bool(l.showMotif,defaults.layout.showMotif) },
    sections, breakBeforeEntries:Array.isArray(d.breakBeforeEntries) ? [...new Set(d.breakBeforeEntries.filter((id): id is string => typeof id==='string').map(id=>id.slice(0,180)))].slice(0,500) : [], continuationHeader:bool(d.continuationHeader,defaults.continuationHeader),
  };
  if (signatureComposition) return { ...normalized, rendererVersion:3, composition:'taco-signature',
    layout:{ ...normalized.layout, columns:1, headerStyle:'left', headingStyle:'plain', showMotif:false },
    sections:normalized.sections.map(section => ({ ...section, region:'main' })),
  };
  return normalized;
}

/** Stable source references keep role achievements attached to their employers. */
export function buildResumeDocumentPlan(resume: CanonicalResume, config: ResumeDesignConfig): ResumeDocumentPlan {
  const design=normalizeResumeDesign(config,config.templateId,resume);
  const inventory=new Map<string,Pick<ResumeDocumentSection,'kind'|'entries'>>();
  if (text(resume.summary)) inventory.set('summary',{ kind:'summary', entries:[{ id:'summary:0', title:'', text:text(resume.summary), bullets:[] }] });
  const experience=resume.experience.map((e,i)=>({ id:`experience:${e.id || i}`, title:text(design.layout.companyFirst ? e.company : e.role), subtitle:text(design.layout.companyFirst ? e.role : e.company), date:text(e.duration), bullets:e.achievements.map(text).filter(Boolean) })).filter(e=>e.title || e.subtitle || e.date || e.bullets.length);
  if (experience.length) inventory.set('experience',{ kind:'experience',entries:experience });
  const education=resume.education.map((e,i)=>({ id:`education:${e.id || i}`, title:text(e.degree), subtitle:text(e.institution), date:text(e.year), text:text(e.details), bullets:[] })).filter(e=>e.title || e.subtitle || e.date || e.text);
  if (education.length) inventory.set('education',{kind:'education',entries:education});
  const skills=resume.skills.map((e,i)=>({ id:`skills:${e.id || i}`, title:text(e.category), text:e.items.map(text).filter(Boolean).join(', '), bullets:[] })).filter(e=>e.text);
  if (skills.length) inventory.set('skills',{kind:'skills',entries:skills});
  const certs=resume.certifications.map((e,i)=>({ id:`certifications:${i}`,title:'',text:text(e),bullets:[] })).filter(e=>e.text);
  if (certs.length) inventory.set('certifications',{kind:'certifications',entries:certs});
  const extraDefaults=defaultSections(resume,RESUME_DESIGN_PRESETS[design.templateId]).filter(s=>s.id.startsWith('additional:'));
  // IDs may be reordered by defaults; resolve each original additional section by unique ID.
  const used=new Set<string>();
  (resume.additionalSections || []).forEach((s,i)=>{
    const raw=`additional:${s.id || i}`; const id=used.has(raw) ? `${raw}:${i}` : raw; used.add(id);
    if (!extraDefaults.some(section=>section.id===id)) return;
    const entries=s.items.map((item,j)=>({ id:`${id}:${j}`,title:'',text:text(item),bullets:[] })).filter(e=>e.text);
    if (entries.length) inventory.set(id,{kind:'additional',entries});
  });
  const sections:ResumeDocumentSection[]=[]; const excluded:string[]=[];
  for (const settings of design.sections) {
    const data=inventory.get(settings.id); if (!data) continue;
    if (!settings.visible) excluded.push(settings.title);
    else sections.push({...settings,...data});
  }
  return { name:text(resume.name) || 'Resume',title:text(resume.title),contact:[resume.email,resume.phone,resume.location,resume.linkedin,resume.website,...(resume.links || [])].map(text).filter(Boolean), sections,excluded,design,source:resume };
}

export function switchResumeDesignTemplate(design: ResumeDesignConfig, id: string, resume: CanonicalResume, keepStyle = true): ResumeDesignConfig {
  const next=createResumeDesign(id,resume,undefined,design.pageSize);
  if (!keepStyle) return next;
  const old=new Map(design.sections.map(section=>[section.id,section]));
  return normalizeResumeDesign({ ...next, typography:design.typography,colors:design.colors, layout:{ ...next.layout,margins:design.layout.margins,columnGap:design.layout.columnGap,sectionGap:design.layout.sectionGap,entryGap:design.layout.entryGap,bulletGap:design.layout.bulletGap },sections:next.sections.map(section=>({ ...section, visible:old.get(section.id)?.visible ?? true, title:old.get(section.id)?.title || section.title, typography:old.get(section.id)?.typography,breakBefore:old.get(section.id)?.breakBefore ?? false })),breakBeforeEntries:design.breakBeforeEntries,continuationHeader:design.continuationHeader },id,resume);
}

export function shouldUseStackedResumeHeader(design: ResumeDesignConfig, name: string, contact: string[] = []): boolean {
  if (design.layout.headerStyle !== 'split') return false;
  const pageWidthMm = design.pageSize === 'A4' ? 210 : 215.9;
  const usable = (pageWidthMm - design.layout.margins.left - design.layout.margins.right) * 72 / 25.4;
  const longest = (value: string, font: ResumeDesignTypography['bodyFont'], size: number, weight:400|700) => Math.max(0, ...value.split(/\s+/).map(token => measureBundledText(font, weight, token, size, design.typography.letterSpacing)));
  const nameWidth = longest(name, design.typography.headingFont, design.typography.nameSize, design.typography.headingWeight);
  const contactWidth = Math.max(0, ...contact.map(value => longest(value, design.typography.bodyFont, design.typography.contactSize, design.typography.bodyWeight)));
  return nameWidth > usable * 0.56 || contactWidth > usable * 0.38;
}

export function getResumeDesignWarnings(design: ResumeDesignConfig, resume?: CanonicalResume): string[] {
  const warnings:string[]=[];
  if (design.typography.bodySize<10) warnings.push('Body text below 10 pt can be difficult to read in print.');
  if (design.typography.contactSize<9) warnings.push('Contact text below 9 pt may be difficult to read.');
  const pairs:[string,string,string][]=[['Body',design.colors.ink,design.colors.paper],['Headings',design.colors.heading,design.colors.paper],['Accent',design.colors.accent,design.colors.paper]];
  if (design.layout.columns === 2) pairs.push(['Rail',design.colors.railInk,design.colors.rail]);
  for (const [label,ink,paper] of pairs) if (getContrastRatio(ink,paper)<4.5) warnings.push(`${label} text contrast is below 4.5:1. Choose a darker ink or lighter surface.`);
  if (design.layout.columns===2) warnings.push('Two-column layouts can be harder for recruiting systems to parse. An application PDF is also available.');
  if (resume && shouldUseStackedResumeHeader(design, text(resume.name), [resume.email, resume.phone, resume.location, resume.linkedin, resume.website, ...(resume.links || [])].map(text).filter(Boolean))) warnings.push('The split header switches to a full-width layout because the name or contact details need more room. The saved header setting stays unchanged.');
  if (design.sections.some(section=>section.typography?.bodySize && section.typography.bodySize<10)) warnings.push('A section override uses body text below 10 pt.');
  return warnings;
}

export function resumeDesignSignature(resume: unknown, templateId: string, colors: unknown, pageSize: string, design?: ResumeDesignConfig | null, mode='designed', composition: 'standard' | 'flagship-experiment' = 'standard'): string {
  return JSON.stringify({ resume,templateId,colors,pageSize,design:design || null,mode,composition,fontVersion:2 });
}

/** The application variant uses an explicit white-paper, readable-ink contract. */
export function getApplicationResumeDesign(design: ResumeDesignConfig): ResumeDesignConfig {
  const readable = (ink: string, fallback: string) => getContrastRatio(ink, '#ffffff') >= 4.5 ? ink : fallback;
  return { ...design,
    colors: { paper:'#ffffff', ink:readable(design.colors.ink,'#17212b'), heading:readable(design.colors.heading,'#18354d'), accent:readable(design.colors.accent,'#46535e'), rail:'#ffffff', railInk:readable(design.colors.ink,'#17212b') },
    layout:{ ...design.layout, columns:1,headerStyle:'left',headingStyle:'plain',showMotif:false },
  };
}
