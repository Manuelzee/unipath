import { getAuth } from "../lib/auth/session";
import type { RequestHandler } from "express";

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Sign in to access your student workspace." });
    return;
  }
  next();
};
