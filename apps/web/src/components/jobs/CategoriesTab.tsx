import { useState } from 'react';
import { Info, Plus, Search } from 'lucide-react';

export const GROUPS: Array<[string, string[]]> = [
  ['Campus employment', ['Library assistant', 'Student ambassador', 'Campus receptionist', 'Research assistant', 'Teaching assistant', 'Laboratory assistant', 'Campus dining assistant', 'University bookstore assistant', 'IT help desk assistant', 'Student event assistant']],
  ['Hospitality and retail', ['Barista', 'Restaurant server', 'Cashier', 'Retail sales associate', 'Hotel front desk assistant', 'Kitchen assistant', 'Customer service representative', 'Event staff']],
  ['Technology', ['Software engineering intern', 'Web developer intern', 'Data analyst intern', 'IT support technician', 'Cybersecurity intern', 'UX/UI design intern']],
  ['Business and professional', ['Marketing intern', 'Finance intern', 'Accounting assistant', 'Administrative assistant', 'Human resources intern', 'Business analyst intern', 'Engineering intern']],
  ['Other opportunities', ['Tutor', 'Language assistant', 'Graphic designer', 'Social media assistant', 'Video editor', 'Warehouse assistant', 'Inventory assistant', 'Graduate trainee']],
];

function guessType(title: string) {
  if (title === 'Research assistant') return 'research_assistant';
  if (title === 'Teaching assistant') return 'teaching_assistant';
  if (/ intern$/i.test(title)) return 'internship';
  if (title === 'Graduate trainee') return 'post_graduation';
  return 'other';
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');

export function CategoriesTab({ onPick }: { onPick: (p: { title: string; jobType: string }) => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const groups = GROUPS.map(([g, items]) => [g, items.filter(i => !term || i.toLowerCase().includes(term) || g.toLowerCase().includes(term))] as const).filter(([, i]) => i.length);
  return <div className="sj-stack">
    <div className="sj-honest" data-testid="status-categories-note"><Info size={18} />
      <p><strong>These are search categories, not job listings.</strong> They are not guaranteed visa-eligible positions, and no listings are connected. Use them as search terms on official employer and university career sites, then add what you find to your tracker.</p></div>
    <label className="field sj-country"><span>Filter categories</span>
      <span className="sj-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. assistant, intern" data-testid="input-filter-categories" /></span></label>
    {groups.length ? groups.map(([g, items]) => <div key={g} className="sj-card" data-testid={`group-category-${slug(g)}`}>
      <h2 className="sj-h2">{g}</h2>
      <div className="sj-chips">{items.map(i => <button key={i} type="button" className="sj-chip sj-chip-btn" onClick={() => onPick({ title: i, jobType: guessType(i) })} aria-label={`Track a ${i} job`} data-testid={`chip-category-${slug(i)}`}><Plus size={11} /> {i}</button>)}</div>
    </div>) : <div className="state-card" data-testid="status-categories-empty"><h3>No categories match</h3><p>Try a shorter word.</p></div>}
    <p className="sj-muted">Selecting a category opens your tracker with the title filled in. You still enter the employer and posting details yourself.</p>
  </div>;
}
