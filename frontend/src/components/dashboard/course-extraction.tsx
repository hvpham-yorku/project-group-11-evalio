"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Target,
  Weight,
  Award,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import { Course } from "@/lib/api/client"
import {
  useCreateAssessment,
  useUpdateAssessment,
  useDeleteAssessment,
  useUpdateCourse,
} from "@/lib/api/hooks"

interface CourseSetupProps {
  course: Course
}

export function CourseSetup({ course }: CourseSetupProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newWeight, setNewWeight] = useState("")
  const [newScore, setNewScore] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editScore, setEditScore] = useState("")
  const [editingCourse, setEditingCourse] = useState(false)
  const [editCourseName, setEditCourseName] = useState(course.name)
  const [editCourseTarget, setEditCourseTarget] = useState(String(course.target_grade))

  const createAssessment = useCreateAssessment()
  const updateAssessment = useUpdateAssessment()
  const deleteAssessment = useDeleteAssessment()
  const updateCourse = useUpdateCourse()

  const totalWeight = course.assessments.reduce((sum, a) => sum + a.weight, 0)
  const totalWeightPct = Math.round(totalWeight * 100)
  const completedCount = course.assessments.filter((a) => a.current_score !== null).length

  const handleAddAssessment = async () => {
    if (!newName.trim() || !newWeight) return
    const weight = parseFloat(newWeight) / 100
    if (weight <= 0 || weight > 1) return

    try {
      await createAssessment.mutateAsync({
        courseId: course.id,
        assessment: {
          name: newName,
          weight,
          current_score: newScore ? parseFloat(newScore) : null,
        },
      })
      setNewName("")
      setNewWeight("")
      setNewScore("")
      setShowAddForm(false)
    } catch (e) {
      console.error(e)
    }
  }

  const handleUpdateScore = async (assessmentId: number, assessment: Course["assessments"][0]) => {
    try {
      await updateAssessment.mutateAsync({
        assessmentId,
        assessment: {
          name: assessment.name,
          weight: assessment.weight,
          current_score: editScore ? parseFloat(editScore) : null,
        },
      })
      setEditingId(null)
      setEditScore("")
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteAssessment = async (id: number) => {
    try {
      await deleteAssessment.mutateAsync(id)
    } catch (e) {
      console.error(e)
    }
  }

  const handleUpdateCourse = async () => {
    try {
      await updateCourse.mutateAsync({
        courseId: course.id,
        data: {
          name: editCourseName,
          target_grade: parseFloat(editCourseTarget),
        },
      })
      setEditingCourse(false)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Course Header Card */}
      <div className="glass rounded-2xl p-6 border border-slate-200/80">
        {editingCourse ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Course Name
                </label>
                <input
                  type="text"
                  value={editCourseName}
                  onChange={(e) => setEditCourseName(e.target.value)}
                  className="input-field w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Target Grade (%)
                </label>
                <input
                  type="number"
                  value={editCourseTarget}
                  onChange={(e) => setEditCourseTarget(e.target.value)}
                  min={0}
                  max={100}
                  className="input-field w-full text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpdateCourse}
                disabled={updateCourse.isPending}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Check className="h-4 w-4 inline mr-1" />
                Save
              </button>
              <button
                onClick={() => setEditingCourse(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{course.name}</h2>
              <div className="flex items-center gap-4 mt-2">
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                  <Target className="h-4 w-4 text-blue-500" />
                  Target: {course.target_grade}%
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                  <Award className="h-4 w-4 text-indigo-500" />
                  {completedCount}/{course.assessments.length} graded
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setEditCourseName(course.name)
                setEditCourseTarget(String(course.target_grade))
                setEditingCourse(true)
              }}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
            >
              <Edit3 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Weight Status Bar */}
      <div className="glass rounded-2xl p-5 border border-slate-200/80">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-700">Total Weight Allocated</span>
          <span
            className={`text-sm font-bold ${
              totalWeightPct === 100
                ? "text-emerald-600"
                : totalWeightPct > 100
                ? "text-red-500"
                : "text-amber-500"
            }`}
          >
            {totalWeightPct}%
          </span>
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(totalWeightPct, 100)}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`h-full rounded-full ${
              totalWeightPct === 100
                ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                : totalWeightPct > 100
                ? "bg-gradient-to-r from-red-400 to-red-500"
                : "bg-gradient-to-r from-amber-400 to-amber-500"
            }`}
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          {totalWeightPct === 100 ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-500" />
          )}
          <p className="text-xs text-slate-500">
            {totalWeightPct === 100
              ? "All weights sum to 100% — course is fully configured"
              : totalWeightPct > 100
              ? "Weights exceed 100% — please adjust"
              : `${100 - totalWeightPct}% remaining to allocate`}
          </p>
        </div>
      </div>

      {/* Assessment List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-bold text-slate-900">Assessments</h3>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50 text-blue-600 text-sm font-semibold hover:bg-blue-100 transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Assessment
          </button>
        </div>

        {course.assessments.length === 0 && !showAddForm ? (
          <div className="glass rounded-2xl p-12 text-center border border-dashed border-slate-300">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Weight className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium mb-1">No assessments yet</p>
            <p className="text-sm text-slate-400 mb-6">
              Add your course assessments with their weights to get started
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add First Assessment
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {course.assessments.map((assessment, index) => (
                <motion.div
                  key={assessment.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="glass rounded-xl p-4 border border-slate-200/80 group hover:border-blue-200/80 transition-all"
                >
                  <div className="flex items-center gap-4">
                    {/* Weight Badge */}
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/15">
                      <span className="text-white font-bold text-sm">
                        {Math.round(assessment.weight * 100)}%
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{assessment.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {editingId === assessment.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={editScore}
                              onChange={(e) => setEditScore(e.target.value)}
                              placeholder="Score"
                              min={0}
                              max={100}
                              className="w-20 px-2 py-1 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleUpdateScore(assessment.id, assessment)
                                if (e.key === "Escape") setEditingId(null)
                              }}
                            />
                            <span className="text-xs text-slate-400">/ 100</span>
                            <button
                              onClick={() => handleUpdateScore(assessment.id, assessment)}
                              className="p-1 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(assessment.id)
                              setEditScore(
                                assessment.current_score !== null
                                  ? String(assessment.current_score)
                                  : ""
                              )
                            }}
                            className="cursor-pointer"
                          >
                            {assessment.current_score !== null ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                                <CheckCircle2 className="h-3 w-3" />
                                Score: {assessment.current_score}%
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium hover:bg-blue-50 hover:text-blue-600 transition-colors">
                                <Edit3 className="h-3 w-3" />
                                Click to enter score
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score indicator */}
                    {assessment.current_score !== null && (
                      <div className="hidden sm:block w-24">
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              assessment.current_score >= 80
                                ? "bg-emerald-400"
                                : assessment.current_score >= 60
                                ? "bg-amber-400"
                                : "bg-red-400"
                            }`}
                            style={{ width: `${assessment.current_score}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${assessment.name}"?`))
                          handleDeleteAssessment(assessment.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-50 hover:text-red-500 text-slate-300 transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Add Assessment Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="glass rounded-2xl p-5 border border-blue-200/60"
            >
              <h4 className="text-sm font-bold text-slate-700 mb-4">New Assessment</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Final Exam"
                    className="input-field w-full text-sm py-2"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Weight (%)
                  </label>
                  <input
                    type="number"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    placeholder="e.g., 40"
                    min={1}
                    max={100}
                    className="input-field w-full text-sm py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Score (optional)
                  </label>
                  <input
                    type="number"
                    value={newScore}
                    onChange={(e) => setNewScore(e.target.value)}
                    placeholder="Leave blank if pending"
                    min={0}
                    max={100}
                    className="input-field w-full text-sm py-2"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleAddAssessment}
                  disabled={!newName.trim() || !newWeight || createAssessment.isPending}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 hover:shadow-lg hover:shadow-blue-500/20 transition-all"
                >
                  {createAssessment.isPending ? "Adding..." : "Add Assessment"}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false)
                    setNewName("")
                    setNewWeight("")
                    setNewScore("")
                  }}
                  className="px-5 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// Keep legacy export name for compatibility
export { CourseSetup as CourseExtraction }
