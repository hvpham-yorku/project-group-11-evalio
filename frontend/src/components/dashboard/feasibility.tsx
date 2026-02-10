"use client"

import { motion } from "framer-motion"
import { TrendingUp, AlertTriangle, CheckCircle } from "lucide-react"

export function FeasibilityAnalysis() {
  const course = {
    name: "EECS 2311Z",
    current: 78.5,
    target: 85,
    completed: { tests: 78, deliverables: 79 },
    remainingWeight: 40,
  }

  const feasibility = {
    status: "achievable",
    requiredScore: 88.5,
    explanation: "You need an 88.5% on the Final Demo to reach 85%. This is challenging but possible.",
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Course Header */}
      <div className="rounded-xl border border-blue-900/30 bg-gradient-to-br from-slate-900/80 to-slate-950 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-50">{course.name}</h2>
            <p className="text-slate-400">Winter 2026</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 mb-1">Current Average</p>
            <p className="text-3xl font-bold text-cyan-400">{course.current}%</p>
          </div>
        </div>

        {/* Assessment Progress */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-300">Completed Assessments</p>
          {[
            { name: "Iteration Tests", score: course.completed.tests, weight: 20 },
            { name: "Iteration Deliverables", score: course.completed.deliverables, weight: 40 },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-50">{item.name}</p>
                <div className="mt-1 h-2 rounded-full bg-slate-700/40">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${item.score}%` }} />
                </div>
              </div>
              <span className="ml-4 text-sm font-bold text-slate-300 min-w-[50px] text-right">{item.score}% ({item.weight}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feasibility Status */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Target Analysis */}
        <div className="rounded-xl border border-blue-900/30 bg-gradient-to-br from-slate-900/80 to-slate-950 p-6">
          <div className="flex items-center gap-3 mb-4">
            {feasibility.status === "achievable" && <CheckCircle className="h-5 w-5 text-green-400" />}
            {feasibility.status === "risky" && <AlertTriangle className="h-5 w-5 text-yellow-400" />}
            <h3 className="font-semibold text-slate-50">Target: {course.target}%</h3>
          </div>
          <p className="text-3xl font-bold mb-4">
            <span className={
              feasibility.status === "achievable" ? "text-green-400" :
              feasibility.status === "risky" ? "text-yellow-400" :
              "text-red-400"
            }>
              {feasibility.status.charAt(0).toUpperCase() + feasibility.status.slice(1)}
            </span>
          </p>
          <p className="text-slate-400 text-sm">{feasibility.explanation}</p>
        </div>

        {/* Required Score */}
        <div className="rounded-xl border border-cyan-900/30 bg-gradient-to-br from-slate-900/80 to-slate-950 p-6">
          <p className="text-xs text-slate-500 mb-2">Minimum Required on Final Demo</p>
          <p className="text-4xl font-bold text-cyan-400 mb-4">{feasibility.requiredScore}%</p>
          <div className="space-y-2 text-sm text-slate-400">
            <p>Remaining weight: {course.remainingWeight}%</p>
            <p>If you score below this, 85% target is impossible</p>
          </div>
        </div>
      </div>

      {/* Risk Ranges */}
      <div className="rounded-xl border border-blue-900/30 bg-gradient-to-br from-slate-900/80 to-slate-950 p-6">
        <h3 className="mb-4 font-semibold text-slate-50">Score Ranges for Final Demo</h3>
        <div className="space-y-4">
          {[
            { label: "Minimum (85% target)", score: 88.5, color: "bg-red-500" },
            { label: "Safe (87% target)", score: 91.5, color: "bg-yellow-500" },
            { label: "Stretch (90% target)", score: 96.5, color: "bg-green-500" },
          ].map((item, i) => (
            <div key={i}>
              <div className="flex justify-between mb-2">
                <p className="text-sm font-medium text-slate-300">{item.label}</p>
                <p className="text-sm font-bold text-slate-100">{item.score}%</p>
              </div>
              <div className="h-2 rounded-full bg-slate-700/40">
                <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
