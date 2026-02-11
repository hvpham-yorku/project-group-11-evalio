"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { Calculator, ArrowRight, Info, RotateCcw } from "lucide-react"

const GPA_SCALES = {
  percentage: "Percentage (%)",
  four: "4.0 Scale (US/Canada)",
  nine: "9.0 Scale (India)",
  ten: "10.0 Scale",
  letter: "Letter Grade",
}

type ScaleKey = keyof typeof GPA_SCALES

function percentageTo4(pct: number): number {
  if (pct >= 90) return 4.0
  if (pct >= 85) return 3.9
  if (pct >= 80) return 3.7
  if (pct >= 77) return 3.3
  if (pct >= 73) return 3.0
  if (pct >= 70) return 2.7
  if (pct >= 67) return 2.3
  if (pct >= 63) return 2.0
  if (pct >= 60) return 1.7
  if (pct >= 57) return 1.3
  if (pct >= 53) return 1.0
  if (pct >= 50) return 0.7
  return 0.0
}

function percentageTo9(pct: number): number {
  if (pct >= 90) return 9.0
  if (pct >= 80) return 8.0
  if (pct >= 70) return 7.0
  if (pct >= 60) return 6.0
  if (pct >= 50) return 5.0
  if (pct >= 40) return 4.0
  return 0.0
}

function percentageTo10(pct: number): number {
  return Math.min(10, Math.max(0, pct / 10))
}

function percentageToLetter(pct: number): string {
  if (pct >= 93) return "A"
  if (pct >= 90) return "A-"
  if (pct >= 87) return "B+"
  if (pct >= 83) return "B"
  if (pct >= 80) return "B-"
  if (pct >= 77) return "C+"
  if (pct >= 73) return "C"
  if (pct >= 70) return "C-"
  if (pct >= 67) return "D+"
  if (pct >= 63) return "D"
  if (pct >= 60) return "D-"
  return "F"
}

function fourToPercentage(gpa: number): number {
  if (gpa >= 4.0) return 95
  if (gpa >= 3.7) return 87
  if (gpa >= 3.3) return 80
  if (gpa >= 3.0) return 77
  if (gpa >= 2.7) return 73
  if (gpa >= 2.3) return 70
  if (gpa >= 2.0) return 67
  if (gpa >= 1.7) return 63
  if (gpa >= 1.3) return 60
  if (gpa >= 1.0) return 57
  if (gpa >= 0.7) return 53
  return 40
}

function nineToPercentage(gpa: number): number {
  return Math.min(100, Math.max(0, (gpa / 9) * 100))
}

function tenToPercentage(gpa: number): number {
  return Math.min(100, Math.max(0, gpa * 10))
}

function letterToPercentage(letter: string): number {
  const map: Record<string, number> = {
    "A+": 97, "A": 95, "A-": 92,
    "B+": 88, "B": 85, "B-": 82,
    "C+": 78, "C": 75, "C-": 72,
    "D+": 68, "D": 65, "D-": 62,
    "F": 40,
  }
  return map[letter.toUpperCase()] ?? 0
}

function toPercentage(value: number | string, from: ScaleKey): number {
  const v = typeof value === "string" ? parseFloat(value) || 0 : value
  switch (from) {
    case "percentage": return Math.min(100, Math.max(0, v))
    case "four": return fourToPercentage(v)
    case "nine": return nineToPercentage(v)
    case "ten": return tenToPercentage(v)
    case "letter": return typeof value === "string" ? letterToPercentage(value) : 0
    default: return v
  }
}

export function GPAConverter() {
  const [inputValue, setInputValue] = useState("85")
  const [fromScale, setFromScale] = useState<ScaleKey>("percentage")

  const conversions = useMemo(() => {
    const pct = toPercentage(inputValue, fromScale)
    return {
      percentage: Math.round(pct * 10) / 10,
      four: percentageTo4(pct),
      nine: percentageTo9(pct),
      ten: Math.round(percentageTo10(pct) * 10) / 10,
      letter: percentageToLetter(pct),
    }
  }, [inputValue, fromScale])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <Calculator className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">GPA Converter</h2>
              <p className="text-sm text-muted-foreground">
                Convert grades between different scales instantly
              </p>
            </div>
          </div>
          <button
            onClick={() => { setInputValue("85"); setFromScale("percentage") }}
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Input Section */}
      <div className="glass rounded-2xl p-6">
        <label className="block text-sm font-semibold text-foreground mb-3">Input Scale</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
          {(Object.entries(GPA_SCALES) as [ScaleKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setFromScale(key)
                setInputValue(key === "letter" ? "A" : "85")
              }}
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                fromScale === key
                  ? "bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/20"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {fromScale === "letter" ? (
            <select
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="input-field flex-1 text-xl font-bold"
            >
              {["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"].map(
                (g) => (
                  <option key={g} value={g}>{g}</option>
                )
              )}
            </select>
          ) : (
            <input
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              min={0}
              max={fromScale === "percentage" ? 100 : fromScale === "four" ? 4 : fromScale === "nine" ? 9 : 10}
              step={fromScale === "four" ? 0.1 : 1}
              className="input-field flex-1 text-xl font-bold"
            />
          )}
          <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 text-right">
            <span className="text-sm text-muted-foreground">Converting from</span>
            <p className="text-lg font-bold text-primary">{GPA_SCALES[fromScale]}</p>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {([
          { key: "percentage" as ScaleKey, label: "Percentage", value: `${conversions.percentage}%`, color: "from-blue-500 to-blue-600" },
          { key: "four" as ScaleKey, label: "4.0 Scale", value: conversions.four.toFixed(1), color: "from-emerald-500 to-emerald-600" },
          { key: "letter" as ScaleKey, label: "Letter Grade", value: conversions.letter, color: "from-violet-500 to-violet-600" },
          { key: "nine" as ScaleKey, label: "9.0 Scale", value: conversions.nine.toFixed(1), color: "from-amber-500 to-amber-600" },
          { key: "ten" as ScaleKey, label: "10.0 Scale", value: conversions.ten.toFixed(1), color: "from-rose-500 to-rose-600" },
        ] as const)
          .filter((item) => item.key !== fromScale)
          .map((item, i) => (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-5 glass-hover"
            >
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {item.label}
              </p>
              <p className={`text-3xl font-bold gradient-text bg-gradient-to-r ${item.color}`}>
                {item.value}
              </p>
            </motion.div>
          ))}
      </div>

      {/* Info */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground mb-1">About GPA Scales</p>
            <p>
              Conversions are approximate and based on commonly used scales. The 4.0 scale follows
              the standard North American grading convention. The 9.0 and 10.0 scales are commonly
              used in Indian and European universities respectively. Actual conversions may vary by
              institution.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
