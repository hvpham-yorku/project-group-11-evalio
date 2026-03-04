"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { Course } from "@/lib/api";

const ACTIVE_COURSE_STORAGE_KEY = "evalio_active_course_id";

type SetupCourseContextValue = {
  courseId: string | null;
  setCourseId: (id: string | null) => void;
  ensureCourseIdFromList: (courses: Course[]) => string | null;
  extractionResult: any | null;
  setExtractionResult: (data: any | null) => void;
  institutionalGradingRules: {
    institution: string;
    scale: string;
    grade_boundaries: Array<{
      letter: string;
      minLabel: string;
      points: string;
      descriptor: string;
    }>;
  } | null;
  setInstitutionalGradingRules: (rules: SetupCourseContextValue["institutionalGradingRules"]) => void;
};

const SetupCourseContext = createContext<SetupCourseContextValue | null>(null);

export function SetupCourseProvider({ children }: { children: React.ReactNode }) {
  const [courseId, setCourseIdState] = useState<string | null>(null);
  const [extractionResult, setExtractionResult] = useState<any | null>(null);
  const [institutionalGradingRules, setInstitutionalGradingRules] =
    useState<SetupCourseContextValue["institutionalGradingRules"]>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(ACTIVE_COURSE_STORAGE_KEY);
    setCourseIdState(stored && stored.trim() ? stored : null);
  }, []);

  const setCourseId = useCallback((id: string | null) => {
    setCourseIdState(id);
    if (!id) {
      window.localStorage.removeItem(ACTIVE_COURSE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_COURSE_STORAGE_KEY, id);
  }, []);

  const ensureCourseIdFromList = useCallback(
    (courses: Course[]): string | null => {
      if (!courses.length) {
        setCourseId(null);
        return null;
      }

      if (courseId && courses.some((course) => course.course_id === courseId)) {
        return courseId;
      }

      const fallback = courses[courses.length - 1]?.course_id ?? null;
      setCourseId(fallback);
      return fallback;
    },
    [courseId, setCourseId]
  );

  const value = useMemo(
    () => ({
      courseId,
      setCourseId,
      ensureCourseIdFromList,
      extractionResult,
      setExtractionResult,
      institutionalGradingRules,
      setInstitutionalGradingRules,
    }),
    [courseId, setCourseId, ensureCourseIdFromList, extractionResult, institutionalGradingRules]
  );

  return <SetupCourseContext.Provider value={value}>{children}</SetupCourseContext.Provider>;
}

export function useSetupCourse() {
  const context = useContext(SetupCourseContext);
  if (!context) {
    throw new Error("useSetupCourse must be used within SetupCourseProvider");
  }
  return context;
}
