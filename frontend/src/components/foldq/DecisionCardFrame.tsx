/** The card is rendered with an empty `sandbox` attribute, which denies every
 *  capability: no scripts, no same-origin access, no form submission. The template
 *  is trusted, but a report view has no reason to hold those permissions. */
export function DecisionCardFrame({ html }: { html: string }) {
  return (
    <iframe
      title="Decision card"
      srcDoc={html}
      sandbox=""
      className="h-[70vh] w-full rounded-lg border border-[var(--border)] bg-white"
    />
  );
}
