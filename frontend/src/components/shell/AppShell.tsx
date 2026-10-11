import { CommandPalette } from "./CommandPalette";
import { Footer } from "./Footer";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--surface)] focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          id="main"
          className="mx-auto w-full min-w-0 max-w-[1240px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
        >
          {children}
        </main>
        <Footer />
      </div>
      <CommandPalette />
    </div>
  );
}
