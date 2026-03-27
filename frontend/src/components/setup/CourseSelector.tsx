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
    riskClass: "bg-[#FDF3E7] text-[#C9945F]",
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
          riskClass: "bg-[#FDF3E7] text-[#C9945F]",
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
        riskClass: risky
          ? "bg-[#FDF3E7] text-[#C9945F]"
          : "bg-[#E8F2EA] text-[#6B9B7A]",
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
        className="flex cursor-pointer items-center justify-between rounded-[1.25rem] border border-[#E8E3DC] bg-[#F5F1EB] px-5 py-3 transition-all hover:bg-[#E8E3DC]"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#3A3530]">
            {currentCourse?.course_name ?? currentCourse?.name ?? "Select Course"}
          </span>
          <ChevronDown
            size={14}
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <span className="text-[#6B6560]">
            Current: <b className="text-[#3A3530]">{toFixedOne(summary.current)}%</b>
          </span>
          <span className="text-[#6B6560]">
            Target: <b className="text-[#3A3530]">{toFixedOne(summary.target)}%</b>
          </span>
          <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${summary.riskClass}`}>
            {summary.riskLabel}
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-[1.25rem] border border-[#D4CFC7] bg-[#FFFFFF] shadow-xl">
          {courses.map((course) => (
            <div
              key={course.course_id}
              onClick={() => {
                setCourseId(course.course_id);
                setIsOpen(false);
              }}
              className="flex cursor-pointer items-center justify-between border-b border-[#E8E3DC] px-4 py-3 text-sm hover:bg-[#F5F1EB]"
            >
              <span>{course.course_name ?? course.name}</span>
              {course.course_id === courseId && (
                <Check size={14} className="text-[#5F7A8A]" />
              )}
            </div>
          ))}

          <div
            onClick={() => {
              setIsOpen(false);
              router.push("/setup/upload");
            }}
            className="flex cursor-pointer items-center gap-2 border-b border-[#E8E3DC] px-4 py-3 text-sm text-[#5F7A8A] hover:bg-[#F5F1EB]"
          >
            <Plus size={14} />
            <span>Add New Course</span>
          </div>

          <div
            onClick={() => {
              setIsOpen(false);
              router.push("/setup/manage");
            }}
            className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm text-[#5F7A8A] hover:bg-[#F5F1EB]"
          >
            <Settings size={14} />
            <span>Manage Courses</span>
          </div>
        </div>
      )}
    </div>
  );
}
