"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  deleteSavedScenario,
  getDashboardSummary,
  listCourses,
  listSavedScenarios,
  runDashboardWhatIf,
  runSavedScenario,
  saveScenario,
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
  is_mandatory_pass?: boolean;
  pass_threshold?: number | null;
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
  is_mandatory_pass?: boolean;
  pass_threshold?: number | null;
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

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 100));
}

function hasPersistedGrade(a: {
  raw_score?: number | null;
  total_score?: number | null;
}): boolean {
  return typeof a.raw_score === "number" && typeof a.total_score === "number";
}

function getMandatoryPassThreshold(
  assessment: CourseAssessment
): number | null {
  if (assessment.rule_type !== "mandatory_pass") return null;
  const config = assessment.rule_config ?? {};
  const raw = (config as Record<string, unknown>).pass_threshold;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(0, Math.min(parsed, 100));
}

function buildScenarioGroups(assessments: CourseAssessment[]): ScenarioGroup[] {
  const groups: ScenarioGroup[] = [];
  let nextId = 1;

  for (const assessment of assessments) {
    const children = Array.isArray(assessment.children)
      ? assessment.children
      : [];
    const passThreshold = getMandatoryPassThreshold(assessment);
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
        is_mandatory_pass: false,
        pass_threshold: null,
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
        is_mandatory_pass: passThreshold !== null,
        pass_threshold: passThreshold,
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
      is_mandatory_pass: passThreshold !== null,
      pass_threshold: passThreshold,
      children: [],
    });
  }

  return groups;
}

