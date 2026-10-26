import { ExternalLink } from 'lucide-react';

export function ExternalRef({ href, children, note, testId }: { href: string; children: string; note?: string; testId?: string }) {
  return <a className="ref-link" href={href} target="_blank" rel="noreferrer" data-testid={testId}><span><strong>{children}</strong>{note && <small>{note}</small>}</span><ExternalLink size={14}/></a>;
}

export const CANADA_REFERENCES = {
  scholarships: { href: 'https://www.educanada.ca/scholarships-bourses/index.aspx?lang=eng', label: 'EduCanada scholarships search', note: 'Government of Canada scholarship listings for international students' },
  studyPermit: { href: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html', label: 'Study permit: who can apply', note: 'Immigration, Refugees and Citizenship Canada' },
  dli: { href: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/designated-learning-institutions-list.html', label: 'Designated learning institutions list', note: 'Official IRCC lookup. Search it yourself; this directory does not confirm DLI status' },
  cicic: { href: 'https://www.cicic.ca/', label: 'CICIC directory of educational institutions', note: 'External reference for recognized institutions in Canada' },
  educanada: { href: 'https://www.educanada.ca/', label: 'EduCanada', note: 'Official guide to studying in Canada' },
};
