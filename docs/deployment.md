# Deploying UniPath AI

How the pieces fit together:

```
browser ──► Cloudflare Pages ──(/api/*)──► Render (API) ──► Supabase (PostgreSQL)
            web app + proxy function                │
                                                     └──► Resend (sign-in code emails, API)
```

The web app calls `/api/...` on its own site. A Cloudflare Pages Function
(`apps/web/functions/api/[[path]].ts`) forwards those requests to Render. The
browser only ever talks to the Cloudflare site, so the sign-in cookie stays a
first-party cookie. Browsers block cookies on calls to another site, so calling
Render directly from the browser would break sign-in.

Work through the steps in order. Each secret goes straight from one dashboard
into another; never put it in the repository or a chat.

| You will collect | Where it comes from | Where it goes |
|---|---|---|
| `DATABASE_URL` | Supabase | Render |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | Render |
| `PROXY_SHARED_SECRET` | Render (generated) | Cloudflare Pages |
| API address (`https://….onrender.com`) | Render | Cloudflare Pages `API_ORIGIN` |
| Site address (`https://….pages.dev`) | Cloudflare Pages | Render `APP_ORIGIN` |

## 1. Supabase (database)

1. **New project.** Choose the region **Central EU (Frankfurt)** (the same region as the Render service in `render.yaml`). Click **Generate a password** and save it in your password manager.
2. **Turn off the Data API.** The app never uses it, and while it is on, tables in the `public` schema can be reached with the project's public key. Go to **Project Settings › Data API** (in some versions **Integrations › Data API**) and turn it off.
3. **Copy the connection string.** Click **Connect** at the top of the project page. Under **Session pooler** (this works from Render, which has no IPv6), copy the URI, replace `[YOUR-PASSWORD]` with the database password, and add `?sslmode=require&uselibpqcompat=true` to the end:

   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true
   ```

   This is `DATABASE_URL`. The ending turns on encryption.

   *Optional, stricter:* to also verify Supabase's certificate, download it under **Database settings › SSL configuration** and paste its full text into a Render variable named `DATABASE_CA_CERT`. Once that is set, the `sslmode` ending is ignored.

## 2. Resend (email)

Until a domain is verified, leave `EMAIL_VERIFICATION` unset on Render: students then register without an emailed code. After the domain is verified and `EMAIL_FROM` uses it, set `EMAIL_VERIFICATION=required` on Render to require the code (and offer password resets).

1. **Add your domain** under **Domains**, add the DNS records Resend shows, and wait until it says **Verified**.
   Without a verified domain, Resend only delivers mail sent from `onboarding@resend.dev` to your own Resend account address. That is enough to try the site yourself, but students would never receive their codes.
2. **Create an API key** under **API Keys**, with **Sending access**, limited to that domain. It is shown only once.
3. Build the two email values:

   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM="UniPath AI <no-reply@your-domain.example>"
   ```

## 3. Code on GitHub

Render and Cloudflare build from the `main` branch of the GitHub repository. Make sure the commit with `render.yaml` and `apps/web/functions/` is pushed.

## 4. Render (API)

1. **New › Blueprint**, connect GitHub, and pick this repository. Render reads `render.yaml` and proposes the `unipath-api` service on the free plan.
2. Fill in the values it asks for:
   - `DATABASE_URL`: from step 1.
   - `APP_ORIGIN`: the Cloudflare site address, for example `https://unipath.pages.dev` (no trailing slash). If you don't know it yet, enter `https://unipath.pages.dev` and correct it in step 6.
   - `RESEND_API_KEY` and `EMAIL_FROM`: from step 2.
3. **Apply.** The build installs packages, bundles the API and creates the database tables (`pnpm db:push`). A schema change that could lose data stops the build instead of being applied. On first start the API loads the institution directory into the empty database, which can take a few minutes.
4. When it is live, note the service address (for example `https://unipath-api.onrender.com`) and check `<address>/api/readyz`. It should answer `{"status":"ok", …}`.
5. Open the service's **Environment** tab and copy the generated `PROXY_SHARED_SECRET` value.
6. **Lock the database down** (run once, after this first deploy). In Supabase's **SQL Editor**, run:

   ```sql
   revoke all on all tables in schema public from anon, authenticated;
   revoke all on all sequences in schema public from anon, authenticated;
   alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
   alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
   ```

   This blocks Supabase's public roles from the app's tables even if the Data API is turned back on. The API connects as the table owner and is not affected.

## 5. Cloudflare Pages (web app)

1. **Workers & Pages › Create › Pages › Connect to Git**, and pick this repository.
2. Build settings:

   | Setting | Value |
   |---|---|
   | Project name | `unipath` (the site becomes `https://unipath.pages.dev`, or a variant if that is taken) |
   | Production branch | `main` |
   | Framework preset | None |
   | Root directory | `apps/web` |
   | Build command | `cd ../.. && npx -y pnpm@10.34.9 install --frozen-lockfile && npx -y pnpm@10.34.9 --filter @workspace/unipath-ai run build` |
   | Build output directory | `dist/public` |

3. Environment variables (Production):

   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `SKIP_DEPENDENCY_INSTALL` | `1` (the build command installs with pnpm itself) |
   | `API_ORIGIN` | the Render address from step 4, for example `https://unipath-api.onrender.com` |
   | `PROXY_SHARED_SECRET` | the value copied from Render. Choose **Encrypt** |

4. **Save and Deploy.** Pages also deploys `apps/web/functions/`, the `/api` proxy.

If you change a variable later, start a new deployment (**Deployments › Retry deployment**) so it takes effect.

## 6. Connect the two

If the Pages address differs from what you entered in step 4, set Render's `APP_ORIGIN` to the exact address and save; Render redeploys. The API accepts sign-in and other changes only from this origin.

## 7. Check it works

1. Open the site and click **Get started**. Create an account with an email you can read.
2. The code email should arrive from your `EMAIL_FROM` address. Enter the code, and you should land on onboarding.
3. Sign out, sign back in, and try **Forgot password?**.

Always use the site through its Cloudflare address. The Render address is only the API behind it.

## Later

- **Custom domain:** add it under Pages › Custom domains, set Render's `APP_ORIGIN` to it, and if the `pages.dev` address should keep working, add that to `UNIPATH_TRUSTED_ORIGINS` (comma-separated).
- **Google sign-in:** create a Google OAuth client ("Web application"), add `https://<site>/api/auth/google/callback` as a redirect URI, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on Render.

## Know before you rely on it

- **Render's free plan sleeps** after 15 minutes without traffic. The next visitor waits up to about a minute while it starts.
- **Uploaded documents are not kept on the free plan.** Files go to the server's disk (`STORAGE_DIR`), which Render wipes on every deploy and restart. Keeping them needs a paid Render plan with a persistent disk (set `STORAGE_DIR` to its mount path), or moving storage to an object store (not built yet).
- **Supabase's free plan pauses** a project after a week without activity; restore it from the dashboard.
- **Tuition data** is not loaded in production. The import script is development-only by design, and loading it into production needs a separate owner decision.
- **Rate limits** (sign-in attempts, code requests) are kept in memory per server instance. This is right for one instance; with several instances, add a shared limiter.
