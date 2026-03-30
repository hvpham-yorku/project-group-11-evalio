"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Lightbulb, RotateCcw } from "lucide-react";
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
import { GpaScaleConverter } from "@/components/setup/GpaScaleConverter";

const CHILD_ASSESSMENT_SEPARATOR = "::";
const DEFAULT_SCENARIO_WORST = "__default_worst_case__";
const DEFAULT_SCENARIO_BEST = "__default_best_case__";

// --- REFACTOR: Constants & Theme to fix "Magic Numbers" and "Repeated Chorus" ---
const DEFAULT_PROJECTION_SCORE = 75;

const COLORS = {
  PRIMARY_BLUE: "#5F7A8A",
  HOVER_BLUE: "#6B8BA8",
  WARNING_RED: "#B86B6B",
  SUCCESS_GREEN: "#6B9B7A",
  NEUTRAL_GREY: "#E8E3DC",
  BG_CREAM: "#F5F1EB",
  BORDER_TAN: "#D4CFC7",
};

// --- TYPES ---
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
  rule_type?: string | null;
  rule_config?: Record<string, unknown> | null;
  total_count?: number | null;
  effective_count?: number | null;
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
  children?: Array<{
    name: string;
    raw_score: number | null;
    total_score: number | null;
  }>;
};

// --- HELPER LOGIC ---
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
        rule_type: assessment.rule_type ?? null,
        rule_config:
          assessment.rule_config && typeof assessment.rule_config === "object"
            ? assessment.rule_config
            : null,
        total_count: Number.isFinite(Number(assessment.total_count))
          ? Number(assessment.total_count)
          : null,
        effective_count: Number.isFinite(Number(assessment.effective_count))
          ? Number(assessment.effective_count)
          : null,
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
      rule_type: assessment.rule_type ?? null,
      rule_config:
        assessment.rule_config && typeof assessment.rule_config === "object"
          ? assessment.rule_config
          : null,
      total_count: Number.isFinite(Number(assessment.total_count))
        ? Number(assessment.total_count)
        : null,
      effective_count: Number.isFinite(Number(assessment.effective_count))
        ? Number(assessment.effective_count)
        : null,
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
        const childIsGraded = isLockedGradedChild(child);
        const overrideParent =
          typeof activeScenario[group.key] === "number" && !childIsGraded;
        const actual = getActualPercent(child.raw_score, child.total_score);
        const parentScore = activeScenario[group.key];
        const childScore = activeScenario[child.key];
        const score = clampPercent(
          typeof childScore === "number"
            ? childScore
            : typeof parentScore === "number" && !childIsGraded
            ? parentScore
            : typeof actual === "number"
            ? actual
            : DEFAULT_PROJECTION_SCORE
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
        : DEFAULT_PROJECTION_SCORE
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

function normalizeScenarioOverrides(
  groups: ScenarioGroup[],
  rawOverrides: Record<string, number>
): Record<string, number> {
  const normalized: Record<string, number> = {};

  for (const group of groups) {
    if (!group.children.length) {
      const parentOverride = rawOverrides[group.key];
      if (typeof parentOverride === "number") {
        normalized[group.key] = clampPercent(parentOverride);
      }
      continue;
    }

    const parentOverride = rawOverrides[group.key];
    for (const child of group.children) {
      const childOverride = rawOverrides[child.key];
      if (typeof childOverride === "number") {
        normalized[child.key] = clampPercent(childOverride);
        continue;
      }
      if (typeof parentOverride === "number" && !isLockedGradedChild(child)) {
        normalized[child.key] = clampPercent(parentOverride);
      }
    }
  }

  return normalized;
}

function buildDefaultScenarioOverrides(
  groups: ScenarioGroup[],
  value: number
): Record<string, number> {
  const safe = clampPercent(value);
  const overrides: Record<string, number> = {};

  for (const group of groups) {
    if (group.children.length) {
      for (const child of group.children) {
        const graded =
          hasPersistedGrade(child) && Number(child.total_score) > 0;
        if (!graded) {
          overrides[child.key] = safe;
        }
      }
      continue;
    }

    const graded = hasPersistedGrade(group) && Number(group.total_score) > 0;
    if (!graded) {
      overrides[group.key] = safe;
    }
  }

  return overrides;
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
    return typeof actual === "number" ? actual : DEFAULT_PROJECTION_SCORE;
  }

  const totalWeight = group.children.reduce(
    (sum, child) =>
      sum + Math.max(0, Number.isFinite(child.weight) ? child.weight : 0),
    0
  );
  if (totalWeight <= 0) return DEFAULT_PROJECTION_SCORE;

  const weightedContribution = group.children.reduce((sum, child) => {
    const childOverride = activeScenario[child.key];
    const actual = getActualPercent(child.raw_score, child.total_score);
    const childValue = clampPercent(
      typeof childOverride === "number"
        ? childOverride
        : typeof actual === "number"
        ? actual
        : DEFAULT_PROJECTION_SCORE
    );
    return sum + (childValue * child.weight) / 100;
  }, 0);

  return clampPercent((weightedContribution / totalWeight) * 100);
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : null;
}

