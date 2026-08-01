import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/AppShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("AppShell", () => {
  it("renders its children", () => {
    render(<AppShell>content</AppShell>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("exposes navigation as a landmark", () => {
    render(<AppShell>x</AppShell>);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("marks the active route with aria-current", () => {
    render(<AppShell>x</AppShell>);
    expect(screen.getByRole("link", { name: /command center/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens the command palette on the keyboard shortcut", async () => {
    render(<AppShell>x</AppShell>);
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog", { name: /command/i })).toBeInTheDocument();
  });

  it("has a skip link to main content", () => {
    render(<AppShell>x</AppShell>);
    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute(
      "href",
      "#main",
    );
  });
});
