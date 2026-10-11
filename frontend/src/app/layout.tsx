import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Decidion FoldQ",
  description:
    "Explainable hybrid quantum-classical optimization for mRNA secondary-structure prediction",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1628" },
  ],
};

/** Applies a remembered dark theme before first paint. It runs ahead of React,
 *  so it is a plain string; the key matches THEME_STORAGE_KEY in ThemeToggle.
 *  Light stays the default, as it is Decidion's own look. */
const THEME_SCRIPT = `try{if(localStorage.getItem("foldq-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
