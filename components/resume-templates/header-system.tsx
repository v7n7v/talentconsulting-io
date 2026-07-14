import { cleanResumeText, type CanonicalResume } from '@/lib/resume-normalizer';

type TemplateColors = { primary: string; accent: string; text: string };

type HeaderDensity = 'hero' | 'standard' | 'compact';
type HeaderLayout =
  | 'authority'
  | 'band'
  | 'centered'
  | 'compact'
  | 'technical'
  | 'traditional'
  | 'creative'
  | 'badge'
  | 'product'
  | 'editorial'
  | 'systems';

interface HeaderPreset {
  layout: HeaderLayout;
  density: HeaderDensity;
  eyebrow?: string;
  contactSeparator?: string;
  sectionStyle?: 'default' | 'border' | 'uppercase' | 'center' | 'tracked' | 'mono';
}

export function getHeaderPreset(templateId: string): HeaderPreset {
  const presets: Record<string, HeaderPreset> = {
    executive: { layout: 'authority', density: 'hero', eyebrow: 'Executive Resume', contactSeparator: '•', sectionStyle: 'border' },
    compact: { layout: 'compact', density: 'compact', eyebrow: 'Compact Resume', contactSeparator: '', sectionStyle: 'border' },
    boardroom: { layout: 'authority', density: 'hero', eyebrow: 'Board Brief', contactSeparator: '•', sectionStyle: 'tracked' },
    'finance-ledger': { layout: 'compact', density: 'standard', eyebrow: 'Finance Ledger', contactSeparator: '•', sectionStyle: 'border' },
    modern: { layout: 'band', density: 'standard', eyebrow: 'Modern Profile', contactSeparator: '•', sectionStyle: 'default' },
    infographic: { layout: 'band', density: 'standard', eyebrow: 'Metro Profile', contactSeparator: '•', sectionStyle: 'border' },
    startup: { layout: 'editorial', density: 'hero', eyebrow: 'Builder Profile', contactSeparator: '/', sectionStyle: 'border' },
    venture: { layout: 'editorial', density: 'hero', eyebrow: 'Venture-Ready Resume', contactSeparator: '/', sectionStyle: 'border' },
    minimal: { layout: 'centered', density: 'standard', contactSeparator: '•', sectionStyle: 'uppercase' },
    nordic: { layout: 'centered', density: 'standard', eyebrow: 'Nordic Profile', contactSeparator: '', sectionStyle: 'tracked' },
    elegant: { layout: 'centered', density: 'standard', eyebrow: 'Professional Profile', contactSeparator: '•', sectionStyle: 'center' },
    technical: { layout: 'technical', density: 'compact', eyebrow: 'system.profile', contactSeparator: '|', sectionStyle: 'mono' },
    'data-signal': { layout: 'technical', density: 'compact', eyebrow: 'signal.profile', contactSeparator: '/', sectionStyle: 'mono' },
    operator: { layout: 'systems', density: 'compact', eyebrow: 'Operating System', contactSeparator: '•', sectionStyle: 'border' },
    harvard: { layout: 'traditional', density: 'standard', contactSeparator: '|', sectionStyle: 'border' },
    academic: { layout: 'traditional', density: 'standard', eyebrow: 'Academic Profile', contactSeparator: '|', sectionStyle: 'border' },
    'ats-optimized': { layout: 'traditional', density: 'compact', eyebrow: 'ATS Resume', contactSeparator: '•', sectionStyle: 'border' },
    federal: { layout: 'traditional', density: 'compact', eyebrow: 'Federal Resume', contactSeparator: '•', sectionStyle: 'border' },
    creative: { layout: 'creative', density: 'standard', eyebrow: 'Creative Profile', contactSeparator: '•', sectionStyle: 'default' },
    cascade: { layout: 'badge', density: 'compact', eyebrow: 'Career Flow', contactSeparator: '•', sectionStyle: 'border' },
    'product-brief': { layout: 'product', density: 'standard', eyebrow: 'Product Narrative', contactSeparator: '•', sectionStyle: 'border' },
    'double-column': { layout: 'product', density: 'compact', eyebrow: 'Competency Brief', contactSeparator: '•', sectionStyle: 'border' },
    deloitte: { layout: 'authority', density: 'standard', eyebrow: 'Consultant Profile', contactSeparator: '•', sectionStyle: 'border' },
    faang: { layout: 'systems', density: 'compact', eyebrow: 'Big Tech Profile', contactSeparator: '•', sectionStyle: 'border' },
    storyline: { layout: 'editorial', density: 'standard', eyebrow: 'Career Story', contactSeparator: '•', sectionStyle: 'tracked' },
  };

  return presets[templateId] || presets.executive;
}

