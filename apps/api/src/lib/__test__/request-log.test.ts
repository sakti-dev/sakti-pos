import { afterEach, describe, expect, test, vi } from "bun:test";
import { Elysia } from "elysia";
import { requestLog } from "../request-log";

const lines: string[] = [];
const logSpy = vi.spyOn(console, "log").mockImplementation((line: string) => {
  lines.push(line);
});

afterEach(() => {
  lines.length = 0;
});

function parseLine(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

describe("requestLog", () => {
  test("emits one JSON line per request with method/path/status/ms", async () => {
    const app = new Elysia().use(requestLog).get("/ping", () => "pong");
    const res = await app.handle(new Request("http://localhost/ping"));

    expect(res.status).toBe(200);
    expect(lines.length).toBe(1);
    const parsed = parseLine(lines[0]!);
    expect(parsed.lvl).toBe("info");
    expect(parsed.origin).toBe("API");
    expect(parsed.msg).toBe("request");
    expect(parsed.method).toBe("GET");
    expect(parsed.path).toBe("/ping");
    expect(parsed.status).toBe(200);
    expect(typeof parsed.ms).toBe("number");
  });

  test("does not log OPTIONS preflight", async () => {
    const app = new Elysia().use(requestLog);
    await app.handle(
      new Request("http://localhost/any", { method: "OPTIONS" })
    );

    expect(lines.length).toBe(0);
  });

  test("logs thrown errors at lvl=error with name+status, no message leak", async () => {
    const app = new Elysia().use(requestLog).get("/boom", () => {
      throw new Error("secret-internal-detail");
    });
    const res = await app.handle(new Request("http://localhost/boom"));

    expect(res.status).toBe(500);
    const errLine = lines.find(
      (l) => (parseLine(l) as Record<string, unknown>).lvl === "error"
    );
    expect(errLine).toBeDefined();
    const parsed = parseLine(errLine!);
    expect(parsed.name).toBe("Error");
    expect(parsed.status).toBe(500);
    expect(JSON.stringify(parsed)).not.toContain("secret-internal-detail");
  });

  test("does not log OPTIONS even when the route throws", async () => {
    const app = new Elysia().use(requestLog).get("/x", ({ set }) => {
      set.status = 400;
      return "bad";
    });
    await app.handle(new Request("http://localhost/x", { method: "OPTIONS" }));

    expect(lines.length).toBe(0);
    logSpy.mockRestore();
  });
});
