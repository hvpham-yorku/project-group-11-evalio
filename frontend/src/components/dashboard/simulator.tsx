"use client"

import { motion } from "framer-motion"
import {
  Zap,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  Target,
  Award,
} from "lucide-react"
import { useState, useEffect, useMemo } from "react"
import { Course } from "@/lib/api/client"

interface SimulatorProps {
  course: Course
}

export function WhatIfSimulator({ course }: SimulatorProps) {
  const [scores, setScores] = useState<Record<string, number>>({})

  // Initialize scores from course data
  useEffect(() => {
    const initial: Record<string, number> = {}
    course.assessments.forEach((a) => {
      initial[a.name] = a.current_score ?? 75
    })
    setScores(initial)
  }, [course])

  const projectedGrade = useMemo(() => {
    return course.assessments.reduce((total, a) => {
      const score = scores[a.name] ?? 0
      return total + score * a.weight
    }, 0)
  }, [scores, course])

  const rounded = Math.round(projectedGrade * 10) / 10
  const meetsTarget = rounded >= course.target_grade
  const difference = Math.round((rounded - course.target_grade) * 10) / 10

  const handleReset = () => {
    const initial: Record<string, number> = {}
    course.assessments.forEach((a) => {
      initial[a.name] = a.current_score ?? 75
    })
    setScores(initial)
  }

  const handleSetAll = (value: number) => {
    const updated: Record<string, number> = {}
    course.assessments.forEach((a) => {
      // Only change scores for ungraded assessments
      updated[a.name] = a.current_score !== null ? a.current_score : value
    })
    setScores(updated)
  }

  if (course.assessments.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-[40vh] text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Zap className="h-8 w-8 text-slate-300" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-1">No assessments to simulate</h3>
        <p className="text-sm text-slate-400 max-w-xs">
          Add assessments in the Course Setup tab, then come back to run what-if scenarios.
        </p>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Projected Grade Header */}
      <div className="glass rounded-2xl p-6 border border-slate-200/80">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-orange-500/15">
                <Zap className="h-5 w-5 text-white" />
              </div>
              What-If Simulator
            </h2>
            <p className="text-sm text-slate-500 mt-1 ml-[46px]">
              Drag the sliders to test different scenarios
            </p>
          </div>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        {/* Big projected grade */}
        <div className="flex items-center gap-8 p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100">
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Projected Final Grade
            </p>
            <p
              className={`text-5xl font-bold ${
                meetsTarget ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {rounded}%
            </p>
            <div className="flex items-center gap-2 mt-3">
              {meetsTarget ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-600">
                    Target achieved! (+{difference} above {course.target_grade}%)
                  </span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium text-red-500">
                    {Math.abs(difference)} points below your {course.target_grade}% target
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={meetsTarget ? "#10b981" : "#ef4444"}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(rounded / 100) * 264} 264`}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className={`text-lg font-bold ${
                    meetsTarget ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {rounded}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="glass rounded-2xl p-5 border border-slate-200/80">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Quick Presets for Ungraded
        </p>
        <div className="flex flex-wrap gap-2">
          {[60, 70, 75, 80, 85, 90, 95, 100].map((val) => (
            <button
              key={val}
              onClick={() => handleSetAll(val)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
            >
              {val}%
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="glass rounded-2xl p-6 border border-slate-200/80">
        <h3 className="text-base font-bold text-slate-900 mb-5">Assessment Scores</h3>
        <div className="space-y-6">
          {course.assessments.map((assessment, index) => {
            const score = scores[assessment.name] ?? 75
            const isGraded = assessment.current_score !== null
            const contribution = Math.round(score * assessment.weight * 10) / 10

            return (
              <motion.div
                key={assessment.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {assessment.name}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      ({Math.round(assessment.weight * 100)}%)
                    </span>
                    {isGraded && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">
                        <CheckCircle2 className="h-3 w-3" />
                        GRADED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">
                      Contributes: {contribution} pts
                    </span>
                    <span
                      className={`text-lg font-bold min-w-[48px] text-right ${
                        score >= 80
                          ? "text-emerald-600"
                          : score >= 60
                          ? "text-amber-600"
                          : "text-red-500"
                      }`}
                    >
                      {score}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={score}
                  onChange={(e) =>
                    setScores((prev) => ({
                      ...prev,
                      [assessment.name]: parseInt(e.target.value),
                    }))
                  }
                  className="w-full"
                  disabled={isGraded}
                  style={{ opacity: isGraded ? 0.5 : 1 }}
                />
                {isGraded && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Locked — this assessment has been graded
                  </p>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Grade Breakdown */}
      <div className="glass rounded-2xl p-6 border border-slate-200/80">
        <h3 className="text-base font-bold text-slate-900 mb-4">Grade Breakdown</h3>
        <div className="space-y-2">
          {course.assessments.map((assessment) => {
            const score = scores[assessment.name] ?? 0
            const contribution = Math.round(score * assessment.weight * 10) / 10
            const pctWeight = Math.round(assessment.weight * 100)

            return (
              <div
                key={assessment.id}
                className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      assessment.current_score !== null ? "bg-emerald-400" : "bg-slate-300"
                    }`}
                  />
                  <span className="text-sm text-slate-600">
                    {assessment.name}{" "}
                    <span className="text-slate-400">({pctWeight}%)</span>
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400">
                    {score} × {pctWeight}% =
                  </span>
                  <span className="text-sm font-bold text-slate-900 min-w-[45px] text-right">
                    {contribution}
                  </span>
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-3 border-t-2 border-slate-200">
            <span className="text-sm font-bold text-slate-900">Total</span>
            <span
              className={`text-lg font-bold ${
                meetsTarget ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {rounded}%
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
