"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Plus, Settings, Check } from "lucide-react";
import { checkTarget, listCourses, type Course } from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";

const COURSE_TARGETS_STORAGE_KEY = "evalio_course_targets_v1";
const COURSE_REFRESH_EVENT = "evalio:courses-updated";
const DEFAULT_TARGET = 85;

type SelectorSummary = {
  current: number;
  target: number;
  riskLabel: string;
  riskClass: string;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getTargetForCourse(courseId: string): number {
  const stored =
    safeParse<Record<string, number>>(
      window.localStorage.getItem(COURSE_TARGETS_STORAGE_KEY)
    ) ?? {};
  const value = stored[courseId];
  if (!Number.isFinite(value)) return DEFAULT_TARGET;
  return Math.max(0, Math.min(100, value));
}

function toFixedOne(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  return value.toFixed(1);
}

function resolveCurrentGrade(result: { current_standing: number; final_total?: number }): number {
  return Number.isFinite(result.final_total) ? Number(result.final_total) : result.current_standing;
}

export function CourseSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [summary, setSummary] = useState<SelectorSummary>({
    current: 0,
    target: DEFAULT_TARGET,
    riskLabel: "Risky",
    riskClass: "bg-orange-50 text-orange-600",
  });
  const { courseId, setCourseId } = useSetupCourse();

  const fetchSelectorData = useCallback(async () => {
    try {
      const listed = await listCourses();
      setCourses(listed);

      if (!listed.length) {
        setSummary({
          current: 0,
          target: DEFAULT_TARGET,
          riskLabel: "Risky",
          riskClass: "bg-orange-50 text-orange-600",
        });
        return;
      }

      const activeId =
        courseId && listed.some((course) => course.course_id === courseId)
          ? courseId
          : listed[listed.length - 1].course_id;

      if (!courseId || activeId !== courseId) {
        setCourseId(activeId);
      }

      const target = getTargetForCourse(activeId);
      const targetCheck = await checkTarget(activeId, { target });

      const risky = !targetCheck.feasible || targetCheck.classification === "Not Possible";
      setSummary({
        current: resolveCurrentGrade(targetCheck),
        target,
        riskLabel: risky ? "Risky" : "On Track",
        riskClass: risky ? "bg-orange-50 text-orange-600" : "bg-green-50 text-green-700",
      });
    } catch (error) {
      console.error(error);
    }
  }, [courseId, setCourseId]);

  useEffect(() => {
    fetchSelectorData();
  }, [fetchSelectorData, pathname]);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchSelectorData();
    };
    window.addEventListener(COURSE_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(COURSE_REFRESH_EVENT, handleRefresh);
  }, [fetchSelectorData]);

  const currentCourse = useMemo(() => {
    if (!courses.length) return null;
    return (
      courses.find((course) => course.course_id === courseId) ??
      courses[courses.length - 1]
    );
  }, [courses, courseId]);

  return (
    <div className="max-w-6xl mx-auto mb-6 relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between bg-[#F9F8F6] border border-gray-200 rounded-lg px-4 py-2 cursor-pointer hover:bg-gray-50 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-800 text-sm">
            {currentCourse?.course_name ?? currentCourse?.name ?? "Select Course"}
          </span>
          <ChevronDown
            size={14}
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <span className="text-gray-400">
            Current: <b className="text-gray-700">{toFixedOne(summary.current)}%</b>
          </span>
          <span className="text-gray-400">
            Target: <b className="text-gray-700">{toFixedOne(summary.target)}%</b>
          </span>
          <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${summary.riskClass}`}>
            {summary.riskLabel}
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
          {courses.map((course) => (
            <div
              key={course.course_id}
              onClick={() => {
                setCourseId(course.course_id);
                setIsOpen(false);
              }}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 text-sm"
            >
              <span>{course.course_name ?? course.name}</span>
              {course.course_id === courseId && (
                <Check size={14} className="text-slate-600" />
              )}
            </div>
          ))}

          <div
            onClick={() => {
              setIsOpen(false);
              router.push("/setup/upload");
            }}
            className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600 hover:bg-gray-50 cursor-pointer border-b border-gray-50"
          >
            <Plus size={14} />
            <span>Add New Course</span>
          </div>

          <div
            onClick={() => {
              setIsOpen(false);
              router.push("/setup/manage");
            }}
            className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600 hover:bg-gray-50 cursor-pointer"
          >
            <Settings size={14} />
            <span>Manage Courses</span>
          </div>
        </div>
      )}
    </div>
  );
}
