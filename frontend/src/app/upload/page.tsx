"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  Upload, FileText, CheckCircle2, ArrowRight, ArrowLeft,
  Sparkles, X, Plus, Trash2, Loader2, Target, BarChart3,
  AlertCircle
} from "lucide-react"
import { uploadApi, coursesApi } from "@/lib/api/client"

const steps = [
  { num: 1, label: "Upload" },
  { num: 2, label: "Structure" },
  { num: 3, label: "Grades" },
  { num: 4, label: "Goals" },
  { num: 5, label: "Plan" },
  { num: 6, label: "Dashboard" },
]

interface AssessmentItem {
  name: string
  weight: number
  current_score: number | null
}

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [courseName, setCourseName] = useState("")
  const [assessments, setAssessments] = useState<AssessmentItem[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newWeight, setNewWeight] = useState("")

  const [targetGrade, setTargetGrade] = useState(80)

  const [isCreating, setIsCreating] = useState(false)
  const [createdCourseId, setCreatedCourseId] = useState<number | null>(null)
  const [analysisResult, setAnalysisResult] = useState<{
    requiredScore: number
    isAchievable: boolean
    currentAvg: number
  } | null>(null)

  const totalWeight = assessments.reduce((sum, a) => sum + a.weight, 0)

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

  const handleParseFile = async () => {
    if (!file) return
    setIsParsing(true)
    setParseError(null)
    try {
      const result = await uploadApi.parseSyllabus(file)
      setCourseName(result.course_name)
      setAssessments(result.assessments.map(a => ({ ...a, current_score: null })))
      setCurrentStep(2)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to parse file"
      setParseError(msg)
    } finally {
      setIsParsing(false)
    }
  }

  const handleSkipUpload = () => {
    setCourseName("")
    setAssessments([
      { name: "Midterm Exam", weight: 0.25, current_score: null },
      { name: "Final Exam", weight: 0.35, current_score: null },
      { name: "Assignments", weight: 0.20, current_score: null },
      { name: "Participation", weight: 0.10, current_score: null },
      { name: "Project", weight: 0.10, current_score: null },
    ])
    setCurrentStep(2)
  }

  const addAssessment = () => {
    if (!newName || !newWeight) return
    const w = parseFloat(newWeight) / 100
    if (w <= 0 || w > 1) return
    setAssessments([...assessments, { name: newName, weight: w, current_score: null }])
    setNewName("")
    setNewWeight("")
    setShowAddForm(false)
  }

  const removeAssessment = (i: number) => {
    setAssessments(assessments.filter((_, idx) => idx !== i))
  }

  const updateAssessmentWeight = (i: number, val: string) => {
    const w = parseFloat(val) / 100
    if (isNaN(w)) return
    const updated = [...assessments]
    updated[i] = { ...updated[i], weight: Math.min(1, Math.max(0, w)) }
    setAssessments(updated)
  }

  const updateAssessmentName = (i: number, val: string) => {
    const updated = [...assessments]
    updated[i] = { ...updated[i], name: val }
    setAssessments(updated)
  }

  const updateScore = (i: number, val: string) => {
    const updated = [...assessments]
    updated[i] = { ...updated[i], current_score: val === "" ? null : parseFloat(val) }
    setAssessments(updated)
  }

  const handleCreateCourseAndAnalyze = async () => {
    setIsCreating(true)
    try {
      const course = await coursesApi.create(courseName || "My Course", targetGrade)
      setCreatedCourseId(course.id)
      await uploadApi.batchCreateAssessments(
        course.id,
        assessments.map(a => ({
          name: a.name,
          weight: a.weight,
          current_score: a.current_score,
        }))
      )
      const graded = assessments.filter(a => a.current_score !== null)
      const gradedWeight = graded.reduce((s, a) => s + a.weight, 0)
      const gradedScore = graded.reduce((s, a) => s + (a.current_score || 0) * a.weight, 0)
      const remainingWeight = totalWeight - gradedWeight
      const currentAvg = gradedWeight > 0 ? gradedScore / gradedWeight : 0
      const requiredScore = remainingWeight > 0 ? (targetGrade - gradedScore) / remainingWeight : 0
      setAnalysisResult({
        requiredScore: Math.max(0, Math.min(100, requiredScore)),
        isAchievable: requiredScore <= 100,
        currentAvg: Math.round(currentAvg * 10) / 10,
      })
      setCurrentStep(5)
    } catch {
      setParseError("Failed to create course. Make sure the backend is running.")
    } finally {
      setIsCreating(false)
    }
  }

  const anim = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3 },
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
              <p className="text-xs text-muted-foreground">Plan your academic success</p>
            </div>
          </Link>
          <Link href="/dashboard">
            <button className="btn-secondary text-sm px-4 py-2">Dashboard</button>
          </Link>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="border-b border-border/40 bg-card/30">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <div className="flex items-center justify-between">
            {steps.map((step, i) => (
              <div key={step.num} className="flex items-center gap-2">
                <button
                  onClick={() => { if (step.num < currentStep) setCurrentStep(step.num) }}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    step.num < currentStep ? "text-emerald-400 cursor-pointer" : step.num === currentStep ? "text-primary" : "text-muted-foreground cursor-default"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step.num < currentStep ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : step.num === currentStep ? "bg-primary/20 text-primary border border-primary/30" : "bg-muted/50 text-muted-foreground border border-border/50"
                  }`}>
                    {step.num < currentStep ? <CheckCircle2 className="h-4 w-4" /> : step.num}
                  </div>
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
                {i < steps.length - 1 && <div className={`hidden sm:block w-12 lg:w-20 h-px mx-2 ${step.num < currentStep ? "bg-emerald-500/30" : "bg-border/40"}`} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-3xl px-6 py-12">
        {parseError && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{parseError}</p>
            <button onClick={() => setParseError(null)} className="ml-auto"><X className="h-4 w-4 text-destructive" /></button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ======= STEP 1: UPLOAD ======= */}
          {currentStep === 1 && (
            <motion.div key="step1" {...anim}>
              <h2 className="text-3xl font-bold mb-2">Upload Your Syllabus</h2>
              <p className="text-muted-foreground mb-8">
                We&apos;ll extract your course&apos;s grading structure automatically.
              </p>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 ${
                  isDragging ? "border-primary bg-primary/5 scale-[1.01]" : file ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60 bg-card/30 hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFileSelect} className="hidden" />
                {file ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center"><FileText className="h-7 w-7 text-emerald-400" /></div>
                    <div>
                      <p className="font-semibold text-foreground">{file.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setFile(null) }} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
                      <X className="h-3 w-3" /> Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center"><Upload className="h-7 w-7 text-primary" /></div>
                    <div>
                      <p className="font-semibold text-foreground">Drop your syllabus here</p>
                      <p className="text-sm text-muted-foreground mt-1">or click to browse files</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Supports PDF, Word, or text files</p>
                  </div>
                )}
              </div>

              <div className="mt-8 flex items-center justify-between">
                <button onClick={handleSkipUpload} className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
                  Skip — enter manually
                </button>
                {file && (
                  <button onClick={handleParseFile} disabled={isParsing} className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2">
                    {isParsing ? <><Loader2 className="h-4 w-4 animate-spin" /> Parsing...</> : <>Extract Structure <ArrowRight className="h-4 w-4" /></>}
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* ======= STEP 2: STRUCTURE ======= */}
          {currentStep === 2 && (
            <motion.div key="step2" {...anim}>
              <h2 className="text-3xl font-bold mb-2">Course Structure</h2>
              <p className="text-muted-foreground mb-6">Review and edit the extracted assessments.</p>

              <div className="mb-6">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Course Name</label>
                <input
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g. EECS 2311 – Software Development"
                  className="input-field w-full text-lg"
                />
              </div>

              <div className="space-y-3 mb-4">
                {assessments.map((a, i) => (
                  <div key={i} className="glass rounded-xl p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <input
                        value={a.name}
                        onChange={(e) => updateAssessmentName(i, e.target.value)}
                        className="bg-transparent text-foreground font-medium outline-none w-full"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={Math.round(a.weight * 100)}
                        onChange={(e) => updateAssessmentWeight(i, e.target.value)}
                        className="w-16 bg-secondary rounded-lg px-2 py-1 text-center text-sm text-foreground outline-none"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <button onClick={() => removeAssessment(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className={`text-sm mb-4 ${Math.abs(totalWeight - 1) < 0.01 ? "text-emerald-400" : "text-amber-400"}`}>
                Total weight: {Math.round(totalWeight * 100)}%
                {Math.abs(totalWeight - 1) > 0.01 && " — should equal 100%"}
              </div>

              {showAddForm ? (
                <div className="glass rounded-xl p-4 flex items-center gap-3">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Assessment name" className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground" />
                  <input type="number" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} placeholder="%" className="w-16 bg-secondary rounded-lg px-2 py-1 text-center text-sm outline-none" />
                  <button onClick={addAssessment} className="btn-primary text-xs px-3 py-1.5">Add</button>
                  <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <button onClick={() => setShowAddForm(true)} className="text-sm text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors">
                  <Plus className="h-4 w-4" /> Add Assessment
                </button>
              )}

              <div className="mt-8 flex justify-between">
                <button onClick={() => setCurrentStep(1)} className="btn-secondary text-sm px-5 py-2.5 flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button onClick={() => setCurrentStep(3)} className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2" disabled={assessments.length === 0}>
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ======= STEP 3: GRADES ======= */}
          {currentStep === 3 && (
            <motion.div key="step3" {...anim}>
              <h2 className="text-3xl font-bold mb-2">Enter Your Grades</h2>
              <p className="text-muted-foreground mb-8">Enter scores for completed assessments. Leave blank for upcoming ones.</p>

              <div className="space-y-3">
                {assessments.map((a, i) => (
                  <div key={i} className="glass rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{Math.round(a.weight * 100)}% weight</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={a.current_score ?? ""}
                        onChange={(e) => updateScore(i, e.target.value)}
                        placeholder="—"
                        className="w-20 bg-secondary rounded-lg px-3 py-2 text-center text-foreground outline-none placeholder:text-muted-foreground/50"
                      />
                      <span className="text-sm text-muted-foreground">/ 100</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-4 rounded-xl bg-card/50 border border-border/30">
                <p className="text-sm text-muted-foreground">
                  <span className="text-foreground font-medium">{assessments.filter(a => a.current_score !== null).length}</span> of {assessments.length} assessments graded
                </p>
              </div>

              <div className="mt-8 flex justify-between">
                <button onClick={() => setCurrentStep(2)} className="btn-secondary text-sm px-5 py-2.5 flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button onClick={() => setCurrentStep(4)} className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2">
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ======= STEP 4: GOALS ======= */}
          {currentStep === 4 && (
            <motion.div key="step4" {...anim}>
              <h2 className="text-3xl font-bold mb-2">Set Your Target</h2>
              <p className="text-muted-foreground mb-8">What grade are you aiming for in {courseName || "this course"}?</p>

              <div className="glass rounded-2xl p-8 text-center">
                <div className="text-7xl font-bold text-foreground mb-4">{targetGrade}%</div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={targetGrade}
                  onChange={(e) => setTargetGrade(parseInt(e.target.value))}
                  className="w-full max-w-md accent-primary"
                />
                <div className="flex justify-between max-w-md mx-auto mt-2 text-xs text-muted-foreground">
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>

                <div className="flex justify-center gap-3 mt-6">
                  {[70, 75, 80, 85, 90].map(g => (
                    <button
                      key={g}
                      onClick={() => setTargetGrade(g)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        targetGrade === g ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {g}%
                    </button>
                  ))}
                </div>

                <p className="mt-6 text-sm text-muted-foreground">
                  {targetGrade >= 90 ? "A+ territory — ambitious!" :
                   targetGrade >= 80 ? "Solid A range goal" :
                   targetGrade >= 70 ? "B range — very achievable" :
                   "Passing goal — let's make it happen"}
                </p>
              </div>

              <div className="mt-8 flex justify-between">
                <button onClick={() => setCurrentStep(3)} className="btn-secondary text-sm px-5 py-2.5 flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button onClick={handleCreateCourseAndAnalyze} disabled={isCreating} className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2">
                  {isCreating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</> : <>Generate Plan <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            </motion.div>
          )}

          {/* ======= STEP 5: PLAN ======= */}
          {currentStep === 5 && analysisResult && (
            <motion.div key="step5" {...anim}>
              <h2 className="text-3xl font-bold mb-2">Your Plan</h2>
              <p className="text-muted-foreground mb-8">Here&apos;s what you need for {courseName || "your course"}.</p>

              <div className="grid gap-4 sm:grid-cols-2 mb-6">
                <div className="glass rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Target className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">Required Score</p>
                  </div>
                  <p className="text-4xl font-bold text-foreground">{Math.round(analysisResult.requiredScore)}%</p>
                  <p className="text-sm text-muted-foreground mt-1">on remaining assessments</p>
                </div>

                <div className="glass rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${analysisResult.isAchievable ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
                      {analysisResult.isAchievable ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
                    </div>
                    <p className="text-sm text-muted-foreground">Status</p>
                  </div>
                  <p className={`text-2xl font-bold ${analysisResult.isAchievable ? "text-emerald-400" : "text-destructive"}`}>
                    {analysisResult.isAchievable ? "Achievable" : "Very Difficult"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {analysisResult.isAchievable ? "Your target is within reach" : "Required score exceeds 100%"}
                  </p>
                </div>
              </div>

              <div className="glass rounded-2xl p-6 mb-6">
                <h3 className="font-semibold text-foreground mb-4">Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Course</span>
                    <span className="text-foreground font-medium">{courseName || "My Course"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Target Grade</span>
                    <span className="text-foreground font-medium">{targetGrade}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Current Average</span>
                    <span className="text-foreground font-medium">{analysisResult.currentAvg}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Assessments</span>
                    <span className="text-foreground font-medium">{assessments.length} total, {assessments.filter(a => a.current_score !== null).length} graded</span>
                  </div>
                </div>
              </div>

              <div className="glass rounded-2xl p-6">
                <h3 className="font-semibold text-foreground mb-4">Assessment Breakdown</h3>
                <div className="space-y-2">
                  {assessments.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-border/20 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-foreground">{a.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{Math.round(a.weight * 100)}%</span>
                      </div>
                      <span className={a.current_score !== null ? "text-foreground font-medium" : "text-muted-foreground"}>
                        {a.current_score !== null ? `${a.current_score}%` : "Upcoming"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex justify-between">
                <button onClick={() => setCurrentStep(4)} className="btn-secondary text-sm px-5 py-2.5 flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button onClick={() => setCurrentStep(6)} className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2">
                  Go to Dashboard <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ======= STEP 6: DASHBOARD REDIRECT ======= */}
          {currentStep === 6 && (
            <motion.div key="step6" {...anim} className="text-center py-16">
              <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </div>
              <h2 className="text-3xl font-bold mb-3">You&apos;re All Set!</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Your course <span className="text-foreground font-medium">{courseName || "My Course"}</span> has been created with {assessments.length} assessments and a target of {targetGrade}%.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/dashboard?tab=feasibility">
                  <button className="btn-primary text-sm px-8 py-3 flex items-center gap-2 mx-auto">
                    <BarChart3 className="h-4 w-4" /> View Feasibility Analysis
                  </button>
                </Link>
                <Link href="/dashboard?tab=simulator">
                  <button className="btn-secondary text-sm px-8 py-3 flex items-center gap-2 mx-auto">
                    Run What-If Simulator
                  </button>
                </Link>
              </div>
              <button onClick={() => { setCurrentStep(1); setFile(null); setAssessments([]); setCourseName("") }} className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
                + Add another course
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
