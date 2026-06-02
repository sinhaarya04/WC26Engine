/**
 * Tests for GET /companies?q=<search>.
 *
 * The controller is a thin wrapper over Company.find({ name: /q/i })
 * with a cap and a sort. We mock the model to assert:
 *
 *   - empty / missing q yields a list call with NO name filter
 *   - case-insensitive partial match: "met" → /met/i, matches MetLife
 *   - regex metacharacters in q are escaped (no ReDoS, no crash)
 *   - result shape is [{ id, name }]
 *   - results are capped (LIMIT) and sorted by name
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/Company", () => ({
  Company: { find: vi.fn() },
}));

import { Company } from "../models/Company";
import { searchCompanies } from "./companies.controller";

// ---------- Chainable mock for Company.find().sort().limit().select() ----------

function findChain(docs: Array<{ _id: string; name: string }>) {
  const chain = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(docs),
  };
  return chain;
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
  vi.mocked(Company.find).mockReset();
});

describe("GET /companies", () => {
  it("returns all (capped) when q is missing", async () => {
    const chain = findChain([
      { _id: "id-a", name: "Alpha Co" },
      { _id: "id-b", name: "Beta Co"  },
    ]);
    vi.mocked(Company.find).mockReturnValue(chain as never);

    const res = makeRes();
    await searchCompanies({ query: {} } as never, res as never);

    expect(vi.mocked(Company.find)).toHaveBeenCalledWith({});
    expect(chain.sort).toHaveBeenCalledWith({ name: 1 });
    expect(chain.limit).toHaveBeenCalledWith(25);
    expect(res.body).toEqual([
      { id: "id-a", name: "Alpha Co" },
      { id: "id-b", name: "Beta Co"  },
    ]);
  });

  it("returns all (capped) when q is empty / whitespace", async () => {
    const chain = findChain([]);
    vi.mocked(Company.find).mockReturnValue(chain as never);

    const res = makeRes();
    await searchCompanies({ query: { q: "   " } } as never, res as never);

    expect(vi.mocked(Company.find)).toHaveBeenCalledWith({});
  });

  it("uses a case-insensitive regex for partial matches: 'met' → /met/i", async () => {
    const chain = findChain([{ _id: "id-m", name: "MetLife" }]);
    vi.mocked(Company.find).mockReturnValue(chain as never);

    const res = makeRes();
    await searchCompanies({ query: { q: "met" } } as never, res as never);

    const callArg = vi.mocked(Company.find).mock.calls[0][0] as unknown as { name: RegExp };
    expect(callArg.name).toBeInstanceOf(RegExp);
    expect(callArg.name.flags).toContain("i");
    expect("MetLife").toMatch(callArg.name);
    expect("biomet".toLowerCase()).toMatch(callArg.name); // partial, anywhere
    expect(res.body).toEqual([{ id: "id-m", name: "MetLife" }]);
  });

  it("trims the query before regex-building", async () => {
    const chain = findChain([]);
    vi.mocked(Company.find).mockReturnValue(chain as never);
    await searchCompanies({ query: { q: "  morgan  " } } as never, makeRes() as never);

    const callArg = vi.mocked(Company.find).mock.calls[0][0] as unknown as { name: RegExp };
    expect(callArg.name.source).toBe("morgan");
  });

  it("escapes regex metacharacters in q (no crash, no ReDoS)", async () => {
    const chain = findChain([]);
    vi.mocked(Company.find).mockReturnValue(chain as never);

    const res = makeRes();
    // These would break or be expensive if not escaped.
    await searchCompanies({ query: { q: ".*+?(a|b)" } } as never, res as never);

    const callArg = vi.mocked(Company.find).mock.calls[0][0] as unknown as { name: RegExp };
    expect(callArg.name).toBeInstanceOf(RegExp);
    // Source must contain escaped metacharacters, not raw ones.
    expect(callArg.name.source).toBe("\\.\\*\\+\\?\\(a\\|b\\)");
    expect(res.statusCode).toBe(200);
  });

  it("ignores non-string q (?q=&q=foo array styles)", async () => {
    const chain = findChain([]);
    vi.mocked(Company.find).mockReturnValue(chain as never);
    await searchCompanies({ query: { q: ["foo", "bar"] } } as never, makeRes() as never);
    expect(vi.mocked(Company.find)).toHaveBeenCalledWith({});
  });
});
