import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User } from "../models/user";
import { Company } from "../models/Company";
import { config } from "../config/env";

/**
 * Multi-tenant auth.
 *
 *   POST /auth/register { name, email, password, companyId }
 *   POST /auth/login    { email, password }
 *
 * Invariants enforced here:
 *   - companyId on register MUST reference an existing seeded Company.
 *     The picker on the client is populated from GET /companies?q=… so
 *     the user resolves to a real id rather than typing free text.
 *   - JWT claims carry { id, companyId } so middleware sees the tenant on
 *     every authenticated request.
 *   - Response shape is identical for register + login:
 *       { token, user: { id, name, email, companyId, companyName } }
 *
 * Note on integrity: company membership is self-selected from the known
 * list. We do NOT verify employment via email domain, invite code, or any
 * other proof — see the README. This is the accepted tradeoff.
 */

type AuthUserPayload = {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
};

function generateToken(id: string, companyId: string): string {
  return jwt.sign({ id, companyId }, config.SECRET, { expiresIn: 7257600 });
}

function buildAuthUser(
  user: { _id: unknown; name: string; email: string },
  company: { _id: unknown; name: string },
): AuthUserPayload {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    companyId: String(company._id),
    companyName: company.name,
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  // Whitelist body keys explicitly. Anything else (e.g. isAdmin) is IGNORED.
  const { name, email, password, companyId } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    companyId?: string;
  };

  if (!name || !email || !password || !companyId) {
    res.status(400).send({ error: "name, email, password, and companyId are required" });
    return;
  }

  if (!mongoose.isValidObjectId(companyId)) {
    res.status(400).send({ error: "Unknown company" });
    return;
  }

  try {
    const company = await Company.findById(companyId);
    if (!company) {
      // The user must resolve to a real seeded company — never create one
      // from registration input.
      res.status(400).send({ error: "Unknown company" });
      return;
    }

    const normalizedEmail = email.toLowerCase();
    if (await User.findOne({ email: normalizedEmail })) {
      res.status(400).send({ error: "User already exists" });
      return;
    }

    // companyId is set from the verified Company doc. We do not trust the
    // body value verbatim past the existence check.
    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      companyId: company._id,
    });

    res.send({
      token: generateToken(user._id.toString(), company._id.toString()),
      user: buildAuthUser(user, company),
    });
  } catch (err) {
    if (config.isDev) console.error("register failed:", err);
    res.status(400).send({ error: "Registration failed" });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).send({ error: "email and password are required" });
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user) {
    res.status(400).send({ error: "User not found" });
    return;
  }

  const stored = (user as unknown as { password: string }).password;
  if (!(await bcrypt.compare(password, stored))) {
    res.status(400).send({ error: "Invalid password" });
    return;
  }

  const companyId = (user as unknown as { companyId: unknown }).companyId;
  const company = await Company.findById(companyId as string);
  if (!company) {
    // A user without a resolvable company is a broken tenant state; refuse to
    // issue a token rather than emit an undefined companyId.
    res.status(500).send({ error: "User has no resolvable company" });
    return;
  }

  res.send({
    token: generateToken(user._id.toString(), company._id.toString()),
    user: buildAuthUser(
      user as unknown as { _id: unknown; name: string; email: string },
      company,
    ),
  });
}

// Back-compat: the upstream code exposed `authenticate`. Keep the name so
// existing callers (and old routes) still resolve to the new login flow.
export const authenticate = login;