function computeGroupRuleState(
  group: ScenarioGroup,
  activeScenario: Record<string, number>
): {
  parentValue: number;
  parentContribution: number;
  droppedChildKeys: Set<string>;
  ruleSummary: string | null;
} {
  if (!group.children.length) {
    const parentValue = resolveParentValue(group, activeScenario);
    return {
      parentValue,
      parentContribution: (parentValue * group.weight) / 100,
      droppedChildKeys: new Set<string>(),
      ruleSummary: null,
    };
  }

  const children = group.children.map((child, index) => ({
    child,
    index,
    score: resolveChildValue(group, child, activeScenario),
    weight: Math.max(0, Number.isFinite(child.weight) ? child.weight : 0),
  }));

  const totalCountFromConfig = parsePositiveInteger(
    (group.rule_config ?? {}).total_count
  );
  const totalCount =
    totalCountFromConfig ??
    parsePositiveInteger(group.total_count) ??
    group.children.length;

  let activeChildren = children;
  let ruleSummary:
    | string
    | null = `${group.children.length} ${group.displayName}`;

  if (group.rule_type === "best_of") {
    const bestCount =
      parsePositiveInteger((group.rule_config ?? {}).best_count) ??
      parsePositiveInteger(group.effective_count) ??
      group.children.length;
    const keepCount = Math.max(1, Math.min(bestCount, children.length));
    const sorted = [...children].sort(
      (a, b) => b.score - a.score || a.index - b.index
    );
    activeChildren = sorted.slice(0, keepCount);
    ruleSummary = `Best ${keepCount} of ${totalCount} ${group.displayName}`;
  } else if (group.rule_type === "drop_lowest") {
    const dropCount =
      parsePositiveInteger((group.rule_config ?? {}).drop_count) ??
      (() => {
        const total = parsePositiveInteger(group.total_count);
        const effective = parsePositiveInteger(group.effective_count);
        if (total && effective && total >= effective) return total - effective;
        return 1;
      })();
    const normalizedDrop = Math.max(
      0,
      Math.min(dropCount, Math.max(0, children.length - 1))
    );
    const sorted = [...children].sort(
      (a, b) => a.score - b.score || a.index - b.index
    );
    activeChildren = sorted.slice(normalizedDrop);
    ruleSummary = `Drop lowest ${normalizedDrop} of ${totalCount} ${group.displayName}`;
  } else if (group.rule_type === "pure_multiplicative") {
    ruleSummary = `All ${totalCount} ${group.displayName} count`;
  }

  const activeChildKeys = new Set(
    activeChildren.map((entry) => entry.child.key)
  );
  const droppedChildKeys = new Set(
    children
      .filter((entry) => !activeChildKeys.has(entry.child.key))
      .map((entry) => entry.child.key)
  );

  let parentContribution = activeChildren.reduce(
    (sum, entry) => sum + (entry.score * entry.weight) / 100,
    0
  );

  if (group.rule_type === "best_of" || group.rule_type === "drop_lowest") {
    const activeWeight = activeChildren.reduce(
      (sum, entry) => sum + entry.weight,
      0
    );
    if (activeWeight > 0 && Math.abs(activeWeight - group.weight) > 0.001) {
      parentContribution = (parentContribution / activeWeight) * group.weight;
    }
  }

  const parentValue =
    group.weight > 0
      ? clampPercent((parentContribution / group.weight) * 100)
      : 0;

  return {
    parentValue,
    parentContribution,
    droppedChildKeys,
    ruleSummary,
  };
}

