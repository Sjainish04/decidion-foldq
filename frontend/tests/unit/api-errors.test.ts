import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw/handlers";
import { ApiError, foldSequence } from "@/lib/api/client";

describe("typed API errors", () => {
  it("surfaces the code and trace id, not just the message", async () => {
    server.use(
      http.post("*/api/v1/fold", () =>
        HttpResponse.json(
          {
            error: {
              code: "SEQUENCE_TOO_LONG_FOR_SOLVER",
              message: "solver 'qaoa' is limited to 40 nt in this API",
              details: { maximum_length: 40, suggested_solver: "simulated_annealing" },
              trace_id: "trace_abc123",
            },
          },
          { status: 422 },
        ),
      ),
    );
    await expect(foldSequence({ sequence: "GGGAAAUCCCU", solver: "qaoa" })).rejects.toThrow(
      /limited to 40 nt/,
    );
    try {
      await foldSequence({ sequence: "GGGAAAUCCCU", solver: "qaoa" });
    } catch (error) {
      const api = error as ApiError;
      // The code is what a UI branches on to suggest a different solver; the
      // message is prose and may be reworded.
      expect(api.code).toBe("SEQUENCE_TOO_LONG_FOR_SOLVER");
      expect(api.traceId).toBe("trace_abc123");
      expect(api.status).toBe(422);
    }
  });

  it("still reads FastAPI's own validation shape", async () => {
    // Framework-level validation errors are raised before the typed handler
    // runs, so the client must not lose the message when `error` is absent.
    server.use(
      http.post("*/api/v1/fold", () =>
        HttpResponse.json({ detail: "field required" }, { status: 422 }),
      ),
    );
    await expect(foldSequence({ sequence: "GGGAAAUCCCU", solver: "exact" })).rejects.toThrow(/field required/);
  });

  it("falls back to the status text when the body carries neither", async () => {
    server.use(http.post("*/api/v1/fold", () => new HttpResponse(null, { status: 500 })));
    await expect(foldSequence({ sequence: "GGGAAAUCCCU", solver: "exact" })).rejects.toBeInstanceOf(ApiError);
  });
});
