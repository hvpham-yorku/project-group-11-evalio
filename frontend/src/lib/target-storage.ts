const LEGACY_TARGET_STORAGE_KEY = "evalio_target_grade";
const TARGET_STORAGE_KEY_PREFIX = "evalio_target_grade";

function getCourseTargetStorageKey(courseId: string) {
  return `${TARGET_STORAGE_KEY_PREFIX}_${courseId}`;
}

export function readStoredTargetGrade(
  courseId: string | null | undefined,
  fallback: number
): number {
  if (typeof window === "undefined") return fallback;

  const scopedValue =
    courseId && courseId.trim()
      ? window.localStorage.getItem(getCourseTargetStorageKey(courseId))
      : null;
  const rawValue = scopedValue ?? window.localStorage.getItem(LEGACY_TARGET_STORAGE_KEY);

  if (rawValue === null) return fallback;

  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return fallback;
  }

  return parsed;
}

export function writeStoredTargetGrade(
  courseId: string | null | undefined,
  target: number
) {
  if (typeof window === "undefined" || !courseId || !courseId.trim()) return;
  window.localStorage.setItem(getCourseTargetStorageKey(courseId), String(target));
}
