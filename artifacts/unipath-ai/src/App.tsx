import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { DiscoverView } from '@/components/directory/DiscoverView';
import { UniversityDetailView } from '@/components/directory/UniversityDetailView';
import { FundingFinder } from '@/components/directory/FundingFinder';
import { SourceBadge } from '@/components/directory/SchoolCard';
import { InstitutionLogo, LinkedInstitutionLogo } from '@/components/directory/InstitutionLogo';
import { schoolLocation } from '@/components/directory/format';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  getGetStudentDashboardQueryKey, getGetStudentProfileQueryKey,
  getGetUniversityFilterOptionsQueryKey, getGetUniversityQueryKey,
  getListApplicationTasksQueryKey, getListSavedUniversitiesQueryKey,
  getListUniversitiesQueryKey, useCreateApplicationTask, useDeleteApplicationTask,
  useGetUniversityFilterOptions,
  useGetStudentDashboard, useGetStudentProfile, useGetUniversity, useListApplicationTasks,
  useListSavedUniversities, useListUniversities, useRemoveSavedUniversity,
  useSaveStudentProfile, useSaveUniversity, useUpdateApplicationTask,
} from '@workspace/api-client-react';
import type { ApplicationTask, StudentProfileInput, University } from '@workspace/api-client-react';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, Bookmark, Check, CheckCircle2, ChevronDown,
  Circle, Compass, ExternalLink, Globe2, GraduationCap, LayoutDashboard,
  LoaderCircle, Menu, MessageCircle, Plus, Search, ShieldCheck, Sparkles, Trash2,
  UserRound, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');

const appearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#173e62', colorForeground: '#20354a', colorMutedForeground: '#687b8c',
    colorDanger: '#b34e47', colorBackground: '#ffffff', colorInput: '#f8fafb',
    colorInputForeground: '#20354a', colorNeutral: '#dbe4e9', fontFamily: 'DM Sans, sans-serif', borderRadius: '.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#20354a] font-bold', headerSubtitle: 'text-[#687b8c]',
    socialButtonsBlockButtonText: 'text-[#20354a] font-semibold', formFieldLabel: 'text-[#324b60] font-semibold',
    footerActionLink: 'text-[#176b70] font-semibold', footerActionText: 'text-[#687b8c]',
    dividerText: 'text-[#718392]', identityPreviewEditButton: 'text-[#176b70]',
    formFieldSuccessText: 'text-[#176b70]', alertText: 'text-[#8f3834]',
    logoBox: 'mb-2', logoImage: 'max-h-10', socialButtonsBlockButton: 'border-[#dbe4e9] rounded-xl',
    formButtonPrimary: 'bg-[#173e62] hover:bg-[#245779] rounded-xl',
    formFieldInput: 'bg-[#f8fafb] border-[#dbe4e9] rounded-xl text-[#20354a]',
    footerAction: 'mt-4', dividerLine: 'bg-[#dbe4e9]', alert: 'rounded-xl',
    otpCodeFieldInput: 'rounded-lg border-[#dbe4e9]', formFieldRow: 'mb-4', main: 'gap-4',
  },
};

