"use client"

import Link from "next/link"
import { Plus, BarChart3, Zap, Settings, LogOut } from "lucide-react"

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-56 border-r border-blue-900/30 bg-slate-900/60 p-4 backdrop-blur md:block sticky top-0 overflow-auto">
      {/* Logo */}
      <Link href="/" className="mb-8 flex items-center gap-3 group">
        <div className="rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 p-2.5">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="font-bold text-sm text-slate-50">Evalio</div>
          <div className="text-xs text-slate-500">v0.1</div>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="mb-12 space-y-1">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-lg bg-blue-500/15 px-4 py-2.5 text-sm font-medium text-blue-300 border border-blue-500/30">
          <BarChart3 className="h-4 w-4" />
          My Courses
        </Link>
      </nav>

      {/* Quick Actions */}
      <div className="mb-12 space-y-2 border-t border-slate-700/40 pt-4">
        <button className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:shadow-lg hover:shadow-blue-500/30 transition-all">
          <Plus className="mr-2 h-4 w-4 inline" />
          New Course
        </button>
      </div>

      {/* Bottom */}
      <div className="absolute bottom-4 left-4 right-4 space-y-2">
        <Link href="#settings" className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-300 hover:bg-slate-800/40 transition">
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-300 hover:bg-slate-800/40 transition">
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
