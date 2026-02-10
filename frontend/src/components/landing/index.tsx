"use client"

import Link from "next/link"
import { Navbar } from "./navbar"
import { Upload, Eye, Zap, ArrowRight } from "lucide-react"

export function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 text-white leading-tight">
            Your <span className="text-gradient-cyan">Academic</span> Superpower
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Upload your course syllabus and instantly understand exactly what score you need on every remaining assessment to hit your target grade.
          </p>
          <Link href="/dashboard">
            <button className="btn-primary inline-flex items-center gap-2">
              Start Planning <ArrowRight size={20} />
            </button>
          </Link>
        </div>
      </section>

      {/* Three-Step Process */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-white mb-16">How Evalio Works</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="glass rounded-2xl p-8 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-colors">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center mb-4">
                <Upload size={24} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">1. Upload Syllabus</h3>
              <p className="text-slate-300">
                Drop your course PDF. We automatically extract all assessments, weights, and grading rules.
              </p>
            </div>

            {/* Step 2 */}
            <div className="glass rounded-2xl p-8 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-colors">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center mb-4">
                <Eye size={24} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">2. Review & Confirm</h3>
              <p className="text-slate-300">
                Verify extracted data. Edit grading rules if needed. Confirm your course setup.
              </p>
            </div>

            {/* Step 3 */}
            <div className="glass rounded-2xl p-8 backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/40 transition-colors">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center mb-4">
                <Zap size={24} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">3. Plan Your Path</h3>
              <p className="text-slate-300">
                See exactly what you need on each remaining assessment to reach your target grade.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Take Control?</h2>
          <p className="text-lg text-slate-300 mb-8">
            Stop guessing about your grades. Start planning with precision.
          </p>
          <Link href="/dashboard">
            <button className="btn-primary inline-flex items-center gap-2">
              Open Dashboard <ArrowRight size={20} />
            </button>
          </Link>
        </div>
      </section>
    </div>
  )
}
