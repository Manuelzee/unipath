import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useUser } from '@clerk/react';
import { ArrowRight, Check, CircleDashed, Clock3, Lock, ShieldCheck } from 'lucide-react';
import { AVAILABILITY_LABEL, PACKAGES, PLANS, SUPPORT, type Availability, type Plan } from './catalog';
import { NothingCharged, SetupDialog } from './SetupDialog';
import './plans.css';

const TITLE = 'Plans | UniPath AI';
const DESC = 'Simple, student-friendly plans from UniPath AI: Free, Student Plus ($9.99/month), Premium ($29.99/month), and one-time Application Support packages ($99–$299). Payment is not yet available; nothing is charged.';

function usePageMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    const prevDesc = meta.content;
    document.title = TITLE; meta.content = DESC;
    return () => { document.title = prevTitle; if (created) meta?.remove(); else if (meta) meta.content = prevDesc; };
  }, []);
}

function StatusIcon({ s }: { s: Availability }) {
  return s === 'available' ? <Check size={14} /> : s === 'limited' ? <CircleDashed size={14} /> : <Clock3 size={14} />;
}

const FAQ = [
  ['How do upgrades work?', 'Upgrades are not available yet because payment processing is not configured. Every tool that works today stays free while billing is unavailable, so you do not need to upgrade to use them.'],
  ['Can I cancel?', 'There is nothing to cancel today: no subscriptions can be started. When billing launches, cancellation terms will be shown before you subscribe. There is no cancellation portal yet.'],
  ['How will billing work?', 'Student Plus and Premium are planned monthly subscriptions. Application Support packages are planned one-time purchases. Any applicable taxes and your total would be shown before payment; tax handling is not configured yet.'],
  ['What is included in each plan?', 'Each feature is labeled Available now, Limited, or Planned. Planned features are not built. Live AI is not connected, and the Guidance page shows prepared examples only.'],
  ['Are these prices tuition?', 'No. These are UniPath subscription and support prices only. UniPath does not list school annual costs; check each institution directly.'],
];

