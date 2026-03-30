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
import type {
  ExtractionResult,
  InstitutionalGradingRules,
} from "@/lib/extraction-types";

const ACTIVE_COURSE_STORAGE_KEY = "evalio_active_course_id";
const EXTRACTION_STORAGE_PREFIX = "evalio_extraction_";
const RULES_STORAGE_PREFIX = "evalio_rules_";

function getExtractionStorageKey(courseId: string): string {
  return `${EXTRACTION_STORAGE_PREFIX}${courseId}`;
}

function getRulesStorageKey(courseId: string): string {
  return `${RULES_STORAGE_PREFIX}${courseId}`;
}

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

function writeJsonToStorage<T>(key: string, value: T | null) {
  if (value === null) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

type SetupCourseContextValue = {
  courseId: string | null;
  setCourseId: (id: string | null) => void;
  ensureCourseIdFromList: (courses: Course[]) => string | null;
  extractionResult: ExtractionResult | null;
  setExtractionResult: (data: ExtractionResult | null) => void;
  institutionalGradingRules: InstitutionalGradingRules | null;
  setInstitutionalGradingRules: (rules: InstitutionalGradingRules | null) => void;
};

const SetupCourseContext = createContext<SetupCourseContextValue | null>(null);

export function SetupCourseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [courseId, setCourseIdState] = useState<string | null>(null);
  const [extractionResult, setExtractionResultState] = useState<ExtractionResult | null>(
    null
  );
  const [institutionalGradingRules, setInstitutionalGradingRulesState] =
    useState<InstitutionalGradingRules | null>(null);

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
      readJsonFromStorage(getExtractionStorageKey(courseId))
    );
    setInstitutionalGradingRulesState(
      readJsonFromStorage(getRulesStorageKey(courseId))
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
    (data: ExtractionResult | null) => {
      setExtractionResultState(data);
      if (courseId) {
        writeJsonToStorage(getExtractionStorageKey(courseId), data);
      }
    },
    [courseId]
  );

  const setInstitutionalGradingRules = useCallback(
    (rules: InstitutionalGradingRules | null) => {
      setInstitutionalGradingRulesState(rules);
      if (courseId) {
        writeJsonToStorage(getRulesStorageKey(courseId), rules);
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
      setExtractionResult,
      institutionalGradingRules,
      setInstitutionalGradingRules,
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
