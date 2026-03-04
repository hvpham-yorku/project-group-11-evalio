"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Circle, Plus, RotateCcw, X } from "lucide-react";
import { listCourses, updateCourseGrades } from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";
import { getApiErrorMessage } from "@/lib/errors";

type ChildAssessment = {
  id: string;
  name: string;
  weight: number;
  raw_score?: string;
  total_score?: string;
};

type Assessment = {
  id: number;
  name: string;
  weight: number;
  raw_score?: string;
  total_score?: string;
  children: ChildAssessment[];
  rule_type?: string | null;
  rule_config?: Record<string, unknown> | null;
  effective_count?: number | null;
  total_count?: number | null;
  is_bonus?: boolean;
};

type InstitutionalBoundary = {
  letter: string;
  minLabel: string;
  points: string;
  descriptor: string;
};

const PARTIAL_SCORES_ERROR = "Please enter both received and total score.";
const CHILD_WEIGHT_TOLERANCE = 0.5;

function parseNumberOrNull(value?: string): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPartial(raw: number | null, total: number | null): boolean {
  return (raw === null) !== (total === null);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatScore(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

function toPercentage(raw: number, total: number): number {
  if (!Number.isFinite(raw) || !Number.isFinite(total) || total <= 0) return 0;
  return clampPercent((raw / total) * 100);
}

function getBestOfEffectiveCount(assessment: Assessment): number {
  if (typeof assessment.effective_count === "number" && assessment.effective_count > 0) {
    return Math.min(Math.floor(assessment.effective_count), assessment.children.length || 1);
  }

  const config = assessment.rule_config ?? {};
  const bestCountRaw =
    typeof config.best_count === "number"
      ? config.best_count
      : typeof config.best === "number"
      ? config.best
      : null;

  if (typeof bestCountRaw === "number" && bestCountRaw > 0) {
    return Math.min(Math.floor(bestCountRaw), assessment.children.length || 1);
  }

  return Math.max(1, assessment.children.length);
}

function computeParentPercentFromChildren(assessment: Assessment): number | null {
  if (!assessment.children.length) return null;

  const childPercents = assessment.children.map((child) => {
    const raw = parseNumberOrNull(child.raw_score);
    const total = parseNumberOrNull(child.total_score);
    if (raw === null || total === null || total <= 0) {
      return { percent: 0, graded: false };
    }
    return { percent: toPercentage(raw, total), graded: true };
  });

  const hasAnyGraded = childPercents.some((entry) => entry.graded);
  if (!hasAnyGraded) return null;

  if (assessment.rule_type === "pure_multiplicative") {
    const sum = childPercents.reduce((acc, item) => acc + item.percent, 0);
    return clampPercent(sum / assessment.children.length);
  }

  if (assessment.rule_type === "best_of") {
    const effectiveCount = getBestOfEffectiveCount(assessment);
    const selected = [...childPercents]
      .map((item) => item.percent)
      .sort((a, b) => b - a)
      .slice(0, effectiveCount);
    if (!selected.length) return null;
    const sum = selected.reduce((acc, value) => acc + value, 0);
    return clampPercent(sum / selected.length);
  }

  const totalChildWeight = assessment.children.reduce((sum, child) => sum + child.weight, 0);
  if (totalChildWeight <= 0) {
    const sum = childPercents.reduce((acc, item) => acc + item.percent, 0);
    return clampPercent(sum / assessment.children.length);
  }

  const weighted = assessment.children.reduce((sum, child, index) => {
    const percent = childPercents[index]?.percent ?? 0;
    return sum + (percent * child.weight) / totalChildWeight;
  }, 0);
  return clampPercent(weighted);
}

function syncParentFromChildren(assessment: Assessment): Assessment {
  if (!assessment.children.length) return assessment;

  const parentPercent = computeParentPercentFromChildren(assessment);
  if (parentPercent === null) {
    return { ...assessment, raw_score: "", total_score: "" };
  }

  return {
    ...assessment,
    raw_score: formatScore(parentPercent),
    total_score: "100",
  };
}

function distributeParentToChildren(assessment: Assessment): Assessment {
  if (!assessment.children.length) return assessment;

  const raw = parseNumberOrNull(assessment.raw_score);
  const total = parseNumberOrNull(assessment.total_score);
  if (raw === null || total === null || total <= 0) return assessment;

  const parentPercent = toPercentage(raw, total);
  return {
    ...assessment,
    children: assessment.children.map((child) => ({
      ...child,
      raw_score: formatScore(parentPercent),
      total_score: "100",
    })),
  };
}

function isAssessmentGraded(assessment: Assessment): boolean {
  const raw = parseNumberOrNull(assessment.raw_score);
  const total = parseNumberOrNull(assessment.total_score);
  return raw !== null && total !== null && total > 0;
}

function getEffectiveAssessmentWeight(assessment: Assessment): number {
  const parentWeight = Number.isFinite(assessment.weight) ? Math.max(0, assessment.weight) : 0;
  if (assessment.rule_type !== "best_of") return parentWeight;
  if (!assessment.children.length) return parentWeight;

  const effectiveCount = getBestOfEffectiveCount(assessment);
  if (effectiveCount <= 0) return parentWeight;

  const topWeightSum = [...assessment.children]
    .map((child) => (Number.isFinite(child.weight) ? Math.max(0, child.weight) : 0))
    .sort((a, b) => b - a)
    .slice(0, effectiveCount)
    .reduce((sum, value) => sum + value, 0);

  if (!Number.isFinite(topWeightSum) || topWeightSum <= 0) return parentWeight;
  return Math.min(parentWeight, topWeightSum);
}

const DEFAULT_BOUNDARIES: InstitutionalBoundary[] = [
  { letter: "A+", minLabel: "90-100", points: "9.0", descriptor: "Excellent" },
  { letter: "A", minLabel: "80-89", points: "8.0", descriptor: "Excellent" },
  { letter: "B+", minLabel: "75-79", points: "7.0", descriptor: "Very Good" },
  { letter: "B", minLabel: "70-74", points: "6.0", descriptor: "Good" },
  { letter: "C+", minLabel: "65-69", points: "5.0", descriptor: "Competent" },
  { letter: "C", minLabel: "60-64", points: "4.0", descriptor: "Fair" },
  { letter: "D+", minLabel: "55-59", points: "3.0", descriptor: "Pass" },
  { letter: "D", minLabel: "50-54", points: "2.0", descriptor: "Pass" },
  { letter: "F", minLabel: "below 50", points: "0.0", descriptor: "Fail" },
];

function parseBoundaryLowerBound(minLabel: string): number {
  const normalized = minLabel.trim().toLowerCase();
  if (normalized.includes("below")) return 0;
  const firstNumber = normalized.match(/\d+(\.\d+)?/);
  if (!firstNumber) return Number.NEGATIVE_INFINITY;
  const parsed = Number.parseFloat(firstNumber[0]);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function getInstitutionalEvaluation(
  percentage: number,
  boundaries: InstitutionalBoundary[]
): { letter: string; points: number; descriptor: string } {
  const ordered = [...boundaries].sort(
    (left, right) => parseBoundaryLowerBound(right.minLabel) - parseBoundaryLowerBound(left.minLabel)
  );
  const match =
    ordered.find((entry) => percentage >= parseBoundaryLowerBound(entry.minLabel)) ??
    ordered[ordered.length - 1] ??
    { letter: "F", points: "0.0", descriptor: "Fail", minLabel: "below 50" };
  const points = Number.parseFloat(match.points);
  return {
    letter: match.letter,
    points: Number.isFinite(points) ? points : 0,
    descriptor: match.descriptor,
  };
}

export function GradesStep() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const { courseId, ensureCourseIdFromList, institutionalGradingRules } = useSetupCourse();

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const courses = await listCourses();
        const resolvedCourseId = ensureCourseIdFromList(courses);
        if (!resolvedCourseId) {
          setError("No course found. Complete structure first.");
          return;
        }
        const latest = courses.find((course) => course.course_id === resolvedCourseId);
        if (!latest) {
          setError("No course found. Complete structure first.");
          return;
        }
        setAssessments(
          latest.assessments.map((a, i) => ({
            id: i + 1,
            name: a.name,
            weight: a.weight,
            raw_score:
              typeof a.raw_score === "number" ? String(a.raw_score) : "",
            total_score:
              typeof a.total_score === "number" ? String(a.total_score) : "",
            rule_type: a.rule_type ?? null,
            rule_config: a.rule_config ?? null,
            effective_count:
              typeof a.effective_count === "number" ? a.effective_count : null,
            total_count: typeof a.total_count === "number" ? a.total_count : null,
            is_bonus: Boolean(a.is_bonus),
            children: Array.isArray(a.children)
              ? a.children.map((child, index) => ({
                  id: `${i + 1}-${index + 1}`,
                  name: child.name,
                  weight: child.weight,
                  raw_score:
                    typeof child.raw_score === "number" ? String(child.raw_score) : "",
                  total_score:
                    typeof child.total_score === "number" ? String(child.total_score) : "",
                }))
              : [],
          }))
        );
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to load grades."));
      }
    };

    loadCourse();
  }, [ensureCourseIdFromList]);

  const gradedWeight: number = useMemo(() => {
    const graded = assessments.filter((a) => !a.is_bonus && isAssessmentGraded(a));
    const total = graded.reduce((sum, a) => sum + getEffectiveAssessmentWeight(a), 0);
    return Math.min(100, Math.max(0, total));
  }, [assessments]);

  const remainingWeight = Math.max(0, Math.min(100, 100 - gradedWeight));

  const currentGrade = useMemo(
    () =>
      assessments.reduce((sum, a) => {
        const raw = parseNumberOrNull(a.raw_score);
        const total = parseNumberOrNull(a.total_score);
        if (raw === null || total === null || total <= 0) return sum;
        const percent = toPercentage(raw, total);
        const weightedContribution = getEffectiveAssessmentWeight(a);
        return sum + (percent * weightedContribution) / 100;
      }, 0),
    [assessments]
  );

  const institutionalMeta = useMemo(() => {
    const boundaries =
      institutionalGradingRules?.grade_boundaries?.length
        ? institutionalGradingRules.grade_boundaries
        : DEFAULT_BOUNDARIES;
    const evaluation = getInstitutionalEvaluation(currentGrade, boundaries);
    return {
      institutionName: institutionalGradingRules?.institution || "YorkU",
      scale: institutionalGradingRules?.scale || "9.0",
      ...evaluation,
    };
  }, [currentGrade, institutionalGradingRules]);

  const handleParentScoreChange = (
    id: number,
    field: "raw_score" | "total_score",
    value: string
  ) => {
    setAssessments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
    setError((curr) => (curr === PARTIAL_SCORES_ERROR ? "" : curr));
  };

  const handleChildScoreChange = (
    parentId: number,
    childId: string,
    field: "raw_score" | "total_score",
    value: string
  ) => {
    setAssessments((prev) =>
      prev.map((assessment) => {
        if (assessment.id !== parentId) return assessment;
        const nextChildren = assessment.children.map((child) =>
          child.id === childId ? { ...child, [field]: value } : child
        );
        return syncParentFromChildren({ ...assessment, children: nextChildren });
      })
    );
    setError((curr) => (curr === PARTIAL_SCORES_ERROR ? "" : curr));
  };

  const handleChildWeightChange = (parentId: number, childId: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const nextWeight = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setAssessments((prev) =>
      prev.map((assessment) =>
        assessment.id !== parentId
          ? assessment
          : {
              ...assessment,
              children: assessment.children.map((child) =>
                child.id === childId
                  ? { ...child, weight: nextWeight }
                  : child
              ),
            }
      )
    );
  };

  const handleAddChild = (parentId: number) => {
    setAssessments((prev) =>
      prev.map((assessment) => {
        if (assessment.id !== parentId) return assessment;
        const nextIndex = assessment.children.length + 1;
        const baseName = assessment.name.endsWith("s")
          ? assessment.name.slice(0, -1)
          : assessment.name;
        const defaultWeight =
          assessment.children.length === 0
            ? Math.round(assessment.weight * 100) / 100
            : 0;
        const nextChild: ChildAssessment = {
          id: `${assessment.id}-${Date.now()}-${nextIndex}`,
          name: `${baseName} ${nextIndex}`,
          weight: defaultWeight,
          raw_score: "",
          total_score: "",
        };
        return {
          ...assessment,
          children: [...assessment.children, nextChild],
        };
      })
    );
    setExpandedByKey((prev) => ({ ...prev, [String(parentId)]: true }));
  };

  const handleDeleteChild = (parentId: number, childId: string) => {
    setAssessments((prev) =>
      prev.map((assessment) => {
        if (assessment.id !== parentId) return assessment;
        const nextChildren = assessment.children.filter((child) => child.id !== childId);
        if (nextChildren.length === assessment.children.length) return assessment;
        if (nextChildren.length === 0) {
          return { ...assessment, children: [] };
        }
        return syncParentFromChildren({ ...assessment, children: nextChildren });
      })
    );
    setExpandedByKey((prev) => {
      const key = String(parentId);
      if (!prev[key]) return prev;
      const parent = assessments.find((item) => item.id === parentId);
      if (!parent) return prev;
      const remaining = parent.children.filter((child) => child.id !== childId);
      if (remaining.length > 0) return prev;
      return { ...prev, [key]: false };
    });
    setError((curr) => (curr === PARTIAL_SCORES_ERROR ? "" : curr));
  };

  const persistParentGrade = async (assessmentName: string, raw: number | null, total: number | null) => {
    if (!courseId) return;
    await updateCourseGrades(courseId, {
      assessments: [{ name: assessmentName, raw_score: raw, total_score: total }],
    });
  };

  const handleParentScoreBlur = async (assessment: Assessment) => {
    const raw = parseNumberOrNull(assessment.raw_score);
    const total = parseNumberOrNull(assessment.total_score);

    if (raw === null && total === null) {
      try {
        await persistParentGrade(assessment.name, null, null);
        setError("");
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to save grade."));
      }
      return;
    }

    if (raw === null || total === null) {
      setError(PARTIAL_SCORES_ERROR);
      return;
    }

    if (raw < 0 || total <= 0 || raw > total) {
      setError("Scores must satisfy: raw_score >= 0, total_score > 0, raw_score <= total_score.");
      return;
    }

    let syncedAssessment = assessment;
    if (assessment.children.length > 0) {
      syncedAssessment = distributeParentToChildren(assessment);
      setAssessments((prev) =>
        prev.map((item) => (item.id === assessment.id ? syncedAssessment : item))
      );
    }

    const syncedRaw = parseNumberOrNull(syncedAssessment.raw_score);
    const syncedTotal = parseNumberOrNull(syncedAssessment.total_score);

    try {
      await persistParentGrade(
        syncedAssessment.name,
        syncedRaw,
        syncedTotal
      );
      setError("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save grade."));
    }
  };

  const handleChildScoreBlur = async (parentId: number, childId: string) => {
    const parent = assessments.find((assessment) => assessment.id === parentId);
    const child = parent?.children.find((item) => item.id === childId);
    if (!parent || !child) return;

    const childRaw = parseNumberOrNull(child.raw_score);
    const childTotal = parseNumberOrNull(child.total_score);

    if (childRaw === null && childTotal === null) {
      // allow empty child row and recompute parent from remaining children
    } else if (childRaw === null || childTotal === null) {
      setError(PARTIAL_SCORES_ERROR);
      return;
    } else if (childRaw < 0 || childTotal <= 0 || childRaw > childTotal) {
      setError("Scores must satisfy: raw_score >= 0, total_score > 0, raw_score <= total_score.");
      return;
    }

    let parentToPersist: Assessment | null = null;
    setAssessments((prev) =>
      prev.map((assessment) => {
        if (assessment.id !== parentId) return assessment;
        const synced = syncParentFromChildren(assessment);
        parentToPersist = synced;
        return synced;
      })
    );

    const resolvedParent = parentToPersist ?? syncParentFromChildren(parent);
    const raw = parseNumberOrNull(resolvedParent.raw_score);
    const total = parseNumberOrNull(resolvedParent.total_score);

    try {
      await persistParentGrade(resolvedParent.name, raw, total);
      setError("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save grade."));
    }
  };

  const handleResetAllGrades = async () => {
    if (!courseId) {
      setError("No course found. Complete structure first.");
      return;
    }

    try {
      await updateCourseGrades(courseId, {
        assessments: assessments.map((assessment) => ({
          name: assessment.name,
          raw_score: null,
          total_score: null,
        })),
      });
      setAssessments((prev) =>
        prev.map((assessment) => ({
          ...assessment,
          raw_score: "",
          total_score: "",
          children: assessment.children.map((child) => ({
            ...child,
            raw_score: "",
            total_score: "",
          })),
        }))
      );
      setError("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to reset grades."));
    }
  };

  const handleClearSingleGrade = async (assessment: Assessment) => {
    if (!courseId) {
      setError("No course found. Complete structure first.");
      return;
    }

    try {
      await updateCourseGrades(courseId, {
        assessments: [{ name: assessment.name, raw_score: null, total_score: null }],
      });
      setAssessments((prev) =>
        prev.map((a) =>
          a.id === assessment.id
            ? {
                ...a,
                raw_score: "",
                total_score: "",
                children: a.children.map((child) => ({
                  ...child,
                  raw_score: "",
                  total_score: "",
                })),
              }
            : a
        )
      );
      setError("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to clear grade."));
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pb-20">
      <h2 className="text-2xl font-bold text-gray-800">Enter Your Grades</h2>
      <p className="mt-2 text-gray-500 text-sm leading-relaxed">
        Add grades as you receive them. We&apos;ll calculate your standing in
        real-time.
      </p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Current Grade</p>
          <p className="mt-2 text-3xl font-semibold text-gray-800">
            {currentGrade.toFixed(1)}%
          </p>
          <p className="mt-2 text-xs text-[#B8A89A]">
            Overall standing out of 100
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Graded</p>
          <p className="mt-2 text-3xl font-semibold text-green-600">
            {gradedWeight.toFixed(1)}%
          </p>
          <p className="mt-2 text-xs text-[#B8A89A]">Of total non-bonus weight</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Remaining</p>
          <p className="mt-2 text-3xl font-semibold text-[#5D737E]">
            {remainingWeight.toFixed(1)}%
          </p>
          <p className="mt-2 text-xs text-[#B8A89A]">Still to be graded</p>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <h3 className="mt-2 text leading-tight font-medium text-[#3B3735]">
          Institutional Evaluation ({institutionalMeta.institutionName})
        </h3>
        <p className="mt-2 text-base text-[#6A6561]">
          Your current standing expressed using YorkU grading rules.
        </p>

        {gradedWeight > 0 ? (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-[#EAE6E0] px-4 py-3">
              <span className="text-sm text-[#6A6561]">Current Percentage</span>
              <span className="mt-2 text-[#3B3735]">{currentGrade.toFixed(1)}%</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-[#EAE6E0] px-4 py-3">
              <span className="text-sm text-[#6A6561]">Letter Grade</span>
              <span className="mt-2 text-[#3B3735]">{institutionalMeta.letter}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-[#EAE6E0] px-4 py-3">
              <span className="text-sm text-[#6A6561]">Grade Point</span>
              <span className="mt-2 text-[#597183]">
                {institutionalMeta.points.toFixed(1)} / {institutionalMeta.scale}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-[#EAE6E0] px-4 py-3">
              <span className="text-sm text-[#6A6561]">Descriptor</span>
              <span className="mt-2 text-[#B5A897]">
                {institutionalMeta.descriptor}
              </span>
            </div>

            <div className="pt-4 border-t border-[#D5D1CC]">
              <p className="text-xs text-[#6A6561]">
                Based on graded assessments only. This does not modify your stored grades.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-[#95A0A9] bg-[#EAE6E0] py-8 text-center">
            <p className="text-sm text-[#6A6561]">
              No graded work yet — enter a grade to see your YorkU evaluation.
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
        <div className="space-y-4">
          {assessments.map((a) => {
            const raw = parseNumberOrNull(a.raw_score);
            const total = parseNumberOrNull(a.total_score);
            const hasGrade = raw !== null && total !== null && total > 0;
            const percent = hasGrade ? toPercentage(raw, total) : 0;
            const effectiveWeight = getEffectiveAssessmentWeight(a);
            const contribution = hasGrade ? (percent * effectiveWeight) / 100 : 0;
            const hasChildren = a.children.length > 0;
            const isExpanded = !!expandedByKey[String(a.id)];
            const childWeightSum = a.children.reduce((sum, child) => sum + child.weight, 0);
            const bestOfEffectiveCount = getBestOfEffectiveCount(a);
            const bestOfChildWeightSum = [...a.children]
              .map((child) => child.weight)
              .sort((left, right) => right - left)
              .slice(0, bestOfEffectiveCount)
              .reduce((sum, weight) => sum + weight, 0);
            const childWeightMismatch = hasChildren
              ? a.rule_type === "best_of"
                ? Math.abs(bestOfChildWeightSum - a.weight) > CHILD_WEIGHT_TOLERANCE
                : Math.abs(childWeightSum - a.weight) > CHILD_WEIGHT_TOLERANCE
              : false;

            return (
              <div
                key={a.id}
                className="rounded-2xl p-5 border border-gray-100 bg-[#F3F0EA]"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {hasGrade ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300" />
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedByKey((prev) => ({
                                  ...prev,
                                  [String(a.id)]: !prev[String(a.id)],
                                }))
                              }
                              className="inline-flex items-center text-gray-500"
                              aria-label={isExpanded ? "Collapse children" : "Expand children"}
                            >
                              <ChevronDown
                                size={16}
                                className={`transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`}
                              />
                            </button>
                          ) : null}
                          <h4 className="font-semibold text-gray-800">{a.name}</h4>
                        </div>
                        <p className="text-sm text-gray-500">
                          {a.weight}% of final grade
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={a.raw_score ?? ""}
                          onChange={(e) =>
                            handleParentScoreChange(a.id, "raw_score", e.target.value)
                          }
                          onBlur={() => handleParentScoreBlur(a)}
                          placeholder="Received"
                          min={0}
                          step={0.1}
                          className="w-24 h-10 px-3 bg-white rounded-xl text-right text-sm leading-5 border border-gray-200 shadow-sm focus:outline-none"
                        />
                        <span className="text-sm text-gray-500">/</span>
                        <input
                          type="number"
                          value={a.total_score ?? ""}
                          onChange={(e) =>
                            handleParentScoreChange(a.id, "total_score", e.target.value)
                          }
                          onBlur={() => handleParentScoreBlur(a)}
                          placeholder="Total"
                          min={0}
                          step={0.1}
                          className="w-24 h-10 px-3 bg-white rounded-xl text-right text-sm leading-5 border border-gray-200 shadow-sm focus:outline-none"
                        />
                        {hasGrade && (
                          <button
                            onClick={() => handleClearSingleGrade(a)}
                            className="ml-2 p-1 text-gray-400 hover:text-red-500 transition"
                            title="Clear this grade"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {hasGrade && (
                      <div>
                        <div className="w-full bg-gray-200 h-2 rounded-full">
                          <div
                            className="h-2 rounded-full bg-[#6D9A7C]"
                            style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
                          />
                        </div>
                        <p className="text-xs mt-2 text-[#B8A89A]">
                          Contributing {contribution.toFixed(1)}% to your final
                          grade
                        </p>
                      </div>
                    )}

                    {!hasChildren ? (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => handleAddChild(a.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                        >
                          <Plus size={14} /> Add item
                        </button>
                      </div>
                    ) : null}

                    {hasChildren && isExpanded ? (
                      <div className="mt-4 space-y-2">
                        {a.children.map((child) => {
                          const childRaw = parseNumberOrNull(child.raw_score);
                          const childTotal = parseNumberOrNull(child.total_score);
                          const childHasGrade =
                            childRaw !== null && childTotal !== null && childTotal > 0;
                          return (
                            <div
                              key={child.id}
                              className="ml-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
                            >
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="text-sm text-gray-700">{child.name}</p>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    value={child.weight}
                                    onChange={(e) =>
                                      handleChildWeightChange(a.id, child.id, e.target.value)
                                    }
                                    min={0}
                                    step={0.1}
                                    className="w-20 h-9 px-2 bg-white rounded-lg text-right text-xs leading-5 border border-gray-200 shadow-sm focus:outline-none"
                                  />
                                  <p className="text-xs text-gray-500">%</p>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteChild(a.id, child.id)}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 transition"
                                    title="Delete item"
                                    aria-label={`Delete ${child.name}`}
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                <input
                                  type="number"
                                  value={child.raw_score ?? ""}
                                  onChange={(e) =>
                                    handleChildScoreChange(a.id, child.id, "raw_score", e.target.value)
                                  }
                                  onBlur={() => handleChildScoreBlur(a.id, child.id)}
                                  placeholder="Received"
                                  min={0}
                                  step={0.1}
                                  className="w-24 h-9 px-3 bg-white rounded-lg text-right text-xs leading-5 border border-gray-200 shadow-sm focus:outline-none"
                                />
                                <span className="text-xs text-gray-500">/</span>
                                <input
                                  type="number"
                                  value={child.total_score ?? ""}
                                  onChange={(e) =>
                                    handleChildScoreChange(a.id, child.id, "total_score", e.target.value)
                                  }
                                  onBlur={() => handleChildScoreBlur(a.id, child.id)}
                                  placeholder="Total"
                                  min={0}
                                  step={0.1}
                                  className="w-24 h-9 px-3 bg-white rounded-lg text-right text-xs leading-5 border border-gray-200 shadow-sm focus:outline-none"
                                />
                              </div>

                              <p className="mt-2 text-xs text-gray-500">
                                {childHasGrade
                                  ? `Received ${child.raw_score}/${child.total_score}`
                                  : "No score entered yet"}
                              </p>
                            </div>
                          );
                        })}
                        <div className="ml-4 pt-1">
                          <button
                            type="button"
                            onClick={() => handleAddChild(a.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                          >
                            <Plus size={14} /> Add item
                          </button>
                        </div>
                        {childWeightMismatch ? (
                          <p className="ml-4 text-xs text-amber-700">
                            {a.rule_type === "best_of"
                              ? `Top ${bestOfEffectiveCount} child weights should sum to ${a.weight}% (current: ${formatScore(bestOfChildWeightSum)}%).`
                              : `Child weights should sum to ${a.weight}% (current: ${formatScore(childWeightSum)}%).`}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <p className="text-sm font-semibold text-blue-800">
          About &quot;Not graded yet&quot;
        </p>
        <p className="mt-1 text-sm text-blue-700 leading-relaxed">
          Empty grades are treated as 0 contribution to your overall standing
          out of 100.
        </p>
      </div>
      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      <div className="mt-8 flex flex-col md:flex-row gap-4">
        <button
          onClick={handleResetAllGrades}
          className="md:w-[240px] bg-white border border-gray-200 rounded-xl px-6 py-4 text-sm font-medium text-red-500 hover:bg-gray-50 transition flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} />
          Reset All Grades
        </button>

        <button
          onClick={() => router.push("/setup/goals")}
          className="flex-1 bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition"
        >
          Continue to Goals
        </button>
      </div>
    </div>
  );
}
