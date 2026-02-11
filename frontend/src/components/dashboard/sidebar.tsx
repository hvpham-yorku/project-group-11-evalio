"use client"

import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Sparkles, Trash2, BookOpen, Loader2, ArrowLeft } from "lucide-react"
import { Course } from "@/lib/api/client"

interface SidebarProps {
  courses: Course[]
  selectedCourseId: number | null
  onSelectCourse: (id: number) => void
  onNewCourse: () => void
  onDeleteCourse: (id: number) => void
  isLoading: boolean
}

export function Sidebar({
  courses,
  selectedCourseId,
  onSelectCourse,
  onNewCourse,
  onDeleteCourse,
  isLoading,
}: SidebarProps) {
  return (
    <aside className="hidden h-screen w-72 border-r border-border/40 bg-white/80 backdrop-blur-xl p-6 md:flex flex-col sticky top-0 overflow-auto">
      {/* Logo */}
      <Link href="/" className="mb-8 flex items-center gap-3 group">
        <div className="relative">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-accent blur-lg opacity-50 group-hover:opacity-70 transition-opacity" />
          <div className="relative rounded-xl bg-gradient-to-br from-primary to-accent p-2.5">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
        </div>
        <div>
          <div className="font-bold text-foreground text-lg">Evalio</div>
          <div className="text-xs text-muted-foreground">Grade Planner</div>
        </div>
      </Link>

      {/* New Course Button */}
      <button
        onClick={onNewCourse}
        className="w-full mb-8 btn-primary flex items-center justify-center gap-2 py-3.5 text-sm"
      >
        <Plus className="h-4 w-4" />
        New Course
      </button>

      {/* Course List */}
      <div className="flex-1">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 px-1">
          My Courses
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-8 px-2">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-3">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No courses yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Click &quot;New Course&quot; to begin</p>
          </div>
        ) : (
          <nav className="space-y-1.5">
            <AnimatePresence>
              {courses.map((course, i) => (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm cursor-pointer transition-all duration-200 ${
                    selectedCourseId === course.id
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-secondary border border-transparent"
                  }`}
                  onClick={() => onSelectCourse(course.id)}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      selectedCourseId === course.id
                        ? "bg-gradient-to-br from-primary to-accent shadow-md shadow-primary/20"
                        : "bg-secondary"
                    }`}
                  >
                    <BookOpen
                      className={`h-4 w-4 ${
                        selectedCourseId === course.id ? "text-white" : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-semibold truncate text-[13px] ${
                        selectedCourseId === course.id ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {course.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Target: {course.target_grade}% &middot;{" "}
                      {course.assessments?.length ?? 0} items
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete "${course.name}"?`)) onDeleteCourse(course.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-all text-muted-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </nav>
        )}
      </div>

      {/* Bottom */}
      <div className="border-t border-border/40 pt-4 mt-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>
    </aside>
  )
}