export function getHeaderScale(name = '', title = '', density: HeaderDensity = 'standard') {
  const normalizedName = cleanResumeText(name);
  const normalizedTitle = cleanResumeText(title);
  const longestNameToken = normalizedName.split(/\s+/).reduce((max, token) => Math.max(max, token.length), 0);
  const pressure = normalizedName.length + normalizedTitle.length * 0.35 + Math.max(0, longestNameToken - 12) * 1.4;

  if (density === 'hero') {
    if (pressure > 42) return { nameClassName: 'text-[1.95rem]', titleClassName: 'text-[1.05rem]', trackingClassName: 'tracking-normal' };
    if (pressure > 32) return { nameClassName: 'text-3xl', titleClassName: 'text-lg', trackingClassName: 'tracking-normal' };
    return { nameClassName: 'text-4xl', titleClassName: 'text-xl', trackingClassName: 'tracking-tight' };
  }

  if (density === 'compact') {
    if (pressure > 38) return { nameClassName: 'text-[1.45rem]', titleClassName: 'text-sm', trackingClassName: 'tracking-normal' };
    return { nameClassName: 'text-2xl', titleClassName: 'text-sm', trackingClassName: 'tracking-normal' };
  }

  if (pressure > 40) return { nameClassName: 'text-[1.65rem]', titleClassName: 'text-sm', trackingClassName: 'tracking-normal' };
  if (pressure > 30) return { nameClassName: 'text-2xl', titleClassName: 'text-base', trackingClassName: 'tracking-normal' };
  return { nameClassName: 'text-3xl', titleClassName: 'text-lg', trackingClassName: 'tracking-tight' };
}

export function ResumeContactRow({
  resume,
  separator = '•',
  className = '',
  tone = 'default',
}: {
  resume: CanonicalResume;
  separator?: string;
  className?: string;
  tone?: 'default' | 'inverse' | 'muted';
}) {
  const items = [resume.email, resume.phone, resume.location, resume.linkedin, resume.website]
    .map(item => cleanResumeText(item))
    .filter(Boolean);

  if (!items.length) return null;

  const toneClass = tone === 'inverse' ? 'text-white/75' : tone === 'muted' ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${toneClass} ${className}`}>
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="inline-flex min-w-0 items-center gap-3">
          {index > 0 && separator && <span className="shrink-0 opacity-55">{separator}</span>}
          <span className="min-w-0 break-words">{item}</span>
        </span>
      ))}
    </div>
  );
}

export function ResumeSectionTitle({
  children,
  colors,
  style = 'default',
}: {
  children: React.ReactNode;
  colors: TemplateColors;
  style?: HeaderPreset['sectionStyle'];
}) {
  const base = 'mb-3';
  if (style === 'border') return <h2 className={`${base} text-sm font-bold uppercase tracking-wider border-b pb-1`} style={{ color: colors.primary, borderColor: `${colors.primary}40` }}>{children}</h2>;
  if (style === 'uppercase') return <h2 className={`${base} text-sm uppercase tracking-widest text-gray-400`}>{children}</h2>;
  if (style === 'center') return (
    <div className={`${base} flex items-center gap-4`}>
      <div className="h-px flex-1" style={{ backgroundColor: `${colors.accent}40` }} />
      <h2 className="text-xs uppercase tracking-[0.24em] font-semibold" style={{ color: colors.primary }}>{children}</h2>
      <div className="h-px flex-1" style={{ backgroundColor: `${colors.accent}40` }} />
    </div>
  );
  if (style === 'tracked') return <h2 className={`${base} text-[11px] uppercase tracking-[0.22em] font-medium`} style={{ color: colors.accent }}>{children}</h2>;
  if (style === 'mono') return <h2 className={`${base} font-bold uppercase tracking-wider font-mono`} style={{ color: colors.primary }}>// {children}</h2>;
  return <h2 className={`${base} text-lg font-bold uppercase tracking-wider`} style={{ color: colors.primary }}>{children}</h2>;
}

function initialsFor(name: string) {
  return cleanResumeText(name)
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function HeaderText({
  resume,
  colors,
  preset,
  inverse = false,
  uppercaseName = false,
  centered = false,
}: {
  resume: CanonicalResume;
  colors: TemplateColors;
  preset: HeaderPreset;
  inverse?: boolean;
  uppercaseName?: boolean;
  centered?: boolean;
}) {
  const name = cleanResumeText(resume.name) || 'Your Name';
  const title = cleanResumeText(resume.title);
  const scale = getHeaderScale(name, title, preset.density);
  const textColor = inverse ? '#f8fafc' : colors.primary;
  const titleColor = inverse ? 'rgba(248,250,252,0.82)' : colors.accent;

  return (
    <div className={`min-w-0 ${centered ? 'text-center' : ''}`}>
      {preset.eyebrow && (
        <p className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] ${inverse ? 'text-white/65' : 'text-gray-500'}`}>
          {preset.eyebrow}
        </p>
      )}
      <h1
        className={`${scale.nameClassName} ${scale.trackingClassName} font-bold leading-[1.08] break-words`}
        style={{ color: textColor }}
      >
        {uppercaseName ? name.toUpperCase() : name}
      </h1>
      {title && (
        <p
          className={`${scale.titleClassName} mt-2 font-medium leading-snug break-words`}
          style={{ color: titleColor }}
        >
          {uppercaseName ? title.toUpperCase() : title}
        </p>
      )}
    </div>
  );
}

