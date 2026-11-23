import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { publicRequestFailure } from "./lib/requestErrors";
import { rejectCrossSiteWrites, trustedOrigins } from "./lib/admin/security";
import { sessionMiddleware } from "./lib/auth/session";
import { emailDelivery } from "./lib/auth/email";
import { googleConfigured } from "./lib/auth/google";
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

// Flag slow requests (default 1.5 s; set SLOW_REQUEST_MS). Logs the method,
// path, status and duration only: never query strings, bodies or headers.
const slowRequestMs = Number(process.env.SLOW_REQUEST_MS) > 0 ? Number(process.env.SLOW_REQUEST_MS) : 1500;
app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.once("finish", () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    if (durationMs >= slowRequestMs) {
      req.log.warn({ method: req.method, path: req.originalUrl.split("?")[0], status: res.statusCode, durationMs }, "Slow request");
    }
  });
  next();
});

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

// Cookie sessions (lib/auth/session.ts), behind the cross-site write guard
// that cookie authentication needs.
app.use("/api", rejectCrossSiteWrites, sessionMiddleware);
const delivery = emailDelivery();
if (delivery === "server_log") logger.warn("RESEND_API_KEY / EMAIL_FROM (or SMTP_URL / EMAIL_FROM) are not set: sign-in codes are written to this log instead of being emailed (development only).");
if (delivery === "unavailable") logger.warn("RESEND_API_KEY / EMAIL_FROM (or SMTP_URL / EMAIL_FROM) are not set: email sign-up, sign-in codes and password resets are off. Google and existing passwords still work.");
if (!googleConfigured()) logger.info("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set: Continue with Google is hidden.");

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
