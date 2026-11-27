import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import './legal.css';

/** Set VITE_SUPPORT_EMAIL on the web build to publish a support address. */
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL?.trim();
const UPDATED = '27 November 2026';

function Contact() {
  return SUPPORT_EMAIL
    ? <p>Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. If it is about your account, send it from the email address you signed up with.</p>
    : <p>A support email address is coming soon. Until then, signed-in students can reach the UniPath team in <Link href="/chat">Community chat</Link>; please do not post personal documents or details there.</p>;
}

function LegalPage({ kicker, title, lede, updated, children }: { kicker: string; title: string; lede: string; updated?: boolean; children: ReactNode }) {
  return <main className="legal page-enter">
    <header className="legal-head">
      <span className="eyebrow">{kicker}</span>
      <h1>{title}</h1>
      <p className="legal-lede">{lede}</p>
      {updated && <p className="legal-updated">Last updated {UPDATED}</p>}
    </header>
    {children}
  </main>;
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => <section className="legal-section"><h2>{title}</h2>{children}</section>;

export function AboutView() {
  return <LegalPage kicker="ABOUT UNIPATH AI" title="Find a university abroad, and a way to pay for it."
    lede="UniPath AI helps students find universities and scholarships outside their home country, compare their options, and keep every application step in one place. It is free during beta.">
    <section className="legal-steps" aria-label="How it works">
      {[
        ['01', 'Search', 'Look through 30,000+ universities and colleges in 160+ countries, and 40 scholarship and sponsorship programmes. Every detail says where it came from.'],
        ['02', 'Plan', 'Save your profile once to get explainable matches, a shortlist, side-by-side comparisons and a budget in your own currency.'],
        ['03', 'Keep track', 'Track applications, deadlines and tasks, keep your documents in one private place, and get reminders before the dates you recorded.'],
      ].map(([n, title, body]) => <article key={n}><span>{n}</span><h3>{title}</h3><p>{body}</p></article>)}
    </section>
    <div className="legal-actions"><Link href="/discover" className="button button-primary" data-testid="link-about-discover">Find universities <ArrowRight size={16}/></Link><Link href="/scholarships" className="button button-outline" data-testid="link-about-scholarships">See scholarships</Link></div>

    <Section title="Where the information comes from">
      <ul>
        <li><strong>United States:</strong> NCES IPEDS, the U.S. Department of Education's college data.</li>
        <li><strong>160+ other countries:</strong> the Research Organization Registry (ROR), a public register of universities. It gives the name, city and website; programmes, fees and entry requirements are not included. African countries are not covered.</li>
        <li><strong>Canada:</strong> ROR plus a pilot list from the Government of Canada.</li>
        <li><strong>Scholarships:</strong> a list we keep ourselves, each linked to the sponsor's official page and marked with the date we last checked it.</li>
      </ul>
      <p>When a source does not report something, UniPath says it is unknown instead of guessing. None of these sources is an accreditation register, so check that a university is recognised before you apply.</p>
    </Section>

    <Section title="What we do not do">
      <div className="legal-qa">
        {[
          ['Do we decide who gets in?', 'No. Each university makes its own decisions. Matches on UniPath are estimates from your preferences, not your chance of admission.'],
          ['Do we send your applications?', 'Not yet. You apply on each university’s own website. UniPath helps you prepare, and keeps your deadlines, tasks and documents together.'],
          ['Do we charge you?', 'No. UniPath is free during beta. If a university charges an application fee or tuition, you pay the university directly.'],
          ['Do we guarantee scholarships?', 'No. Sponsors decide who receives an award. Amounts and deadlines change every year, so confirm them on the official page.'],
          ['Do we act for you?', 'No. UniPath does not contact universities, embassies or visa offices on your behalf.'],
          ['Do we sell your data?', 'No. UniPath has no advertising and no tracking scripts, and does not give your profile or documents to universities. See the privacy page for the details.'],
        ].map(([q, a]) => <div key={q}><XCircle size={17} aria-hidden="true"/><div><h3>{q}</h3><p>{a}</p></div></div>)}
      </div>
    </Section>

    <Section title="Questions">
      <Contact/>
      <p className="legal-links"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p>
    </Section>
  </LegalPage>;
}

export function PrivacyView() {
  return <LegalPage kicker="PRIVACY" updated title="Your information, in plain words."
    lede="What UniPath AI stores, why, who can see it, and how to download or delete it.">
    <div className="legal-summary">
      {['We store only what you give us to use UniPath’s features.', 'No advertising and no tracking scripts.', 'Your documents can be downloaded only by you.', 'You can download or delete your data at any time in Settings.'].map(t => <p key={t}><CheckCircle2 size={16}/> {t}</p>)}
    </div>

    <Section title="What we store">
      <ul>
        <li><strong>Your account:</strong> your name and email address, and your password stored only as a one-way scrambled code (a hash), never as the password itself. If you choose Continue with Google, we receive your name and email address from Google.</li>
        <li><strong>What you add:</strong> your profile (such as study preferences, grades and budget), saved schools, applications, tasks and notes, the documents you upload, your community chat messages, and AI answers you choose to save.</li>
        <li><strong>Usage counts:</strong> how many AI assistant requests you make each day, to apply the daily limit. The text of your questions is not kept for this.</li>
        <li><strong>In your browser:</strong> one cookie that keeps you signed in, plus small settings such as your display currency and which announcements and notifications you have already seen.</li>
      </ul>
    </Section>

    <Section title="Who can see it">
      <ul>
        <li><strong>You</strong> can see everything you added.</li>
        <li><strong>Other students</strong> see your community chat messages in the rooms where you post them, with your first name and the first letter of your last name. They never see your email address.</li>
        <li><strong>UniPath administrators</strong> can remove chat messages, post announcements and see limited account details needed to run the service, such as your study country and degree level. They cannot download your documents.</li>
        <li><strong>Universities and sponsors</strong> receive nothing from UniPath. You apply to them yourself.</li>
      </ul>
    </Section>

    <Section title="Services that run UniPath">
      <p>These companies process data only to provide their part of the service:</p>
      <ul>
        <li><strong>Cloudflare</strong> serves the website.</li>
        <li><strong>Render</strong> runs the UniPath server, and <strong>Supabase</strong> hosts the database, both in Frankfurt, Germany.</li>
        <li><strong>Resend</strong> sends sign-in and verification codes by email, when those are switched on.</li>
        <li><strong>OpenAI</strong> produces AI assistant answers and essay feedback, only when you use those features. Your question or essay is sent, with the profile details listed on the assistant page. Your budget, living costs, citizenship and home region are never sent.</li>
        <li><strong>Google Fonts</strong> supplies the website's fonts, so your browser contacts Google when pages load.</li>
      </ul>
    </Section>

    <Section title="Your documents">
      <p>Uploaded files are checked to make sure they really are the type of file they claim to be, kept outside any public folder, and returned only to you, as downloads. You can delete them at any time on the Documents page.</p>
      <p>On our current hosting plan, uploaded files can be removed when the server restarts or is updated. Keep your own copies of anything important.</p>
    </Section>

    <Section title="How long we keep it">
      <p>Until you delete it or delete your account. Sign-in sessions end after 30 days without use.</p>
    </Section>

    <Section title="Your choices">
      <p>In <Link href="/settings">Settings</Link> you can:</p>
      <ul>
        <li><strong>Download my data:</strong> a copy of everything UniPath stores for your account.</li>
        <li><strong>Delete my data:</strong> removes your profile, schools, applications, tasks, documents, chat messages and saved AI answers. Your account stays, so you can still sign in.</li>
        <li><strong>Delete my account:</strong> removes the account itself.</li>
      </ul>
    </Section>

    <Section title="Keeping it safe">
      <p>Connections use HTTPS. Passwords are stored as hashes. The sign-in cookie cannot be read by scripts on the page, and repeated sign-in attempts are limited.</p>
    </Section>

    <Section title="Changes and questions">
      <p>If this page changes, we will update the date at the top and post an announcement for significant changes.</p>
      <Contact/>
    </Section>
  </LegalPage>;
}

export function TermsView() {
  return <LegalPage kicker="TERMS" updated title="The terms for using UniPath."
    lede="Short and in plain words. By creating an account or using UniPath AI, you agree to them.">
    <Section title="1. What UniPath is">
      <p>UniPath AI is an information and planning tool for students who want to study abroad. It is free during beta, and its features may change as it grows.</p>
    </Section>
    <Section title="2. Check before you rely on anything">
      <p>Information on UniPath comes from public sources and lists we keep. It can be incomplete, out of date or wrong. Always confirm programmes, fees, requirements, deadlines and scholarships with the university, sponsor or government office before you rely on them or pay anything.</p>
      <p>Matches, comparisons and AI answers are estimates and suggestions. UniPath does not guarantee admission, a scholarship, a visa or a job.</p>
    </Section>
    <Section title="3. Your account">
      <p>Give true information, keep your password private, and use your account for yourself only. You are responsible for what happens in your account.</p>
    </Section>
    <Section title="4. Community rules">
      <ul>
        <li>Be respectful. No harassment, hate or threats.</li>
        <li>No spam, scams or advertising, and no selling services such as admission or visa help.</li>
        <li>Never ask other students for money, passwords or documents, and never share anyone else's personal details or documents.</li>
        <li>Do not pretend to be a university, sponsor, official or member of the UniPath team.</li>
      </ul>
      <p>We may remove messages and suspend or close accounts that break these rules.</p>
    </Section>
    <Section title="5. Your content">
      <p>Your documents, notes and messages stay yours. You allow UniPath to store them and show them as the features need, for example showing your chat messages to other students in that room.</p>
    </Section>
    <Section title="6. The AI assistant">
      <p>AI answers can be wrong, so review them before you use them. Essay feedback does not write your essay for you; follow each university's rules on your own work.</p>
    </Section>
    <Section title="7. Fees">
      <p>UniPath is free during beta. If paid features are added later, the price and terms will be shown before you pay, and nothing will be charged without your agreement.</p>
    </Section>
    <Section title="8. Other websites">
      <p>UniPath links to universities, sponsors and other sites that we do not control. Their own terms and privacy policies apply there.</p>
    </Section>
    <Section title="9. Responsibility">
      <p>We work to keep UniPath accurate and available, but we provide it as it is, without a promise that it will be free of errors or always available. As far as the law allows, we are not responsible for decisions made using information on UniPath.</p>
    </Section>
    <Section title="10. Ending">
      <p>You can delete your account at any time in <Link href="/settings">Settings</Link>. We may suspend or close accounts that misuse UniPath.</p>
    </Section>
    <Section title="11. Changes and questions">
      <p>If these terms change, we will update the date at the top and post an announcement for significant changes.</p>
      <Contact/>
      <p className="legal-links"><ShieldCheck size={14}/> <Link href="/privacy">How we handle your information</Link></p>
    </Section>
  </LegalPage>;
}
