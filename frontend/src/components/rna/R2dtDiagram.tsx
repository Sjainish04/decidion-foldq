"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, requestDiagram } from "@/lib/api/client";
import type { DiagramResult } from "@/lib/api/schemas";

/** A template-based secondary-structure diagram from EMBL-EBI's R2DT.
 *
 *  Complements this project's own drawings rather than replacing them. FoldQ
 *  lays a structure out from the structure alone; R2DT matches it against
 *  curated templates, so a tRNA appears in the cloverleaf orientation the
 *  literature uses. Seeing both is how you tell "this is the conventional shape"
 *  from "this is what our layout happened to produce".
 *
 *  **The SVG is rendered through an `<img>` data URI, never `dangerouslySet-
 *  InnerHTML`.** SVG is an active format: inline, it can carry `<script>` and
 *  event handlers that run with this origin's privileges. Loaded as an image,
 *  the browser treats it as inert by specification. The sequence submitted by
 *  the user reaches R2DT and comes back inside the returned document, so this is
 *  a real path from user input to markup, not a hypothetical one. The cost is
 *  losing per-nucleotide hover — worth paying, and the interactive drawing
 *  elsewhere on the page already provides it.
 */
export function R2dtDiagram({ sequence }: { sequence: string }) {
  const [result, setResult] = useState<DiagramResult | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // A job outlives a click, so an unmount mid-poll must stop the loop.
  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setPending(true);
    setError(null);
    setResult(null);
    setState("SUBMITTING");

    try {
      const diagram = await requestDiagram(sequence, {
        signal: controller.signal,
        onState: setState,
      });
      if (!controller.signal.aborted) setResult(diagram);
    } catch (caught) {
      if (controller.signal.aborted || (caught as Error)?.name === "AbortError") return;
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not reach the diagram service. It is an external dependency; this does not affect the fold above.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        setState(null);
      }
    }
  }, [sequence]);

  return (
    <section className="rounded-lg border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Template diagram (R2DT)</h3>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="rounded border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          {pending ? "Drawing…" : result ? "Redraw" : "Draw with R2DT"}
        </button>
      </div>

      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Drawn by{" "}
        <a
          href="https://rnacentral.org/r2dt"
          target="_blank"
          rel="noreferrer noopener"
          className="underline"
        >
          R2DT
        </a>{" "}
        at EMBL-EBI, which places nucleotides using curated family templates. Runs on their
        servers and takes up to a minute.
      </p>

      {/* Politeness matters here: the result arrives a minute after the click,
          long after focus has moved on. */}
      <div aria-live="polite" className="mt-3">
        {pending && (
          <p className="text-sm text-[var(--text-secondary)]">
            {state === "SUBMITTING" ? "Submitting to R2DT…" : `R2DT job ${state?.toLowerCase()}…`}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-[var(--accent-text)]">
            {error}
          </p>
        )}

        {result?.svg && (
          <figure className="mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element --
                next/image optimises remote and static assets; this is an
                already-in-memory data URI, so there is nothing to optimise and
                it would only add required width/height. The plain <img> is also
                the security control described above, not a shortcut. */}
            <img
              src={`data:image/svg+xml;base64,${toBase64(result.svg)}`}
              alt={
                result.templated
                  ? `Secondary structure diagram drawn from the ${result.template} template`
                  : "Secondary structure diagram, computed layout"
              }
              className="mx-auto max-w-full bg-white"
            />
            <figcaption className="mt-2 text-sm text-[var(--text-secondary)]">
              {result.templated ? (
                <>
                  Matched template <strong>{result.template}</strong> from {result.template_source}.
                  The orientation follows that family&rsquo;s convention.
                </>
              ) : (
                // Said plainly: without a template the layout is computed, so
                // its orientation carries no meaning and should not be read as
                // though it did.
                <>
                  No template matched, so R2DT computed the layout. The shape is valid but follows
                  no family convention.
                </>
              )}
            </figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}

/** UTF-8 safe base64. `btoa` alone throws on any byte above U+00FF, and R2DT's
 *  output contains them. */
function toBase64(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
