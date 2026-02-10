"use client"

import Link from "next/link"
import { Zap } from "lucide-react"

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-blue-900/20 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-50">
          <div className="rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 p-2">
            <Zap className="h-5 w-5 text-white" />
          </div>
          Evalio
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="#" className="text-slate-300 hover:text-slate-50">Docs</Link>
          <Link href="#" className="text-slate-300 hover:text-slate-50">GitHub</Link>
        </nav>
        <Link href="/dashboard" className="btn-primary">
          Get Started
        </Link>
      </div>
    </header>
  )
}
