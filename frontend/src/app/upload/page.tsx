"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, FileText, CheckCircle2, ArrowRight, ArrowLeft, Sparkles, X } from "lucide-react"

const steps = [
  { num: 1, label: "Upload" },
  { num: 2, label: "Structure" },
  { num: 3, label: "Grades" },
  { num: 4, label: "Goals" },
  { num: 5, label: "Plan" },
  { num: 6, label: "Dashboard" },
]

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) setFile(selected)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-accent blur-lg opacity-50 group-hover:opacity-70 transition-opacity" />
              <div className="relative rounded-xl bg-gradient-to-br from-primary to-accent p-2.5">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
            </div>
            <div>
              <span className="text-lg font-bold text-foreground">Evalio</span>
              <p className="text-xs text-muted-foreground">Plan your academic success with confidence</p>
            </div>
          </Link>
          <div className="flex gap-3">
            <Link href="/dashboard">
              <button className="btn-secondary text-sm px-4 py-2">Dashboard</button>
            </Link>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="border-b border-border/40 bg-card/30">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <div className="flex items-center justify-between">
            {steps.map((step, i) => (
              <div key={step.num} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                  step.num < currentStep
                    ? "text-emerald-400"
                    : step.num === currentStep
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step.num < currentStep
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : step.num === currentStep
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-muted/50 text-muted-foreground border border-border/50"
                  }`}>
                    {step.num < currentStep ? <CheckCircle2 className="h-4 w-4" /> : step.num}
                  </div>
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`hidden sm:block w-12 lg:w-20 h-px mx-2 ${
                    step.num < currentStep ? "bg-emerald-500/30" : "bg-border/40"
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-3xl px-6 py-12">
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="text-3xl font-bold mb-2">Upload Your Syllabus</h2>
              <p className="text-muted-foreground mb-8">
                We&apos;ll extract your course&apos;s grading structure automatically...
              </p>

              {/* Upload Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 ${
                  isDragging
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : file
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border/60 bg-card/30 hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {file ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                      <FileText className="h-7 w-7 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{file.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null) }}
                      className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                    >
                      <X className="h-3 w-3" /> Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Upload className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Drop your syllabus here</p>
                      <p className="text-sm text-muted-foreground mt-1">or click to browse files</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                      className="btn-primary text-sm px-6 py-2.5"
                    >
                      Choose File
                    </button>
                    <p className="text-xs text-muted-foreground">
                      Supports PDF, Word, or text files
                    </p>
                  </div>
                )}
              </div>

              {/* Next Button */}
              {file && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 flex justify-end"
                >
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2"
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {currentStep >= 2 && (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-20"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Step {currentStep}: {steps[currentStep - 1].label}</h2>
              <p className="text-muted-foreground mb-8">This step is coming soon...</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="btn-secondary text-sm px-5 py-2.5 flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                {currentStep < 6 && (
                  <button
                    onClick={() => setCurrentStep(currentStep + 1)}
                    className="btn-primary text-sm px-5 py-2.5 flex items-center gap-2"
                  >
                    Next <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                {currentStep === 6 && (
                  <Link href="/dashboard">
                    <button className="btn-primary text-sm px-5 py-2.5 flex items-center gap-2">
                      Go to Dashboard <ArrowRight className="h-4 w-4" />
                    </button>
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
