import { Link } from 'wouter';
import { useUser } from '@/lib/auth';
import { ArrowRight, Check, Clock3, Sparkles } from 'lucide-react';
import { PACKAGES, PLANS, SUPPORT } from './catalog';
import './plans.css';

/** Everything that works today, all free while UniPath is in beta. */
const INCLUDED: Array<[string, string]> = [
  ['Search 30,000+ universities', 'In 160+ countries, by country, region and city, with the source of every detail.'],
  ['Scholarships and sponsorships', '40 government, university and foundation programmes, each linked to its official page.'],
  ['Matches from your profile', 'Explainable matches that show what fits and what still needs checking.'],
  ['Shortlist and comparison', 'Save schools and compare up to four side by side.'],
  ['Application tracker', 'Statuses, your deadlines, tasks and reminders before the dates you set.'],
  ['Private documents', 'Keep transcripts and certificates in one place that only you can download.'],
  ['AI assistant and essay feedback', 'Answers grounded in your profile and saved schools, within a daily limit.'],
  ['Community and announcements', 'Chat with students heading to the same country, and news from the UniPath team.'],
  ['Budget in your currency', 'Reference exchange rates for planning, never a price quote.'],
];

const FAQ: Array<[string, string]> = [
  ['Is it really free?', 'Yes. Every tool on UniPath is free during beta, and there is nothing to buy. If a university charges an application fee or tuition, you pay the university directly.'],
  ['Will it stay free?', 'Paid extras may be added later. If that happens, the price and what is included will be shown before anything changes, and nothing will ever be charged without your agreement.'],
  ['Do you take payments or share my information?', 'No. UniPath takes no payments, and it does not send your profile or documents to universities. See the privacy page for what is stored.'],
  ['Are these tuition prices?', 'No. The ideas below are possible UniPath extras, not school tuition. Where a source reports tuition, it appears on that school’s page with its year.'],
];

export function PlansView() {
  const { isSignedIn } = useUser();
  const later = PLANS.filter(p => p.id !== 'free');
  return <div className="page page-enter pp">
    <header className="pp-hero">
      <span className="eyebrow">PLANS</span>
      <h1 data-testid="text-plans-heading">Free during beta.</h1>
      <p>Everything on UniPath is free while we build it with students. No card, no trial and nothing to cancel.</p>
    </header>

    <section className="pp-free" data-testid="card-plan-free">
      <div className="pp-free-price"><span className="pp-free-tag"><Sparkles size={13}/> Beta</span><strong>$0</strong><small>Everything included</small>
        <Link href={isSignedIn ? '/dashboard' : '/sign-up'} className="button button-primary" data-testid="button-plan-free">{isSignedIn ? 'Go to my plan' : 'Create a free account'} <ArrowRight size={15}/></Link>
        <Link href="/discover" className="pp-free-link">or start searching without an account</Link>
      </div>
      <ul className="pp-free-list">
        {INCLUDED.map(([title, note]) => <li key={title}><Check size={16}/><div><strong>{title}</strong><small>{note}</small></div></li>)}
      </ul>
    </section>

    <section className="pp-later" data-testid="section-later">
      <h2><Clock3 size={16}/> Ideas for later</h2>
      <p>Not available, and nothing can be bought today. Planned prices are shown so there are no surprises if these launch.</p>
      <div className="pp-later-grid">
        {later.map(p => <div key={p.id} data-testid={`card-plan-${p.id}`}><strong>{p.name}</strong><span>Planned at {p.price}{p.period}</span><small>{p.audience}</small></div>)}
        <div data-testid="card-plan-application-support"><strong>{SUPPORT.name}</strong><span>Planned at {PACKAGES.map(p => p.price).join(', ')} one-time</span><small>{SUPPORT.audience}</small></div>
      </div>
    </section>

    <section className="pp-faq" data-testid="section-faq">
      <h2>Questions, answered plainly</h2>
      {FAQ.map(([q, a], i) => <details key={q} data-testid={`faq-item-${i}`}><summary>{q}</summary><p>{a}</p></details>)}
    </section>

    <p className="plans-footnote">UniPath AI does not submit applications or guarantee admission or scholarships. See <Link href="/about">what we do and do not do</Link>.</p>
  </div>;
}
