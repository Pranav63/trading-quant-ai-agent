import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/layout/providers";
import { Sidebar } from "@/components/layout/sidebar";
import MacroStrip from "@/components/MacroStrip";

export const metadata: Metadata = {
  title: "trading agent",
  description: "Autonomous AI trading agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        style={{
          margin: 0,
          fontFamily: "var(--dash-mono)",
          overflow: "hidden",
        }}
      >
        <Providers>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100vh",
              background: "var(--dash-bg)",
              overflow: "hidden",
            }}
          >
            <div style={{ marginLeft: 220 }}>
              <MacroStrip />
            </div>
            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
              <Sidebar />
              <main
                style={{
                  marginLeft: 220,
                  flex: 1,
                  padding: "16px 20px",
                  height: "100%",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
