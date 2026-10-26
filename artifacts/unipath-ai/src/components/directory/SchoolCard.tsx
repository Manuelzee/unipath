import type { University } from '@workspace/api-client-react';
import { ArrowRight, Bookmark, Check, Globe2, LoaderCircle } from 'lucide-react';
import { Link } from 'wouter';
import { cn, formatDate, regionName, schoolLocation, sourceShort } from './format';
import { InstitutionLogo } from './InstitutionLogo';

export function SourceBadge({ school }: { school: University }) {
  return <span className="sample-badge official-badge" data-testid={`badge-source-${school.id}`}><span/>{sourceShort(school)} · {formatDate(school.lastUpdatedAt)}</span>;
}

export function SchoolCard({ school, saved, saving, onSave }: { school: University; saved: boolean; saving: boolean; onSave: () => void }) {
  return <article className="school-card" data-testid={`card-university-${school.id}`}>
    <div className={`school-cover cover-${school.id.length % 4}`}><span className="cover-monogram"><InstitutionLogo school={school}/></span><span className="cover-country"><Globe2 size={13}/>{school.countryCode}{school.state ? ` · ${regionName(school.countryCode, school.state)}` : ''}</span><SourceBadge school={school}/></div>
    <div className="school-content">
      <div className="school-location">{schoolLocation(school)}</div>
      <h3>{school.name}</h3>
      <p className="school-meta">{school.institutionType || 'Institution type not reported'} · {school.ownership || 'Ownership not reported'}</p>
      <div className="school-tags">
        {school.degreeLevels.map(level => <span key={level}>{level}</span>)}
        {school.languages.length ? school.languages.map(l => <span key={l} className="tag-lang">{l}</span>) : <span className="tag-unknown">Language unknown</span>}
        {school.countryCode === 'CA' ? <span className="tag-scope">Source-listed · not verified</span> : school.sourceScope && <span className="tag-scope">{school.sourceScope}</span>}
      </div>
      <div className="school-bottom"><span className="program-availability">{school.majors.length ? `${school.majors.length} source-reported fields` : 'Fields of study not in imported source'}</span><Link href={`/university/${school.id}`} className="school-view" data-testid={`link-university-${school.id}`}>Details <ArrowRight size={15}/></Link></div>
      <button className={cn('save-chip', saved && 'save-chip-active')} onClick={onSave} disabled={saving} data-testid={`button-save-${school.id}`} aria-label={saved ? 'Remove saved university' : 'Save university'}>{saving ? <LoaderCircle className="spin" size={15}/> : saved ? <><Check size={14}/> Saved</> : <><Bookmark size={14}/> Save</>}</button>
    </div>
  </article>;
}