function isLockedGradedChild(child: ScenarioAssessment): boolean {
  return (
    hasPersistedGrade(child) &&
    typeof child.total_score === "number" &&
    child.total_score > 0
  );
}

function withUngradedChildrenSetTo(
  group: ScenarioGroup,
  activeScenario: Record<string, number>,
  fillValue: number
): Record<string, number> {
  const next = { ...activeScenario };
  delete next[group.key];

  const safe = clampPercent(fillValue);
  for (const child of group.children) {
    if (!isLockedGradedChild(child)) {
      next[child.key] = safe;
    }
  }
  return next;
}

function getParentSliderBounds(
  group: ScenarioGroup,
  activeScenario: Record<string, number>
): { min: number; max: number; hasUngradedChildren: boolean } {
  if (!group.children.length) {
    return { min: 0, max: 100, hasUngradedChildren: false };
  }

  const hasUngradedChildren = group.children.some(
    (child) => !isLockedGradedChild(child)
  );
  if (!hasUngradedChildren) {
    const current = computeGroupRuleState(group, activeScenario).parentValue;
    return { min: current, max: current, hasUngradedChildren: false };
  }

  const minValue = computeGroupRuleState(
    group,
    withUngradedChildrenSetTo(group, activeScenario, 0)
  ).parentValue;
  const maxValue = computeGroupRuleState(
    group,
    withUngradedChildrenSetTo(group, activeScenario, 100)
  ).parentValue;

  return {
    min: Math.max(0, Math.min(minValue, maxValue)),
    max: Math.min(100, Math.max(minValue, maxValue)),
    hasUngradedChildren: true,
  };
}

function getSliderFillPercent(value: number, min: number, max: number): number {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    return 0;
  }
  if (max <= min) return 100;
  const normalized = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, normalized));
}

function solveUngradedFillForTargetParentValue(
  group: ScenarioGroup,
  activeScenario: Record<string, number>,
  targetParentValue: number
): number {
  let low = 0;
  let high = 100;
  let bestFill = 0;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < 28; i += 1) {
    const mid = (low + high) / 2;
    const midParent = computeGroupRuleState(
      group,
      withUngradedChildrenSetTo(group, activeScenario, mid)
    ).parentValue;
    const diff = Math.abs(midParent - targetParentValue);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestFill = mid;
    }
    if (midParent < targetParentValue) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return clampPercent(bestFill);
}

