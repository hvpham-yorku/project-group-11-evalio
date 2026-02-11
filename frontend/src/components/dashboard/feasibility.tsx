"use client"

import { motion } from "framer-motion"
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Target,
  Award,
  ArrowRight,
  BarChart3,
} from "lucide-react"
import { Course } from "@/lib/api/client"
import { useMemo } from "react"

interface FeasibilityProps {
  course: Course
}

export function FeasibilityAnalysis({ course }: FeasibilityProps) {
  const analysis = useMemo(() => {
    const assessments = course.assessments
    if (assessments.length === 0) return null

    // Calculate current weighted average
    let completedWeight = 0
    let completedScore = 0
    let remainingWeight = 0
    const completed: { name: string; score: number; weight: number }[] = []
    const remaining: { name: string; weight: number }[] = []

    for (const a of assessments) {
      if (a.current_score !== null) {
        completedWeight += a.weight
        completedScore += a.current_score * a.weight
        completed.push({ name: a.name, score: a.current_score, weight: a.weight })
      } else {
        remainingWeight += a.weight
        remaining.push({ name: a.name, weight: a.weight })
      }
    }

    const currentAvg = completedWeight > 0 ? completedScore / completedWeight : 0

    // Required score on remaining assessments
    let requiredScore = 0
    if (remainingWeight > 0) {
      requiredScore = (course.target_grade - completedScore) / remainingWeight
      requiredScore = Math.max(0, Math.min(100, requiredScore))
    } else {
      // All graded — check if target was met
      const total = completedScore // since total weight should be ~1.0
      requiredScore = total >= course.target_grade ? 0 : 101 // impossible
    }

    const isAchievable = requiredScore <= 100
    const status: keyof typeof statusConfig =
      requiredScore <= 0
        ? "guaranteed"
        : requiredScore <= 70
        ? "comfortable"
        : requiredScore <= 85
        ? "achievable"
        : requiredScore <= 95
        ? "challenging"
        : requiredScore <= 100
        ? "risky"
        : "impossible"

    return {
      currentAvg: Math.round(currentAvg * 10) / 10,
      requiredScore: Math.round(requiredScore * 10) / 10,
      isAchievable,
      status,
      completed,
      remaining,
      completedWeight: Math.round(completedWeight * 100),
      remainingWeight: Math.round(remainingWeight * 100),
      riskRanges: {
        minimum: Math.round(requiredScore * 10) / 10,
        safe: Math.round(Math.min(100, requiredScore + 3) * 10) / 10,
        stretch: Math.round(Math.min(100, requiredScore + 8) * 10) / 10,
      },
    }
  }, [course])

  if (course.assessments.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-[40vh] text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <BarChart3 className="h-8 w-8 text-slate-300" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-1">No assessments to analyze</h3>
        <p className="text-sm text-slate-400 max-w-xs">
          Add assessments in the Course Setup tab first, then come back to see your feasibility
          analysis.
        </p>
      </motion.div>
    )
  }

  if (!analysis) return null

  const statusConfig = {
    guaranteed: {
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      icon: CheckCircle2,
      label: "Guaranteed",
      description: "You've already secured your target grade!",
    },
    comfortable: {
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      icon: CheckCircle2,
      label: "Comfortable",
      description: "Very achievable — you need a moderate score on remaining work.",
    },
    achievable: {
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-200",
      icon: TrendingUp,
      label: "Achievable",
      description: "Your target is reachable with solid performance on remaining assessments.",
    },
    challenging: {
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
      icon: AlertTriangle,
      label: "Challenging",
      description: "You'll need strong performance on remaining work to hit your target.",
    },
    risky: {
      color: "text-orange-600",
      bg: "bg-orange-50",
      border: "border-orange-200",
      icon: AlertTriangle,
      label: "Risky",
      description: "This will be very difficult — you need near-perfect scores.",
    },
    impossible: {
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-200",
      icon: XCircle,
      label: "Not Achievable",
      description: "Unfortunately, the target grade is no longer mathematically possible.",
    },
  }

  const config = statusConfig[analysis.status]
  const StatusIcon = config.icon

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Current Average */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-5 border border-slate-200/80"
        >
          <div className="flex items-center gap-2 mb-3">
            <Award className="h-4 w-4 text-indigo-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Current Average
            </span>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {analysis.completedWeight > 0 ? `${analysis.currentAvg}%` : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Based on {analysis.completedWeight}% of coursework
          </p>
        </motion.div>

        {/* Target */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-5 border border-slate-200/80"
        >
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Target Grade
            </span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{course.target_grade}%</p>
          <p className="text-xs text-slate-400 mt-1">{analysis.remainingWeight}% weight remaining</p>
        </motion.div>

        {/* Required Score */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`glass rounded-2xl p-5 border ${config.border}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className={`h-4 w-4 ${config.color}`} />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Required Score
            </span>
          </div>
          <p className={`text-3xl font-bold ${config.color}`}>
            {analysis.isAchievable ? `${analysis.requiredScore}%` : "N/A"}
          </p>
          <p className="text-xs text-slate-400 mt-1">On remaining assessments</p>
        </motion.div>
      </div>

      {/* Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className={`glass rounded-2xl p-6 border ${config.border} ${config.bg}`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}
          >
            <StatusIcon className={`h-6 w-6 ${config.color}`} />
          </div>
          <div>
            <h3 className={`text-lg font-bold ${config.color}`}>{config.label}</h3>
            <p className="text-slate-600 text-sm mt-1">{config.description}</p>
            {analysis.isAchievable && analysis.remaining.length > 0 && (
              <p className="text-slate-700 text-sm mt-2 font-medium">
                You need an average of{" "}
                <span className={`font-bold ${config.color}`}>{analysis.requiredScore}%</span> on
                your remaining {analysis.remaining.length} assessment
                {analysis.remaining.length > 1 ? "s" : ""} to reach {course.target_grade}%.
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Completed Assessments */}
      {analysis.completed.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-2xl p-6 border border-slate-200/80"
        >
          <h3 className="text-base font-bold text-slate-900 mb-4">Completed Assessments</h3>
          <div className="space-y-4">
            {analysis.completed.map((item, i) => (
              <div key={i}>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">{item.name}</span>
                  <span className="text-sm font-bold text-slate-900">
                    {item.score}%{" "}
                    <span className="text-slate-400 font-normal">
                      ({Math.round(item.weight * 100)}% weight)
                    </span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.score}%` }}
                    transition={{ duration: 0.6, delay: i * 0.1 }}
                    className={`h-full rounded-full ${
                      item.score >= 80
                        ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                        : item.score >= 60
                        ? "bg-gradient-to-r from-amber-400 to-amber-500"
                        : "bg-gradient-to-r from-red-400 to-red-500"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Risk Ranges */}
      {analysis.isAchievable && analysis.remaining.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass rounded-2xl p-6 border border-slate-200/80"
        >
          <h3 className="text-base font-bold text-slate-900 mb-1">Score Ranges</h3>
          <p className="text-xs text-slate-400 mb-5">
            What you need on remaining assessments for different outcomes
          </p>
          <div className="space-y-5">
            {[
              {
                label: `Minimum (${course.target_grade}%)`,
                score: analysis.riskRanges.minimum,
                gradient: "from-blue-400 to-blue-500",
                bg: "bg-blue-50",
                text: "text-blue-700",
              },
              {
                label: `Safe (${course.target_grade + 2}%)`,
                score: analysis.riskRanges.safe,
                gradient: "from-indigo-400 to-indigo-500",
                bg: "bg-indigo-50",
                text: "text-indigo-700",
              },
              {
                label: `Stretch (${course.target_grade + 5}%)`,
                score: analysis.riskRanges.stretch,
                gradient: "from-violet-400 to-violet-500",
                bg: "bg-violet-50",
                text: "text-violet-700",
              },
            ].map((item, i) => (
              <div key={i}>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">{item.label}</span>
                  <span className={`text-sm font-bold ${item.text} ${item.bg} px-2.5 py-0.5 rounded-full`}>
                    {item.score}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.score}%` }}
                    transition={{ duration: 0.6, delay: 0.3 + i * 0.1 }}
                    className={`h-full rounded-full bg-gradient-to-r ${item.gradient}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Remaining Assessments */}
      {analysis.remaining.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-2xl p-6 border border-slate-200/80"
        >
          <h3 className="text-base font-bold text-slate-900 mb-4">Upcoming Assessments</h3>
          <div className="space-y-2">
            {analysis.remaining.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">{item.name}</span>
                </div>
                <span className="text-sm font-semibold text-slate-500">
                  {Math.round(item.weight * 100)}% weight
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