function getActualPercent(
  raw?: number | null,
  total?: number | null
): number | undefined {
  if (typeof raw !== "number" || typeof total !== "number") return undefined;
  if (!Number.isFinite(raw) || !Number.isFinite(total) || total <= 0)
    return undefined;
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
  if (typeof parentOverride === "number") return clampPercent(parentOverride);
  if (!group.children.length) {
    const actual = getActualPercent(group.raw_score, group.total_score);
    return typeof actual === "number" ? actual : 75;
  }
  const totalWeight = group.children.reduce(
    (sum, child) =>
      sum + Math.max(0, Number.isFinite(child.weight) ? child.weight : 0),
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
  const [error, setError] = useState("");
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
  const [activeScenario, setActiveScenario] = useState<Record<string, number>>(
    {}
  );
  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>(
    {}
  );

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
        if (!resolvedCourseId) return;
        const latest = courses.find((c) => c.course_id === resolvedCourseId) as
          | Course
          | undefined;
        if (!latest) return;
        setAssessments(buildScenarioGroups(latest.assessments ?? []));
        setDashboardSummary(await getDashboardSummary(resolvedCourseId));
        await fetchSavedScenarios(resolvedCourseId);
      } catch (e) {
        setError(getApiErrorMessage(e, "Error loading simulation."));
      }
    };
    loadCourse();
  }, [ensureCourseIdFromList]);

  const leafTargets = useMemo(
    () => flattenScenarioLeafTargets(assessments, activeScenario),
    [assessments, activeScenario]
  );

  useEffect(() => {
    if (!courseId || !assessments.length) return;
    const scenarioEntries = leafTargets
      .filter((t) => !t.graded || t.overrideSelf || t.overrideParent)
      .map((t) => ({
        assessment_name: t.assessment_name,
        score: clampPercent(t.score),
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
  const projectedFinal = scenarioProjection?.projected_normalised ?? 0;
  const currentStanding = dashboardSummary?.current_normalised ?? 0;

  const handleParentSliderChange = (group: ScenarioGroup, value: number) => {
    const safe = clampPercent(value);
    setActiveScenario((prev) => {
      const next = { ...prev, [group.key]: safe };
      if (group.children.length)
        group.children.forEach((c) => (next[c.key] = safe));
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
      const next = { ...prev, [child.key]: safe };
      delete next[group.key];
      return next;
    });
  };

  const handleSaveScenario = async () => {
    if (!courseId || !scenarioName.trim()) return;
    const scenarios = leafTargets
      .filter((t) => t.overrideSelf || t.overrideParent)
      .map((t) => ({ assessment_name: t.assessment_name, score: t.score }));
    try {
      setSavingScenario(true);
      await saveScenario(courseId, { name: scenarioName.trim(), scenarios });
      await fetchSavedScenarios(courseId);
      setShowSaveDialog(false);
    } catch (e) {
      setError("Failed to save.");
    } finally {
      setSavingScenario(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-20">
      {/* Visual Sandbox Banner */}
      <div className="mb-8 flex items-center justify-between rounded-3xl bg-slate-800 text-white p-6 shadow-xl border border-slate-700">
        <div className="flex items-center gap-4">
          <div className="bg-blue-500/20 p-3 rounded-2xl">
            <ShieldCheck className="text-blue-400" size={24} />
          </div>
          <div>
            <h4 className="text-lg font-bold">Safe Exploration Mode</h4>
            <p className="text-slate-400 text-sm">
              Experiment with hypotheticals. Official grades cannot be edited
              here.
            </p>
          </div>
        </div>
        <button
          onClick={() => router.push("/setup/grades")}
          className="text-xs font-bold px-4 py-2 bg-slate-700 rounded-xl hover:bg-slate-600 transition"
        >
          Go to Real Gradebook
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-200 rounded-[2.5rem] p-8 shadow-sm">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                <Zap size={22} className="text-blue-500" />
                Hypothetical Inputs
              </h3>
              <select
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm outline-none"
              >
                <option value="">Choose Scenario</option>
                {savedScenarios.map((s) => (
                  <option key={s.scenario_id} value={s.scenario_id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-6">
              {assessments.map((group) => {
                const isExpanded = expandedByKey[group.key] ?? false;
                const parentValue = resolveParentValue(group, activeScenario);
                return (
                  <div
                    key={group.key}
                    className="p-6 rounded-3xl bg-gray-50/50 border border-gray-100"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        {group.children.length > 0 && (
                          <button
                            onClick={() =>
                              setExpandedByKey((p) => ({
                                ...p,
                                [group.key]: !p[group.key],
                              }))
                            }
                            className="p-1 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition"
                          >
                            <ChevronDown
                              size={18}
                              className={`transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        )}
                        <span className="font-bold text-gray-800">
                          {group.displayName}
                        </span>
                      </div>
                      <span className="text-2xl font-black text-blue-600 font-mono">
                        {parentValue.toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={parentValue}
                      onChange={(e) =>
                        handleParentSliderChange(group, Number(e.target.value))
                      }
                      className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer"
                    />
                    {isExpanded && (
                      <div className="mt-4 space-y-3 ml-6">
                        {group.children.map((child) => {
                          const childVal = resolveChildValue(
                            group,
                            child,
                            activeScenario
                          );
                          return (
                            <div
                              key={child.key}
                              className="p-4 bg-white rounded-2xl border border-gray-100 flex items-center gap-6"
                            >
                              <span className="text-sm font-medium text-gray-600 w-32 truncate">
                                {child.name}
                              </span>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={childVal}
                                onChange={(e) =>
                                  handleChildSliderChange(
                                    group,
                                    child,
                                    Number(e.target.value)
                                  )
                                }
                                className="flex-1 h-2 bg-gray-100 rounded-full appearance-none cursor-pointer"
                              />
                              <span className="text-sm font-bold text-gray-800 w-12 text-right">
                                {childVal.toFixed(0)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-[2.5rem] p-8 shadow-xl lg:sticky lg:top-8">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">
              Simulation Result
            </p>
            <div className="p-10 rounded-[2rem] bg-blue-50 border-2 border-blue-100 text-center mb-8">
              <p className="text-7xl font-black text-blue-600 font-mono tracking-tighter">
                {projectedFinal.toFixed(2)}%
              </p>
              <p className="mt-4 text-sm font-bold text-blue-800 opacity-60">
                Hypothetical Course Total
              </p>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex justify-between p-4 bg-gray-50 rounded-2xl text-sm">
                <span className="text-gray-500 font-bold">ACTUAL CURRENT</span>
                <span className="text-gray-800 font-black font-mono">
                  {currentStanding.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between p-4 bg-green-50 rounded-2xl text-sm border border-green-100">
                <span className="text-green-600 font-bold">
                  SIMULATION DELTA
                </span>
                <span className="text-green-700 font-black font-mono">
                  +{(projectedFinal - currentStanding).toFixed(2)}%
                </span>
              </div>
            </div>

            {hasChanges && (
              <div className="space-y-3">
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200 hover:scale-105 active:scale-95 transition-all"
                >
                  Save Simulation State
                </button>
                <button
                  onClick={() => setActiveScenario({})}
                  className="w-full py-4 bg-gray-100 text-gray-500 rounded-2xl font-bold hover:bg-gray-200 transition"
                >
                  Clear Sandbox
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl">
            <h4 className="text-2xl font-black text-gray-900 mb-2">
              Save Sandbox Label
            </h4>
            <p className="text-sm text-gray-500 mb-6">
              Store these inputs as a "Scenario" to revisit later.
            </p>
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 mb-6"
              placeholder="e.g., Best Case Final"
            />
            <div className="flex gap-4">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-4 font-bold text-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveScenario}
                className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black"
              >
                Save State
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #2563eb;
          border: 3px solid #fff;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
