import "./globals.css"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "Evalio – Academic Planning & Grade Simulation",
  description: "Plan your grades with real rules. Extract course structures, run what-if scenarios, and calculate minimum required scores.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-[#F9F8F6] text-foreground antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
