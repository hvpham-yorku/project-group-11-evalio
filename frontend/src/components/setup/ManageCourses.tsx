"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  checkTarget,
  deleteCourse,
  listCourses,
  updateCourseMetadata,
  type Course,
  type TargetCheckResponse,
} from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";
import { getApiErrorMessage } from "@/lib/errors";

const COURSE_TARGETS_STORAGE_KEY = "evalio_course_targets_v1";
const DEFAULT_TARGET = 85;
const COURSE_REFRESH_EVENT = "evalio:courses-updated";

type TargetMap = Record<string, number>;

type CourseAnalytics = {
  current: number;
  target: number;
  assessmentCount: number;
  classification: string;
  feasible: boolean;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadTargetMap(): TargetMap {
  return safeParse<TargetMap>(window.localStorage.getItem(COURSE_TARGETS_STORAGE_KEY)) ?? {};
}

function saveTargetMap(map: TargetMap) {
  window.localStorage.setItem(COURSE_TARGETS_STORAGE_KEY, JSON.stringify(map));
}

function normalizeTarget(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TARGET;
  return Math.max(0, Math.min(100, value));
}

function toFixedOne(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  return value.toFixed(1);
}

function resolveCurrentGrade(result: TargetCheckResponse): number {
  return Number.isFinite(result.final_total) ? Number(result.final_total) : result.current_standing;
}

function getRiskBadge(analytics: CourseAnalytics) {
  if (!analytics.feasible || analytics.classification === "Not Possible") {
    return { label: "Risky", className: "bg-orange-50 text-orange-700" };
  }
  if (analytics.classification === "Comfortable" || analytics.classification === "Complete") {
    return { label: "On Track", className: "bg-green-50 text-green-700" };
  }
  return { label: "Watch", className: "bg-amber-50 text-amber-700" };
}

export function ManageCourses() {
  const router = useRouter();
  const { courseId, setCourseId, ensureCourseIdFromList } = useSetupCourse();

  const [courses, setCourses] = useState<Course[]>([]);
  const [analyticsByCourseId, setAnalyticsByCourseId] = useState<Record<string, CourseAnalytics>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTerm, setEditTerm] = useState("");
  const [editTarget, setEditTarget] = useState(DEFAULT_TARGET);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);

  const refreshCourses = useCallback(async () => {
    try {
      setLoading(true);
      const listed = await listCourses();
      setCourses(listed);
      ensureCourseIdFromList(listed);

      const storedTargets = loadTargetMap();
      const normalizedTargets: TargetMap = { ...storedTargets };
      for (const course of listed) {
        if (!(course.course_id in normalizedTargets)) {
          normalizedTargets[course.course_id] = DEFAULT_TARGET;
        } else {
          normalizedTargets[course.course_id] = normalizeTarget(normalizedTargets[course.course_id]);
        }
      }
      saveTargetMap(normalizedTargets);

      const analyticsEntries = await Promise.all(
        listed.map(async (course) => {
          const target = normalizedTargets[course.course_id] ?? DEFAULT_TARGET;
          try {
            const targetResult = (await checkTarget(course.course_id, { target })) as TargetCheckResponse;
            return [
              course.course_id,
              {
                current: resolveCurrentGrade(targetResult),
                target,
                assessmentCount: course.assessments.length,
                classification: targetResult.classification,
                feasible: targetResult.feasible,
              } satisfies CourseAnalytics,
            ] as const;
          } catch {
            return [
              course.course_id,
              {
                current: 0,
                target,
                assessmentCount: course.assessments.length,
                classification: "Unknown",
                feasible: true,
              } satisfies CourseAnalytics,
            ] as const;
          }
        })
      );

      setAnalyticsByCourseId(Object.fromEntries(analyticsEntries));
      setError("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load courses."));
    } finally {
      setLoading(false);
    }
  }, [ensureCourseIdFromList]);

  useEffect(() => {
    refreshCourses();
  }, [refreshCourses]);

  useEffect(() => {
    const handleRefresh = () => {
      refreshCourses();
    };
    window.addEventListener(COURSE_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(COURSE_REFRESH_EVENT, handleRefresh);
  }, [refreshCourses]);

  const sortedCourses = useMemo(() => {
    return [...courses].sort((a, b) => a.name.localeCompare(b.name));
  }, [courses]);

  const handleOpenCourse = (selectedCourseId: string) => {
    setCourseId(selectedCourseId);
    window.dispatchEvent(new Event(COURSE_REFRESH_EVENT));
    router.push("/setup/grades");
  };

  const startEdit = (course: Course) => {
    const analytics = analyticsByCourseId[course.course_id];
    setEditingCourseId(course.course_id);
    setEditName(course.name);
    setEditTerm(course.term ?? "");
    setEditTarget(analytics?.target ?? DEFAULT_TARGET);
  };

  const cancelEdit = () => {
    setEditingCourseId(null);
    setEditName("");
    setEditTerm("");
    setEditTarget(DEFAULT_TARGET);
  };

  const handleSaveEdit = async () => {
    if (!editingCourseId) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError("Course name is required.");
      return;
    }

    try {
      setSavingEdit(true);
      await updateCourseMetadata(editingCourseId, {
        name: trimmedName,
        term: editTerm.trim() || null,
      });

      const currentTargets = loadTargetMap();
      currentTargets[editingCourseId] = normalizeTarget(editTarget);
      saveTargetMap(currentTargets);

      cancelEdit();
      await refreshCourses();
      window.dispatchEvent(new Event(COURSE_REFRESH_EVENT));
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to update course."));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteCourse = async (selectedCourseId: string) => {
    if (!window.confirm("Delete this course? This action cannot be undone.")) {
      return;
    }

    try {
      setDeletingCourseId(selectedCourseId);
      await deleteCourse(selectedCourseId);

      const currentTargets = loadTargetMap();
      delete currentTargets[selectedCourseId];
      saveTargetMap(currentTargets);

      if (courseId === selectedCourseId) {
        setCourseId(null);
      }

      await refreshCourses();
      window.dispatchEvent(new Event(COURSE_REFRESH_EVENT));
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to delete course."));
    } finally {
      setDeletingCourseId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <section className="rounded-2xl border border-gray-200 bg-[#F7F6F4] p-6 shadow-sm">
        <h2 className="text-3xl font-semibold tracking-tight text-gray-800">Manage Courses</h2>
        <p className="mt-2 text-base text-gray-500">
          View, edit, and organize all your courses in one place.
        </p>

        <button
          onClick={() => router.push("/setup/upload")}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5D737E] px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#4A5D66]"
        >
          <Plus size={18} />
          Add New Course
        </button>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
              Loading courses...
            </div>
          ) : null}

          {!loading && !sortedCourses.length ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
              No courses found yet. Add a new course to get started.
            </div>
          ) : null}

          {!loading &&
            sortedCourses.map((course) => {
              const analytics = analyticsByCourseId[course.course_id] ?? {
                current: 0,
                target: DEFAULT_TARGET,
                assessmentCount: course.assessments.length,
                classification: "Unknown",
                feasible: true,
              };
              const isCurrent = course.course_id === courseId;
              const riskBadge = getRiskBadge(analytics);
              const isEditing = editingCourseId === course.course_id;

              return (
                <article
                  key={course.course_id}
                  className="rounded-2xl border border-[#7E9CAE] bg-white px-5 py-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold text-gray-800">{course.name}</h3>
                        {isCurrent ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            Current
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm text-gray-600">
                        Current Grade: <span className="font-semibold text-gray-800">{toFixedOne(analytics.current)}%</span>
                        <span className="mx-2.5 text-gray-300">•</span>
                        Target: <span className="font-semibold text-gray-800">{toFixedOne(analytics.target)}%</span>
                        <span className="mx-2.5 text-gray-300">•</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${riskBadge.className}`}
                        >
                          {riskBadge.label}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        {analytics.assessmentCount} assessment{analytics.assessmentCount === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenCourse(course.course_id)}
                        className="rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => startEdit(course)}
                        className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 transition hover:bg-gray-50"
                        aria-label={`Edit ${course.name}`}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteCourse(course.course_id)}
                        disabled={deletingCourseId === course.course_id}
                        className="rounded-lg border border-red-100 bg-red-50 p-2 text-red-500 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`Delete ${course.name}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-6 rounded-2xl border border-gray-200 bg-[#FAFAF9] p-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <label className="text-sm text-gray-600">
                          Course Name
                          <input
                            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                          />
                        </label>
                        <label className="text-sm text-gray-600">
                          Term
                          <input
                            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                            value={editTerm}
                            onChange={(event) => setEditTerm(event.target.value)}
                            placeholder="e.g., W26"
                          />
                        </label>
                        <label className="text-sm text-gray-600">
                          Target (%)
                          <input
                            type="number"
                            min={0}
                            max={100}
                            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                            value={editTarget}
                            onChange={(event) =>
                              setEditTarget(normalizeTarget(Number(event.target.value)))
                            }
                          />
                        </label>
                      </div>
                      <div className="mt-4 flex gap-3">
                        <button
                          onClick={handleSaveEdit}
                          disabled={savingEdit}
                          className="rounded-xl bg-[#5D737E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4A5D66] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingEdit ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={savingEdit}
                          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
        </div>
      </section>
    </div>
  );
}
