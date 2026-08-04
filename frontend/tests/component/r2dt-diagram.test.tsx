import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { R2dtDiagram } from "@/components/rna/R2dtDiagram";

const JOB_ID = "r2dt-R20260803-184444-0638-96777356-p1m";
const SEQUENCE = "GCGGAUUUAGCUCAGUUGGGAGAGCGCC";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>G</text></svg>';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    statusText: "",
    json: async () => body,
  } as Response;
}

/** Queues responses in order so a test can script submit → RUNNING → FINISHED. */
function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("R2dtDiagram", () => {
  it("submits, polls, and renders the finished diagram", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockFetch(
      jsonResponse({ job_id: JOB_ID, state: "RUNNING" }),
      jsonResponse({ job_id: JOB_ID, state: "RUNNING", svg: null }),
      jsonResponse({
        job_id: JOB_ID,
        state: "FINISHED",
        svg: SVG,
        template: "E_Phe",
        template_source: "GtRNAdb",
        templated: true,
      }),
    );

    render(<R2dtDiagram sequence={SEQUENCE} />);
    await user.click(screen.getByRole("button", { name: /draw with r2dt/i }));

    await vi.advanceTimersByTimeAsync(4000);

    const image = await screen.findByRole("img");
    expect(image).toBeInTheDocument();
    // The template name is the whole reason to show this alongside our own
    // drawing, so it must reach the caption, not only the network response.
    expect(screen.getByText(/E_Phe/)).toBeInTheDocument();
    expect(screen.getByText(/GtRNAdb/)).toBeInTheDocument();
  });

  it("renders the SVG as an inert image, never as inline markup", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // A hostile payload: if this were injected with dangerouslySetInnerHTML the
    // script element would land in the document.
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>window.pwned=1</script></svg>';
    mockFetch(
      jsonResponse({ job_id: JOB_ID, state: "RUNNING" }),
      jsonResponse({
        job_id: JOB_ID,
        state: "FINISHED",
        svg: hostile,
        template: null,
        template_source: null,
        templated: false,
      }),
    );

    const { container } = render(<R2dtDiagram sequence={SEQUENCE} />);
    await user.click(screen.getByRole("button", { name: /draw with r2dt/i }));

    const image = await screen.findByRole("img");
    expect(image.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
    // The payload reached the page only inside a data URI.
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("says plainly when no template matched", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockFetch(
      jsonResponse({ job_id: JOB_ID, state: "RUNNING" }),
      jsonResponse({
        job_id: JOB_ID,
        state: "FINISHED",
        svg: SVG,
        template: null,
        template_source: null,
        templated: false,
      }),
    );

    render(<R2dtDiagram sequence={SEQUENCE} />);
    await user.click(screen.getByRole("button", { name: /draw with r2dt/i }));

    expect(await screen.findByText(/no template matched/i)).toBeInTheDocument();
    expect(screen.getByText(/follows no family convention/i)).toBeInTheDocument();
  });

  it("reports an outage without implying the fold itself failed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockFetch(
      jsonResponse(
        {
          error: {
            code: "STRUCTURE_SOURCE_UNAVAILABLE",
            message: "R2DT is unavailable: connection refused",
            trace_id: "trace_abc",
          },
        },
        503,
      ),
    );

    render(<R2dtDiagram sequence={SEQUENCE} />);
    await user.click(screen.getByRole("button", { name: /draw with r2dt/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/unavailable/i);
  });

  it("announces progress politely, since the result lands long after the click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockFetch(
      jsonResponse({ job_id: JOB_ID, state: "RUNNING" }),
      jsonResponse({ job_id: JOB_ID, state: "RUNNING", svg: null }),
    );

    const { container } = render(<R2dtDiagram sequence={SEQUENCE} />);
    await user.click(screen.getByRole("button", { name: /draw with r2dt/i }));

    await waitFor(() => {
      expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
    });
    expect(screen.getByText(/r2dt job running/i)).toBeInTheDocument();
  });
});
