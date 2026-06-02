import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";

/**
 * JWT-bearer middleware. Verifies `Authorization: Bearer <token>` and attaches
 * `req.userId` (and `req.companyId`, once Stage 3 issues tokens with that field).
 *
 * Returns 401 on any failure. NEVER reads identity from request body/query.
 */

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
    companyId?: string;
  }
}

interface JwtClaims {
  id: string;
  companyId?: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).send({ error: "No token provided" });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2) {
    res.status(401).send({ error: "Token error" });
    return;
  }

  const [scheme, token] = parts;
  if (!/^Bearer$/i.test(scheme)) {
    res.status(401).send({ error: "Token malformatted" });
    return;
  }

  jwt.verify(token, config.SECRET, (err, decoded) => {
    if (err || !decoded || typeof decoded === "string") {
      res.status(401).send({ error: "Token invalid" });
      return;
    }
    const claims = decoded as JwtClaims;
    req.userId = claims.id;
    if (claims.companyId) req.companyId = claims.companyId;
    next();
  });
}

export default requireAuth;