const cn = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' ');
const navItems = [
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/funding', label: 'Funding finder', icon: Sparkles },
  { href: '/dashboard', label: 'My plan', icon: LayoutDashboard },
  { href: '/profile', label: 'My profile', icon: UserRound },
  { href: '/assistant', label: 'Guidance', icon: MessageCircle },
  { href: '/plans', label: 'Plans', icon: Sparkles },
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
  const { signOut } = useClerk();
  const initials = user?.firstName?.slice(0, 1) || user?.primaryEmailAddress?.emailAddress?.slice(0, 1) || 'S';
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand inverse />
      <p className="side-label">YOUR SPACE</p>
      <nav className="side-nav">
        {navItems.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} data-testid={`nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} className={cn('side-link', location === item.href && 'side-link-active')}><Icon size={18}/><span>{item.label}</span>{item.label === 'Guidance' && <span className="side-new">DEMO</span>}</Link>; })}
      </nav>
      <div className="sidebar-note"><div className="note-icon"><Globe2 size={17}/></div><strong>Your world is wide open.</strong><span>One step at a time, we’ll help you find your way.</span><Link href="/discover">Explore universities <ArrowRight size={14}/></Link></div>
      {isSignedIn?<div className="side-user"><div className="user-avatar">{initials.toUpperCase()}</div><div className="user-info"><strong>{user?.firstName || 'Student'}</strong><span>Student account</span></div><button className="logout-button" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button></div>:<div className="side-user"><Link href="/sign-in" className="side-auth-link" data-testid="link-shell-sign-in">Sign in</Link><Link href="/sign-up" className="side-auth-link" data-testid="link-shell-sign-up">Create account <ArrowRight size={13}/></Link></div>}
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
function EmptyState({ icon: Icon = Compass, title, body, href, action, onAction }: { icon?: typeof Compass; title: string; body: string; href?: string; action: string; onAction?: () => void }) { return <div className="state-card"><div className="state-icon"><Icon size={22}/></div><h3>{title}</h3><p>{body}</p>{href ? <Link href={href} className="button button-primary button-small">{action} <ArrowRight size={15}/></Link> : onAction ? <button className="button button-primary button-small" onClick={onAction}>{action}</button> : null}</div>; }
function Discover() { return <Shell><DiscoverView/></Shell>; }
function UniversityDetails({ id }: { id: string }) { return <Shell><UniversityDetailView id={id}/></Shell>; }
function Dashboard() {
  const summary=useGetStudentDashboard({query:{queryKey:getGetStudentDashboardQueryKey()}}); const saved=useListSavedUniversities({query:{queryKey:getListSavedUniversitiesQueryKey()}}); const tasks=useListApplicationTasks({query:{queryKey:getListApplicationTasksQueryKey()}}); const create=useCreateApplicationTask(); const update=useUpdateApplicationTask(); const remove=useRemoveSavedUniversity(); const del=useDeleteApplicationTask(); const qc=useQueryClient(); const [taskTitle,setTaskTitle]=useState(''); const [taskDate,setTaskDate]=useState(''); const [showAdd,setShowAdd]=useState(false);
  const refresh=()=>{void qc.invalidateQueries({queryKey:getListApplicationTasksQueryKey()});void qc.invalidateQueries({queryKey:getGetStudentDashboardQueryKey()});};
  const addTask=(e:FormEvent)=>{e.preventDefault(); if(!taskTitle.trim()||!taskDate)return;create.mutate({data:{title:taskTitle.trim(),dueDate:taskDate,universityId:''}},{onSuccess:()=>{setTaskTitle('');setTaskDate('');setShowAdd(false);refresh();}});};
  const busy=summary.isLoading||saved.isLoading||tasks.isLoading;
  return <Shell><div className="page page-enter"><PageHeading kicker="YOUR JOURNEY, YOUR PACE" title="A plan that’s yours." body="A few small steps can take you somewhere wonderful." action={<Link href="/discover" className="button button-primary button-small"><Compass size={15}/> Explore schools</Link>}/>
    {busy?<LoadingState/>:summary.isError||saved.isError||tasks.isError?<ErrorState retry={()=>{void summary.refetch();void saved.refetch();void tasks.refetch();}}/>:<>
    <div className="summary-grid"><div className="summary-card summary-feature"><span className="summary-label">SCHOOLS YOU’RE CONSIDERING</span><strong data-testid="text-saved-count">{summary.data?.savedCount ?? saved.data?.length ?? 0}</strong><span>Good things start with curiosity.</span><Bookmark size={20}/></div><div className="summary-card"><span className="summary-label">OPEN STEPS</span><strong data-testid="text-open-tasks">{summary.data?.openTasks ?? 0}</strong><span>One at a time is just right.</span><Circle size={19}/></div><div className="summary-card"><span className="summary-label">COMPLETED STEPS</span><strong data-testid="text-completed-tasks">{summary.data?.completedTasks ?? 0}</strong><span>Look how far you’ve come.</span><CheckCircle2 size={20}/></div></div>
    <div className="dashboard-columns"><section className="content-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR SHORTLIST</span><h2>Schools on your mind</h2></div><Link href="/discover" className="text-link">Find more <ArrowRight size={15}/></Link></div>
      {saved.data?.length?<div className="saved-list">{saved.data.map(entry=><div className="saved-row" key={entry.universityId} data-testid={`saved-university-${entry.universityId}`}><InstitutionLogo school={entry.university} size="small" className="saved-mark"/><div className="saved-name"><strong>{entry.university.name}</strong><span>{schoolLocation(entry.university)}</span></div><SourceBadge school={entry.university}/><Link href={`/university/${entry.universityId}`} className="icon-button" aria-label="View details"><ArrowRight size={17}/></Link><button className="icon-button remove-icon" onClick={()=>remove.mutate({universityId:entry.universityId},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getListSavedUniversitiesQueryKey()});refresh();}})} aria-label="Remove saved university" data-testid={`button-remove-school-${entry.universityId}`}><X size={17}/></button></div>)}</div>:<EmptyState icon={Bookmark} title="Your shortlist starts here" body="Save schools that catch your eye and compare them as your plans take shape." href="/discover" action="Explore schools"/>}</section>
    <section className="content-panel tasks-panel"><div className="panel-heading"><div><span className="eyebrow">LITTLE BY LITTLE</span><h2>Next steps</h2></div><button className="icon-button add-task-button" onClick={()=>setShowAdd(!showAdd)} aria-label="Add a task" data-testid="button-add-task">{showAdd?<X size={18}/>:<Plus size={18}/>}</button></div>
      {showAdd&&<form className="add-task-form" onSubmit={addTask}><input required value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="What would you like to do?" data-testid="input-task-title"/><input required type="date" value={taskDate} onChange={e=>setTaskDate(e.target.value)} data-testid="input-task-date"/><button className="button button-primary button-small" disabled={create.isPending} data-testid="button-save-task">{create.isPending?'Adding…':'Add step'}</button>{create.isError&&<p className="form-error">Couldn’t add this step. Please try again.</p>}</form>}
      {tasks.data?.length?<div className="task-list">{tasks.data.map((task:ApplicationTask)=><div className={cn('task-row',task.completed&&'task-complete')} key={task.id} data-testid={`task-${task.id}`}><button className="task-check" aria-label={task.completed?'Mark incomplete':'Mark complete'} onClick={()=>update.mutate({id:task.id,data:{completed:!task.completed}},{onSuccess:refresh})} data-testid={`button-complete-task-${task.id}`}>{task.completed?<CheckCircle2 size={19}/>:<Circle size={19}/>}</button>{task.universityId && <LinkedInstitutionLogo id={task.universityId}/>}<div className="task-copy"><strong>{task.title}</strong><span>{task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`:'No due date set'}</span></div><button className="icon-button task-delete" aria-label="Delete task" onClick={()=>del.mutate({id:task.id},{onSuccess:refresh})} data-testid={`button-delete-task-${task.id}`}><Trash2 size={15}/></button></div>)}</div>:<EmptyState icon={CheckCircle2} title="Room for your first step" body="Add a task you want to remember, like exploring entry requirements or asking for a recommendation." action=""/>}</section></div>
     <div className="dashboard-footnote"><ShieldCheck size={16}/> School records come from imported official sources (partial U.S. and Canada coverage); verify cost, admissions, and program details with each institution.</div></>}</div></Shell>;
 }

