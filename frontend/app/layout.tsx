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
      <body suppressHydrationWarning style={{ margin: 0, fontFamily: "var(--dash-mono)", overflow: "hidden" }}>
        <Providers>
          <div style={{ display: "flex", height: "100vh", background: "var(--dash-bg)", overflow: "hidden" }}>
            <Sidebar />
            <main style={{
              marginLeft: 220, flex: 1,
              padding: "16px 20px",
              height: "100vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}