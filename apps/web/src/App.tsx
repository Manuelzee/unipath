import { Fragment, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AuthProvider, Show, useAuth, useUser } from '@/lib/auth';
import { AuthFlow } from '@/components/auth/AuthFlow';
import { ErrorBoundary } from '@/components/error-boundary';
import { DiscoverView } from '@/components/directory/DiscoverView';
import { UniversityDetailView } from '@/components/directory/UniversityDetailView';
import { FundingFinder } from '@/components/directory/FundingFinder';
import { PreferenceFields, invalidLivingExpenses, thisYear } from '@/components/profile/PreferenceFields';
import { AdminDashboardView, AdminSetupView } from '@/components/admin/AdminViews';
import { PlansView } from '@/components/plans/PlansView';
import { JobsView } from '@/components/jobs/JobsView';
import { RecommendationsView } from '@/components/recommendations/RecommendationsView';
import { BillingView } from '@/components/billing/BillingViews';
import { AdminBillingView } from '@/components/billing/AdminBillingView';
import { OnboardingWizard } from '@/components/profile/OnboardingWizard';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { ApplicationsView } from '@/components/applications/ApplicationsView';
import { SavedView } from '@/components/saved/SavedView';
import { CompareView } from '@/components/compare/CompareView';
import { AssistantView } from '@/components/assistant/AssistantView';
import { SettingsView } from '@/components/settings/SettingsView';
import { DocumentsView } from '@/components/documents/DocumentsView';
import '@/components/workspace/workspace.css';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  getGetBudgetSettingsQueryKey, getGetStudentDashboardQueryKey, getGetStudentProfileQueryKey, getGetStudentRecommendationsQueryKey,
  getGetAdminAccessQueryKey, useGetAdminAccess, useGetStudentProfile, useSaveStudentProfile,
} from '@workspace/api-client-react';
import type { StudentProfileInput } from '@workspace/api-client-react';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, Bookmark, Briefcase, Check, CheckCircle2,
  ClipboardList, Compass, CreditCard, FileText, Gem, Globe2, GraduationCap, LayoutDashboard,
  LoaderCircle, Menu, MessageCircle, Scale, Search, Settings, ShieldCheck, Sparkles,
  UserRound, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, useLocation, useSearch, Router as WouterRouter } from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const cn = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' ');
// Ordered along the student journey: discover → match → compare → prepare → apply → track.
const navItems = [
  { href: '/dashboard', label: 'My plan', icon: LayoutDashboard },
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/recommendations', label: 'Matches', icon: GraduationCap },
  { href: '/saved', label: 'Shortlist', icon: Bookmark },
  { href: '/compare', label: 'Compare', icon: Scale },
  { href: '/applications', label: 'Applications', icon: ClipboardList },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/ai-assistant', label: 'AI assistant', icon: MessageCircle },
  { href: '/funding', label: 'Funding finder', icon: Sparkles },
  { href: '/jobs', label: 'Global Student Jobs', icon: Briefcase, testId: 'nav-student-jobs' },
  { href: '/profile', label: 'My profile', icon: UserRound },
  { href: '/plans', label: 'Plans', icon: Gem },
  { href: '/billing', label: 'Billing & Payments', icon: CreditCard, testId: 'nav-billing' },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className={cn('brand', inverse && 'brand-inverse')} data-testid="link-home">
    <img src={`${basePath}/logo.svg`} alt="" className="brand-mark" />
    <span>UniPath<span className="brand-ai"> AI</span></span>
  </Link>;
 }

