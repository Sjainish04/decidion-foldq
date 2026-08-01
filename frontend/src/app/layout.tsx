import type { Metadata } from "next";
import "@/styles/globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Decidion FoldQ",
  description:
    "Explainable hybrid quantum-classical optimization for mRNA secondary-structure prediction",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
