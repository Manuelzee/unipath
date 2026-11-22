import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import { publicRequestFailure } from "./lib/requestErrors";
import { trustedOrigins } from "./lib/admin/security";
import { repoPath } from "./lib/paths";

const app: Express = express();
app.disable("x-powered-by");
// Behind a reverse proxy (Nginx, a PaaS load balancer) set TRUST_PROXY=1 so
// client IPs and HTTPS detection come from X-Forwarded-* headers.
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : process.env.TRUST_PROXY);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Baseline security headers for every response.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

app.use(cors({ credentials: true, origin: (origin, callback) => callback(null, !origin || trustedOrigins().has(origin)) }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const clerkConfigured = !!process.env.CLERK_SECRET_KEY && !!process.env.CLERK_PUBLISHABLE_KEY;
/**
 * Without Clerk keys every request is treated as signed out: public pages keep
 * working and protected routes return 401. Nothing is ever signed in by default.
 */
const signedOut: RequestHandler = (req, _res, next) => {
  const auth = () => ({ userId: null, sessionId: null, tokenType: "session_token", isAuthenticated: false, getToken: async () => null, has: () => false, debug: () => ({}) });
  (req as unknown as { auth: unknown }).auth = Object.assign(auth, { [Symbol.for("@clerk/express.auth")]: true });
  next();
};
if (!clerkConfigured) logger.warn("CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY are not set: sign-in is disabled and protected routes return 401.");
app.use(clerkConfigured ? clerkMiddleware({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY, secretKey: process.env.CLERK_SECRET_KEY }) : signedOut);

app.use("/api", router);
app.use("/api", (_req, res) => { res.status(404).json({ error: "Not found." }); });

// Serve the built web app (apps/web/dist/public) from the same origin, so a
// single Node process can be deployed. In development Vite serves it instead.
const webDir = process.env.WEB_DIST_DIR ? path.resolve(process.env.WEB_DIST_DIR) : repoPath("apps", "web", "dist", "public");
if (existsSync(path.join(webDir, "index.html"))) {
  app.use("/assets", express.static(path.join(webDir, "assets"), { immutable: true, maxAge: "1y", index: false }));
  app.use(express.static(webDir, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") { next(); return; }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(webDir, "index.html"));
  });
  logger.info({ webDir }, "Serving the built web app");
}

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) { next(error); return; }
  const failure = publicRequestFailure(error);
  req.log.error({ code: failure.code, requestId: req.id }, "API request failed; details withheld to protect credentials and request data");
  res.status(failure.status).json({ error: failure.error, code: failure.code, requestId: req.id });
});

export default app;
