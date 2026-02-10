"use client"

import { motion } from "framer-motion"
import { Upload, FileUp, ArrowRight, AlertCircle } from "lucide-react"
import { useState } from "react"

export function CourseExtraction() {
  const [step, setStep] = useState<"upload" | "preview" | "confirm">("upload")

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {step === "upload" && (
        <div className="rounded-xl border border-blue-900/30 bg-gradient-to-br from-slate-900/80 to-slate-950 p-8">
          <div className="mb-8">
            <h2 className="mb-2 text-2xl font-bold text-slate-50">Upload Course Outline</h2>
            <p className="text-slate-400">PDF, image, or screenshot of your course syllabus</p>
          </div>

          <div className="rounded-lg border-2 border-dashed border-blue-500/30 bg-blue-500/5 p-12 text-center hover:border-blue-500/50 transition">
            <Upload className="mx-auto mb-4 h-12 w-12 text-blue-400" />
            <h3 className="mb-2 text-lg font-semibold text-slate-50">Drag & drop or click to upload</h3>
            <p className="mb-6 text-slate-400 text-sm">PDF, PNG, JPG (max 10MB)</p>
            <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg" />
            <button className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-2 font-medium text-white hover:shadow-lg hover:shadow-blue-500/30 transition-all">
              Choose File
            </button>
          </div>

          <p className="mt-6 text-xs text-slate-500 text-center">
            We'll extract assessments, weights, and grading rules automatically using OCR
          </p>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-blue-900/30 bg-gradient-to-br from-slate-900/80 to-slate-950 p-8">
            <h2 className="mb-6 text-2xl font-bold text-slate-50">Review Extracted Structure</h2>

            {/* Extracted Data Preview */}
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-700/40 bg-slate-950/50 p-4">
                <p className="text-xs text-slate-500 mb-1">Course Name</p>
                <p className="font-semibold text-slate-50">EECS 2311Z: Object-Oriented Design</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-300 mb-3">Assessments & Weights</p>
                <div className="space-y-2">
                  {[
                    { name: "Iteration Tests", weight: "20%", type: "percent" },
                    { name: "Iteration Deliverables", weight: "40%", type: "percent" },
                    { name: "Final Demo", weight: "40%", type: "percent" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-950/50 p-3">
                      <div>
                        <p className="font-medium text-slate-50">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.type}</p>
                      </div>
                      <span className="text-lg font-bold text-cyan-400">{item.weight}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                <p className="text-sm font-semibold text-blue-300 mb-2">Grading Rules Detected</p>
                <ul className="space-y-1 text-sm text-blue-200">
                  <li>✓ All assessments counted towards final grade</li>
                  <li>✓ Total weight = 100%</li>
                  <li>✓ No special rules (best-of, drop lowest)</li>
                </ul>
              </div>
            </div>

            <div className="mt-8 flex gap-4">
              <button
                onClick={() => setStep("upload")}
                className="flex-1 rounded-lg border border-slate-600 px-4 py-2.5 font-medium text-slate-300 hover:border-slate-500 hover:bg-slate-800/40 transition"
              >
                Back
              </button>
              <button
                onClick={() => setStep("confirm")}
                className="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 font-medium text-white hover:shadow-lg hover:shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="rounded-xl border border-green-900/30 bg-gradient-to-br from-slate-900/80 to-slate-950 p-8 text-center">
          <div className="mb-4 rounded-full bg-green-500/20 w-16 h-16 flex items-center justify-center mx-auto">
            <FileUp className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-slate-50">Course Added Successfully!</h2>
          <p className="mb-8 text-slate-400">EECS 2311Z is ready for grade planning</p>
          <button className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-2.5 font-medium text-white hover:shadow-lg hover:shadow-blue-500/30 transition-all">
            Start Planning
          </button>
        </div>
      )}
    </motion.div>
  )
}
