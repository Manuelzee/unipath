import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { publicRequestFailure } from "./lib/requestErrors";
import { trustedOrigins } from "./lib/admin/security";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: (origin, callback) => callback(null, !origin || trustedOrigins().has(origin)) }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) { next(error); return; }
  const failure = publicRequestFailure(error);
  req.log.error({ code: failure.code, requestId: req.id }, "API request failed; details withheld to protect credentials and request data");
  res.status(failure.status).json({ error: failure.error, code: failure.code, requestId: req.id });
});

export default app;
