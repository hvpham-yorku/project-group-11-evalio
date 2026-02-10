"use client"

import { motion } from "framer-motion"
import { Sidebar } from "./sidebar"
import { CourseExtraction } from "./course-extraction"
import { FeasibilityAnalysis } from "./feasibility"
import { WhatIfSimulator } from "./simulator"
import { useState } from "react"
import { ChevronDown } from "lucide-react"

export function Dashboard() {
  const [activeView, setActiveView] = useState<"extraction" | "feasibility" | "simulator">("feasibility")
  const [hasCourse, setHasCourse] = useState(true)

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {!hasCourse ? (
            <CourseExtraction />
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Tab Navigation */}
              <div className="mb-8 flex gap-2 border-b border-slate-700/40">
                {[
                  { id: "extraction", label: "📤 Course Extraction" },
                  { id: "feasibility", label: "📊 Feasibility Analysis" },
                  { id: "simulator", label: "⚡ What-If Simulator" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveView(tab.id as any)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                      activeView === tab.id
                        ? "border-cyan-500 text-cyan-400"
                        : "border-transparent text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              {activeView === "extraction" && <CourseExtraction />}
              {activeView === "feasibility" && <FeasibilityAnalysis />}
              {activeView === "simulator" && <WhatIfSimulator />}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  )
}
