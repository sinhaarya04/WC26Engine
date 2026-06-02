/**
 * Integration tests for auth.
 *
 * Mocks the User + Company Mongoose models (same pattern as
 * bracket.controller.test.ts) and invokes the handlers directly with a
 * mock req/res. Exercises:
 *
 *   - register: missing fields, malformed companyId, unknown companyId,
 *     duplicate email, happy path
 *   - register: client-supplied isAdmin is IGNORED (security boundary)
 *   - register: passes plaintext password through to User.create so the
 *     pre-save hook hashes it (we don't re-test bcrypt here)
 *   - login:    missing fields, unknown user, wrong password, happy path,
 *     500 when user has no resolvable company
 *   - JWT:      both register and login issue tokens carrying { id, companyId }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../models/user", () => ({
  User: { findOne: vi.fn(), create: vi.fn() },
}));
vi.mock("../models/Company", () => ({
  Company: { findOne: vi.fn(), findById: vi.fn() },
}));

// We import the real config so jwt.verify uses the same SECRET the controller signs with.
import { config } from "../config/env";
import { User } from "../models/user";
import { Company } from "../models/Company";
import { register, login } from "./auth.controller";

// ---------- Fixtures ----------

// Valid 24-char hex ObjectIds.
const COMPANY_ID = "507f1f77bcf86cd799439011";
const OTHER_COMPANY_ID = "507f1f77bcf86cd799439012";

const COMPANY = {
  _id: COMPANY_ID,
  name: "Tigress Financial Partners",
};

const USER_DOC = {
  _id: "user-1",
  name: "Ada",
  email: "ada@example.com",
  // Pre-hashed password ($2b$… is a real bcrypt hash for "correct horse"):
  password: "$2b$10$X1k1y8H6V0V1Q4Q1m6n5OuJv3K2/3iZ7g3M0G0w2vQ4z1g6r6r5Wq",
  companyId: COMPANY._id,
};

// ---------- Mongoose-mock helpers ----------

function chain<T>(value: T) {
  // Supports both `Model.findOne(...)` returning the doc directly and
  // `Model.findOne(...).select(...)` chains used by login.
  return {
    select: () => Promise.resolve(value),
    then: (resolve: (v: T) => unknown) => Promise.resolve(value).then(resolve),
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return res;
}

beforeEach(() => {
  vi.mocked(User.findOne).mockReset();
  vi.mocked(User.create).mockReset();
  vi.mocked(Company.findOne).mockReset();
  vi.mocked(Company.findById).mockReset();
});

// ---------- /auth/register ----------

describe("POST /auth/register", () => {
  it("400s when any required field is missing", async () => {
    for (const body of [
      {},
      { name: "Ada" },
      { name: "Ada", email: "a@b.com" },
      { name: "Ada", email: "a@b.com", password: "pw" },
      { email: "a@b.com", password: "pw", companyId: COMPANY_ID },
    ]) {
      const res = makeRes();
      await register({ body } as never, res as never);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/required/i);
    }
  });

  it("400s on malformed companyId (not an ObjectId)", async () => {
    const res = makeRes();
    await register(
      { body: { name: "Ada", email: "a@b.com", password: "pw", companyId: "not-an-id" } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("Unknown company");
    expect(vi.mocked(Company.findById)).not.toHaveBeenCalled();
    expect(vi.mocked(User.create)).not.toHaveBeenCalled();
  });

  it("400s on unknown companyId (well-formed but no Company doc)", async () => {
    vi.mocked(Company.findById).mockResolvedValue(null as never);

    const res = makeRes();
    await register(
      { body: { name: "Ada", email: "a@b.com", password: "pw", companyId: COMPANY_ID } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("Unknown company");
    expect(vi.mocked(Company.findById)).toHaveBeenCalledWith(COMPANY_ID);
    expect(vi.mocked(User.create)).not.toHaveBeenCalled();
  });

  it("400s when email already exists", async () => {
    vi.mocked(Company.findById).mockResolvedValue(COMPANY as never);
    vi.mocked(User.findOne).mockResolvedValue({ _id: "existing" } as never);

    const res = makeRes();
    await register(
      { body: { name: "Ada", email: "ada@example.com", password: "pw", companyId: COMPANY_ID } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("User already exists");
    expect(vi.mocked(User.create)).not.toHaveBeenCalled();
  });

  it("happy path: returns token + user shape, JWT carries { id, companyId }", async () => {
    vi.mocked(Company.findById).mockResolvedValue(COMPANY as never);
    vi.mocked(User.findOne).mockResolvedValue(null as never);
    vi.mocked(User.create).mockResolvedValue(USER_DOC as never);

    const res = makeRes();
    await register(
      { body: { name: "Ada", email: "ADA@example.com", password: "pw", companyId: COMPANY_ID } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { token: string; user: Record<string, unknown> };
    expect(body.user).toEqual({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      companyId: COMPANY_ID,
      companyName: "Tigress Financial Partners",
    });

    const claims = jwt.verify(body.token, config.SECRET) as { id: string; companyId: string };
    expect(claims.id).toBe("user-1");
    expect(claims.companyId).toBe(COMPANY_ID);
  });

  it("normalizes email to lowercase before User.create and persists companyId from server lookup", async () => {
    vi.mocked(Company.findById).mockResolvedValue(COMPANY as never);
    vi.mocked(User.findOne).mockResolvedValue(null as never);
    vi.mocked(User.create).mockResolvedValue(USER_DOC as never);

    const res = makeRes();
    await register(
      { body: { name: "Ada", email: "ADA@Example.COM", password: "raw-pw", companyId: COMPANY_ID } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(User.create)).toHaveBeenCalledWith({
      name: "Ada",
      email: "ada@example.com",
      password: "raw-pw", // plaintext: the pre-save hook (covered by mongoose, not this test) hashes it
      companyId: COMPANY._id,
    });
  });

  it("IGNORES client-supplied isAdmin — security boundary", async () => {
    vi.mocked(Company.findById).mockResolvedValue(COMPANY as never);
    vi.mocked(User.findOne).mockResolvedValue(null as never);
    vi.mocked(User.create).mockResolvedValue(USER_DOC as never);

    const res = makeRes();
    await register(
      {
        body: {
          name: "Ada",
          email: "ada@example.com",
          password: "pw",
          companyId: COMPANY_ID,
          // Attacker tries to impersonate admin via mass-assignment:
          isAdmin: true,
          // …and slip a different tenant id into User.create:
          companyName: "Other Co",
        },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    const createArg = vi.mocked(User.create).mock.calls[0][0] as Record<string, unknown>;
    expect(createArg.isAdmin).toBeUndefined(); // never read from body
    expect(createArg.companyId).toBe(COMPANY._id);

    const body = res.body as { token: string; user: { companyId: string } };
    const claims = jwt.verify(body.token, config.SECRET) as { companyId: string };
    expect(body.user.companyId).toBe(COMPANY_ID);
    expect(claims.companyId).toBe(COMPANY_ID);
  });

  it("rejects when an unknown companyId is supplied even with otherwise-valid body", async () => {
    vi.mocked(Company.findById).mockResolvedValue(null as never);

    const res = makeRes();
    await register(
      { body: { name: "Ada", email: "a@b.com", password: "pw", companyId: OTHER_COMPANY_ID } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("Unknown company");
    expect(vi.mocked(User.create)).not.toHaveBeenCalled();
  });
});

// ---------- /auth/login ----------

describe("POST /auth/login", () => {
  it("400s when email or password missing", async () => {
    for (const body of [{}, { email: "a@b.com" }, { password: "pw" }]) {
      const res = makeRes();
      await login({ body } as never, res as never);
      expect(res.statusCode).toBe(400);
    }
  });

  it("400s when user not found", async () => {
    vi.mocked(User.findOne).mockReturnValue(chain(null) as never);

    const res = makeRes();
    await login(
      { body: { email: "ghost@example.com", password: "pw" } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("User not found");
  });

  it("400s on wrong password", async () => {
    vi.mocked(User.findOne).mockReturnValue(chain(USER_DOC) as never);

    const res = makeRes();
    await login(
      { body: { email: "ada@example.com", password: "wrong-password" } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("Invalid password");
  });

  it("500s when user has no resolvable company (broken tenant state)", async () => {
    // Hash "right-pw" with bcrypt so compare succeeds.
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("right-pw", 10);
    vi.mocked(User.findOne).mockReturnValue(chain({ ...USER_DOC, password: hash }) as never);
    vi.mocked(Company.findById).mockResolvedValue(null as never);

    const res = makeRes();
    await login(
      { body: { email: "ada@example.com", password: "right-pw" } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(500);
  });

  it("happy path: same shape as register, JWT carries { id, companyId }", async () => {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("right-pw", 10);
    vi.mocked(User.findOne).mockReturnValue(chain({ ...USER_DOC, password: hash }) as never);
    vi.mocked(Company.findById).mockResolvedValue(COMPANY as never);

    const res = makeRes();
    await login(
      { body: { email: "ADA@Example.COM", password: "right-pw" } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { token: string; user: Record<string, unknown> };
    expect(body.user).toEqual({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      companyId: COMPANY_ID,
      companyName: "Tigress Financial Partners",
    });

    expect(vi.mocked(User.findOne)).toHaveBeenCalledWith({ email: "ada@example.com" });

    const claims = jwt.verify(body.token, config.SECRET) as { id: string; companyId: string };
    expect(claims.id).toBe("user-1");
    expect(claims.companyId).toBe(COMPANY_ID);
  });
});
