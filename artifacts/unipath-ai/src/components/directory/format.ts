import type { University } from '@workspace/api-client-react';

const US_REGIONS: Record<string, string> = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',AS:'American Samoa',GU:'Guam',MP:'Northern Mariana Islands',PR:'Puerto Rico',VI:'U.S. Virgin Islands',FM:'Federated States of Micronesia',MH:'Marshall Islands',PW:'Palau' };
const CA_REGIONS: Record<string, string> = { AB:'Alberta',BC:'British Columbia',MB:'Manitoba',NB:'New Brunswick',NL:'Newfoundland and Labrador',NS:'Nova Scotia',NT:'Northwest Territories',NU:'Nunavut',ON:'Ontario',PE:'Prince Edward Island',QC:'Quebec',SK:'Saskatchewan',YT:'Yukon' };

export function regionName(countryCode: string, code: string) {
  if (!code) return '';
  const map = countryCode === 'US' ? US_REGIONS : countryCode === 'CA' ? CA_REGIONS : undefined;
  return map?.[code] || code;
}
export function regionLabel(countryCode: string) {
  if (countryCode === 'US') return 'STATE OR TERRITORY';
  if (countryCode === 'CA') return 'PROVINCE OR TERRITORY';
  return 'REGION';
}
export function schoolLocation(school: University) {
  const parts = [school.city, regionName(school.countryCode, school.state), school.country].filter(Boolean);
  return school.city ? parts.join(', ') : `City not reported · ${[regionName(school.countryCode, school.state), school.country].filter(Boolean).join(', ')}`;
}
export function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}
export function formatRate(rate: number | null, year: number | null) {
  if (rate == null) return 'Not reported';
  return `${(rate * 100).toFixed(1)}%${year ? ` · ${year}` : ''}`;
}
export function monogram(name: string) { return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join(''); }
export function sourceShort(school: University) {
  const s = school.dataSource;
  if (s.includes('IPEDS') && s.includes('Scorecard')) return 'IPEDS + Scorecard';
  if (s.includes('IPEDS')) return 'NCES IPEDS';
  if (s.includes('Scorecard')) return 'College Scorecard';
  return s.length > 26 ? `${s.slice(0, 24)}...` : s;
}
export const cn = (...v: Array<string | false | undefined | null>) => v.filter(Boolean).join(' ');
