import { useState } from 'react';
import { useGetUniversity, type University } from '@workspace/api-client-react';
import { monogram } from './format';
import './InstitutionLogo.css';

export function InstitutionLogo({ school, size = 'medium', showSource = false, className = '' }: {
  school: University; size?: 'small' | 'medium' | 'large'; showSource?: boolean; className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = school.logoUrl;
  const valid = school.logoVerificationStatus === 'verified' && url &&
    /^\/api\/institution-logos\/[a-f0-9]{64}\.webp$/.test(url) && failedUrl !== url;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return <figure className={`institution-logo institution-logo-${size} ${className}`} data-testid={`institution-logo-${school.id}`}>
    {valid
      ? <img src={base + url} alt={`${school.name} logo`} width={size === 'small' ? 40 : 160} height={size === 'small' ? 40 : 80}
          loading={size === 'large' ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer"
          onError={() => setFailedUrl(url)} data-logo-state="verified"/>
      : <span className="institution-logo-placeholder" role="img" aria-label={`${school.name} — verified logo unavailable`}
          title={`${school.name} — verified logo unavailable`} data-logo-state="placeholder">
          <strong>{monogram(school.name)}</strong>{size !== 'small' && <small>{school.name}</small>}
        </span>}
    {showSource && valid && school.logoSource && <figcaption>
      <a href={school.logoSource} target="_blank" rel="noopener noreferrer">Logo source</a>
      {school.logoLicenseUrl && <> · <a href={school.logoLicenseUrl} target="_blank" rel="noopener noreferrer">Reuse terms</a></>}
      {school.logoIdentitySource && <> · <a href={school.logoIdentitySource} target="_blank" rel="noopener noreferrer">Identity evidence</a></>}
      {school.logoLastCheckedAt && <span className="logo-use-note"><time dateTime={school.logoLastCheckedAt}>Logo checked {new Date(school.logoLastCheckedAt).toLocaleDateString()}</time></span>}
      <span className="logo-use-note">Institution identification only. No affiliation or endorsement is implied.</span>
    </figcaption>}
  </figure>;
}

// Existing application steps can carry stable institution IDs. Never match a task title by name.
export function LinkedInstitutionLogo({ id }: { id: string }) {
  const school = useGetUniversity(id);
  return school.data ? <InstitutionLogo school={school.data} size="small"/> : null;
}