export function ResumeHeader({
  resume,
  colors,
  templateId,
  className = '',
}: {
  resume: CanonicalResume;
  colors: TemplateColors;
  templateId: string;
  className?: string;
}) {
  const preset = getHeaderPreset(templateId);
  const separator = preset.contactSeparator;
  const initials = initialsFor(resume.name);

  if (preset.layout === 'band') {
    return (
      <div className={`mb-6 p-7 ${className}`} style={{ backgroundColor: colors.primary }}>
        <HeaderText resume={resume} colors={colors} preset={preset} inverse />
        <ResumeContactRow resume={resume} separator={separator} tone="inverse" className="mt-3 text-xs" />
      </div>
    );
  }

  if (preset.layout === 'centered') {
    return (
      <div className={`mb-8 text-center ${className}`}>
        <HeaderText resume={resume} colors={colors} preset={preset} centered uppercaseName={templateId === 'elegant'} />
        <ResumeContactRow resume={resume} separator={separator} className="mt-4 justify-center text-xs" />
        <div className="mx-auto mt-5 h-px max-w-[84%]" style={{ backgroundColor: `${colors.accent}40` }} />
      </div>
    );
  }

  if (preset.layout === 'compact') {
    return (
      <div className={`mb-6 grid grid-cols-[minmax(0,1fr)_minmax(130px,190px)] gap-5 border-b-2 pb-4 ${className}`} style={{ borderColor: colors.primary }}>
        <HeaderText resume={resume} colors={colors} preset={preset} />
        <ResumeContactRow resume={resume} separator="" className="justify-end text-right text-xs" />
      </div>
    );
  }

  if (preset.layout === 'technical') {
    return (
      <div className={`mb-6 border p-5 font-mono ${className}`} style={{ borderColor: `${colors.primary}35` }}>
        <HeaderText resume={resume} colors={colors} preset={preset} />
        <ResumeContactRow resume={resume} separator={separator} className="mt-3 text-xs font-sans" />
      </div>
    );
  }

  if (preset.layout === 'traditional') {
    return (
      <div className={`mb-6 border-b-2 pb-5 text-center ${className}`} style={{ borderColor: colors.primary }}>
        <HeaderText resume={resume} colors={colors} preset={preset} centered />
        <ResumeContactRow resume={resume} separator={separator} className="mt-3 justify-center text-xs" />
      </div>
    );
  }

  if (preset.layout === 'creative') {
    return (
      <div className={`mb-8 flex items-start gap-5 ${className}`}>
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white" style={{ backgroundColor: colors.primary }}>
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <HeaderText resume={resume} colors={colors} preset={preset} />
          <ResumeContactRow resume={resume} separator={separator} className="mt-2 text-xs" />
        </div>
      </div>
    );
  }

  if (preset.layout === 'badge') {
    return (
      <div className={`mb-8 ${className}`}>
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white" style={{ backgroundColor: colors.primary }}>
          {initials}
        </div>
        <HeaderText resume={resume} colors={colors} preset={preset} />
        <ResumeContactRow resume={resume} separator={separator} className="mt-3 text-xs" />
      </div>
    );
  }

  if (preset.layout === 'product') {
    return (
      <div className={`mb-7 border bg-gray-50 p-5 ${className}`} style={{ borderColor: `${colors.primary}24` }}>
        <HeaderText resume={resume} colors={colors} preset={preset} />
        <ResumeContactRow resume={resume} separator={separator} className="mt-3 text-xs" />
      </div>
    );
  }

  if (preset.layout === 'editorial') {
    return (
      <div className={`mb-7 ${className}`}>
        <HeaderText resume={resume} colors={colors} preset={preset} />
        <ResumeContactRow resume={resume} separator={separator} className="mt-3 text-xs" />
        <div className="mt-4 h-1 w-20 rounded-full" style={{ backgroundColor: colors.accent }} />
      </div>
    );
  }

  if (preset.layout === 'systems') {
    return (
      <div className={`mb-6 grid grid-cols-[minmax(0,1fr)_minmax(140px,210px)] gap-5 border-b-2 pb-5 ${className}`} style={{ borderColor: colors.primary }}>
        <HeaderText resume={resume} colors={colors} preset={preset} />
        <ResumeContactRow resume={resume} separator="" className="justify-end text-right text-xs" />
      </div>
    );
  }

  return (
    <div className={`mb-6 border-b-4 pb-6 ${className}`} style={{ borderColor: colors.primary }}>
      <HeaderText resume={resume} colors={colors} preset={preset} />
      <ResumeContactRow resume={resume} separator={separator} className="mt-3 text-xs" />
    </div>
  );
}
