"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

export function Navbar() {
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="sticky top-0 z-50 border-b border-border/40 bg-white/70 backdrop-blur-xl"
    >
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-accent blur-lg opacity-50 group-hover:opacity-70 transition-opacity" />
            <div className="relative rounded-xl bg-gradient-to-br from-primary to-accent p-2.5">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
          </div>
          <span className="text-lg font-bold text-foreground">Evalio</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</Link>
          <Link href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How It Works</Link>
        </nav>
        <Link href="/dashboard">
          <button className="btn-primary text-sm px-5 py-2.5">
            Get Started
          </button>
        </Link>
      </div>
    </motion.header>
  )
}
