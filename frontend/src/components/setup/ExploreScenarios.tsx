"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Lightbulb, RotateCcw } from "lucide-react";
import {
  deleteSavedScenario,
  getDashboardSummary,
  listCourses,
  listSavedScenarios,
  runDashboardWhatIf,
  runSavedScenario,
  saveScenario,
  updateCourseGrades,
  type Course,
  type CourseAssessment,
  type DashboardSummaryResponse,
  type DashboardWhatIfResponse,
  type SavedScenario,
} from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";
import { getApiErrorMessage } from "@/lib/errors";

const CHILD_ASSESSMENT_SEPARATOR = "::";

type ScenarioAssessment = {
  id: number;
  key: string;
  displayName: string;
  name: string;
  weight: number;
  raw_score?: number | null;
  total_score?: number | null;
  parentName?: string;
  childName?: string;
  is_bonus?: boolean;
};

type ScenarioGroup = {
  id: number;
  key: string;
  displayName: string;
  name: string;
  weight: number;
  raw_score?: number | null;
  total_score?: number | null;
  is_bonus?: boolean;
  children: ScenarioAssessment[];
};

type ScenarioLeafTarget = {
  assessment_name: string;
  score: number;
  actual?: number;
  graded: boolean;
  overrideSelf: boolean;
  overrideParent: boolean;
};

type GradeUpdate = {
  name: string;
  raw_score: number | null;
  total_score: number | null;
  children?: Array<{ name: string; raw_score: number | null; total_score: number | null }>;
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 100));
}

function hasPersistedGrade(a: { raw_score?: number | null; total_score?: number | null }): boolean {
  return typeof a.raw_score === "number" && typeof a.total_score === "number";
}

function buildScenarioGroups(
  assessments: CourseAssessment[]
): ScenarioGroup[] {
  const groups: ScenarioGroup[] = [];
  let nextId = 1;

  for (const assessment of assessments) {
    const children = Array.isArray(assessment.children) ? assessment.children : [];
    if (children.length) {
      const childItems: ScenarioAssessment[] = children.map((child) => ({
        id: nextId++,
        key: `${assessment.name}${CHILD_ASSESSMENT_SEPARATOR}${child.name}`,
        displayName: `${assessment.name} — ${child.name}`,
        name: child.name,
        weight: child.weight,
        raw_score: child.raw_score,
        total_score: child.total_score,
        parentName: assessment.name,
        childName: child.name,
        is_bonus: Boolean(assessment.is_bonus),
      }));

      groups.push({
        id: nextId++,
        key: assessment.name,
        displayName: assessment.name,
        name: assessment.name,
        weight: assessment.weight,
        raw_score: assessment.raw_score,
        total_score: assessment.total_score,
        is_bonus: Boolean(assessment.is_bonus),
        children: childItems,
      });
      continue;
    }

    groups.push({
      id: nextId++,
      key: assessment.name,
      displayName: assessment.name,
      name: assessment.name,
      weight: assessment.weight,
      raw_score: assessment.raw_score,
      total_score: assessment.total_score,
      is_bonus: Boolean(assessment.is_bonus),
      children: [],
    });
  }

  return groups;
}

function getActualPercent(raw?: number | null, total?: number | null): number | undefined {
  if (typeof raw !== "number" || typeof total !== "number") return undefined;
  if (!Number.isFinite(raw) || !Number.isFinite(total) || total <= 0) return undefined;
  return clampPercent((raw / total) * 100);
}

