import { Link } from 'wouter';
import type { Scholarship } from '@workspace/api-client-react';
import { Building2, ExternalLink, Globe2, Landmark, ShieldCheck, Users } from 'lucide-react';
import './scholarships.css';

export const LEVEL_LABEL: Record<string, string> = {
  bachelor: "Bachelor's", master: "Master's", doctoral: 'PhD', research: 'Research', non_degree: 'Non-degree',
};
export const SPONSOR_LABEL: Record<string, string> = {
  government: 'Government', university: 'University', foundation: 'Foundation', intergovernmental: 'International organization',
};
const FUNDING_LABEL: Record<string, string> = {
  full: 'Fully funded, as the sponsor describes it', partial: 'Partial funding', varies: 'Funding varies by award',
};
const SPONSOR_ICON = { government: Landmark, university: Building2, foundation: Users, intergovernmental: Globe2 } as const;

function checked(value: string | null) {
  if (!value) return 'This site blocks automated checks; open it to confirm.';
  const date = new Date(`${value}T00:00:00Z`);
  return `Official page checked ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

export function ScholarshipCard({ program, scope }: { program: Scholarship; scope?: 'institution' | 'country' }) {
  const Icon = SPONSOR_ICON[program.sponsorType] ?? Landmark;
  const where = program.studyCountryNames.length > 3
    ? program.studyRegion ?? `${program.studyCountryNames.length} countries`
    : program.studyCountryNames.join(', ') || program.studyRegion || 'Several countries';
  return <article className="sch-card" data-testid={`card-scholarship-${program.id}`}>
    <div className="sch-top">
      <span className="sch-icon" aria-hidden="true"><Icon size={17}/></span>
      <div className="sch-titles">
        <span className="sch-kicker">{SPONSOR_LABEL[program.sponsorType]} · Study in {where}</span>
        <h3>{program.name}</h3>
        <p className="sch-sponsor">{program.sponsor}</p>
      </div>
      {scope && <span className={`sch-scope sch-scope-${scope}`}>{scope === 'institution' ? 'For this university' : 'For this country'}</span>}
    </div>
    <p className="sch-summary">{program.summary}</p>
    <div className="sch-tags">
      {program.levels.map(level => <span key={level}>{LEVEL_LABEL[level] ?? level}</span>)}
      <span className={`sch-funding sch-funding-${program.funding}`}>{FUNDING_LABEL[program.funding]}</span>
    </div>
    <p className="sch-eligibility"><strong>Who can apply:</strong> {program.eligibility}</p>
    {program.institutions.length > 0 && <p className="sch-schools">At {program.institutions.map((school, i) => <span key={school.id}>{i ? ', ' : ''}<Link href={`/university/${encodeURIComponent(school.id)}`}>{school.name}</Link></span>)}</p>}
    <div className="sch-foot">
      <a className="funding-official-link" href={program.officialUrl} target="_blank" rel="noreferrer" data-testid={`link-scholarship-${program.id}`}>Official page <ExternalLink size={13}/></a>
      <span><ShieldCheck size={12}/> {checked(program.linkCheckedAt)}</span>
    </div>
  </article>;
}
