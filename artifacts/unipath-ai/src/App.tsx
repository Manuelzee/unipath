import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
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
    {marketing && <div className="sample-strip"><ShieldCheck size={14}/> U.S. college listings use NCES IPEDS and College Scorecard data; figures show their reporting year.</div>}
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
     <section className="home-disclaimer"><ShieldCheck size={18}/><div><strong>A note about our U.S. college directory</strong><p>Active institution records come from NCES IPEDS and the U.S. Department of Education College Scorecard. Tuition, admissions, completion, and aid figures appear only when reported, with a reporting year. Confirm current program and application details with each school.</p></div></section>
    <Footer/>
  </div>;
}

function Footer() { return <footer className="footer"><Brand/><span>Thoughtful steps toward somewhere new.</span><div><Link href="/discover">Explore</Link><Link href="/plans">Plans</Link><Link href="/sign-up">Create account</Link></div><small>© 2026 UniPath AI. College directory sources: NCES IPEDS and U.S. Department of Education College Scorecard.</small></footer>; }
function PageHeading({ kicker, title, body, action }: { kicker: string; title: string; body?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1>{body && <p>{body}</p>}</div>{action}</div>;
}
function LoadingState() { return <div className="loading-stack" aria-label="Loading"><div className="skeleton skeleton-line"/><div className="skeleton skeleton-card"/><div className="skeleton skeleton-card"/></div>; }
function ErrorState({ retry }: { retry: () => void }) { return <div className="state-card"><div className="state-icon warning"><Globe2 size={21}/></div><h3>We couldn’t load this just now</h3><p>Give it another try. Your progress is still here.</p><button className="button button-primary button-small" onClick={retry} data-testid="button-retry">Try again</button></div>; }
function EmptyState({ icon: Icon = Compass, title, body, href, action, onAction }: { icon?: typeof Compass; title: string; body: string; href?: string; action: string; onAction?: () => void }) { return <div className="state-card"><div className="state-icon"><Icon size={22}/></div><h3>{title}</h3><p>{body}</p>{href ? <Link href={href} className="button button-primary button-small">{action} <ArrowRight size={15}/></Link> : onAction ? <button className="button button-primary button-small" onClick={onAction}>{action}</button> : null}</div>; }
const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
  ['AS','American Samoa'],['GU','Guam'],['MP','Northern Mariana Islands'],['PR','Puerto Rico'],['VI','U.S. Virgin Islands'],['FM','Federated States of Micronesia'],['MH','Marshall Islands'],['PW','Palau'],
] as const;
const STATE_NAMES = new Map<string, string>(US_STATES.map(([code, name]) => [code, name] as const));
function schoolLocation(school: University) {
  const state = STATE_NAMES.get(school.state) || school.state;
  return [school.city, state].filter(Boolean).join(', ') || school.country;
}
function ListingBadge({ school }: { school: University }) {
  const synced = new Date(school.lastUpdatedAt).toLocaleDateString();
  const source = school.dataSource.includes('College Scorecard') ? 'IPEDS + Scorecard' : 'NCES IPEDS';
  return <span className="sample-badge official-badge"><span/>{source} · {synced}</span>;
}
function formatMoney(amount: number | null, year: number | null) {
  if (amount == null) return 'Not reported';
  return `$${amount.toLocaleString()}${year ? ` · ${year}` : ''}`;
}
function formatRate(rate: number | null, year: number | null) {
  if (rate == null) return 'Not reported';
  return `${(rate * 100).toFixed(1)}%${year ? ` · ${year}` : ''}`;
}
function UniversityCard({ school, saved = false, onSave, saving = false }: { school: University; saved?: boolean; onSave?: () => void; saving?: boolean }) {
  return <article className="school-card" data-testid={`card-university-${school.id}`}>
    <div className={`school-cover cover-${school.id.length % 4}`}><span className="cover-monogram">{school.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span><span className="cover-country"><Globe2 size={13}/>{STATE_NAMES.get(school.state) || school.country}</span><ListingBadge school={school}/></div>
    <div className="school-content"><div className="school-location">{schoolLocation(school)}</div><h3>{school.name}</h3><p className="school-meta">{school.institutionType} · {school.ownership || 'Ownership not reported'}</p>
      <div className="school-tags">{school.degreeLevels?.map(level => <span key={level}>{level}</span>)}</div>
      <div className="school-bottom"><div className="school-costs"><span>In-state<strong>{school.tuitionInStateUsd == null ? 'Not reported' : formatMoney(school.tuitionInStateUsd, school.tuitionInStateYear)}</strong></span><span>Out-of-state<strong>{school.tuitionOutOfStateUsd == null ? 'Not reported' : formatMoney(school.tuitionOutOfStateUsd, school.tuitionOutOfStateYear)}</strong></span></div><Link href={`/university/${school.id}`} className="school-view" data-testid={`link-university-${school.id}`}>Details <ArrowRight size={15}/></Link></div>
      {onSave && <button className={cn('save-chip', saved && 'save-chip-active')} onClick={onSave} disabled={saving} data-testid={`button-save-${school.id}`} aria-label={saved ? 'Remove saved university' : 'Save university'}>{saving ? <LoaderCircle className="spin" size={15}/> : saved ? <><Check size={14}/> Saved</> : <><Bookmark size={14}/> Save</>}</button>}
    </div>
  </article>;
}
function Discover() {
  const [search, setSearch] = useState(''); const [state, setState] = useState(''); const [institutionType, setInstitutionType] = useState(''); const [ownership, setOwnership] = useState(''); const [degreeLevel, setDegreeLevel] = useState(''); const [major, setMajor] = useState(''); const [maxTuition, setMaxTuition] = useState(''); const [tuitionResidency, setTuitionResidency] = useState<'in_state' | 'out_of_state'>('in_state'); const [page, setPage] = useState(1);
  const { isSignedIn } = useUser(); const [, setLocation] = useLocation(); const pageSize = 24;
  const filterOptions = useGetUniversityFilterOptions({ query: { queryKey: getGetUniversityFilterOptionsQueryKey() } });
  const params = useMemo(() => ({ page, pageSize, ...(search ? { search } : {}), ...(state ? { state } : {}), ...(institutionType ? { institutionType } : {}), ...(ownership ? { ownership } : {}), ...(degreeLevel ? { degreeLevel } : {}), ...(major ? { major } : {}), ...(maxTuition !== '' ? { maxTuition: Number(maxTuition), tuitionResidency } : {}) }), [page, pageSize, search, state, institutionType, ownership, degreeLevel, major, maxTuition, tuitionResidency]);
  const results = useListUniversities(params, { query: { queryKey: getListUniversitiesQueryKey(params) } }); const saved = useListSavedUniversities({ query: { enabled: !!isSignedIn, queryKey: getListSavedUniversitiesQueryKey() } }); const save = useSaveUniversity(); const remove = useRemoveSavedUniversity(); const qc = useQueryClient();
  const savedIds = new Set((saved.data || []).map(s => s.universityId));
  const total = results.data?.total ?? 0; const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clearFilters = () => { setSearch(''); setState(''); setInstitutionType(''); setOwnership(''); setDegreeLevel(''); setMajor(''); setMaxTuition(''); setTuitionResidency('in_state'); setPage(1); };
  const saveSchool = (school: University) => {
    if (!isSignedIn) { setLocation('/sign-up'); return; }
    const onSuccess=()=>{void qc.invalidateQueries({queryKey:getListSavedUniversitiesQueryKey()});void qc.invalidateQueries({queryKey:getGetStudentDashboardQueryKey()});};
    if (savedIds.has(school.id)) remove.mutate({ universityId: school.id }, { onSuccess });
    else save.mutate({ data: { universityId: school.id } }, { onSuccess });
  };
  const refreshedAt = results.data?.items[0]?.lastUpdatedAt;
  return <Shell><div className="page page-enter"><PageHeading kicker="U.S. COLLEGE DIRECTORY" title="Find a college in the United States." body="Search active U.S. postsecondary institutions and compare official data where it is available."/>
    <div className="data-notice"><ShieldCheck size={17}/><span><strong>NCES IPEDS + College Scorecard.</strong> Tuition, admissions, completion, aid, and program information are shown only when reported. Each statistic includes its reporting year; missing values are not estimated. This data does not indicate whether applications are currently open.</span></div>
    <div className="search-panel"><label className="search-main"><Search size={18}/><input value={search} onChange={e => {setSearch(e.target.value);setPage(1);}} placeholder="Search by school name, city, state, or institution type" data-testid="input-university-search"/></label>
      <div className="filter-grid college-filter-grid">
        <label><span>STATE OR TERRITORY</span><select value={state} onChange={e => {setState(e.target.value);setPage(1);}} data-testid="select-state"><option value="">All states and territories</option>{US_STATES.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select><ChevronDown size={15}/></label>
        <label><span>INSTITUTION TYPE</span><select value={institutionType} onChange={e => {setInstitutionType(e.target.value);setPage(1);}} data-testid="select-institution-type"><option value="">All institution types</option>{filterOptions.data?.institutionTypes.map(type=><option key={type} value={type}>{type}</option>)}</select><ChevronDown size={15}/></label>
        <label><span>PUBLIC OR PRIVATE</span><select value={ownership} onChange={e => {setOwnership(e.target.value);setPage(1);}} data-testid="select-ownership"><option value="">All ownership types</option>{filterOptions.data?.ownerships.map(value=><option key={value} value={value}>{value}</option>)}</select><ChevronDown size={15}/></label>
        <label><span>DEGREE LEVEL</span><select value={degreeLevel} onChange={e => {setDegreeLevel(e.target.value);setPage(1);}} data-testid="select-degree-level"><option value="">All degree levels</option>{filterOptions.data?.degreeLevels.map(value=><option key={value} value={value}>{value}</option>)}</select><ChevronDown size={15}/></label>
        <label><span>INTENDED MAJOR</span><select value={major} onChange={e => {setMajor(e.target.value);setPage(1);}} data-testid="select-major"><option value="">All reported fields of study</option>{filterOptions.data?.majors.map(value=><option key={value} value={value}>{value}</option>)}</select><ChevronDown size={15}/></label>
        <label><span>MAX TUITION BUDGET (USD)</span><input type="number" min="0" step="500" value={maxTuition} onChange={e => {setMaxTuition(e.target.value);setPage(1);}} placeholder="No limit" data-testid="input-tuition-budget"/></label>
        <label><span>BUDGET APPLIES TO</span><select value={tuitionResidency} onChange={e => {setTuitionResidency(e.target.value as 'in_state' | 'out_of_state');setPage(1);}} data-testid="select-tuition-residency"><option value="in_state">In-state tuition</option><option value="out_of_state">Out-of-state tuition</option></select><ChevronDown size={15}/></label>
      </div></div>
    <div className="results-header"><div><h2>Colleges and universities</h2><p>{total.toLocaleString()} active institutions in the directory</p></div><span className="results-caption"><Globe2 size={15}/> NCES IPEDS + College Scorecard{refreshedAt ? ` · refreshed ${new Date(refreshedAt).toLocaleDateString()}` : ''}</span></div>
    {results.isLoading ? <LoadingState/> : results.isError ? <ErrorState retry={() => void results.refetch()}/> : results.data?.items.length ? <div className="school-grid">{results.data.items.map(school=><UniversityCard key={school.id} school={school} saved={savedIds.has(school.id)} saving={save.isPending || remove.isPending} onSave={()=>saveSchool(school)}/>)}</div> : <EmptyState title="No matches found" body="Try a different search term or clear your filters to browse the full directory." action="Clear search and filters" onAction={clearFilters}/>}
    {total > 0 && <div className="pagination-bar"><button className="button button-outline button-small" onClick={()=>setPage(current=>Math.max(1,current-1))} disabled={page<=1 || results.isFetching}><ArrowLeft size={14}/> Previous</button><span>Page {page} of {totalPages}</span><button className="button button-outline button-small" onClick={()=>setPage(current=>Math.min(totalPages,current+1))} disabled={page>=totalPages || results.isFetching}>Next <ArrowRight size={14}/></button></div>}
  </div></Shell>;
}
function UniversityDetails({ id }: { id: string }) {
  const q = useGetUniversity(id, { query: { queryKey: getGetUniversityQueryKey(id) } }); const {isSignedIn}=useUser(); const [,setLocation]=useLocation(); const save = useSaveUniversity(); const saved = useListSavedUniversities({query:{enabled:!!isSignedIn,queryKey:getListSavedUniversitiesQueryKey()}}); const remove = useRemoveSavedUniversity(); const qc = useQueryClient();
  const isSaved = (saved.data || []).some(x=>x.universityId===id);
  const toggle = () => { if(!isSignedIn){setLocation('/sign-up');return;} if(isSaved) remove.mutate({universityId:id},{onSuccess:()=>void qc.invalidateQueries({queryKey:getListSavedUniversitiesQueryKey()})}); else if(q.data) save.mutate({data:{universityId:id}},{onSuccess:()=>void qc.invalidateQueries({queryKey:getListSavedUniversitiesQueryKey()})}); };
  if(q.isLoading) return <Shell><div className="page"><LoadingState/></div></Shell>;
  if(q.isError || !q.data) return <Shell><div className="page"><ErrorState retry={()=>void q.refetch()}/></div></Shell>;
  const school=q.data;
  const metrics = [
    school.tuitionInStateUsd != null ? { label: 'In-state annual tuition', value: formatMoney(school.tuitionInStateUsd, school.tuitionInStateYear) } : null,
    school.tuitionOutOfStateUsd != null ? { label: 'Out-of-state annual tuition', value: formatMoney(school.tuitionOutOfStateUsd, school.tuitionOutOfStateYear) } : null,
    school.admissionRate != null ? { label: 'Admission rate', value: formatRate(school.admissionRate, school.admissionRateYear) } : null,
    school.completionRate != null ? { label: school.completionRateType || 'Completion rate', value: formatRate(school.completionRate, school.completionRateYear) } : null,
    school.pellGrantRate != null ? { label: 'Students receiving Pell Grants', value: formatRate(school.pellGrantRate, school.pellGrantRateYear) } : null,
    school.medianDebtUsd != null ? { label: 'Median debt for completers', value: formatMoney(school.medianDebtUsd, school.medianDebtYear) } : null,
  ].filter((metric): metric is { label: string; value: string } => metric !== null);
  return <Shell><div className="page page-enter"><Link href="/discover" className="back-link"><ArrowLeft size={16}/> Back to explore</Link>
      <div className="detail-hero"><div className={`detail-monogram cover-${school.id.length%4}`}>{school.name.split(' ').map(w=>w[0]).slice(0,2).join('')}</div><div><ListingBadge school={school}/><p className="school-location detail-location">{schoolLocation(school)}</p><h1>{school.name}</h1><p className="detail-subtitle">{school.institutionType} · {school.ownership || 'Ownership not reported'}</p></div><button className={cn('button',isSaved?'button-outline':'button-primary')} onClick={toggle} data-testid="button-save-university">{isSaved?<Check size={16}/>:<Bookmark size={16}/>} {isSaved?'Saved to my plan':'Save to my plan'}</button></div>
      <div className="detail-notice"><ShieldCheck size={18}/><span>Official reporting data only. Reporting years appear beside each figure and may differ by measure. This directory does not verify current admissions requirements, program availability, or whether applications are open.</span></div>
      <div className="detail-columns"><div className="detail-main">
        <section className="detail-panel"><span className="eyebrow">INSTITUTION & DEGREES</span><div className="fact-grid"><div><span>Institution type</span><strong>{school.institutionType}</strong></div><div><span>Ownership</span><strong>{school.ownership || 'Not reported'}</strong></div><div><span>Degree levels</span><strong>{school.degreeLevels.join(', ') || 'Not reported'}</strong></div><div><span>Reported credentials</span><strong>{school.degreeTypes.join(', ') || 'Not available in Scorecard'}</strong></div></div>
          {school.majors.length > 0 && <details className="programs-accordion"><summary>Fields of study in College Scorecard ({school.majors.length})</summary><div className="programs-list">{school.majors.map(value=><span key={value}>{value}</span>)}</div></details>}
        </section>
        {metrics.length > 0 && <section className="detail-panel"><span className="eyebrow">COST, ADMISSIONS & OUTCOMES</span><div className="metric-grid">{metrics.map(metric=><div className="metric-item" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div><p className="metric-footnote">Figures are from the U.S. Department of Education College Scorecard. Tuition is tuition and required fees; completion rates use the cohort and time limit named above.</p></section>}
      </div>
      <aside className="detail-aside"><div className="detail-panel source-panel"><span className="eyebrow">SOURCE & DATA</span><p>{school.dataSource}</p><div className="source-meta"><span>IPEDS directory year</span><strong>{school.dataYear || 'College Scorecard record'}</strong></div><div className="source-meta"><span>Directory synced</span><strong>{new Date(school.lastUpdatedAt).toLocaleDateString()}</strong></div>{school.website && <a href={school.website} target="_blank" rel="noreferrer" className="source-link">Official school website <ExternalLink size={14}/></a>}{school.admissionsWebsite && <a href={school.admissionsWebsite} target="_blank" rel="noreferrer" className="source-link">Admissions website <ExternalLink size={14}/></a>}<a href={school.sourceUrl} target="_blank" rel="noreferrer" className="source-link">Official institution source record <ExternalLink size={14}/></a></div><div className="tip-card"><Sparkles size={19}/><strong>Keep it personal</strong><p>Compare this school against your priorities, location, and goals.</p><Link href="/profile">Update my profile <ArrowRight size={14}/></Link></div></aside></div></div></Shell>;
}
function Dashboard() {
  const summary=useGetStudentDashboard({query:{queryKey:getGetStudentDashboardQueryKey()}}); const saved=useListSavedUniversities({query:{queryKey:getListSavedUniversitiesQueryKey()}}); const tasks=useListApplicationTasks({query:{queryKey:getListApplicationTasksQueryKey()}}); const create=useCreateApplicationTask(); const update=useUpdateApplicationTask(); const remove=useRemoveSavedUniversity(); const del=useDeleteApplicationTask(); const qc=useQueryClient(); const [taskTitle,setTaskTitle]=useState(''); const [taskDate,setTaskDate]=useState(''); const [showAdd,setShowAdd]=useState(false);
  const refresh=()=>{void qc.invalidateQueries({queryKey:getListApplicationTasksQueryKey()});void qc.invalidateQueries({queryKey:getGetStudentDashboardQueryKey()});};
  const addTask=(e:FormEvent)=>{e.preventDefault(); if(!taskTitle.trim()||!taskDate)return;create.mutate({data:{title:taskTitle.trim(),dueDate:taskDate,universityId:''}},{onSuccess:()=>{setTaskTitle('');setTaskDate('');setShowAdd(false);refresh();}});};
  const busy=summary.isLoading||saved.isLoading||tasks.isLoading;
  return <Shell><div className="page page-enter"><PageHeading kicker="YOUR JOURNEY, YOUR PACE" title="A plan that’s yours." body="A few small steps can take you somewhere wonderful." action={<Link href="/discover" className="button button-primary button-small"><Compass size={15}/> Explore schools</Link>}/>
    {busy?<LoadingState/>:summary.isError||saved.isError||tasks.isError?<ErrorState retry={()=>{void summary.refetch();void saved.refetch();void tasks.refetch();}}/>:<>
    <div className="summary-grid"><div className="summary-card summary-feature"><span className="summary-label">SCHOOLS YOU’RE CONSIDERING</span><strong data-testid="text-saved-count">{summary.data?.savedCount ?? saved.data?.length ?? 0}</strong><span>Good things start with curiosity.</span><Bookmark size={20}/></div><div className="summary-card"><span className="summary-label">OPEN STEPS</span><strong data-testid="text-open-tasks">{summary.data?.openTasks ?? 0}</strong><span>One at a time is just right.</span><Circle size={19}/></div><div className="summary-card"><span className="summary-label">COMPLETED STEPS</span><strong data-testid="text-completed-tasks">{summary.data?.completedTasks ?? 0}</strong><span>Look how far you’ve come.</span><CheckCircle2 size={20}/></div></div>
    <div className="dashboard-columns"><section className="content-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR SHORTLIST</span><h2>Schools on your mind</h2></div><Link href="/discover" className="text-link">Find more <ArrowRight size={15}/></Link></div>
      {saved.data?.length?<div className="saved-list">{saved.data.map((entry,i)=><div className="saved-row" key={entry.universityId} data-testid={`saved-university-${entry.universityId}`}><span className={`saved-mark cover-${i%4}`}>{entry.university.name.split(' ').map(w=>w[0]).slice(0,2).join('')}</span><div className="saved-name"><strong>{entry.university.name}</strong><span>{schoolLocation(entry.university)}</span></div><ListingBadge school={entry.university}/><Link href={`/university/${entry.universityId}`} className="icon-button" aria-label="View details"><ArrowRight size={17}/></Link><button className="icon-button remove-icon" onClick={()=>remove.mutate({universityId:entry.universityId},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getListSavedUniversitiesQueryKey()});refresh();}})} aria-label="Remove saved university" data-testid={`button-remove-school-${entry.universityId}`}><X size={17}/></button></div>)}</div>:<EmptyState icon={Bookmark} title="Your shortlist starts here" body="Save schools that catch your eye and compare them as your plans take shape." href="/discover" action="Explore schools"/>}</section>
    <section className="content-panel tasks-panel"><div className="panel-heading"><div><span className="eyebrow">LITTLE BY LITTLE</span><h2>Next steps</h2></div><button className="icon-button add-task-button" onClick={()=>setShowAdd(!showAdd)} aria-label="Add a task" data-testid="button-add-task">{showAdd?<X size={18}/>:<Plus size={18}/>}</button></div>
      {showAdd&&<form className="add-task-form" onSubmit={addTask}><input required value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="What would you like to do?" data-testid="input-task-title"/><input required type="date" value={taskDate} onChange={e=>setTaskDate(e.target.value)} data-testid="input-task-date"/><button className="button button-primary button-small" disabled={create.isPending} data-testid="button-save-task">{create.isPending?'Adding…':'Add step'}</button>{create.isError&&<p className="form-error">Couldn’t add this step. Please try again.</p>}</form>}
      {tasks.data?.length?<div className="task-list">{tasks.data.map((task:ApplicationTask)=><div className={cn('task-row',task.completed&&'task-complete')} key={task.id} data-testid={`task-${task.id}`}><button className="task-check" aria-label={task.completed?'Mark incomplete':'Mark complete'} onClick={()=>update.mutate({id:task.id,data:{completed:!task.completed}},{onSuccess:refresh})} data-testid={`button-complete-task-${task.id}`}>{task.completed?<CheckCircle2 size={19}/>:<Circle size={19}/>}</button><div className="task-copy"><strong>{task.title}</strong><span>{task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`:'No due date set'}</span></div><button className="icon-button task-delete" aria-label="Delete task" onClick={()=>del.mutate({id:task.id},{onSuccess:refresh})} data-testid={`button-delete-task-${task.id}`}><Trash2 size={15}/></button></div>)}</div>:<EmptyState icon={CheckCircle2} title="Room for your first step" body="Add a task you want to remember, like exploring entry requirements or asking for a recommendation." action=""/>}</section></div>
     <div className="dashboard-footnote"><ShieldCheck size={16}/> School records come from NCES IPEDS 2025–26; verify cost, admissions, and program details with each institution.</div></>}</div></Shell>;
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
        <label className="field"><span>Annual budget (USD)</span><input type="number" min="0" value={form.annualBudgetUsd||''} onChange={e=>update('annualBudgetUsd',Number(e.target.value))} placeholder="Tuition and living costs" data-testid="input-budget"/></label>
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
    'Start with what you already know: a subject that interests you, a few places you might live, or a budget range. Then search the U.S. college directory and save anything worth a second look. You do not need to decide everything today.',
    'Choose a few priorities before comparing: program fit, location, total cost, and support for international students are useful starting points. The directory does not include tuition or admissions details, so verify those directly with each school.',
    'Most application journeys include researching requirements, preparing transcripts, planning language tests if needed, requesting recommendations, and drafting personal materials. Requirements vary widely—use each school’s official admissions page as your source of truth.',
  ];
  const [selected,setSelected]=useState<number|null>(null);
  return <Shell><div className="page page-enter"><PageHeading kicker="A CALM PLACE TO THINK" title="Let’s make it clearer." body="A little guidance for the next part of your journey."/>
    <div className="assistant-alert"><div className="assistant-alert-icon"><MessageCircle size={19}/></div><div><strong>Guidance demo — live AI is not connected.</strong><p>The responses below are prepared examples, not generated advice. Review all application materials carefully and confirm requirements with each university.</p></div></div>
    <div className="assistant-layout"><section className="assistant-main"><div className="assistant-welcome"><div className="assistant-spark"><Sparkles size={21}/></div><div><span className="eyebrow">A GOOD PLACE TO BEGIN</span><h2>What’s on your mind?</h2><p>Pick a question to see an example of the kind of guidance you might find useful.</p></div></div>
      <div className="prompt-list">{prompts.map((prompt,i)=><button className={cn('prompt-button',selected===i&&'prompt-selected')} onClick={()=>setSelected(i)} key={prompt} data-testid={`button-prompt-${i}`}><span>{prompt}</span><ArrowRight size={17}/></button>)}</div>
      {selected!==null&&<div className="assistant-answer page-enter"><div className="answer-label"><Sparkles size={15}/> SAMPLE RESPONSE</div><p>{answers[selected]}</p><span className="answer-caveat">Example only · not live AI advice</span></div>}
      <div className="assistant-input-ghost"><span>Live AI guidance is not available in this demo.</span><button disabled aria-label="Send message"><ArrowRight size={17}/></button></div>
    </section><aside className="assistant-sidebar"><div className="assistant-side-card"><span className="eyebrow">KEEP IN MIND</span><ul><li><Check size={15}/> Requirements vary by university.</li><li><Check size={15}/> Tuition and admissions details are not in this directory.</li><li><Check size={15}/> You are responsible for reviewing every document.</li></ul><Link href="/discover">Search U.S. schools <ArrowRight size={14}/></Link></div><div className="assistant-side-note"><ShieldCheck size={18}/><p>For accurate application guidance, contact the university’s admissions office.</p></div></aside></div>
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