function flattenScenarioLeafTargets(
  groups: ScenarioGroup[],
  activeScenario: Record<string, number>
): ScenarioLeafTarget[] {
  const leafTargets: ScenarioLeafTarget[] = [];

  for (const group of groups) {
    if (group.children.length) {
      for (const child of group.children) {
        const overrideSelf = typeof activeScenario[child.key] === "number";
        const overrideParent = typeof activeScenario[group.key] === "number";
        const actual = getActualPercent(child.raw_score, child.total_score);
        const parentScore = activeScenario[group.key];
        const childScore = activeScenario[child.key];
        const score = clampPercent(
          typeof childScore === "number"
            ? childScore
            : typeof parentScore === "number"
              ? parentScore
              : typeof actual === "number"
                ? actual
                : 75
        );

        leafTargets.push({
          assessment_name: child.key,
          score,
          actual,
          graded: hasPersistedGrade(child) && Number(child.total_score) > 0,
          overrideSelf,
          overrideParent,
        });
      }
      continue;
    }

    const overrideSelf = typeof activeScenario[group.key] === "number";
    const actual = getActualPercent(group.raw_score, group.total_score);
    const score = clampPercent(
      typeof activeScenario[group.key] === "number"
        ? activeScenario[group.key]
        : typeof actual === "number"
          ? actual
          : 75
    );

    leafTargets.push({
      assessment_name: group.key,
      score,
      actual,
      graded: hasPersistedGrade(group) && Number(group.total_score) > 0,
      overrideSelf,
      overrideParent: false,
    });
  }

  return leafTargets;
}

function resolveParentValue(
  group: ScenarioGroup,
  activeScenario: Record<string, number>
): number {
  const parentOverride = activeScenario[group.key];
  if (typeof parentOverride === "number") {
    return clampPercent(parentOverride);
  }

  if (!group.children.length) {
    const actual = getActualPercent(group.raw_score, group.total_score);
    return typeof actual === "number" ? actual : 75;
  }

  const totalWeight = group.children.reduce(
    (sum, child) => sum + Math.max(0, Number.isFinite(child.weight) ? child.weight : 0),
    0
  );
  if (totalWeight <= 0) return 75;

  const weightedContribution = group.children.reduce((sum, child) => {
    const childOverride = activeScenario[child.key];
    const actual = getActualPercent(child.raw_score, child.total_score);
    const childValue = clampPercent(
      typeof childOverride === "number"
        ? childOverride
        : typeof actual === "number"
          ? actual
          : 75
    );
    return sum + (childValue * child.weight) / 100;
  }, 0);

  return clampPercent((weightedContribution / totalWeight) * 100);
}