function Header({ marketing = false }: { marketing?: boolean }) {
  const [open, setOpen] = useState(false);
  const { isSignedIn } = useUser();
  return <header className="topbar">
    <div className="topbar-inner">
      <Brand />
      <button className="mobile-menu icon-button" aria-label="Toggle navigation" onClick={() => setOpen(!open)} data-testid="button-mobile-menu">{open ? <X size={20}/> : <Menu size={20}/>}</button>
      <nav className={cn('topnav', open && 'topnav-open')} aria-label="Main navigation">
        <Link href="/discover" className="topnav-link" data-testid="link-discover">Explore schools</Link>
        <Link href="/plans" className="topnav-link" data-testid="link-plans">Plans</Link>
        {isSignedIn ? <Link href="/dashboard" className="topnav-login" data-testid="link-dashboard">My plan <ArrowRight size={16}/></Link> :
          <><Link href="/sign-in" className="topnav-link" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="button button-primary button-small" data-testid="link-sign-up">Get started <ArrowRight size={15}/></Link></>}
      </nav>
    </div>
    {marketing && <div className="sample-strip"><ShieldCheck size={14}/> Source-listed institutions: partial U.S. coverage from NCES IPEDS and a Canada pilot from a government co-op program listing. Not independently verified.</div>}
  </header>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, isSignedIn } = useUser();
  const { signOut } = useAuth();
  const [, setLocation] = useLocation();
  const adminAccess = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey(), enabled: !!isSignedIn, retry: false } });
  const initials = user?.firstName?.slice(0, 1) || user?.email?.slice(0, 1) || 'S';
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand inverse />
      <p className="side-label">YOUR SPACE</p>
      <nav className="side-nav">
        {navItems.map(item => { const Icon = item.icon; const active = location === item.href; return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} data-testid={'testId' in item ? item.testId : `nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} className={cn('side-link', active && 'side-link-active')}><Icon size={18}/><span>{item.label}</span></Link>; })}
      </nav>
      {adminAccess.data?.isAdmin && <Link href="/admin" data-testid="nav-admin" className={cn('side-link', location.startsWith('/admin') && 'side-link-active')} style={{marginTop:5}}><ShieldCheck size={18}/><span>Admin</span></Link>}
      <div className="sidebar-note"><div className="note-icon"><Globe2 size={17}/></div><strong>Your world is wide open.</strong><span>One step at a time, we’ll help you find your way.</span><Link href="/discover">Explore universities <ArrowRight size={14}/></Link></div>
      {isSignedIn?<div className="side-user"><div className="user-avatar">{initials.toUpperCase()}</div><div className="user-info"><strong>{user?.firstName || 'Student'}</strong><span>{adminAccess.data?.isAdmin ? 'Admin account' : 'Student account'}</span></div><button className="logout-button" onClick={() => void signOut(() => setLocation('/'))} data-testid="button-sign-out">Sign out</button></div>:<div className="side-user"><Link href="/sign-in" className="side-auth-link" data-testid="link-shell-sign-in">Sign in</Link><Link href="/sign-up" className="side-auth-link" data-testid="link-shell-sign-up">Create account <ArrowRight size={13}/></Link></div>}
    </aside>
    <main className="workspace">{children}</main>
  </div>;
}

function Home() {
  const { isSignedIn } = useUser();
  if (isSignedIn) return <Redirect to="/dashboard"/>;
  return <div className="marketing-page page-enter"><Header marketing/>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot"/> YOUR NEXT CHAPTER, ANYWHERE</div>
        <h1>Big world.<br/><em>Clear next steps.</em></h1>
        <p className="hero-lede">Finding your place at a university abroad shouldn’t feel like learning a new system alone. Let’s make the journey feel possible.</p>
        <div className="hero-actions"><Link href="/discover" className="button button-primary" data-testid="button-explore-hero">Find My University <ArrowRight size={17}/></Link><Link href="/sign-up" className="button button-quiet" data-testid="button-start-hero">Build my plan <ArrowDownRight size={17}/></Link></div>
        <div className="hero-trust"><div className="trust-avatars"><span>J</span><span>M</span><span>A</span></div><p><strong>A plan that starts with you.</strong><br/>Clear, personal, and at your pace.</p></div>
      </div>
      <div className="hero-art" aria-label="Illustration of a student exploring universities">
        <div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
        <div className="globe"><div className="globe-lat lat-one"/><div className="globe-lat lat-two"/><div className="globe-lon"/><div className="land land-a"/><div className="land land-b"/><div className="land land-c"/></div>
        <div className="orbit-pin pin-london"><span className="pin-dot"/>LONDON</div><div className="orbit-pin pin-toronto"><span className="pin-dot"/>TORONTO</div><div className="orbit-pin pin-singapore"><span className="pin-dot"/>SINGAPORE</div>
        <div className="floating-card card-schools"><div className="float-icon mint"><GraduationCap size={18}/></div><div><strong>Find your fit</strong><span>Across 6 continents</span></div></div>
        <div className="floating-card card-plan"><div className="float-icon amber"><Check size={18}/></div><div><strong>One clear step</strong><span>Then the next</span></div></div>
        <div className="art-caption">A world of possibility,<br/>with a path that feels like yours.</div>
      </div>
    </section>
    <section className="trust-row"><span>START WITH WHAT MATTERS TO YOU</span><div><i/>Your goals <i/>Your budget <i/>Your next step</div></section>
    <section className="how-section"><div className="section-heading"><span className="eyebrow">A LITTLE LESS OVERWHELM</span><h2>Make a big decision<br/>feel <em>manageable.</em></h2><p>You don’t need every answer today. Just a good place to begin.</p></div>
      <div className="steps-grid"><article className="step-card step-01"><span className="step-no">01 / EXPLORE</span><div className="step-art art-search"><Search/><span/><span/><span/></div><h3>See what’s out there</h3><p>Explore schools around the world by what matters most to you.</p><Link href="/discover" data-testid="link-step-discover">Browse universities <ArrowRight size={15}/></Link></article>
      <article className="step-card step-02"><span className="step-no">02 / MAKE IT YOURS</span><div className="step-art art-profile"><UserRound/><i/><i/><i/></div><h3>Start with your story</h3><p>Your interests, budget, and goals help shape a more personal path.</p><Link href="/sign-up" data-testid="link-step-profile">Create your profile <ArrowRight size={15}/></Link></article>
      <article className="step-card step-03"><span className="step-no">03 / TAKE A STEP</span><div className="step-art art-check"><CheckCircle2/><span>One thing at a time</span></div><h3>Keep moving forward</h3><p>Turn a big application journey into a few clear next steps.</p><Link href="/sign-up" data-testid="link-step-plan">Build your plan <ArrowRight size={15}/></Link></article></div>
    </section>
    <section className="quote-section"><div className="quote-mark">“</div><blockquote>You don’t have to have it all figured out to get started.</blockquote><p>Start curious. Find your way as you go.</p><Link href="/discover" className="button button-light" data-testid="button-browse-footer">See where you could go <ArrowRight size={16}/></Link></section>
     <section className="home-disclaimer"><ShieldCheck size={18}/><div><strong>A note about our institution directory</strong><p>Coverage is partial. U.S. records come from NCES IPEDS. Canadian records are a pilot drawn from a Government of Canada (PSC) co-op and internship program listing, which may include historical names and is not a full list of Canadian institutions. Records are source-reported and not independently verified. Use official school websites to confirm programs, admissions requirements, and funding opportunities.</p></div></section>
    <Footer/>
  </div>;
}

function Footer() { return <footer className="footer"><Brand/><span>Thoughtful steps toward somewhere new.</span><div><Link href="/discover">Explore</Link><Link href="/plans">Plans</Link><Link href="/sign-up">Create account</Link></div><small>© 2026 UniPath AI. Directory sources (partial coverage): NCES IPEDS (U.S.) and a Public Service Commission of Canada program listing (Canada pilot). Source-reported, not independently verified.</small></footer>; }
function PageHeading({ kicker, title, body, action }: { kicker: string; title: string; body?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1>{body && <p>{body}</p>}</div>{action}</div>;
}
function LoadingState() { return <div className="loading-stack" aria-label="Loading"><div className="skeleton skeleton-line"/><div className="skeleton skeleton-card"/><div className="skeleton skeleton-card"/></div>; }
function ErrorState({ retry }: { retry: () => void }) { return <div className="state-card"><div className="state-icon warning"><Globe2 size={21}/></div><h3>We couldn’t load this just now</h3><p>Give it another try. Your progress is still here.</p><button className="button button-primary button-small" onClick={retry} data-testid="button-retry">Try again</button></div>; }
function Discover() { return <Shell><DiscoverView/></Shell>; }
function UniversityDetails({ id }: { id: string }) { return <Shell><UniversityDetailView id={id}/></Shell>; }
const profileDefaults: StudentProfileInput = {
  residenceCountry: '', citizenship: '', studyCountry: '', degreeLevel: '',
  major: '', grades: '', annualBudgetUsd: 0, preferredLanguage: '', englishTest: '', englishScore: '',
  budgetCurrency: 'USD', budgetScope: 'tuition', priorities: [], topPriorities: [], preferredLocation: '', residenceRegion: '', admissionTrack: 'unsure',
  currentQualification: '', gradingScale: '', graduationYear: null, englishTestDate: null,
};
const graduationYears = Array.from({ length: 22 }, (_, i) => thisYear + 6 - i);
function Profile() {
  const profileQuery=useGetStudentProfile({query:{queryKey:getGetStudentProfileQueryKey()}}); const save=useSaveStudentProfile(); const qc=useQueryClient();
  const profile=profileQuery.data?.profile;
  const [form,setForm]=useState<StudentProfileInput>(profileDefaults);
  const [initialized,setInitialized]=useState(false);
  useEffect(()=>{if(profile&&!initialized){const { updatedAt: _u, ...rest } = profile; void _u; setForm({...profileDefaults,...rest});setInitialized(true);}},[profile,initialized]);
  const update=(key:keyof StudentProfileInput,value:string|number)=>setForm(current=>({...current,[key]:value} as StudentProfileInput));
  const customInvalid=(form.budgetChoice==='custom'&&!(Number(form.customBudget)>0&&Number(form.customBudget)<=1e9))||invalidLivingExpenses(form.livingExpenses); const pastYear=form.startYear!=null&&form.startYear<thisYear;
  const submit=(e:FormEvent)=>{e.preventDefault(); if(customInvalid||pastYear)return; const data:StudentProfileInput={...form,annualBudgetUsd:Number(form.annualBudgetUsd)||0,customBudget:form.budgetChoice==='custom'?Math.floor(Number(form.customBudget)):null,topPriorities:(form.topPriorities??[]).slice(0,3),englishTestDate:form.englishTestDate||null,graduationYear:form.graduationYear??null}; if(!data.applicantStatus)delete data.applicantStatus; save.mutate({data},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getGetStudentProfileQueryKey()});void qc.invalidateQueries({queryKey:getGetStudentDashboardQueryKey()});void qc.invalidateQueries({queryKey:getGetStudentRecommendationsQueryKey()});void qc.invalidateQueries({queryKey:getGetBudgetSettingsQueryKey()});}});};
  return <Shell><div className="page page-enter"><PageHeading kicker="START WITH YOU" title="Your story, your way." body="Share a little about what you’re looking for. You can change any of this whenever you like."/>
    {profileQuery.isLoading?<LoadingState/>:profileQuery.isError?<ErrorState retry={()=>void profileQuery.refetch()}/>:<div className="profile-layout"><form className="profile-form content-panel" onSubmit={submit}>
      <div className="form-section-title"><div className="profile-icon"><UserRound size={20}/></div><div><h2>About you</h2><p>These details help keep your plans grounded in what matters.</p></div></div>
      <div className="form-grid"><label className="field"><span>Where do you live?</span><input value={form.residenceCountry} onChange={e=>update('residenceCountry',e.target.value)} placeholder="Your country of residence" data-testid="input-residence-country"/></label>
        <label className="field"><span>Citizenship</span><input value={form.citizenship} onChange={e=>update('citizenship',e.target.value)} placeholder="Country or countries" data-testid="input-citizenship"/></label>
        <label className="field"><span>Where might you study?</span><input value={form.studyCountry} onChange={e=>update('studyCountry',e.target.value)} placeholder="Any country, or still exploring" data-testid="input-study-country"/></label>
        <label className="field"><span>Degree level</span><select value={form.degreeLevel} onChange={e=>update('degreeLevel',e.target.value)} data-testid="select-profile-degree"><option value="">Choose a level</option>{['Bachelor','Master','Doctorate','Undergraduate','Graduate'].map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="field"><span>What would you like to study?</span><input value={form.major} onChange={e=>update('major',e.target.value)} placeholder="A subject, field, or idea" data-testid="input-major"/></label>
        <label className="field"><span>Current qualification</span><input value={form.currentQualification??''} maxLength={120} onChange={e=>update('currentQualification',e.target.value)} placeholder="e.g. High school diploma, WAEC, A-Levels" data-testid="input-current-qualification"/></label>
        <label className="field"><span>Grades or academic background</span><input value={form.grades} onChange={e=>update('grades',e.target.value)} placeholder="Share only what feels useful" data-testid="input-grades"/></label>
        <label className="field"><span>Grading scale</span><input value={form.gradingScale??''} maxLength={60} onChange={e=>update('gradingScale',e.target.value)} placeholder="e.g. 4.0 GPA, percentage, WAEC A1–F9" data-testid="input-grading-scale"/></label>
        <label className="field"><span>Graduation year</span><select value={form.graduationYear??''} onChange={e=>setForm(c=>({...c,graduationYear:e.target.value?Number(e.target.value):null}))} data-testid="select-graduation-year"><option value="">Not sure</option>{form.graduationYear!=null&&!graduationYears.includes(form.graduationYear)&&<option value={form.graduationYear}>{form.graduationYear}</option>}{graduationYears.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
        <label className="field"><span>Preferred language</span><input value={form.preferredLanguage} onChange={e=>update('preferredLanguage',e.target.value)} placeholder="e.g. English" data-testid="input-language"/></label>
        <label className="field"><span>English test (if applicable)</span><input value={form.englishTest} onChange={e=>update('englishTest',e.target.value)} placeholder="IELTS, TOEFL, not yet taken…" data-testid="input-english-test"/></label>
        <label className="field"><span>English score (optional)</span><input value={form.englishScore} onChange={e=>update('englishScore',e.target.value)} placeholder="Add a score if you have one" data-testid="input-english-score"/></label>
        <label className="field"><span>English test date (optional)</span><input type="date" value={form.englishTestDate??''} onChange={e=>setForm(c=>({...c,englishTestDate:e.target.value||null}))} data-testid="input-english-test-date"/></label>
        <label className="field"><span>State, province, or region</span><input value={form.residenceRegion??''} maxLength={100} onChange={e=>update('residenceRegion',e.target.value)} placeholder="Helps with regional scholarships" data-testid="input-residence-region"/></label>
        <label className="field"><span>Preferred location to study</span><input value={form.preferredLocation??''} maxLength={150} onChange={e=>update('preferredLocation',e.target.value)} placeholder="City, region, or anywhere" data-testid="input-preferred-location"/></label>
        <label className="field"><span>Applicant status</span><select value={form.applicantStatus??''} onChange={e=>setForm(c=>({...c,applicantStatus:(e.target.value||undefined) as StudentProfileInput['applicantStatus']}))} data-testid="select-applicant-status"><option value="">Choose one</option><option value="domestic">Domestic</option><option value="international">International</option><option value="unsure">Not sure</option></select></label>
        <label className="field"><span>Application track</span><select value={form.admissionTrack??'unsure'} onChange={e=>setForm(c=>({...c,admissionTrack:e.target.value as NonNullable<StudentProfileInput['admissionTrack']>}))} data-testid="select-admission-track"><option value="first_year">First-year</option><option value="transfer">Transfer</option><option value="graduate">Graduate</option><option value="unsure">Not sure</option></select></label></div>
      <PreferenceFields form={form} setForm={setForm}/>
      <div className="form-footer"><span>{profile?.updatedAt?`Last updated ${new Date(profile.updatedAt).toLocaleDateString()}`:'Your information stays yours.'}</span><button className="button button-primary" disabled={save.isPending||customInvalid||pastYear} data-testid="button-save-profile">{save.isPending?<><LoaderCircle size={16} className="spin"/> Saving…</>:save.isSuccess?<><Check size={16}/> Saved</>:<>Save my profile <ArrowRight size={16}/></>}</button></div>
      {save.isError&&<p className="form-error" role="alert">We couldn’t save your profile. Please try again.</p>}{pastYear&&<p className="form-error" role="alert">Your saved start year has passed. Choose a future year before saving.</p>}{customInvalid&&<p className="form-error" role="alert">Enter a positive custom budget amount, or choose another option.</p>}{save.isSuccess&&<p className="form-footer-note"><Link href="/recommendations" className="text-link" data-testid="link-see-matches">See your matches <ArrowRight size={14}/></Link></p>}
      </form><aside className="profile-side"><div className="profile-note"><div className="note-icon"><ShieldCheck size={19}/></div><h3>Your plan should fit your life.</h3><p>Your interests and budget can help focus your exploration. Nothing here locks you into a choice.</p><Link href="/discover">Explore schools <ArrowRight size={14}/></Link><Link href="/onboarding" data-testid="link-profile-wizard">Guided setup <ArrowRight size={14}/></Link><Link href="/billing" data-testid="link-profile-billing">Billing &amp; Payments <ArrowRight size={14}/></Link></div><div className="profile-note pale"><Globe2 size={19}/><h3>Still figuring it out?</h3><p>That’s a perfectly good place to be. You can leave any field blank.</p></div></aside></div>}
  </div></Shell>;
}

function Plans() { return <Shell><PlansView/></Shell>; }

function AuthPage({ kind }: { kind:'sign-in'|'sign-up' }) {
  const { isLoaded, isSignedIn } = useUser();
  if (isLoaded && isSignedIn) return <Redirect to="/dashboard"/>;
  return <div className="auth-page"><div className="auth-side"><Brand inverse/><div><span className="eyebrow">YOUR JOURNEY STARTS HERE</span><h1>Make room for<br/><em>what’s next.</em></h1><p>Keep your plans, school shortlist, and next steps together in one calm place.</p><div className="auth-world"><Globe2 size={68}/><span>Where will curiosity take you?</span></div></div><span className="auth-legal">A supportive place to plan your next chapter.</span></div><div className="auth-panel"><Link href="/" className="auth-back"><ArrowLeft size={15}/> Back to UniPath AI</Link><div className="auth-form-wrap"><AuthFlow key={kind} mode={kind}/></div><p className="auth-footnote">By continuing, you agree to use university information as a starting point and verify all application details directly with the institution.</p></div></div>;
}
function Protected({ children }: { children: ReactNode }) {
  const [location] = useLocation(); const search = useSearch();
  const back = encodeURIComponent(location + (search ? `?${search}` : ''));
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to={`/sign-in?redirect=${back}`}/></Show></>;
}
function UserScopedQueries({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const identity = isLoaded ? user?.id ?? 'signed-out' : 'loading';
  // A new query cache and component tree for each identity prevents one student's
  // saved budget or profile from appearing briefly after switching accounts.
  const client = useMemo(() => new QueryClient(), [identity]);
  return <QueryClientProvider client={client}><Fragment key={identity}>{children}</Fragment></QueryClientProvider>;
}
function AppRoutes() {
  return <AuthProvider>
    <UserScopedQueries><Switch>
      <Route path="/" component={Home}/>
      <Route path="/sign-in/*?" component={()=> <AuthPage kind="sign-in"/>}/>
      <Route path="/sign-up/*?" component={()=> <AuthPage kind="sign-up"/>}/>
      {/* Blueprint route names, kept as aliases so existing links keep working. */}
      <Route path="/register">{()=><Redirect to="/sign-up"/>}</Route>
      <Route path="/login">{()=><Redirect to="/sign-in"/>}</Route>
      <Route path="/universities">{()=><Redirect to="/discover"/>}</Route>
      <Route path="/universities/:id">{params=><Redirect to={`/university/${encodeURIComponent(params.id)}`}/>}</Route>
      <Route path="/pricing">{()=><Redirect to="/plans"/>}</Route>
      <Route path="/assistant">{()=><Redirect to="/ai-assistant"/>}</Route>
      <Route path="/discover" component={Discover}/>
      <Route path="/compare">{()=><Shell><CompareView/></Shell>}</Route>
      <Route path="/funding">{()=><Shell><FundingFinder/></Shell>}</Route>
      <Route path="/university/:id">{params=><UniversityDetails id={params.id}/>}</Route>
      <Route path="/dashboard">{()=><Protected><Shell><DashboardView/></Shell></Protected>}</Route>
      <Route path="/saved">{()=><Protected><Shell><SavedView/></Shell></Protected>}</Route>
      <Route path="/applications">{()=><Protected><Shell><ApplicationsView/></Shell></Protected>}</Route>
      <Route path="/ai-assistant">{()=><Protected><Shell><AssistantView/></Shell></Protected>}</Route>
      <Route path="/documents">{()=><Protected><Shell><DocumentsView/></Shell></Protected>}</Route>
      <Route path="/settings">{()=><Protected><Shell><SettingsView/></Shell></Protected>}</Route>
      <Route path="/profile">{()=><Protected><Profile/></Protected>}</Route>
      <Route path="/recommendations">{()=><Protected><Shell><RecommendationsView/></Shell></Protected>}</Route>
      <Route path="/jobs">{()=><Protected><Shell><JobsView/></Shell></Protected>}</Route>
      <Route path="/plans" component={Plans}/>
      <Route path="/onboarding">{()=><Protected><Shell><OnboardingWizard/></Shell></Protected>}</Route>
      <Route path="/billing">{()=><Protected><Shell><BillingView/></Shell></Protected>}</Route>
      <Route path="/admin/billing">{()=><Protected><Shell><AdminBillingView/></Shell></Protected>}</Route>
      <Route path="/admin/setup">{()=><Protected><Shell><AdminSetupView/></Shell></Protected>}</Route>
      <Route path="/admin">{()=><Protected><Shell><AdminDashboardView/></Shell></Protected>}</Route>
      <Route><div className="not-found"><Brand/><div className="state-icon"><Compass size={22}/></div><h1>That path isn’t on the map.</h1><p>The page may have moved. Let’s find your way back.</p><Link href="/" className="button button-primary">Go home <ArrowRight size={15}/></Link></div></Route>
    </Switch></UserScopedQueries>
  </AuthProvider>;
}
function App() {
  return <TooltipProvider><WouterRouter base={basePath}><ErrorBoundary><AppRoutes/></ErrorBoundary></WouterRouter><Toaster/></TooltipProvider>;
}
export default App;
