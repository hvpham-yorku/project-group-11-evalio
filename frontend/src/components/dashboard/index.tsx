"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Sidebar } from "./sidebar"
import { CourseSetup } from "./course-extraction"
import { FeasibilityAnalysis } from "./feasibility"
import { WhatIfSimulator } from "./simulator"
import { GPAConverter } from "./gpa-converter"
import { useCourses, useCourse, useCreateCourse, useDeleteCourse } from "@/lib/api/hooks"
import { BookOpen, BarChart3, Zap, Plus, Loader2, GraduationCap, Calculator } from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"

export function Dashboard() {
  const searchParams = useSearchParams()
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [activeView, setActiveView] = useState<"setup" | "feasibility" | "simulator" | "gpa">("setup")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newCourseName, setNewCourseName] = useState("")
  const [newCourseTarget, setNewCourseTarget] = useState(80)

  const { data: courses, isLoading: coursesLoading } = useCourses()
  const { data: selectedCourse, isLoading: courseLoading } = useCourse(selectedCourseId)
  const createCourse = useCreateCourse()
  const deleteCourse = useDeleteCourse()

  // Read tab from URL query param
  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab && ["setup", "feasibility", "simulator", "gpa"].includes(tab)) {
      setActiveView(tab as typeof activeView)
    }
  }, [searchParams])

  // Auto-select first course
  useEffect(() => {
    if (courses?.length && !selectedCourseId) {
      setSelectedCourseId(courses[0].id)
    }
  }, [courses, selectedCourseId])

  // Handle when selected course is deleted
  useEffect(() => {
    if (courses && selectedCourseId && !courses.find((c) => c.id === selectedCourseId)) {
      setSelectedCourseId(courses[0]?.id ?? null)
    }
  }, [courses, selectedCourseId])

  const handleCreateCourse = async () => {
    if (!newCourseName.trim()) return
    try {
      const course = await createCourse.mutateAsync({
        name: newCourseName,
        target_grade: newCourseTarget,
      })
      setSelectedCourseId(course.id)
      setShowCreateDialog(false)
      setNewCourseName("")
      setNewCourseTarget(80)
      setActiveView("setup")
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteCourse = async (courseId: number) => {
    try {
      await deleteCourse.mutateAsync(courseId)
    } catch (e) {
      console.error(e)
    }
  }

  const tabs = [
    { id: "setup" as const, label: "Course Setup", icon: BookOpen },
    { id: "feasibility" as const, label: "Feasibility", icon: BarChart3 },
    { id: "simulator" as const, label: "What-If", icon: Zap },
    { id: "gpa" as const, label: "GPA", icon: Calculator },
  ]

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        courses={courses ?? []}
        selectedCourseId={selectedCourseId}
        onSelectCourse={setSelectedCourseId}
        onNewCourse={() => setShowCreateDialog(true)}
        onDeleteCourse={handleDeleteCourse}
        isLoading={coursesLoading}
      />

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          {coursesLoading ? (
            <div className="flex items-center justify-center h-[60vh]">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !courses?.length ? (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-[70vh] text-center"
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary to-accent blur-2xl opacity-30" />
                <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <GraduationCap className="h-12 w-12 text-white" />
                </div>
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-3">Welcome to Evalio</h2>
              <p className="text-muted-foreground mb-10 max-w-md text-lg leading-relaxed">
                Create your first course to start tracking grades, analyzing feasibility, and running what-if scenarios.
              </p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="btn-primary inline-flex items-center gap-2 text-lg px-8 py-4"
              >
                <Plus className="h-5 w-5" /> Add Your First Course
              </button>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Tab Navigation */}
              <div className="mb-8 flex gap-1 glass rounded-2xl p-1.5">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveView(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-2.5 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-300 ${
                        activeView === tab.id
                          ? "bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              {/* Content */}
              <AnimatePresence mode="wait">
                {courseLoading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center h-[40vh]"
                  >
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </motion.div>
                ) : activeView === "gpa" ? (
                  <motion.div
                    key="gpa"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <GPAConverter />
                  </motion.div>
                ) : selectedCourse ? (
                  <motion.div
                    key={`${activeView}-${selectedCourseId}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    {activeView === "setup" && <CourseSetup course={selectedCourse} />}
                    {activeView === "feasibility" && <FeasibilityAnalysis course={selectedCourse} />}
                    {activeView === "simulator" && <WhatIfSimulator course={selectedCourse} />}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </main>

      {/* Create Course Dialog */}
      <Dialog.Root open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md glass-strong rounded-2xl p-8 shadow-2xl z-50">
            <Dialog.Title className="text-2xl font-bold text-foreground mb-1">
              Create New Course
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground text-sm mb-8">
              Add a course to start tracking grades and planning your academic path.
            </Dialog.Description>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Course Name
                </label>
                <input
                  type="text"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="e.g., EECS 2311 – Software Design"
                  className="input-field w-full"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreateCourse()}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Target Grade (%)
                </label>
                <input
                  type="number"
                  value={newCourseTarget}
                  onChange={(e) => setNewCourseTarget(Number(e.target.value))}
                  min={0}
                  max={100}
                  className="input-field w-full"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  The grade you&apos;re aiming for in this course
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <Dialog.Close asChild>
                <button className="btn-secondary flex-1">Cancel</button>
              </Dialog.Close>
              <button
                onClick={handleCreateCourse}
                disabled={!newCourseName.trim() || createCourse.isPending}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createCourse.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Create Course"
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
