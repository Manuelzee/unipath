export type Availability = 'available' | 'limited' | 'planned';

export interface PlanFeature { label: string; status: Availability; note: string }
export interface Plan {
  id: 'free' | 'student-plus' | 'premium';
  name: string; price: string; period: string; audience: string; cta: string;
  popular?: boolean; features: PlanFeature[];
}
export interface SupportPackage { id: string; name: string; price: string; scope: string[]; limits: string }

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Available now',
  limited: 'Limited',
  planned: 'Planned',
};

export const PLANS: Plan[] = [
  {
    id: 'free', name: 'Free', price: '$0', period: 'forever', audience: 'For students beginning their college search.', cta: 'Get Started Free',
    features: [
      { label: 'Basic university matching', status: 'available', note: 'Preference-based matches from your saved profile.' },
      { label: 'Search universities worldwide', status: 'limited', note: 'Today: partial U.S. (NCES IPEDS) plus a Canada pilot. Worldwide coverage is planned, not available.' },
      { label: 'Explore majors and fields of study', status: 'limited', note: 'Source-reported programs where available; coverage is partial.' },
      { label: 'View available admissions information', status: 'limited', note: 'Source links where reported. Confirm with each school.' },
      { label: 'Discover scholarship opportunities', status: 'limited', note: 'Source-linked funding opportunities; no eligibility guarantee.' },
      { label: 'Save basic student preferences', status: 'available', note: 'Stored in your profile.' },
      { label: 'Save schools to your plan', status: 'available', note: 'Keep a shortlist on your dashboard.' },
      { label: 'Build a personal application checklist', status: 'available', note: 'Add, complete, and remove your own steps.' },
      { label: 'Guided five-step profile setup', status: 'available', note: 'Personal, academic, budget and language details, with a review before saving.' },
    ],
  },
  {
    id: 'student-plus', name: 'Student Plus', price: '$9.99', period: '/month', audience: 'For students who want deeper comparisons and better planning.', cta: 'Upgrade to Student Plus', popular: true,
    features: [
      { label: 'Everything in Free', status: 'available', note: 'All current Free tools.' },
      { label: 'Advanced university comparisons', status: 'available', note: 'Compare up to four schools side by side: programs, source-reported tuition, outcomes, official links and verification dates. Data coverage is partial. Free while billing is unavailable.' },
      { label: 'Personalized university recommendations', status: 'available', note: 'Free while billing is unavailable.' },
      { label: 'Enhanced scholarship discovery', status: 'planned', note: 'Today only the current source links are available.' },
      { label: 'Application planning tools', status: 'available', note: 'Application tracker with statuses, the deadlines you record, tasks and a common document checklist. You apply on each official site. Free while billing is unavailable.' },
      { label: 'Saved university lists and preferences', status: 'available', note: 'Free while billing is unavailable.' },
      { label: 'Start-term and budget-based matching', status: 'limited', note: 'Uses term and budget metadata only where verified evidence exists.' },
    ],
  },
  {
    id: 'premium', name: 'Premium', price: '$29.99', period: '/month', audience: 'For students who want more personalized application guidance.', cta: 'Get Premium Support',
    features: [
      { label: 'Everything in Student Plus', status: 'limited', note: 'Includes Student Plus items that are planned.' },
      { label: 'AI-powered application guidance', status: 'limited', note: 'Built: answers grounded in your profile and UniPath records, which you review before anything is saved. Works only after the site owner connects an AI provider. Free with a daily limit while billing is unavailable.' },
      { label: 'College essay assistance and feedback', status: 'limited', note: 'Built: feedback on grammar, clarity, organization, tone and prompt fit. No ghostwriting. Works only after the AI provider is connected.' },
      { label: 'Personalized application checklists', status: 'limited', note: 'A common document checklist per application that you can edit, plus AI-drafted checklists once the AI provider is connected. Not taken from verified school requirements.' },
      { label: 'Document preparation guidance', status: 'planned', note: 'Not built.' },
      { label: 'Scholarship application planning', status: 'planned', note: 'Not built.' },
      { label: 'Personalized next-step recommendations', status: 'planned', note: 'Not built.' },
    ],
  },
];

export const SUPPORT = {
  name: 'Application Support', price: '$99–$299', period: 'per package (one-time)',
  audience: 'For students who want additional help organizing their applications.', cta: 'Explore Application Support',
  features: [
    'Personalized application support based on the selected package',
    'Application timeline and deadline organization',
    'Document checklist assistance',
    'Guidance through application requirements',
    'Support with preparing application materials',
  ],
};

export const PACKAGES: SupportPackage[] = [
  { id: 'application-roadmap', name: 'Application Roadmap', price: '$99', scope: ['Shortlist review and next-step plan', 'Application timeline and deadline organization', 'Document checklist assistance'], limits: 'Planning help only. Does not include essay feedback or document review.' },
  { id: 'essay-review', name: 'Essay Review', price: '$199', scope: ['Feedback on one essay draft', 'Guidance on the prompt and requirements'], limits: 'Feedback only. You write and own every word; no ghostwriting.' },
  { id: 'full-application-support', name: 'Full Application Support', price: '$299', scope: ['Multi-school planning', 'Document review and checklist assistance', 'Guidance through application requirements', 'Support preparing application materials'], limits: 'You submit your own applications. No admission or scholarship outcome is guaranteed.' },
];