export function PlansView() {
  usePageMeta();
  const { isSignedIn } = useUser();
  const [setupPlan, setSetupPlan] = useState<Plan | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [pkg, setPkg] = useState(PACKAGES[0].id);
  const selected = PACKAGES.find(p => p.id === pkg)!;

  return <div className="page page-enter pp">
    <header className="pp-hero">
      <span className="eyebrow">PLANS</span>
      <h1 data-testid="text-plans-heading">Simple, student-friendly plans</h1>
      <p>Choose the support you need, Start free, then upgrade when you want deeper comparisons, personalized planning, or hands-on application support.</p>
    </header>

    <div className="plans-callout" data-testid="status-billing"><ShieldCheck size={17} /><span><strong>Nothing is charged today.</strong> Payment processing is not configured, so no checkout or subscription can be started. Every tool that works today stays free while billing is unavailable. No hidden fees: prices shown are in USD, before any applicable tax.</span></div>

    <div className="pp-legend" aria-label="Availability legend">
      {(['available', 'limited', 'planned'] as Availability[]).map(s => <span key={s} className={`pp-status pp-${s}`}><StatusIcon s={s} />{AVAILABILITY_LABEL[s]}</span>)}
    </div>

    <div className="pp-grid">
      {PLANS.map(plan => <article key={plan.id} className={plan.popular ? 'pp-card pp-popular' : 'pp-card'} data-testid={`card-plan-${plan.id}`}>
        {plan.popular && <span className="pp-badge" data-testid="badge-most-popular">Most Popular</span>}
        <h2>{plan.name}</h2>
        <div className="pp-price" data-testid={`text-price-${plan.id}`}>{plan.price}<small>{plan.period}</small></div>
        <p className="pp-aud">{plan.audience}</p>
        <ul className="pp-features">
          {plan.features.map(f => <li key={f.label} className={`pp-f pp-f-${f.status}`}>
            <StatusIcon s={f.status} />
            <div><span>{f.label} <em className={`pp-status pp-${f.status}`}>{AVAILABILITY_LABEL[f.status]}</em></span><small>{f.note}</small></div>
          </li>)}
        </ul>
        {plan.id === 'free'
          ? <Link href={isSignedIn ? '/dashboard' : '/sign-up'} className="button button-outline" data-testid="button-plan-free">{plan.cta} <ArrowRight size={15} /></Link>
           : <button className={plan.popular ? 'button button-primary' : 'button button-outline'} onClick={() => setSetupPlan(plan)} aria-haspopup="dialog" aria-expanded={setupPlan?.id === plan.id} data-testid={`button-plan-${plan.id}`}>{plan.cta}</button>}
      </article>)}

      <article className="pp-card pp-support" data-testid="card-plan-application-support">
        <h2>{SUPPORT.name}</h2>
        <div className="pp-price" data-testid="text-price-application-support">{SUPPORT.price}<small>{SUPPORT.period}</small></div>
        <p className="pp-aud">{SUPPORT.audience}</p>
        <ul className="pp-features">
          {SUPPORT.features.map(f => <li key={f} className="pp-f pp-f-planned"><StatusIcon s="planned" /><div><span>{f} <em className="pp-status pp-planned">Planned</em></span></div></li>)}
        </ul>
        <p className="pp-aud">Human package fulfillment is not available yet. No submissions, admission, or scholarship guarantees.</p>
        <button className="button button-outline" onClick={() => setSupportOpen(true)} aria-haspopup="dialog" aria-expanded={supportOpen} data-testid="button-plan-application-support">{SUPPORT.cta}</button>
      </article>
    </div>

    <section className="pp-explain" data-testid="section-billing-types">
      <div><h3>Monthly subscriptions</h3><p>Student Plus ($9.99/month) and Premium ($29.99/month) are planned to renew each month until cancelled.</p></div>
      <div><h3>One-time packages</h3><p>Application Support packages ($99, $199, or $299) are planned as single purchases with no renewal.</p></div>
      <div><h3>Totals before payment</h3><p>Any applicable taxes and your full total would be shown before you pay. Tax handling is not configured yet, and nothing can be paid today.</p></div>
    </section>

    <section className="pp-faq" data-testid="section-faq">
      <h2>Questions, answered plainly</h2>
      {FAQ.map(([q, a], i) => <details key={q} data-testid={`faq-item-${i}`}><summary>{q}</summary><p>{a}</p></details>)}
    </section>

    <p className="plans-footnote">Plan and package prices are UniPath subscription or support prices, not school tuition. Directory coverage is partial (U.S. plus a Canada pilot); worldwide expansion is planned. UniPath AI does not submit applications or guarantee admission or scholarships.</p>

    <SetupDialog open={!!setupPlan} onOpenChange={o => { if (!o) setSetupPlan(null); }} title={`${setupPlan?.name ?? ''} is not available yet`} testId="dialog-plan-setup">
      {setupPlan && <>
        <p><strong>{setupPlan.name}</strong> is planned at <strong>{setupPlan.price}{setupPlan.period}</strong>, billed monthly, plus any applicable tax shown before payment.</p>
        <NothingCharged />
         <p>The site owner must connect a payment provider and activate this plan before upgrades can open. No billing details are needed from you now.</p>
        <p>Features that work today remain free for everyone. Planned features in this plan are not built:</p>
        <ul className="pp-mini">{setupPlan.features.filter(f => f.status === 'planned').map(f => <li key={f.label}>{f.label}</li>)}</ul>
        <button className="button button-primary" disabled data-testid="button-payment-disabled"><Lock size={15} /> Payment unavailable</button>
      </>}
    </SetupDialog>

    <SetupDialog open={supportOpen} onOpenChange={setSupportOpen} title="Explore Application Support" testId="dialog-application-support">
      <p>Choose a package to see its planned scope. These are one-time packages, not subscriptions.</p>
      <div role="radiogroup" aria-label="Application Support packages" className="pp-pkgs">
        {PACKAGES.map(p => <label key={p.id} className={p.id === pkg ? 'pp-pkg pp-pkg-on' : 'pp-pkg'} data-testid={`option-package-${p.id}`}>
          <input type="radio" name="package" value={p.id} checked={p.id === pkg} onChange={() => setPkg(p.id)} data-testid={`radio-package-${p.id}`} />
          <span>{p.name}</span><b>{p.price}</b>
        </label>)}
      </div>
      <div className="pp-pkg-detail" data-testid={`detail-package-${selected.id}`}>
        <h3>{selected.name} · {selected.price} one-time</h3>
        <ul className="pp-mini">{selected.scope.map(s => <li key={s}>{s}</li>)}</ul>
        <p><strong>Limits:</strong> {selected.limits}</p>
        <p>Planned scope only. Human fulfillment is not available yet, so nothing can be booked, no receipt is issued, and UniPath AI does not submit applications or guarantee admission or scholarships.</p>
      </div>
      <NothingCharged />
       <p>The site owner must configure payment processing and package fulfillment before bookings can open.</p>
      <button className="button button-primary" disabled data-testid="button-package-payment-disabled"><Lock size={15} /> Payment unavailable</button>
    </SetupDialog>
  </div>;
}