function resolveChildValue(
  group: ScenarioGroup,
  child: ScenarioAssessment,
  activeScenario: Record<string, number>
): number {
  const childOverride = activeScenario[child.key];
  if (typeof childOverride === "number") return clampPercent(childOverride);

  const parentOverride = activeScenario[group.key];
  if (typeof parentOverride === "number" && !isLockedGradedChild(child)) {
    return clampPercent(parentOverride);
  }

  const actual = getActualPercent(child.raw_score, child.total_score);
  return typeof actual === "number" ? actual : DEFAULT_PROJECTION_SCORE;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

// --- REFACTOR: Extracted Sub-component to fix "Stuffed Suitcase" ---
type AssessmentSliderRowProps = {
  value: number;
  min?: number;
  max?: number;
  isBelowThreshold?: boolean;
  sliderFillPercent: number;
  onChange: (val: number) => void;
  disabled?: boolean;
};

function AssessmentSliderRow({
  value,
  min = 0,
  max = 100,
  isBelowThreshold = false,
  sliderFillPercent,
  onChange,
  disabled = false,
}: AssessmentSliderRowProps) {
  const activeColor = isBelowThreshold
    ? COLORS.WARNING_RED
    : COLORS.PRIMARY_BLUE;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={0.1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      className="mt-4 w-full h-2 rounded-full appearance-none cursor-pointer"
      style={{
        background: `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${sliderFillPercent}%, ${COLORS.NEUTRAL_GREY} ${sliderFillPercent}%, ${COLORS.NEUTRAL_GREY} 100%)`,
        WebkitAppearance: "none",
      }}
    />
  );
}

// --- MAIN COMPONENT ---
export function ExploreScenarios() {
  const router = useRouter();

  const [assessments, setAssessments] = useState<ScenarioGroup[]>([]);
  const [courseAssessments, setCourseAssessments] = useState<
    CourseAssessment[]
  >([]);
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
  const [exploreTab, setExploreTab] = useState<"course" | "gpa">("course");

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

  const getGroupRuleState = useCallback(
    (group: ScenarioGroup) => computeGroupRuleState(group, activeScenario),
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
    if (!assessments.length) return 0;
    const sum = assessments.reduce((acc, group) => {
      const ruleState = getGroupRuleState(group);
      return acc + ruleState.parentContribution;
    }, 0);
    return Number.isFinite(sum) ? sum : 0;
  })();

  const currentStanding =
    dashboardSummary?.current_normalised ??
    dashboardSummary?.current_grade ??
    0;

  const mandatoryPassWarnings = useMemo(() => {
    const explicitWarnings = scenarioProjection?.mandatory_pass_warnings ?? [];
    const status = scenarioProjection?.mandatory_pass_status;
    const computedWarnings = !status?.has_requirements
      ? []
      : status.requirements
          .filter((requirement) => requirement.status === "failed")
          .map(
            (requirement) =>
              `Warning: Score of ${(requirement.actual_percent ?? 0).toFixed(
                1
              )}% on ${
                requirement.assessment_name
              } is below the mandatory pass threshold of ${requirement.threshold.toFixed(
                1
              )}%.`
          );
    return [...new Set([...explicitWarnings, ...computedWarnings])];
  }, [scenarioProjection]);

  const handleParentSliderChange = (group: ScenarioGroup, value: number) => {
    const safe = clampPercent(value);
    setActiveScenario((prev) => {
      if (!group.children.length) {
        return { ...prev, [group.key]: safe };
      }

      const bounds = getParentSliderBounds(group, prev);
      if (!bounds.hasUngradedChildren) {
        const next = { ...prev };
        delete next[group.key];
        return next;
      }

      const clampedTarget = Math.max(bounds.min, Math.min(safe, bounds.max));
      const fillValue = solveUngradedFillForTargetParentValue(
        group,
        prev,
        clampedTarget
      );

      const next = withUngradedChildrenSetTo(group, prev, fillValue);
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
        const children = Array.isArray(assessment.children)
          ? assessment.children
          : [];

        if (children.length) {
          const childUpdates = children
            .map((child) => {
              const parentOverride = activeScenario[assessment.name];
              const key = `${assessment.name}${CHILD_ASSESSMENT_SEPARATOR}${child.name}`;
              const childOverride = activeScenario[key];
              const hasGrade =
                typeof child.raw_score === "number" &&
                typeof child.total_score === "number" &&
                child.total_score > 0;
              const canUseParentOverride =
                typeof parentOverride === "number" && !hasGrade;
              const hasOverride =
                typeof childOverride === "number" || canUseParentOverride;

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
                : DEFAULT_PROJECTION_SCORE;

              return {
                name: child.name,
                raw_score: percent,
                total_score: 100,
              };
            })
            .filter(
              (
                item
              ): item is {
                name: string;
                raw_score: number;
                total_score: number;
              } => item !== null
            );

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
            ? clampPercent(
                (assessment.raw_score! / assessment.total_score) * 100
              )
            : undefined;
        const percent = hasOverride
          ? clampPercent(activeScenario[key])
          : typeof actual === "number"
          ? actual
          : DEFAULT_PROJECTION_SCORE;

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
    if (
      selectedScenarioId === DEFAULT_SCENARIO_WORST ||
      selectedScenarioId === DEFAULT_SCENARIO_BEST
    ) {
      window.alert("Built-in default scenarios cannot be deleted.");
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
      setActiveScenario({});
      setError("");
      return;
    }
    if (scenarioId === DEFAULT_SCENARIO_WORST) {
      setActiveScenario(buildDefaultScenarioOverrides(assessments, 0));
      setError("");
      return;
    }
    if (scenarioId === DEFAULT_SCENARIO_BEST) {
      setActiveScenario(buildDefaultScenarioOverrides(assessments, 100));
      setError("");
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
      setActiveScenario(normalizeScenarioOverrides(assessments, overrides));
      setError("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load scenario."));
    } finally {
      setLoadingScenario(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <h2 className="text-3xl font-bold text-[#3A3530]">Scenario Explorer</h2>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-[#6B6560]">
        This is your sandbox. Experiment freely with different grade
        possibilities. Nothing here affects your actual grades unless you choose
        to apply it.
      </p>

      {error ? <p className="mt-4 text-sm text-[#B86B6B]">{error}</p> : null}

      {/* Tab toggle */}
      <div className="mt-6 mb-2">
        <div className="inline-flex rounded-lg border border-[#D4CFC7] bg-[#F5F1EB] p-1">
          <button
            onClick={() => setExploreTab("course")}
            className={`rounded-md px-5 py-2 text-sm font-medium transition ${
              exploreTab === "course"
                ? "bg-[#5F7A8A] text-white shadow-sm"
                : "text-[#6B6560] hover:text-[#3A3530]"
            }`}
          >
            Course
          </button>
          <button
            onClick={() => setExploreTab("gpa")}
            className={`rounded-md px-5 py-2 text-sm font-medium transition ${
              exploreTab === "gpa"
                ? "bg-[#5F7A8A] text-white shadow-sm"
                : "text-[#6B6560] hover:text-[#3A3530]"
            }`}
          >
            GPA
          </button>
        </div>
      </div>

      {exploreTab === "gpa" ? (
        <div className="mt-6">
          <GpaScaleConverter />
        </div>
      ) : null}

      {exploreTab === "course" ? (
      <>
<div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* LEFT: WHAT-IF */}
        <div className="lg:col-span-3">
          <div className="rounded-3xl border border-[#D4CFC7] bg-white p-8 shadow-sm">
            <div className="flex justify-between items-center mb-6 gap-4">
              <div className="flex items-center gap-3">
                <Lightbulb className="text-[#C9945F]" size={22} />
                <h3 className="text-lg font-semibold text-[#3A3530]">
                  What-If Exploration
                </h3>
              </div>
              <select
                value={selectedScenarioId}
                onChange={(e) => handleSelectScenario(e.target.value)}
                disabled={loadingScenario}
                className={`min-w-[180px] rounded-xl border border-[#D4CFC7] bg-[#F5F1EB] px-4 py-2 text-sm text-[#6B6560] focus:border-[#5F7A8A] focus:outline-none disabled:opacity-70`}
              >
                <option value="">Select Scenario</option>
                <option value={DEFAULT_SCENARIO_WORST}>Worst Case</option>
                <option value={DEFAULT_SCENARIO_BEST}>Best Case</option>
                {savedScenarios.map((scenario) => (
                  <option
                    key={scenario.scenario_id}
                    value={scenario.scenario_id}
                  >
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>

            {mandatoryPassWarnings.length > 0 ? (
              <div className="mb-4 rounded-xl border border-[#F1DCC4] bg-[#FDF3E7] px-4 py-3 text-sm text-[#C9945F]">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <AlertTriangle size={16} />
                  Mandatory pass warning
                </div>
                <div className="space-y-1 text-xs">
                  {mandatoryPassWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-5">
              {assessments.map((group) => {
                const hasChildren = group.children.length > 0;
                const isExpanded = expandedByKey[group.key] ?? false;
                const parentActual = getActualPercent(
                  group.raw_score,
                  group.total_score
                );
                const groupRuleState = getGroupRuleState(group);
                const parentValue = groupRuleState.parentValue;
                const parentContribution = groupRuleState.parentContribution;
                const droppedChildKeys = groupRuleState.droppedChildKeys;
                const ruleSummary = groupRuleState.ruleSummary;
                const parentBounds = hasChildren
                  ? getParentSliderBounds(group, activeScenario)
                  : { min: 0, max: 100, hasUngradedChildren: false };
                const parentSliderFill = getSliderFillPercent(
                  parentValue,
                  hasChildren ? parentBounds.min : 0,
                  hasChildren ? parentBounds.max : 100
                );
                const parentThreshold = group.pass_threshold;
                const parentBelowThreshold =
                  Boolean(group.is_mandatory_pass) &&
                  typeof parentThreshold === "number" &&
                  parentValue < parentThreshold;
                const isModified =
                  typeof activeScenario[group.key] === "number" ||
                  group.children.some(
                    (child) => typeof activeScenario[child.key] === "number"
                  );

                return (
                  <div
                    key={group.key}
                    className={`rounded-2xl p-5 border ${
                      isModified
                        ? "border-[#C4D6E4] bg-[#E8EFF5]"
                        : "border-[#E8E3DC] bg-[#F5F1EB]"
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
                            className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#C4D6E4] bg-white text-[#5F7A8A] hover:bg-[#E8EFF5]"
                            aria-label={`${
                              isExpanded ? "Collapse" : "Expand"
                            } ${group.displayName}`}
                          >
                            <ChevronDown
                              size={16}
                              className={`transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        ) : (
                          <span className="mt-3 h-2.5 w-2.5 rounded-full bg-[#C4B5A6]" />
                        )}
                        <div>
                          <h4 className="font-semibold text-[#3A3530]">
                            {group.displayName}
                          </h4>
                          <p className="text-sm text-[#6B6560]">
                            {formatCompactNumber(group.weight)}% •{" "}
                            {hasChildren && ruleSummary
                              ? `${ruleSummary} • `
                              : ""}
                            {typeof parentActual === "number"
                              ? `Current: ${parentActual.toFixed(1)}%`
                              : hasChildren
                              ? "Derived from child inputs"
                              : "Not graded"}
                          </p>
                          <p className="text-sm text-[#6B6560]">
                            {`${parentValue.toFixed(1)}% (${parentContribution.toFixed(2)} / ${formatCompactNumber(group.weight)})`}
                          </p>
                          {group.is_mandatory_pass ? (
                            <p
                              className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
                                parentBelowThreshold
                                  ? "bg-[#F9EAEA] text-[#B86B6B]"
                                  : "bg-[#E8F2EA] text-[#6B9B7A]"
                              }`}
                            >
                              Mandatory pass threshold:{" "}
                              {(parentThreshold ?? 50).toFixed(1)}%
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-3xl font-semibold text-[#5F7A8A]">
                        {parentValue.toFixed(1)}%
                      </div>
                    </div>

                    <AssessmentSliderRow
                      value={parentValue}
                      min={hasChildren ? parentBounds.min : 0}
                      max={hasChildren ? parentBounds.max : 100}
                      isBelowThreshold={parentBelowThreshold}
                      sliderFillPercent={parentSliderFill}
                      onChange={(val) => handleParentSliderChange(group, val)}
                      disabled={
                        hasChildren && !parentBounds.hasUngradedChildren
                      }
                    />

                    {hasChildren && !parentBounds.hasUngradedChildren ? (
                      <p className="mt-2 text-xs text-[#6B6560]">
                        All child assessments are graded. Parent slider is
                        locked.
                      </p>
                    ) : null}
                    {group.is_mandatory_pass ? (
                      <p
                        className={`mt-2 text-xs ${
                          parentBelowThreshold
                            ? "text-[#B86B6B]"
                            : "text-[#6B9B7A]"
                        }`}
                      >
                        {parentBelowThreshold
                          ? `Below threshold (${(parentThreshold ?? 50).toFixed(
                              1
                            )}%).`
                          : `At or above threshold (${(
                              parentThreshold ?? 50
                            ).toFixed(1)}%).`}
                      </p>
                    ) : null}

                    {hasChildren && isExpanded ? (
                      <div className="mt-4 space-y-3 border-l border-[#D4CFC7] pl-5">
                        {group.children.map((child) => {
                          const childActual = getActualPercent(
                            child.raw_score,
                            child.total_score
                          );
                          const childValue = getChildScenarioValue(
                            group,
                            child
                          );
                          const childContribution =
                            (childValue * child.weight) / 100;
                          const isDropped = droppedChildKeys.has(child.key);
                          const displayContribution = isDropped
                            ? 0
                            : childContribution;
                          const childModified =
                            typeof activeScenario[child.key] === "number" ||
                            typeof activeScenario[group.key] === "number";

                          return (
                            <div
                              key={child.key}
                              className={`rounded-xl border px-4 py-3 ${
                                isDropped
                                  ? "border-[#E8B6B6] bg-[#F9EAEA]"
                                  : childModified
                                  ? "border-[#C4D6E4] bg-[#E8EFF5]"
                                  : "border-[#D4CFC7] bg-[#FCFAF7]"
                              }`}
                            >
                              <div className="mb-2 flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-sm font-medium text-[#3A3530]">
                                    {child.name}
                                    {isDropped ? (
                                      <span className="ml-2 rounded-full bg-[#F9EAEA] px-2 py-0.5 text-[10px] font-semibold text-[#B86B6B]">
                                        Dropped
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="text-xs text-[#6B6560]">
                                    {formatCompactNumber(child.weight)}% •{" "}
                                    {typeof childActual === "number"
                                      ? `Current: ${childActual.toFixed(1)}%`
                                      : "Not graded"}{" "}
                                    •{" "}
                                    {`${childValue.toFixed(
                                      1
                                    )}% (${displayContribution.toFixed(
                                      2
                                    )} / ${formatCompactNumber(child.weight)})`}
                                  </p>
                                  {isDropped ? (
                                    <p className="mt-1 text-[11px] font-medium text-[#B86B6B]">
                                      Excluded by rule from parent calculation.
                                    </p>
                                  ) : null}
                                </div>
                                <span
                                  className={`text-xl font-semibold ${
                                    isDropped
                                      ? "text-[#B86B6B]"
                                      : "text-[#5F7A8A]"
                                  }`}
                                >
                                  {childValue.toFixed(1)}%
                                </span>
                              </div>
                              <AssessmentSliderRow
                                value={childValue}
                                sliderFillPercent={childValue}
                                isBelowThreshold={isDropped}
                                onChange={(val) =>
                                  handleChildSliderChange(group, child, val)
                                }
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
                  background: #5f7a8a;
                  border-radius: 9999px;
                  border: none;
                  cursor: pointer;
                  margin-top: -5px;
                }

                input[type="range"]::-moz-range-thumb {
                  width: 18px;
                  height: 18px;
                  background: #5f7a8a;
                  border-radius: 9999px;
                  border: none;
                  cursor: pointer;
                }
              `}</style>
            </div>

            {/* Controls appear only when changed */}
            {hasChanges ? (
              <div className="mt-8 border-t border-[#E8E3DC] pt-6">
                <div className="inline-flex items-center gap-3">
                  <button
                    onClick={handleOpenSaveDialog}
                    disabled={savingScenario}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#2E7D52] px-5 py-3 font-medium text-white transition shadow-sm hover:bg-[#256943] disabled:opacity-70"
                  >
                    Save Scenario
                  </button>
                  <button
                    onClick={handleDeleteScenarioClick}
                    disabled={deletingScenario}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#D94444] px-5 py-3 font-medium text-white transition shadow-sm hover:bg-[#C03636] disabled:opacity-70"
                  >
                    Delete Scenario
                  </button>
                  <button
                    onClick={handleResetAll}
                    className={`inline-flex items-center gap-2 rounded-xl bg-[#F5F1EB] px-5 py-3 font-medium text-[#3A3530] transition shadow-sm hover:opacity-90`}
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
        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-[#D4CFC7] bg-white p-8 shadow-lg lg:sticky lg:top-6">
            <h3 className="mb-6 text-lg font-semibold text-[#3A3530]">
              Live Projection
            </h3>

            <div className="rounded-3xl border border-[#C4D6E4] bg-[#E8EFF5] p-8 text-center">
              <p className="text-sm text-[#6B6560]">Projected Final Grade</p>
              <p className="mt-3 text-6xl font-semibold text-[#5F7A8A]">
                {projectedFinal.toFixed(2)}%
              </p>
              <p className="mt-3 text-xs text-[#6B6560]">
                Displayed as the raw weighted course result.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3">
              <div
                className={`rounded-2xl border border-[#E8E3DC] bg-[#F5F1EB] px-4 py-3`}
              >
                <p className="text-xs uppercase tracking-wide text-[#6B6560]">
                  Current Standing
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#3A3530]">
                  {currentStanding.toFixed(2)}%
                </p>
              </div>
            </div>

            {hasChanges ? (
              <div className="mt-8">
                <button
                  onClick={handleApplyToGrades}
                  disabled={saving}
                  className="w-full rounded-xl bg-[#5F7A8A] py-4 font-semibold text-white shadow-lg transition hover:bg-[#6B8BA8] disabled:opacity-70"
                >
                  Apply to Actual Grades
                </button>
                <p className="mt-2 text-center text-xs text-[#C4B5A6]">
                  This will update your grades page with these values
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      </>
      ) : null}

      {showSaveDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            className={`w-full max-w-md rounded-2xl border border-[#D4CFC7] bg-white p-6 shadow-2xl`}
          >
            <h4 className="text-lg font-semibold text-[#3A3530]">
              Save Scenario
            </h4>
            <p className="mt-2 text-sm text-[#6B6560]">
              Enter a name for this scenario
            </p>

            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className={`mt-4 w-full rounded-xl border border-[#D4CFC7] bg-[#F5F1EB] px-4 py-3 text-sm text-[#3A3530] focus:border-[#5F7A8A] focus:outline-none`}
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
                className={`rounded-xl bg-[#F5F1EB] px-4 py-2 text-sm font-medium text-[#3A3530] transition hover:opacity-90`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveScenario}
                disabled={savingScenario}
                className={`rounded-xl bg-[#6B9B7A] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-70`}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            className={`w-full max-w-md rounded-2xl border border-[#D4CFC7] bg-white p-6 shadow-2xl`}
          >
            <h4 className="text-lg font-semibold text-[#3A3530]">
              Delete this scenario?
            </h4>
            <p className="mt-2 text-sm text-[#6B6560]">
              This action cannot be undone.
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (deletingScenario) return;
                  setShowDeleteDialog(false);
                }}
                className={`rounded-xl bg-[#F5F1EB] px-4 py-2 text-sm font-medium text-[#3A3530] transition hover:opacity-90`}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteScenario}
                disabled={deletingScenario}
                className={`rounded-xl bg-[#B86B6B] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-70`}
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
