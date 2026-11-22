import { useState } from 'react';
import { Copy, Printer } from 'lucide-react';
import { getListJobApplicationsQueryKey, useListJobApplications } from '@workspace/api-client-react';

const lines = (s: string) => s.split('\n').map(l => l.trim().replace(/^[-*\u2022]\s*/, '')).filter(Boolean);

export function ResumeTab() {
  const jobs = useListJobApplications({ query: { queryKey: getListJobApplicationsQueryKey() } });
  const [f, setF] = useState({ name: '', contact: '', education: '', skills: '', experience: '', jobTitle: '', employer: '' });
  const [copied, setCopied] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(c => ({ ...c, [k]: e.target.value }));
  const pick = (id: string) => { const j = jobs.data?.find(x => String(x.id) === id); setF(c => ({ ...c, jobTitle: j?.title ?? '', employer: j?.employer ?? '' })); };

  const resume = [f.name.trim(), f.contact.trim(), '',
    ...(lines(f.education).length ? ['EDUCATION', ...lines(f.education), ''] : []),
    ...(lines(f.experience).length ? ['EXPERIENCE', ...lines(f.experience).map(l => `- ${l}`), ''] : []),
    ...(f.skills.trim() ? ['SKILLS', f.skills.split(',').map(s => s.trim()).filter(Boolean).join(', ')] : []),
  ].join('\n').trim();
  const role = f.jobTitle.trim() ? `the ${f.jobTitle.trim()} position` : 'this position';
  const at = f.employer.trim() ? ` at ${f.employer.trim()}` : '';
  const exp = lines(f.experience);
  const letter = [`Dear ${f.employer.trim() ? `${f.employer.trim()} hiring team` : 'Hiring team'},`, '',
    `I am writing to apply for ${role}${at}.${lines(f.education)[0] ? ` My education: ${lines(f.education)[0]}.` : ''}`,
    ...(exp.length ? ['', 'Relevant experience:', ...exp.slice(0, 3).map(l => `- ${l}`)] : []),
    ...(f.skills.trim() ? ['', `Skills: ${f.skills.split(',').map(s => s.trim()).filter(Boolean).join(', ')}.`] : []),
    '', 'Thank you for your consideration.', '', 'Sincerely,', f.name.trim() || '[Your name]',
  ].join('\n');
  const copy = async (text: string, which: string) => { try { await navigator.clipboard.writeText(text); setCopied(which); } catch { setCopied('fail'); } };
  const print = (text: string, title: string) => {
    const w = window.open('', '_blank'); if (!w) return; w.opener = null;
    const pre = w.document.createElement('pre'); pre.textContent = text; pre.style.cssText = 'font:13px/1.5 Georgia,serif;white-space:pre-wrap;margin:32px;';
    w.document.title = title; w.document.body.appendChild(pre); w.focus(); w.print();
  };
  const area = (k: keyof typeof f, label: string, ph: string, rows = 3) => <label className="field"><span>{label}</span><textarea rows={rows} value={f[k]} onChange={set(k)} placeholder={ph} data-testid={`input-resume-${k}`} /></label>;
  return <div className="sj-stack">
    <div className="sj-warn" role="note" data-testid="status-template-label"><p><strong>Template draft, not AI.</strong> This tool only rearranges what you type. Review every line and only include true information. Nothing is saved to UniPath.</p></div>
    <div className="sj-resume">
      <div className="sj-card sj-form">
        <label className="field"><span>Name</span><input value={f.name} onChange={set('name')} data-testid="input-resume-name" /></label>
        <label className="field"><span>Contact</span><input value={f.contact} onChange={set('contact')} placeholder="Email, phone, city" data-testid="input-resume-contact" /></label>
        {area('education', 'Education (one per line)', 'B.Sc. Biology, University name, 2027')}
        {area('skills', 'Skills (comma separated)', 'Excel, Spanish, lab safety', 2)}
        {area('experience', 'Experience bullets (one per line)', 'Tutored first-year chemistry students, 6 hours per week', 5)}
        <label className="field"><span>Tracked job (optional)</span><select onChange={e => pick(e.target.value)} defaultValue="" data-testid="select-resume-job"><option value="">None</option>{jobs.data?.map(j => <option key={j.id} value={j.id}>{j.title} at {j.employer}</option>)}</select></label>
        <div className="sj-grid">
          <label className="field"><span>Job title</span><input value={f.jobTitle} onChange={set('jobTitle')} data-testid="input-resume-job-title" /></label>
          <label className="field"><span>Employer</span><input value={f.employer} onChange={set('employer')} data-testid="input-resume-employer" /></label>
        </div>
      </div>
      <div className="sj-stack">
        {[['resume', 'Resume draft', resume || 'Start typing to see your resume.'], ['letter', 'Cover letter draft', letter]].map(([k, t, text]) => <div key={k} className="sj-card">
          <div className="sj-row-between"><h2 className="sj-h2">{t}</h2><div className="sj-actions">
            <button className="button button-outline button-small" onClick={() => void copy(text, k)} data-testid={`button-copy-${k}`}><Copy size={13} /> {copied === k ? 'Copied' : 'Copy'}</button>
            <button className="button button-outline button-small" onClick={() => print(text, t)} data-testid={`button-print-${k}`}><Printer size={13} /> Print</button></div></div>
          <pre className="sj-pre" data-testid={`text-${k}-draft`}>{text}</pre>
        </div>)}
        {copied === 'fail' && <p className="form-error" role="alert">Copy failed. Select the text and copy it manually.</p>}
      </div>
    </div>
  </div>;
}