const profileDefaults: StudentProfileInput = {
  residenceCountry: '', citizenship: '', studyCountry: '', degreeLevel: '',
  major: '', grades: '', annualBudgetUsd: 0, preferredLanguage: '', englishTest: '', englishScore: '',
};
function Profile() {
  const profileQuery=useGetStudentProfile({query:{queryKey:getGetStudentProfileQueryKey()}}); const save=useSaveStudentProfile(); const qc=useQueryClient();
  const profile=profileQuery.data?.profile;
  const [form,setForm]=useState<StudentProfileInput>(profileDefaults);
  const [initialized,setInitialized]=useState(false);
  useEffect(()=>{if(profile&&!initialized){setForm({...profile});setInitialized(true);}},[profile,initialized]);
  const update=(key:keyof StudentProfileInput,value:string|number)=>setForm(current=>({...current,[key]:value} as StudentProfileInput));
  const submit=(e:FormEvent)=>{e.preventDefault();save.mutate({data:{...form,annualBudgetUsd:Number(form.annualBudgetUsd)||0}},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getGetStudentProfileQueryKey()});}});};
  return <Shell><div className="page page-enter"><PageHeading kicker="START WITH YOU" title="Your story, your way." body="Share a little about what you’re looking for. You can change any of this whenever you like."/>
    {profileQuery.isLoading?<LoadingState/>:profileQuery.isError?<ErrorState retry={()=>void profileQuery.refetch()}/>:<div className="profile-layout"><form className="profile-form content-panel" onSubmit={submit}>
      <div className="form-section-title"><div className="profile-icon"><UserRound size={20}/></div><div><h2>About you</h2><p>These details help keep your plans grounded in what matters.</p></div></div>
      <div className="form-grid"><label className="field"><span>Where do you live?</span><input value={form.residenceCountry} onChange={e=>update('residenceCountry',e.target.value)} placeholder="Your country of residence" data-testid="input-residence-country"/></label>
        <label className="field"><span>Citizenship</span><input value={form.citizenship} onChange={e=>update('citizenship',e.target.value)} placeholder="Country or countries" data-testid="input-citizenship"/></label>
        <label className="field"><span>Where might you study?</span><input value={form.studyCountry} onChange={e=>update('studyCountry',e.target.value)} placeholder="Any country, or still exploring" data-testid="input-study-country"/></label>
        <label className="field"><span>Degree level</span><select value={form.degreeLevel} onChange={e=>update('degreeLevel',e.target.value)} data-testid="select-profile-degree"><option value="">Choose a level</option>{['Bachelor','Master','Doctorate','Undergraduate','Graduate'].map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="field"><span>What would you like to study?</span><input value={form.major} onChange={e=>update('major',e.target.value)} placeholder="A subject, field, or idea" data-testid="input-major"/></label>
        <label className="field"><span>Grades or academic background</span><input value={form.grades} onChange={e=>update('grades',e.target.value)} placeholder="Share only what feels useful" data-testid="input-grades"/></label>
        <label className="field"><span>Preferred language</span><input value={form.preferredLanguage} onChange={e=>update('preferredLanguage',e.target.value)} placeholder="e.g. English" data-testid="input-language"/></label>
        <label className="field"><span>English test (if applicable)</span><input value={form.englishTest} onChange={e=>update('englishTest',e.target.value)} placeholder="IELTS, TOEFL, not yet taken…" data-testid="input-english-test"/></label>
        <label className="field"><span>English score (optional)</span><input value={form.englishScore} onChange={e=>update('englishScore',e.target.value)} placeholder="Add a score if you have one" data-testid="input-english-score"/></label></div>
      <div className="form-footer"><span>{profile?.updatedAt?`Last updated ${new Date(profile.updatedAt).toLocaleDateString()}`:'Your information stays yours.'}</span><button className="button button-primary" disabled={save.isPending} data-testid="button-save-profile">{save.isPending?<><LoaderCircle size={16} className="spin"/> Saving…</>:save.isSuccess?<><Check size={16}/> Saved</>:<>Save my profile <ArrowRight size={16}/></>}</button></div>
      {save.isError&&<p className="form-error" role="alert">We couldn’t save your profile. Please try again.</p>}
      </form><aside className="profile-side"><div className="profile-note"><div className="note-icon"><ShieldCheck size={19}/></div><h3>Your plan should fit your life.</h3><p>Your interests and budget can help focus your exploration. Nothing here locks you into a choice.</p><Link href="/discover">Explore schools <ArrowRight size={14}/></Link></div><div className="profile-note pale"><Globe2 size={19}/><h3>Still figuring it out?</h3><p>That’s a perfectly good place to be. You can leave any field blank.</p></div></aside></div>}
  </div></Shell>;
}

