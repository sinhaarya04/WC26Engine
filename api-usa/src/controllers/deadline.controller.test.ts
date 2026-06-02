/**
 * Tests for GET /deadline. Shape + isOpen flip around SUBMISSION_DEADLINE_UTC.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SUBMISSION_DEADLINE_UTC } from "../config/deadline";
import { getDeadline } from "./deadline.controller";

function makeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(p: unknown) { this.body = p; return this; },
    send(p: unknown) { this.body = p; return this; },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("GET /deadline", () => {
  it("returns deadline, serverNow, isOpen=true before the deadline", () => {
    const t = new Date(SUBMISSION_DEADLINE_UTC.getTime() - 60_000);
    vi.setSystemTime(t);

    const res = makeRes();
    getDeadline({} as never, res as never);

    const body = res.body as { deadline: string; serverNow: string; isOpen: boolean };
    expect(body.deadline).toBe(SUBMISSION_DEADLINE_UTC.toISOString());
    expect(body.serverNow).toBe(t.toISOString());
    expect(body.isOpen).toBe(true);
  });

  it("isOpen=false exactly AT the deadline (boundary is the close)", () => {
    vi.setSystemTime(SUBMISSION_DEADLINE_UTC);

    const res = makeRes();
    getDeadline({} as never, res as never);

    expect((res.body as { isOpen: boolean }).isOpen).toBe(false);
  });

  it("isOpen=false after the deadline", () => {
    vi.setSystemTime(new Date(SUBMISSION_DEADLINE_UTC.getTime() + 1));

    const res = makeRes();
    getDeadline({} as never, res as never);

    expect((res.body as { isOpen: boolean }).isOpen).toBe(false);
  });
});
