import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "@/components/layout/providers"
import { Sidebar } from "@/components/layout/sidebar"

export const metadata: Metadata = {
  title: "trading agent",
  description: "Autonomous AI trading agent",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning style={{ margin: 0, fontFamily: "var(--dash-mono)" }}>
        <Providers>
          <div style={{ display: "flex", minHeight: "100vh", background: "var(--dash-bg)" }}>
            <Sidebar />
            <main style={{ marginLeft: 220, flex: 1, padding: 24, minHeight: "100vh" }}>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}