function Assistant() {
  const prompts=['What should I do first?','How do I compare schools?','What belongs on my application checklist?'];
  const answers=[
    'Start with what you already know: a subject that interests you, a few places you might live, or a field and degree level you prefer. Then search the institution directory (partial U.S. and Canada coverage) and save anything worth a second look. You do not need to decide everything today.',
    'Choose a few priorities before comparing: program fit, location, degree level, and student support are useful starting points. Browse reported programs where available, then use official school admissions and financial aid pages to verify requirements and funding opportunities.',
    'Most application journeys include researching requirements, preparing transcripts, planning language tests if needed, requesting recommendations, and drafting personal materials. Requirements vary widely—use each school’s official admissions page as your source of truth.',
  ];
  const [selected,setSelected]=useState<number|null>(null);
  return <Shell><div className="page page-enter"><PageHeading kicker="A CALM PLACE TO THINK" title="Let’s make it clearer." body="A little guidance for the next part of your journey."/>
    <div className="assistant-alert"><div className="assistant-alert-icon"><MessageCircle size={19}/></div><div><strong>Guidance demo — live AI is not connected.</strong><p>The responses below are prepared examples, not generated advice. Review all application materials carefully and confirm requirements with each university.</p></div></div>
    <div className="assistant-layout"><section className="assistant-main"><div className="assistant-welcome"><div className="assistant-spark"><Sparkles size={21}/></div><div><span className="eyebrow">A GOOD PLACE TO BEGIN</span><h2>What’s on your mind?</h2><p>Pick a question to see an example of the kind of guidance you might find useful.</p></div></div>
      <div className="prompt-list">{prompts.map((prompt,i)=><button className={cn('prompt-button',selected===i&&'prompt-selected')} onClick={()=>setSelected(i)} key={prompt} data-testid={`button-prompt-${i}`}><span>{prompt}</span><ArrowRight size={17}/></button>)}</div>
      {selected!==null&&<div className="assistant-answer page-enter"><div className="answer-label"><Sparkles size={15}/> SAMPLE RESPONSE</div><p>{answers[selected]}</p><span className="answer-caveat">Example only · not live AI advice</span></div>}
      <div className="assistant-input-ghost"><span>Live AI guidance is not available in this demo.</span><button disabled aria-label="Send message"><ArrowRight size={17}/></button></div>
    </section><aside className="assistant-sidebar"><div className="assistant-side-card"><span className="eyebrow">KEEP IN MIND</span><ul><li><Check size={15}/> Requirements vary by university.</li><li><Check size={15}/> Tuition and admissions details are not in this directory.</li><li><Check size={15}/> You are responsible for reviewing every document.</li></ul><Link href="/discover">Search the directory <ArrowRight size={14}/></Link></div><div className="assistant-side-note"><ShieldCheck size={18}/><p>For accurate application guidance, contact the university’s admissions office.</p></div></aside></div>
  </div></Shell>;
}

