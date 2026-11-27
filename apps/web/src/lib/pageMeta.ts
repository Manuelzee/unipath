import { useEffect } from 'react';

const SITE = 'UniPath AI';
export const DEFAULT_DESCRIPTION = 'Search 30,000+ universities in 160+ countries, find scholarships and sponsorships, and plan your applications in one place. Free during beta.';

/** Page titles and descriptions by path, for browser tabs, bookmarks and search results. */
const ROUTES: Array<[RegExp, string, string?]> = [
  [/^\/$/, `${SITE} — Universities and scholarships abroad`],
  [/^\/discover/, `Find universities | ${SITE}`, 'Search 30,000+ universities and colleges in 160+ countries by country, region and city, with the source of every detail.'],
  [/^\/scholarships/, `Scholarships & sponsorships | ${SITE}`, 'Government, university and foundation scholarships for studying abroad, each linked to its official page.'],
  [/^\/funding/, `Funding finder | ${SITE}`],
  [/^\/plans/, `Plans | ${SITE}`, 'UniPath AI is free during beta: search, scholarships, matches, application tracking and documents.'],
  [/^\/about/, `About | ${SITE}`, 'What UniPath AI does, where its information comes from, and what it does not do.'],
  [/^\/privacy/, `Privacy | ${SITE}`, 'What UniPath AI stores, why, who can see it, and how to export or delete it.'],
  [/^\/terms/, `Terms | ${SITE}`, 'The plain-language terms for using UniPath AI.'],
  [/^\/sign-in/, `Sign in | ${SITE}`],
  [/^\/sign-up/, `Create your account | ${SITE}`],
  [/^\/dashboard/, `My plan | ${SITE}`],
  [/^\/notifications/, `Notifications | ${SITE}`],
  [/^\/announcements/, `Announcements | ${SITE}`],
  [/^\/recommendations/, `Matches | ${SITE}`],
  [/^\/saved/, `Shortlist | ${SITE}`],
  [/^\/compare/, `Compare | ${SITE}`],
  [/^\/applications/, `Applications | ${SITE}`],
  [/^\/documents/, `Documents | ${SITE}`],
  [/^\/ai-assistant/, `AI assistant | ${SITE}`],
  [/^\/chat/, `Community chat | ${SITE}`],
  [/^\/jobs/, `Global Student Jobs | ${SITE}`],
  [/^\/profile|^\/onboarding/, `My profile | ${SITE}`],
  [/^\/settings/, `Settings | ${SITE}`],
  [/^\/billing/, `Billing | ${SITE}`],
  [/^\/admin/, `Admin | ${SITE}`],
];

function setDescription(text: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
  meta.content = text;
}

/** Sets the title and description for the current path (university pages set their own). */
export function useRouteMeta(path: string) {
  useEffect(() => {
    if (path.startsWith('/university/')) return;
    const match = ROUTES.find(([pattern]) => pattern.test(path));
    document.title = match?.[1] ?? SITE;
    setDescription(match?.[2] ?? DEFAULT_DESCRIPTION);
  }, [path]);
}

/** For pages whose title depends on their data, such as a university's name. */
export function usePageMeta(title: string | null, description?: string) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} | ${SITE}`;
    if (description) setDescription(description);
  }, [title, description]);
}
