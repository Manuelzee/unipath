import { useState, type CSSProperties } from 'react';
import type { University } from '@workspace/api-client-react';
import { ExternalLink, ImageOff } from 'lucide-react';
import { formatDate } from './format';
import './InstitutionBranding.css';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const IMG = /^\/api\/institution-branding\/images\/[a-f0-9]{64}\.webp$/;
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

function lum(hex: string) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export type BrandColors = { primary: string; secondary: string; fg: string; ratio: number } | null;

export function verifiedColors(s: University): BrandColors {
  const p = s.primaryColorHex, sc = s.secondaryColorHex;
  if (s.colorsVerificationStatus !== 'verified' || !p || !sc || !HEX.test(p) || !HEX.test(sc)) return null;
  const L = lum(p); const w = contrast(L, 1); const b = contrast(L, 0);
  // Pick the foreground with highest contrast; only accept if it meets WCAG AA 4.5:1.
  const best = w >= b ? { fg: '#FFFFFF', ratio: w } : { fg: '#000000', ratio: b };
  return best.ratio >= 4.5 ? { primary: p.toUpperCase(), secondary: sc.toUpperCase(), ...best } : { primary: p.toUpperCase(), secondary: sc.toUpperCase(), fg: '', ratio: best.ratio };
}

function SourceLinks({ source, license, credit, testId }: { source?: string | null; license?: string | null; credit?: string | null; testId: string }) {
  return <p className="brand-credit" data-testid={testId}>
    {credit && <span>Credit: {credit}</span>}
    {source && <a href={source} target="_blank" rel="noopener noreferrer">Source <ExternalLink size={11}/></a>}
    {license && <a href={license} target="_blank" rel="noopener noreferrer">License <ExternalLink size={11}/></a>}
  </p>;
}

function BrandImage({ url, alt, kind, className, eager }: { url?: string | null; alt: string; kind: string; className: string; eager?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = !!url && failedUrl === url;
  if (!url || !IMG.test(url) || failed) return <div className={`${className} brand-img-missing`} role="img" aria-label={`${kind} not available`}>
    <ImageOff size={20}/><span>{failed ? `${kind} could not be loaded` : `${kind} not available or permission not verified`}</span></div>;
  return <img className={className} src={base + url} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(url ?? null)}/>;
}

export function CampusBanner({ school }: { school: University }) {
  const ok = school.campusImageVerificationStatus === 'verified';
  const colors = verifiedColors(school);
  const style = colors?.fg ? { '--campus-primary': colors.primary, '--campus-fg': colors.fg } as CSSProperties : undefined;
  return <figure className={`campus-banner${colors?.fg ? ' has-school-colors' : ''}`} style={style} data-testid="figure-campus-image">
    <BrandImage url={ok ? school.campusImageUrl : null} alt={`Campus of ${school.name}`} kind="Campus image" className="campus-img" eager/>
    <figcaption>
      {ok && school.campusImageUrl ? <>
        <SourceLinks source={school.campusImageSourceUrl} license={school.campusImageLicenseUrl} credit={school.campusImageCredit} testId="text-campus-credit"/>
        <span className="brand-fine">Resized and converted to WebP; preview may be cropped to fit.{school.campusImageLastVerifiedAt && ` Rights checked ${formatDate(school.campusImageLastVerifiedAt)}.`}</span>
      </> : <span className="brand-fine">No campus photo with verified reuse permission is on file. We do not substitute stock imagery.</span>}
    </figcaption>
  </figure>;
}

export function BrandingPanel({ school, colors }: { school: University; colors: BrandColors }) {
  const mascotOk = school.mascotVerificationStatus === 'verified' && !!school.mascotName;
  const mImgOk = mascotOk && school.mascotImageVerificationStatus === 'verified';
  return <section className="detail-panel branding-panel" data-testid="panel-branding">
    <span className="eyebrow">SCHOOL BRANDING</span>
    <div className="brand-block">
      <h3>School colors</h3>
      {colors ? <>
        <div className="swatches">
          {[['Primary', colors.primary], ['Secondary', colors.secondary]].map(([l, h]) => <div className="swatch" key={l}>
            <span className="swatch-chip" style={{ background: h }} aria-hidden/>
            <span><strong>{l}</strong><code data-testid={`text-color-${l.toLowerCase()}`}>{h}</code></span>
          </div>)}
        </div>
        {school.colorsUsageNote && <p className="brand-note" data-testid="text-colors-usage">{school.colorsUsageNote}</p>}
        <SourceLinks source={school.colorsSourceUrl} testId="text-colors-source"/>
        {school.colorsLastVerifiedAt && <span className="brand-fine">Verified {formatDate(school.colorsLastVerifiedAt)}. Shown exactly as published, used sparingly here.</span>}
      </> : <p className="brand-note">Verified school colors are not available. UniPath default colors are shown.</p>}
    </div>
    <div className="brand-block">
      <h3>Mascot</h3>
      {mascotOk ? <>
        <p className="mascot-name" data-testid="text-mascot-name">{school.mascotName}</p>
        <SourceLinks source={school.mascotSourceUrl} testId="text-mascot-source"/>
        {school.mascotLastVerifiedAt && <span className="brand-fine">Name verified {formatDate(school.mascotLastVerifiedAt)}. A verified name does not grant image rights.</span>}
      </> : <p className="brand-note" data-testid="text-mascot-name">Mascot information unavailable</p>}
      <figure className="mascot-figure">
        <BrandImage url={mImgOk ? school.mascotImageUrl : null} alt={mascotOk ? `${school.mascotName}, mascot of ${school.name}` : `Mascot of ${school.name}`} kind="Mascot image" className="mascot-img"/>
        {mImgOk && school.mascotImageUrl && <figcaption>
          <SourceLinks source={school.mascotImageSourceUrl} license={school.mascotImageLicenseUrl} credit={school.mascotImageCredit} testId="text-mascot-credit"/>
          <span className="brand-fine">Resized and converted to WebP for display.</span>
        </figcaption>}
      </figure>
    </div>
    <p className="brand-fine brand-foot">Branding review: {school.brandingVerificationStatus === 'verified' ? 'verified' : 'incomplete'}{school.brandingLastVerifiedAt && ` · ${formatDate(school.brandingLastVerifiedAt)}`}. Logos, colors and mascots identify the institution only; no affiliation or endorsement is implied.</p>
  </section>;
}
