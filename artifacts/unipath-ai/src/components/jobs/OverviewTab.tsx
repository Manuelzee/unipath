import { Link } from 'wouter';
import { ArrowRight, CircleSlash, Clock3, Info, ListChecks, MessagesSquare, UserRound } from 'lucide-react';
import { getGetStudentProfileQueryKey, useGetStudentProfile } from '@workspace/api-client-react';
import type { TabId } from './JobsView';

const NOT_YET = ['Live job listings', 'AI job matching', 'AI resume and cover letter writing', 'Scam reporting', 'Local currency and language options'];
const CHECKLIST = ['Confirm your work authorization with your DSO or international office', 'Check where the posting came from and when it was posted', "Verify any sponsorship claim on the employer's official page", 'Tailor your resume to the role, using only true information', 'Note the application deadline', 'Prepare your references', 'Record your interview date in your tracker'];
const INTERVIEW = ['Reread the posting and match your examples to its stated duties.', 'Prepare two or three short stories about real work, study, or volunteer experience.', 'Have honest, accurate answers ready about your work authorization; do not guess.', 'Write down questions to ask about hours, schedule, and start date.', 'Test your connection and setting ahead of time for online interviews.', 'Send a brief thank-you note after the interview.'];
const PLANNED = ['On-campus jobs', 'Part-time jobs', 'Internships', 'Research assistant roles', 'Teaching assistant roles', 'Post-graduation roles'];

function ProfileSummary() {
  const q = useGetStudentProfile({ query: { queryKey: getGetStudentProfileQueryKey() } });
  if (q.isLoading) return <div className="sj-card"><div className="skeleton skeleton-line" /></div>;
  if (q.isError) return <div className="sj-card sj-row-between"><span>We couldn't load your profile.</span><button className="button button-outline button-small" onClick={() => void q.refetch()} data-testid="button-retry-profile">Try again</button></div>;
  const p = q.data?.profile;
  const facts = p ? [['Studying', p.major], ['Degree', p.degreeLevel], ['Study country', p.studyCountry], ['Citizenship', p.citizenship], ['Lives in', p.residenceCountry]].filter(([, v]) => v && String(v).trim()) : [];
  if (!facts.length) return <div className="sj-card sj-profile" data-testid="card-profile-summary">
    <div className="sj-ico"><UserRound size={18} /></div>
    <div><strong>Your profile is mostly empty.</strong><p>Adding your field of study and countries helps keep this page relevant to you. Nothing here filters jobs yet.</p>
      <Link href="/profile" className="text-link" data-testid="link-complete-profile">Complete your profile <ArrowRight size={14} /></Link></div>
  </div>;
  return <div className="sj-card sj-profile" data-testid="card-profile-summary">
    <div className="sj-ico"><UserRound size={18} /></div>
    <div><strong>From your profile</strong>
      <dl className="sj-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd data-testid={`text-profile-${String(k).toLowerCase().replace(/\s/g, '-')}`}>{v}</dd></div>)}</dl>
      <Link href="/profile" className="text-link" data-testid="link-edit-profile">Edit profile <ArrowRight size={14} /></Link></div>
  </div>;
}

export function OverviewTab({ go }: { go: (t: TabId) => void }) {
  return <div className="sj-stack">
    <ProfileSummary />
    <div className="sj-honest" data-testid="status-no-listings"><Info size={18} />
      <div><strong>UniPath does not list jobs yet.</strong>
        <p>No authorized job-listing source is connected, so you will not see job postings or match scores here. When listings arrive, they will only come from authorized APIs or official employer and university career sites, each with its posting date. UniPath never invents listings.</p></div>
    </div>
    <div className="sj-card">
      <h2 className="sj-h2">Job categories</h2>
      <ul className="sj-planned">{PLANNED.map(c => <li key={c} data-testid={`text-category-${c.toLowerCase().replace(/\s/g, '-')}`}><span>{c}</span><em className="pp-status pp-planned"><Clock3 size={12} /> Planned</em></li>)}</ul>
      <p className="sj-muted">Job matching and resume tailoring are not live. Nothing on this page is AI-generated.</p>
    </div>
    <div className="sj-card" data-testid="card-not-available">
      <h2 className="sj-h2"><CircleSlash size={16} /> Not available yet</h2>
      <ul className="sj-list">{NOT_YET.map(t => <li key={t}>{t}</li>)}</ul>
    </div>
    <div className="sj-two">
      <div className="sj-card" data-testid="card-checklist"><h2 className="sj-h2"><ListChecks size={16} /> Application checklist</h2>
        <ol className="sj-list">{CHECKLIST.map(t => <li key={t}>{t}</li>)}</ol><p className="sj-muted">A general checklist, not legal or immigration advice.</p></div>
      <div className="sj-card" data-testid="card-interview-prep"><h2 className="sj-h2"><MessagesSquare size={16} /> Interview preparation</h2>
        <ul className="sj-list">{INTERVIEW.map(t => <li key={t}>{t}</li>)}</ul><p className="sj-muted">General tips written by UniPath, not AI-generated.</p></div>
    </div>
    <div className="sj-card">
      <h2 className="sj-h2">Sponsorship is not the same as authorization</h2>
      <p className="sj-body">An employer saying it sponsors visas means it may support a future application. It does not mean you are allowed to work for it today. Your current permission to work comes from your own visa status and any authorization your school or immigration agency grants. In your tracker, each sponsorship claim carries a label: not stated, advertised but unverified (the default), confirmed on an official page, or not offered.</p>
    </div>
    <div className="sj-next">
      <button className="sj-next-btn" onClick={() => go('rules')} data-testid="button-go-rules"><strong>Read official work rules</strong><span>Government sources by country</span><ArrowRight size={16} /></button>
      <button className="sj-next-btn" onClick={() => go('tracker')} data-testid="button-go-tracker"><strong>Track a job you found</strong><span>Dates, status, sponsorship labels</span><ArrowRight size={16} /></button>
      <button className="sj-next-btn" onClick={() => go('resume')} data-testid="button-go-resume"><strong>Draft a resume</strong><span>Template from your own words</span><ArrowRight size={16} /></button>
    </div>
  </div>;
}