function resolveChildValue(
  group: ScenarioGroup,
  child: ScenarioAssessment,
  activeScenario: Record<string, number>
): number {
  const childOverride = activeScenario[child.key];
  if (typeof childOverride === "number") return clampPercent(childOverride);

  const parentOverride = activeScenario[group.key];
  if (typeof parentOverride === "number") return clampPercent(parentOverride);

  const actual = getActualPercent(child.raw_score, child.total_score);
  return typeof actual === "number" ? actual : 75;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function ExploreScenarios() {
  const router = useRouter();

  const [assessments, setAssessments] = useState<ScenarioGroup[]>([]);
  const [courseAssessments, setCourseAssessments] = useState<CourseAssessment[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [savingScenario, setSavingScenario] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingScenario, setDeletingScenario] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [loadingScenario, setLoadingScenario] = useState(false);
  const { courseId, ensureCourseIdFromList } = useSetupCourse();
  const [dashboardSummary, setDashboardSummary] =
    useState<DashboardSummaryResponse | null>(null);
  const [scenarioProjection, setScenarioProjection] =
    useState<DashboardWhatIfResponse | null>(null);

  const [activeScenario, setActiveScenario] = useState<Record<string, number>>({});
  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});

  const fetchSavedScenarios = async (resolvedCourseId: string) => {
    try {
      const saved = await listSavedScenarios(resolvedCourseId);
      setSavedScenarios(saved.scenarios ?? []);
    } catch {
      setSavedScenarios([]);
    }
  };

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const courses = await listCourses();
        const resolvedCourseId = ensureCourseIdFromList(courses);
        if (!resolvedCourseId) {
          setError("No course found. Complete setup first.");
          return;
        }

        const latest = courses.find(
          (course) => course.course_id === resolvedCourseId
        ) as Course | undefined;
        if (!latest) {
          setError("No course found. Complete setup first.");
          return;
        }

        const normalized = buildScenarioGroups(latest.assessments ?? []);
        const summary = await getDashboardSummary(resolvedCourseId);

        setAssessments(normalized);
        setCourseAssessments(latest.assessments ?? []);
        setDashboardSummary(summary);
        await fetchSavedScenarios(resolvedCourseId);
        setError("");
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to load course."));
      }
    };

    loadCourse();
  }, [ensureCourseIdFromList]);

  const getParentScenarioValue = useCallback(
    (group: ScenarioGroup) => resolveParentValue(group, activeScenario),
    [activeScenario]
  );

  const getChildScenarioValue = useCallback(
    (group: ScenarioGroup, child: ScenarioAssessment) =>
      resolveChildValue(group, child, activeScenario),
    [activeScenario]
  );

  const leafTargets = useMemo(
    () => flattenScenarioLeafTargets(assessments, activeScenario),
    [assessments, activeScenario]
  );

  useEffect(() => {
    if (!courseId || !assessments.length) return;

    const scenarioEntries = leafTargets
      .filter(
        (target) =>
          !target.graded || target.overrideSelf || target.overrideParent
      )
      .map((target) => ({
        assessment_name: target.assessment_name,
        score: clampPercent(target.score),
      }));

    const timer = window.setTimeout(async () => {
      try {
        const response = await runDashboardWhatIf(courseId, {
          scenarios: scenarioEntries,
        });
        setScenarioProjection(response);
      } catch {
        setScenarioProjection(null);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [courseId, leafTargets, assessments]);

  const hasChanges = Object.keys(activeScenario).length > 0;

  const projectedFinal = (() => {
    if (scenarioProjection) {
      return scenarioProjection.projected_normalised ?? scenarioProjection.projected_grade;
    }
    if (!assessments.length) return 0;
    const sum = assessments.reduce((acc, group) => {
      if (group.children.length) {
        return (
          acc +
          group.children.reduce(
            (childAcc, child) =>
              childAcc + (getChildScenarioValue(group, child) * child.weight) / 100,
            0
          )
        );
      }
      return acc + (getParentScenarioValue(group) * group.weight) / 100;
    }, 0);
    return Number.isFinite(sum) ? sum : 0;
  })();

  const currentStanding =
    dashboardSummary?.current_normalised ?? dashboardSummary?.current_grade ?? 0;
  const worstCaseFloor =
    dashboardSummary?.min_normalised ?? dashboardSummary?.min_grade ?? 0;
  const bestCaseReachable =
    scenarioProjection?.maximum_possible_normalised ??
    scenarioProjection?.maximum_possible ??
    dashboardSummary?.max_normalised ??
    dashboardSummary?.max_grade ??
    0;
  const projectionBreakdown = scenarioProjection?.breakdown ?? [];
  const normalisationApplied =
    scenarioProjection?.normalisation_applied ??
    dashboardSummary?.normalisation_applied ??
    false;

  const handleParentSliderChange = (group: ScenarioGroup, value: number) => {
    const safe = clampPercent(value);
    setActiveScenario((prev) => {
      const next = { ...prev, [group.key]: safe };
      if (group.children.length) {
        for (const child of group.children) {
          next[child.key] = safe;
        }
      }
      return next;
    });
  };

  const handleChildSliderChange = (
    group: ScenarioGroup,
    child: ScenarioAssessment,
    value: number
  ) => {
    const safe = clampPercent(value);
    setActiveScenario((prev) => {
      // Child changes should not overwrite sibling sliders.
      // Remove any parent override so parent value is derived from children.
      const next = { ...prev, [child.key]: safe };
      delete next[group.key];
      return next;
    });
  };

  const handleResetAll = () => {
    setActiveScenario({});
  };

  const handleOpenSaveDialog = () => {
    setScenarioName("");
    setShowSaveDialog(true);
  };

  const handleSaveScenario = async () => {
    if (!courseId) {
      setError("No course found. Complete setup first.");
      return;
    }

    const trimmedName = scenarioName.trim();
    if (!trimmedName) {
      setError("Scenario name is required.");
      return;
    }

    const scenarios = leafTargets
      .filter((target) => target.overrideSelf || target.overrideParent)
      .map((target) => ({
        assessment_name: target.assessment_name,
        score: clampPercent(target.score),
        actual: target.actual,
      }))
      .filter(
        ({ score, actual }) =>
          typeof actual !== "number" || Math.abs(score - actual) > 0.001
      )
      .map(({ assessment_name, score }) => ({ assessment_name, score }));

    if (!scenarios.length) {
      setError("No changed what-if values to save.");
      return;
    }

    try {
      setSavingScenario(true);
      const saved = await saveScenario(courseId, {
        name: trimmedName,
        scenarios,
      });
      await fetchSavedScenarios(courseId);
      setSelectedScenarioId(saved.scenario.scenario_id);
      setShowSaveDialog(false);
      setScenarioName("");
      setError("");
      window.alert("Scenario saved successfully.");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save scenario."));
    } finally {
      setSavingScenario(false);
    }
  };

  const handleApplyToGrades = async () => {
    if (!courseId) {
      setError("No course found. Complete setup first.");
      return;
    }

    const updates = courseAssessments
      .map((assessment): GradeUpdate | null => {
        const children = Array.isArray(assessment.children) ? assessment.children : [];

        if (children.length) {
          const childUpdates = children
            .map((child) => {
              const parentOverride = activeScenario[assessment.name];
              const key = `${assessment.name}${CHILD_ASSESSMENT_SEPARATOR}${child.name}`;
              const childOverride = activeScenario[key];
              const hasOverride =
                typeof childOverride === "number" ||
                typeof parentOverride === "number";
              const hasGrade =
                typeof child.raw_score === "number" &&
                typeof child.total_score === "number" &&
                child.total_score > 0;

              if (!hasOverride && hasGrade) {
                return null;
              }

              const actual =
                hasGrade && child.total_score
                  ? clampPercent((child.raw_score! / child.total_score) * 100)
                  : undefined;
              const percent = hasOverride
                ? clampPercent(
                    typeof childOverride === "number"
                      ? childOverride
                      : (parentOverride as number)
                  )
                : typeof actual === "number"
                  ? actual
                  : 75;

              return {
                name: child.name,
                raw_score: percent,
                total_score: 100,
              };
            })
            .filter((item): item is { name: string; raw_score: number; total_score: number } => item !== null);

          if (!childUpdates.length) {
            return null;
          }

          return {
            name: assessment.name,
            raw_score: null,
            total_score: null,
            children: childUpdates,
          };
        }

        const key = assessment.name;
        const hasOverride = typeof activeScenario[key] === "number";
        const hasGrade =
          typeof assessment.raw_score === "number" &&
          typeof assessment.total_score === "number" &&
          assessment.total_score > 0;

        if (!hasOverride && hasGrade) {
          return null;
        }

        const actual =
          hasGrade && assessment.total_score
            ? clampPercent((assessment.raw_score! / assessment.total_score) * 100)
            : undefined;
        const percent = hasOverride
          ? clampPercent(activeScenario[key])
          : typeof actual === "number"
            ? actual
            : 75;

        return {
          name: assessment.name,
          raw_score: percent,
          total_score: 100,
        };
      })
      .filter((item): item is GradeUpdate => item !== null);

    if (updates.length === 0) {
      setError("No scenarios to apply.");
      return;
    }

    try {
      setSaving(true);
      await updateCourseGrades(courseId, {
        assessments: updates,
      });
      setActiveScenario({});
      setError("");

      router.push("/setup/grades");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to apply scenario."));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteScenarioClick = () => {
    if (!selectedScenarioId) {
      window.alert("Please select a scenario to delete.");
      return;
    }
    setShowDeleteDialog(true);
  };

  const handleDeleteScenario = async () => {
    if (!courseId || !selectedScenarioId) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeletingScenario(true);
      await deleteSavedScenario(courseId, selectedScenarioId);
      await fetchSavedScenarios(courseId);
      setSelectedScenarioId("");
      setActiveScenario({});
      setShowDeleteDialog(false);
      setError("");
      window.alert("Scenario deleted successfully.");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to delete scenario."));
    } finally {
      setDeletingScenario(false);
    }
  };

  const handleSelectScenario = async (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    if (!scenarioId) {
      return;
    }
    if (!courseId) {
      setError("No course found. Complete setup first.");
      return;
    }

    try {
      setLoadingScenario(true);
      const response = await runSavedScenario(courseId, scenarioId);
      const overrides: Record<string, number> = {};
      for (const entry of response.scenario.entries) {
        overrides[entry.assessment_name] = clampPercent(entry.score);
      }
      setActiveScenario(overrides);
      setError("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load scenario."));
    } finally {
      setLoadingScenario(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-20">
      <h2 className="text-3xl font-bold text-gray-800">Scenario Explorer</h2>
      <p className="mt-2 text-gray-500 text-sm leading-relaxed max-w-4xl">
        This is your sandbox. Experiment freely with different grade
        possibilities. Nothing here affects your actual grades unless you choose
        to apply it.
      </p>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT: WHAT-IF */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
            <div className="flex justify-between items-center mb-6 gap-4">
              <div className="flex items-center gap-3">
                <Lightbulb className="text-[#C8833F]" size={22} />
                <h3 className="text-lg font-semibold text-gray-800">
                  What-If Exploration
                </h3>
              </div>
              <select
                value={selectedScenarioId}
                onChange={(e) => handleSelectScenario(e.target.value)}
                disabled={loadingScenario}
                className="min-w-[180px] rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 focus:border-[#5D737E] focus:outline-none disabled:opacity-70"
              >
                <option value="">Select Scenario</option>
                {savedScenarios.map((scenario) => (
                  <option key={scenario.scenario_id} value={scenario.scenario_id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-5">
              {assessments.map((group) => {
                const hasChildren = group.children.length > 0;
                const isExpanded = expandedByKey[group.key] ?? false;
                const parentActual = getActualPercent(group.raw_score, group.total_score);
                const parentValue = getParentScenarioValue(group);
                const parentContribution = (parentValue * group.weight) / 100;
                const isModified =
                  typeof activeScenario[group.key] === "number" ||
                  group.children.some((child) => typeof activeScenario[child.key] === "number");

                return (
                  <div
                    key={group.key}
                    className={`rounded-2xl p-5 border ${
                      isModified
                        ? "border-[#5D737E] bg-[#E9EFF1]"
                        : "border-gray-100 bg-[#F6F1EA]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-6 mb-4">
                      <div className="flex items-start gap-3">
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedByKey((prev) => ({
                                ...prev,
                                [group.key]: !prev[group.key],
                              }))
                            }
                            className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#D4DDE1] bg-white text-[#5D737E] hover:bg-[#F1F5F7]"
                            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${group.displayName}`}
                          >
                            <ChevronDown
                              size={16}
                              className={`transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        ) : (
                          <span className="mt-3 h-2.5 w-2.5 rounded-full bg-[#B8C6CC]" />
                        )}
                        <div>
                          <h4 className="font-semibold text-gray-800">{group.displayName}</h4>
                          <p className="text-sm text-gray-500">
                            {formatCompactNumber(group.weight)}% •{" "}
                            {typeof parentActual === "number"
                              ? `Current: ${parentActual.toFixed(1)}%`
                              : hasChildren
                                ? "Derived from child inputs"
                                : "Not graded"}{" "}
                            •{" "}
                            {`${parentValue.toFixed(1)}% (${parentContribution.toFixed(2)} / ${formatCompactNumber(
                              group.weight
                            )})`}
                          </p>
                        </div>
                      </div>

                      <div className="text-3xl font-semibold text-[#5D737E]">
                        {parentValue.toFixed(1)}%
                      </div>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={parentValue}
                      onChange={(e) =>
                        handleParentSliderChange(group, Number(e.target.value))
                      }
                      className="mt-4 w-full h-2 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #5D737E 0%, #5D737E ${parentValue}%, #E6E2DB ${parentValue}%, #E6E2DB 100%)`,
                        WebkitAppearance: "none",
                      }}
                    />

                    {hasChildren && isExpanded ? (
                      <div className="mt-4 space-y-3 border-l border-[#D4DDE1] pl-5">
                        {group.children.map((child) => {
                          const childActual = getActualPercent(
                            child.raw_score,
                            child.total_score
                          );
                          const childValue = getChildScenarioValue(group, child);
                          const childContribution = (childValue * child.weight) / 100;
                          const childModified =
                            typeof activeScenario[child.key] === "number" ||
                            typeof activeScenario[group.key] === "number";

                          return (
                            <div
                              key={child.key}
                              className={`rounded-xl border px-4 py-3 ${
                                childModified
                                  ? "border-[#AFC2CC] bg-[#F4F8FA]"
                                  : "border-[#E8E3DC] bg-[#FBF8F3]"
                              }`}
                            >
                              <div className="mb-2 flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-sm font-medium text-gray-800">
                                    {child.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {formatCompactNumber(child.weight)}% •{" "}
                                    {typeof childActual === "number"
                                      ? `Current: ${childActual.toFixed(1)}%`
                                      : "Not graded"}{" "}
                                    •{" "}
                                    {`${childValue.toFixed(1)}% (${childContribution.toFixed(2)} / ${formatCompactNumber(
                                      child.weight
                                    )})`}
                                  </p>
                                </div>
                                <span className="text-xl font-semibold text-[#5D737E]">
                                  {childValue.toFixed(1)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={childValue}
                                onChange={(e) =>
                                  handleChildSliderChange(
                                    group,
                                    child,
                                    Number(e.target.value)
                                  )
                                }
                                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                                style={{
                                  background: `linear-gradient(to right, #5D737E 0%, #5D737E ${childValue}%, #E6E2DB ${childValue}%, #E6E2DB 100%)`,
                                  WebkitAppearance: "none",
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <style jsx>{`
                input[type="range"]::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  appearance: none;
                  width: 18px;
                  height: 18px;
                  background: #5d737e;
                  border-radius: 9999px;
                  border: none;
                  cursor: pointer;
                  margin-top: -5px;
                }

                input[type="range"]::-moz-range-thumb {
                  width: 18px;
                  height: 18px;
                  background: #5d737e;
                  border-radius: 9999px;
                  border: none;
                  cursor: pointer;
                }
              `}</style>
            </div>

            {/* Controls appear only when changed */}
            {hasChanges ? (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <div className="inline-flex items-center gap-3">
                  <button
                    onClick={handleOpenSaveDialog}
                    disabled={savingScenario}
                    className="inline-flex items-center gap-2 bg-green-600 text-white px-5 py-3 rounded-xl font-medium hover:opacity-90 transition shadow-sm disabled:opacity-70"
                  >
                    Save Scenario
                  </button>
                  <button
                    onClick={handleDeleteScenarioClick}
                    disabled={deletingScenario}
                    className="inline-flex items-center gap-2 bg-red-600 text-white px-5 py-3 rounded-xl font-medium hover:opacity-90 transition shadow-sm disabled:opacity-70"
                  >
                    Delete Scenario
                  </button>
                  <button
                    onClick={handleResetAll}
                    className="inline-flex items-center gap-2 bg-[#E6E2DB] text-gray-800 px-5 py-3 rounded-xl font-medium hover:opacity-90 transition shadow-sm"
                  >
                    <RotateCcw size={16} />
                    Reset All
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT: LIVE PROJECTION */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-lg lg:sticky lg:top-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-6">
              Live Projection
            </h3>

            <div className="rounded-3xl p-8 text-center bg-[#EEF3F5] border border-gray-100">
              <p className="text-sm text-gray-500">Projected Final Grade</p>
              <p className="mt-3 text-6xl font-semibold text-[#5D737E]">
                {projectedFinal.toFixed(2)}%
              </p>
              <p className="mt-3 text-xs text-gray-500">
                {normalisationApplied
                  ? "Displayed as the normalized course result."
                  : "Displayed as the raw weighted course result."}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-gray-100 bg-[#F6F1EA] px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Current Standing
                </p>
                <p className="mt-1 text-2xl font-semibold text-gray-800">
                  {currentStanding.toFixed(2)}%
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-[#EEF3F5] px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Scenario Projection
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#5D737E]">
                  {projectedFinal.toFixed(2)}%
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-green-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Best Case Reachable
                </p>
                <p className="mt-1 text-2xl font-semibold text-green-700">
                  {bestCaseReachable.toFixed(2)}%
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-red-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Worst Case Floor
                </p>
                <p className="mt-1 text-2xl font-semibold text-red-600">
                  {worstCaseFloor.toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              {projectionBreakdown.length > 0
                ? projectionBreakdown.map((entry) => {
                    const sourceLabel =
                      entry.source === "scenario" || entry.source === "whatif"
                        ? "Scenario"
                        : entry.source === "graded" || entry.source === "actual"
                          ? "Graded"
                          : "Remaining";
                    return (
                      <div
                        key={entry.name}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <div>
                          <span className="text-gray-500">{entry.name}</span>
                          <p className="text-xs text-gray-400">{sourceLabel}</p>
                        </div>
                        <span className="font-semibold text-gray-800">
                          +{entry.contribution.toFixed(2)}%
                        </span>
                      </div>
                    );
                  })
                : assessments
                    .flatMap((group) => {
                      if (group.children.length) {
                        return group.children.map((child) => ({
                          key: child.key,
                          label: child.displayName,
                          contribution:
                            (getChildScenarioValue(group, child) * child.weight) / 100,
                          sourceLabel:
                            typeof activeScenario[child.key] === "number" ||
                            typeof activeScenario[group.key] === "number"
                              ? "Scenario"
                              : hasPersistedGrade(child)
                                ? "Graded"
                                : "Default",
                        }));
                      }
                      return [
                        {
                          key: group.key,
                          label: group.displayName,
                          contribution:
                            (getParentScenarioValue(group) * group.weight) / 100,
                          sourceLabel:
                            typeof activeScenario[group.key] === "number"
                              ? "Scenario"
                              : hasPersistedGrade(group)
                                ? "Graded"
                                : "Default",
                        },
                      ];
                    })
                    .map((entry) => (
                      <div
                        key={entry.key}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <div>
                          <span className="text-gray-500">{entry.label}</span>
                          <p className="text-xs text-gray-400">{entry.sourceLabel}</p>
                        </div>
                        <span className="font-semibold text-gray-800">
                          +{entry.contribution.toFixed(2)}%
                        </span>
                      </div>
                    ))}
            </div>

            {hasChanges ? (
              <div className="mt-8">
                <button
                  onClick={handleApplyToGrades}
                  disabled={saving}
                  className="w-full bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition disabled:opacity-70"
                >
                  Apply to Actual Grades
                </button>
                <p className="mt-2 text-xs text-center text-[#B8A89A]">
                  This will update your grades page with these values
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showSaveDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h4 className="text-lg font-semibold text-gray-800">Save Scenario</h4>
            <p className="mt-2 text-sm text-gray-600">
              Enter a name for this scenario
            </p>

            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="mt-4 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-[#5D737E] focus:outline-none"
              placeholder="Scenario name"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (savingScenario) return;
                  setShowSaveDialog(false);
                  setScenarioName("");
                }}
                className="rounded-xl bg-[#E6E2DB] px-4 py-2 text-sm font-medium text-gray-800 hover:opacity-90 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveScenario}
                disabled={savingScenario}
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-70"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h4 className="text-lg font-semibold text-gray-800">
              Delete this scenario?
            </h4>
            <p className="mt-2 text-sm text-gray-600">
              This action cannot be undone.
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (deletingScenario) return;
                  setShowDeleteDialog(false);
                }}
                className="rounded-xl bg-[#E6E2DB] px-4 py-2 text-sm font-medium text-gray-800 hover:opacity-90 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteScenario}
                disabled={deletingScenario}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-70"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
