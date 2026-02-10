"use client"

import { motion } from "framer-motion"
import { Zap, TrendingDown, TrendingUp } from "lucide-react"
import { useState } from "react"

export function WhatIfSimulator() {
  const [finalDemoScore, setFinalDemoScore] = useState(88.5)

  const calculateFinal = () => {
    const tests = 78 * 0.2
    const deliverables = 79 * 0.4
    const demo = finalDemoScore * 0.4
    return (tests + deliverables + demo).toFixed(1)
  }

  const finalGrade = parseFloat(calculateFinal())

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="rounded-xl border border-blue-900/30 bg-gradient-to-br from-slate-900/80 to-slate-950 p-6">
        <h2 className="mb-2 text-2xl font-bold text-slate-50 flex items-center gap-2">
          <Zap className="h-6 w-6 text-yellow-400" />
          What-If Simulator
        </h2>
        <p className="text-slate-400 mb-8">Test hypothetical scores and see how they affect your final grade</p>

        {/* Slider */}
        <div className="space-y-4 mb-8">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-semibold text-slate-300">Final Demo Score</label>
              <span className="text-2xl font-bold text-cyan-400">{finalDemoScore}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={finalDemoScore}
              onChange={(e) => setFinalDemoScore(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full bg-slate-700 appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-2">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Results Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Current Grade */}
          <div className="rounded-lg border border-slate-700/40 bg-slate-950/50 p-4">
            <p className="text-xs text-slate-500 mb-2">Projected Final Grade</p>
            <p className="text-3xl font-bold mb-2">
              <span className={
                finalGrade >= 85 ? "text-green-400" :
                finalGrade >= 75 ? "text-yellow-400" :
                "text-red-400"
              }>
                {finalGrade}%
              </span>
            </p>
            <p className="text-sm text-slate-400">
              {finalGrade >= 85 ? "✓ Target achieved!" : finalGrade >= 75 ? "⚠ Below target" : "✗ Failing grade"}
            </p>
          </div>

          {/* Breakdown */}
          <div className="rounded-lg border border-slate-700/40 bg-slate-950/50 p-4">
            <p className="text-xs text-slate-500 mb-3">Grade Breakdown</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Tests (20%)</span>
                <span className="font-semibold text-slate-300">{(78 * 0.2).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Deliverables (40%)</span>
                <span className="font-semibold text-slate-300">{(79 * 0.4).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Demo (40%)</span>
                <span className="font-semibold text-slate-300">{(finalDemoScore * 0.4).toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="mt-6 rounded-lg border border-slate-700/40 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-300 mb-1">Target Status</p>
              <p className="text-slate-400 text-sm">
                {finalGrade >= 85 ? "🎉 You will reach your 85% target!" : `Need ${(85 - finalGrade).toFixed(1)} more percentage points`}
              </p>
            </div>
            {finalGrade >= 85 ? (
              <TrendingUp className="h-6 w-6 text-green-400" />
            ) : (
              <TrendingDown className="h-6 w-6 text-red-400" />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
