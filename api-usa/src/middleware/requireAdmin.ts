import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { User } from "../models/user";

/**
 * requireAdmin — verify a Bearer JWT AND that the bearer is an admin.
 * Replies 401 if missing/invalid token, 403 if authenticated but not admin.
 *
 * Self-contained: doesn't depend on requireAuth being mounted first, since the
 * Stage-4 reference snippet uses it as the sole middleware on the route.
 */

declare module "express-serve-static-core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Request {
    userId?: string;
    companyId?: string;
    isAdmin?: boolean;
  }
}

interface JwtClaims {
  id: string;
  companyId?: string;
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
    res.status(401).json({ error: "Token malformatted" });
    return;
  }

  let claims: JwtClaims;
  try {
    const decoded = jwt.verify(parts[1], config.SECRET);
    if (typeof decoded === "string") {
      res.status(401).json({ error: "Token invalid" });
      return;
    }
    claims = decoded as JwtClaims;
  } catch {
    res.status(401).json({ error: "Token invalid" });
    return;
  }

  // isAdmin is `select: false` on the schema — must explicitly opt in.
  const user = await User.findById(claims.id)
    .select("+isAdmin")
    .lean<{ _id: unknown; isAdmin?: boolean }>();
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (!user.isAdmin) {
    res.status(403).json({ error: "Forbidden — admin only" });
    return;
  }

  req.userId = claims.id;
  if (claims.companyId) req.companyId = claims.companyId;
  req.isAdmin = true;
  next();
}

export default requireAdmin;
