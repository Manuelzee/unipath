import type { ReactNode } from 'react';
import type { UniversityFilterOptions } from '@workspace/api-client-react';
import { ChevronDown, Search } from 'lucide-react';
import { regionLabel, regionName } from './format';

export type DiscoverFilterState = { search: string; countryCode: string; state: string; city: string; institutionType: string; ownership: string; degreeLevel: string; major: string; language: string; applicantStatus: '' | 'Domestic' | 'International'; fundingOnly: boolean };
export const EMPTY_FILTERS: DiscoverFilterState = { search: '', countryCode: '', state: '', city: '', institutionType: '', ownership: '', degreeLevel: '', major: '', language: '', applicantStatus: '', fundingOnly: false };

function Select({ label, value, onChange, testId, disabled, children }: { label: string; value: string; onChange: (v: string) => void; testId: string; disabled?: boolean; children: ReactNode }) {
  return <label><span>{label}</span><select value={value} disabled={disabled} onChange={e => onChange(e.target.value)} data-testid={testId}>{children}</select><ChevronDown size={15}/></label>;
}

export function DiscoverFilters({ filters, options, onChange }: { filters: DiscoverFilterState; options?: UniversityFilterOptions; onChange: (patch: Partial<DiscoverFilterState>) => void }) {
  const regions = (options?.regions || []).filter(r => r.countryCode === filters.countryCode);
  const statuses = (options?.applicantStatuses || []).filter((s): s is 'Domestic' | 'International' => s === 'Domestic' || s === 'International');
  return <div className="search-panel">
    <label className="search-main"><Search size={18}/><input value={filters.search} onChange={e => onChange({ search: e.target.value })} placeholder="Search by institution name" aria-label="Search institutions" data-testid="input-university-search"/></label>
    <div className="filter-grid college-filter-grid">
      <Select label="COUNTRY" value={filters.countryCode} onChange={v => onChange({ countryCode: v, state: '', city: '' })} testId="select-country"><option value="">All imported countries</option>{options?.countries.map(c => <option key={c.code} value={c.code}>{c.name} ({c.count.toLocaleString()})</option>)}</Select>
      <Select label={regionLabel(filters.countryCode)} value={filters.state} disabled={!filters.countryCode || filters.countryCode === 'CA' || !regions.length} onChange={v => onChange({ state: v })} testId="select-region"><option value="">{!filters.countryCode ? 'Choose a country first' : filters.countryCode === 'CA' ? 'Not in Canada pilot source' : regions.length ? 'All regions' : 'No regions reported'}</option>{regions.map(r => <option key={r.code} value={r.code}>{regionName(r.countryCode, r.code)}</option>)}</Select>
      <label><span>CITY</span><input className="filter-input" value={filters.city} onChange={e => onChange({ city: e.target.value })} placeholder="Any reported city" data-testid="input-city"/></label>
      <Select label="INSTITUTION TYPE" value={filters.institutionType} onChange={v => onChange({ institutionType: v })} testId="select-institution-type"><option value="">All institution types</option>{options?.institutionTypes.map(t => <option key={t} value={t}>{t}</option>)}</Select>
      <Select label="PUBLIC OR PRIVATE" value={filters.ownership} onChange={v => onChange({ ownership: v })} testId="select-ownership"><option value="">Any reported status</option>{options?.ownerships.map(t => <option key={t} value={t}>{t}</option>)}</Select>
      <Select label="DEGREE LEVEL" value={filters.degreeLevel} onChange={v => onChange({ degreeLevel: v })} testId="select-degree-level"><option value="">All degree levels</option>{options?.degreeLevels.map(t => <option key={t} value={t}>{t}</option>)}</Select>
      <Select label="INTENDED FIELD OF STUDY" value={filters.major} disabled={!options?.majors.length} onChange={v => onChange({ major: v })} testId="select-major"><option value="">{options?.majors.length ? 'All reported fields' : 'No field data imported yet'}</option>{options?.majors.map(t => <option key={t} value={t}>{t}</option>)}</Select>
      <Select label="INSTRUCTION LANGUAGE" value={filters.language} disabled={!options?.languages.length} onChange={v => onChange({ language: v })} testId="select-language"><option value="">{options?.languages.length ? 'Any language' : 'Not reported by sources'}</option>{options?.languages.map(t => <option key={t} value={t}>{t}</option>)}</Select>
      <Select label="APPLICANT STATUS" value={filters.applicantStatus} disabled={!statuses.length} onChange={v => onChange({ applicantStatus: v as DiscoverFilterState['applicantStatus'] })} testId="select-applicant-status"><option value="">{statuses.length ? 'Any applicant status' : 'Not reported by sources'}</option>{statuses.map(t => <option key={t} value={t}>{t} applicants</option>)}</Select>
    </div>
    <label className="funding-toggle"><input type="checkbox" checked={filters.fundingOnly} onChange={e => onChange({ fundingOnly: e.target.checked })} data-testid="checkbox-funding-only"/><span><strong>Only show institutions with listed funding or scholarships</strong><small>Source-reported funding records, or a scholarship of the university's own in UniPath's list. Other schools are excluded, not judged: missing data means unknown. National scholarships are on the Scholarships page.</small></span></label>
    <p className="filter-footnote">Language and applicant filters match source-reported values only. Most sources, including the Canada pilot, do not report these, so coverage is incomplete and schools with unknown values are left out when these filters are set. Leaving them off shows everything.</p>
    {filters.countryCode === 'CA' && <p className="filter-footnote">The Canada pilot source does not supply city, province, school type or ownership. Filtering these fields can exclude records with unknown information; it does not establish that a school lacks those characteristics.</p>}
  </div>;
}