function Plans() {
  const tiers=[
    {name:'Free',price:'$0',period:'forever',desc:'A thoughtful first step.',items:['Explore U.S. college listings','Save schools to your plan','Build a personal application checklist'],accent:false},
    {name:'Student Plus',price:'$9.99',period:'/ month',desc:'More structure for your journey.',items:['Everything in Free','Advanced university comparisons','Application planning tools'],accent:true},
    {name:'Premium',price:'$29.99',period:'/ month',desc:'Extra support as applications take shape.',items:['Essay brainstorming and feedback','Document checklist','Personalized application guidance'],accent:false},
  ];
  return <Shell><div className="page page-enter"><PageHeading kicker="PLANS THAT MEET YOU WHERE YOU ARE" title="Support for every step." body="Start exploring for free. Choose the kind of support that feels right for you."/>
    <div className="plans-callout"><ShieldCheck size={17}/><span>Plans are informational only. Checkout, payment collection, and subscriptions are not available in this demo.</span></div>
    <div className="plans-grid">{tiers.map((tier,i)=><article className={cn('plan-card',tier.accent&&'plan-featured')} key={tier.name} data-testid={`plan-${tier.name.toLowerCase().replaceAll(' ','-')}`}><div className="plan-top">{tier.accent&&<span className="popular-label">A LITTLE MORE SUPPORT</span>}<span className="eyebrow">{tier.name.toUpperCase()}</span><h2>{tier.price}<small>{tier.period}</small></h2><p>{tier.desc}</p></div><div className="plan-items">{tier.items.map(item=><div key={item}><Check size={15}/>{item}</div>)}</div><button className={cn('button',tier.accent?'button-primary':'button-outline')} disabled data-testid={`button-plan-${i}`}>{i===0?'Current demo tier':'Checkout unavailable'}</button></article>)}</div>
     <div className="support-plan"><div><span className="eyebrow">HUMAN SUPPORT</span><h2>Application Support</h2><p>Sample packages and prices for planning only.</p><div className="support-packages"><div><strong>Application Roadmap</strong><span>Shortlist and next-step plan</span><b>$99</b></div><div><strong>Essay Review</strong><span>Feedback on one draft</span><b>$199</b></div><div><strong>Full Application Support</strong><span>Multi-school planning and document review</span><b>$299</b></div></div></div><button className="button button-outline" disabled data-testid="button-application-support">Not available in demo</button></div>
    <p className="plans-footnote">No payment details are collected. Pricing and plan features are illustrative and may change. UniPath AI does not guarantee admission or replace official university guidance.</p>
  </div></Shell>;
}

