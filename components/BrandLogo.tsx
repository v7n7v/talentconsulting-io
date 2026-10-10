import type { CSSProperties } from 'react';
import Image from 'next/image';

export const TALENT_CONSULTING_WORDMARK = '/brand/talentconsulting-logo-white.png';
export const TALENT_CONSULTING_WORDMARK_TRANSPARENT = '/brand/talentconsulting-logo.png';
export const TALENT_CONSULTING_WORDMARK_DARK_SURFACE = '/brand/talentconsulting-logo-dark-surface.png';
export const TALENT_CONSULTING_MARK = '/brand/talentconsulting-mark-512.png';
export const TACO_MARK = '/taco-icon-512.png';
export const TACO_SYMBOL = '/brand/taco/taco-symbol.svg';
export const TALENT_CONSULTING_BRAND_NAME = 'TalentConsulting.io';

interface TacoWordmarkProps {
  className?: string;
  light?: boolean;
  priority?: boolean;
  sizes?: string;
}

/** The original blue A stays identical; only the surrounding letters adapt. */
export function TacoWordmark({ className = '', light = false, priority = false, sizes = '150px' }: TacoWordmarkProps) {
  return (
    <span className={`taco-wordmark ${light ? 'taco-wordmark--light' : ''} ${className}`} role="img" aria-label="Taco">
      <Image className="taco-wordmark__ink" src="/brand/taco/taco-folded-ink.svg" alt="" aria-hidden="true" width={1188} height={288} sizes={sizes} priority={priority} />
      <Image className="taco-wordmark__light" src="/brand/taco/taco-folded-light.svg" alt="" aria-hidden="true" width={1188} height={288} sizes={sizes} priority={priority} />
    </span>
  );
}

/** A single blue gradient symbol for standalone and inline brand placements. */
export function TacoBrandSymbol({ className = '', decorative = false }: { className?: string; decorative?: boolean }) {
  return <Image className={className} src={TACO_SYMBOL} alt={decorative ? '' : 'Taco'} aria-hidden={decorative || undefined} width={374} height={288} sizes="36px" />;
}

/** Keep the symbol and name together without repeating the accessible name. */
export function TacoName({ name = 'Taco', showSymbol = true }: { name?: 'Taco' | 'TACO'; showSymbol?: boolean }) {
  return <span className="taco-name">{showSymbol && <TacoBrandSymbol className="taco-name__symbol" decorative />}<span>{name}</span></span>;
}

/** Brand only application-owned copy; callers retain their original strings. */
export function TacoText({ text }: { text: string }) {
  return <>{text.split(/(\bTaco\b|\bTACO\b)/g).map((part, index) => part === 'Taco' || part === 'TACO' ? <TacoName key={index} name={part} /> : part)}</>;
}

interface BrandLogoProps {
  className?: string;
  imgClassName?: string;
  alt?: string;
  style?: CSSProperties;
  transparent?: boolean;
  darkSurface?: boolean;
}

export function TalentConsultingWordmark({
  className = '',
  imgClassName = '',
  alt = TALENT_CONSULTING_BRAND_NAME,
  style,
  transparent = false,
  darkSurface = false,
}: BrandLogoProps) {
  return (
    <span className={`inline-flex min-w-0 items-center ${className}`} style={style}>
      <img
        src={darkSurface ? TALENT_CONSULTING_WORDMARK_DARK_SURFACE : transparent ? TALENT_CONSULTING_WORDMARK_TRANSPARENT : TALENT_CONSULTING_WORDMARK}
        alt={alt}
        width={1196}
        height={148}
        decoding="async"
        className={`block h-auto w-full max-w-full object-contain ${imgClassName}`}
      />
    </span>
  );
}

export function TalentConsultingMark({
  className = '',
  imgClassName = '',
  alt = TALENT_CONSULTING_BRAND_NAME,
  style,
}: BrandLogoProps) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`} style={style}>
      <img
        src={TALENT_CONSULTING_MARK}
        alt={alt}
        width={512}
        height={512}
        decoding="async"
        className={`block h-full w-full object-cover ${imgClassName}`}
      />
    </span>
  );
}

export function TacoMark({
  className = '',
  imgClassName = '',
  alt = 'Taco AI assistant',
  style,
}: BrandLogoProps) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`} style={style}>
      <img
        src={TACO_MARK}
        alt={alt}
        width={512}
        height={512}
        decoding="async"
        className={`block h-full w-full object-contain ${imgClassName}`}
      />
    </span>
  );
}
