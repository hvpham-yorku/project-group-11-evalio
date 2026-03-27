"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Course } from "@/lib/api";

const ACTIVE_COURSE_STORAGE_KEY = "evalio_active_course_id";

function readJsonFromStorage<T>(key: string): T | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Recover from stale/corrupted browser cache entries.
    window.localStorage.removeItem(key);
    return null;
  }
}

type SetupCourseContextValue = {
  courseId: string | null;
  setCourseId: (id: string | null) => void;
  ensureCourseIdFromList: (courses: Course[]) => string | null;
  extractionResult: any | null;
  setExtractionResult: (data: any | null) => void;
  institutionalGradingRules: any | null;
  setInstitutionalGradingRules: (rules: any) => void;
};

const SetupCourseContext = createContext<SetupCourseContextValue | null>(null);

export function SetupCourseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [courseId, setCourseIdState] = useState<string | null>(null);
  const [extractionResult, setExtractionResultState] = useState<any | null>(
    null
  );
  const [institutionalGradingRules, setInstitutionalGradingRulesState] =
    useState<any | null>(null);

  // 1. Initial Load of active ID
  useEffect(() => {
    const stored = window.localStorage.getItem(ACTIVE_COURSE_STORAGE_KEY);
    if (stored && stored.trim()) setCourseIdState(stored);
  }, []);

  // 2. Reactively load Course-Specific Data whenever courseId changes
  useEffect(() => {
    if (!courseId) {
      setExtractionResultState(null);
      setInstitutionalGradingRulesState(null);
      return;
    }

    setExtractionResultState(
      readJsonFromStorage(`evalio_extraction_${courseId}`)
    );
    setInstitutionalGradingRulesState(
      readJsonFromStorage(`evalio_rules_${courseId}`)
    );
  }, [courseId]);

  const setCourseId = useCallback((id: string | null) => {
    setCourseIdState(id);
    if (!id) {
      window.localStorage.removeItem(ACTIVE_COURSE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_COURSE_STORAGE_KEY, id);
    }
  }, []);

  const setExtractionResult = useCallback(
    (data: any | null) => {
      setExtractionResultState(data);
      if (courseId && data) {
        window.localStorage.setItem(
          `evalio_extraction_${courseId}`,
          JSON.stringify(data)
        );
      }
    },
    [courseId]
  );

  const setInstitutionalGradingRules = useCallback(
    (rules: any) => {
      setInstitutionalGradingRulesState(rules);
      if (courseId && rules) {
        window.localStorage.setItem(
          `evalio_rules_${courseId}`,
          JSON.stringify(rules)
        );
      }
    },
    [courseId]
  );

  const ensureCourseIdFromList = useCallback(
    (courses: Course[]): string | null => {
      if (!courses.length) {
        setCourseId(null);
        return null;
      }
      const match = courses.find((c) => c.course_id === courseId);
      if (match) return match.course_id;

      const fallback = courses[0].course_id;
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
    [
      courseId,
      setCourseId,
      ensureCourseIdFromList,
      extractionResult,
      institutionalGradingRules,
    ]
  );

  return (
    <SetupCourseContext.Provider value={value}>
      {children}
    </SetupCourseContext.Provider>
  );
}

export function useSetupCourse() {
  const context = useContext(SetupCourseContext);
  if (!context)
    throw new Error("useSetupCourse must be used within SetupCourseProvider");
  return context;
}