function AuthPage({ kind }: { kind:'sign-in'|'sign-up' }) {
  return <div className="auth-page"><div className="auth-side"><Brand inverse/><div><span className="eyebrow">YOUR JOURNEY STARTS HERE</span><h1>Make room for<br/><em>what’s next.</em></h1><p>Keep your plans, school shortlist, and next steps together in one calm place.</p><div className="auth-world"><Globe2 size={68}/><span>Where will curiosity take you?</span></div></div><span className="auth-legal">A supportive place to plan your next chapter.</span></div><div className="auth-panel"><Link href="/" className="auth-back"><ArrowLeft size={15}/> Back to UniPath AI</Link><div className="auth-form-wrap">{kind==='sign-in'?<SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/>:<SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/>}</div><p className="auth-footnote">By continuing, you agree to use university information as a starting point and verify all application details directly with the institution.</p></div></div>;
}
function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/"/></Show></>;
}
function ClerkRoutes() {
  const [,setLocation]=useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{signIn:{start:{title:'Welcome back',subtitle:'Pick up where your plans left off'}},signUp:{start:{title:'Your next chapter starts here',subtitle:'Create an account to make your plan yours'}}}}
    routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    <Switch>
      <Route path="/" component={Home}/>
      <Route path="/sign-in/*?" component={()=> <AuthPage kind="sign-in"/>}/>
      <Route path="/sign-up/*?" component={()=> <AuthPage kind="sign-up"/>}/>
      <Route path="/discover" component={Discover}/>
      <Route path="/funding">{()=><Shell><FundingFinder/></Shell>}</Route>
      <Route path="/university/:id">{params=><UniversityDetails id={params.id}/>}</Route>
      <Route path="/dashboard">{()=><Protected><Dashboard/></Protected>}</Route>
      <Route path="/profile">{()=><Protected><Profile/></Protected>}</Route>
      <Route path="/assistant">{()=><Protected><Assistant/></Protected>}</Route>
      <Route path="/plans" component={Plans}/>
      <Route><div className="not-found"><Brand/><div className="state-icon"><Compass size={22}/></div><h1>That path isn’t on the map.</h1><p>The page may have moved. Let’s find your way back.</p><Link href="/" className="button button-primary">Go home <ArrowRight size={15}/></Link></div></Route>
    </Switch>
  </ClerkProvider>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ErrorBoundary><ClerkRoutes/></ErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
