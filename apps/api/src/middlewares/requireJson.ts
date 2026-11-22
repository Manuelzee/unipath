import type { RequestHandler } from "express";

/**
 * Mutations must send JSON. Cross-site HTML forms cannot send
 * application/json without a CORS preflight, so this closes simple
 * form-based request forgery against signed-in students.
 */
export const requireJson: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const hasBody = Number(req.get("content-length") ?? 0) > 0 || req.get("transfer-encoding") !== undefined;
  // Body-less actions (such as adding a checklist) carry no form payload to forge.
  if (hasBody && !req.is("application/json")) {
    res.status(415).json({ error: "Send this request as JSON from the UniPath app. No change was made." });
    return;
  }
  next();
};
