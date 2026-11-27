import { Link } from 'wouter';
import type { ProgrammeSummary, ProgrammeVerification } from '@workspace/api-client-react';
import { ArrowRight, BadgeCheck, Clock3, Globe2 } from 'lucide-react';
import { LEVEL_LABEL, deadlineText, durationText, tuitionText } from './format';
import './programmes.css';

export function VerificationBadge({ v, compact = false }: { v: ProgrammeVerification; compact?: boolean }) {
  const Icon = v.level === 'confirmed' ? BadgeCheck : v.level === 'checked' ? Globe2 : Clock3;
  return <span className={`prg-badge prg-badge-${v.level}`} title={v.detail}><Icon size={13}/>{compact && v.level === 'checked' ? 'University website' : v.label}</span>;
}

export function ProgrammeCard({ p }: { p: ProgrammeSummary }) {
  const tuition = tuitionText(p);
  const deadline = deadlineText(p);
  const facts = [LEVEL_LABEL[p.level], p.language, durationText(p.durationMonths)].filter(Boolean).join(' · ');
  return <article className="prg-card" data-testid={`card-programme-${p.id}`}>
    <VerificationBadge v={p.verification} compact/>
    <p className="prg-card-school">{p.institution.name} · {p.institution.country}</p>
    <h3><Link href={`/programmes/${p.id}`}>{p.name}</Link></h3>
    <p className="prg-card-facts">{facts}</p>
    <dl className="prg-card-rows">
      <div><dt>Tuition</dt><dd>{tuition ?? <span className="prg-unknown">Not published</span>}</dd></div>
      <div><dt>Deadline</dt><dd className={`prg-deadline-${deadline.tone}`}>{deadline.text}</dd></div>
    </dl>
    <Link href={`/programmes/${p.id}`} className="prg-card-link" data-testid={`link-programme-${p.id}`}>View programme <ArrowRight size={14}/></Link>
  </article>;
}
