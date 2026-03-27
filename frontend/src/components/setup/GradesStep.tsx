"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Circle, RotateCcw, X } from "lucide-react";
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

type GradeUpdatePayloadAssessment = {
  name: string;
  raw_score: number | null;
  total_score: number | null;
  children?: Array<{
    name: string;
    raw_score: number | null;
    total_score: number | null;
  }>;
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

function hasValidGradePair(raw: number | null, total: number | null): boolean {
  return raw !== null && total !== null && total > 0;
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

function getMandatoryPassThreshold(assessment: Assessment): number | null {
  if (assessment.rule_type !== "mandatory_pass") return null;
  const config = assessment.rule_config ?? {};
  const raw = (config as Record<string, unknown>).pass_threshold;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(0, Math.min(parsed, 100));
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

function getDropLowestCount(assessment: Assessment): number {
  if (assessment.rule_type !== "drop_lowest") return 0;

  const config = assessment.rule_config ?? {};
  const dropCountRaw =
    typeof config.drop_count === "number"
      ? config.drop_count
      : typeof config.drop === "number"
        ? config.drop
        : 1;

  if (!Number.isFinite(dropCountRaw)) return 1;
  return Math.max(0, Math.floor(dropCountRaw));
}

function getSelectableChildren(assessment: Assessment) {
  const entries = assessment.children.map((child) => {
    const raw = parseNumberOrNull(child.raw_score);
    const total = parseNumberOrNull(child.total_score);
    if (raw === null || total === null || total <= 0) {
      return { child, percent: 0, graded: false };
    }
    return { child, percent: toPercentage(raw, total), graded: true };
  });

  if (assessment.rule_type === "best_of") {
    return [...entries]
      .sort((left, right) => right.percent - left.percent)
      .slice(0, getBestOfEffectiveCount(assessment));
  }

  if (assessment.rule_type === "drop_lowest") {
    const keepCount = Math.max(0, entries.length - getDropLowestCount(assessment));
    return [...entries]
      .sort((left, right) => right.percent - left.percent)
      .slice(0, keepCount);
  }

  return entries;
}

function computeAssessmentContribution(assessment: Assessment): number {
  if (!assessment.children.length) {
    const raw = parseNumberOrNull(assessment.raw_score);
    const total = parseNumberOrNull(assessment.total_score);
    if (raw === null || total === null || total <= 0) return 0;
    return (toPercentage(raw, total) * assessment.weight) / 100;
  }

  return getSelectableChildren(assessment).reduce(
    (sum, entry) => sum + (entry.percent * entry.child.weight) / 100,
    0
  );
}

function computeParentPercentFromChildren(assessment: Assessment): number | null {
  if (!assessment.children.length) return null;

  const selectedChildren = getSelectableChildren(assessment);
  const hasAnyGraded = selectedChildren.some((entry) => entry.graded);
  if (!hasAnyGraded) return null;

  const effectiveWeight = selectedChildren.reduce(
    (sum, entry) => sum + Math.max(0, entry.child.weight),
    0
  );
  if (effectiveWeight <= 0) return null;

  const contribution = selectedChildren.reduce(
    (sum, entry) => sum + (entry.percent * entry.child.weight) / 100,
    0
  );
  return clampPercent((contribution / effectiveWeight) * 100);
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
  if (assessment.children.length) {
    return assessment.children.every((child) => {
      const childRaw = parseNumberOrNull(child.raw_score);
      const childTotal = parseNumberOrNull(child.total_score);
      return hasValidGradePair(childRaw, childTotal);
    });
  }

  const raw = parseNumberOrNull(assessment.raw_score);
  const total = parseNumberOrNull(assessment.total_score);
  return hasValidGradePair(raw, total);
}

function getEffectiveAssessmentWeight(assessment: Assessment): number {
  const parentWeight = Number.isFinite(assessment.weight) ? Math.max(0, assessment.weight) : 0;
  if (!assessment.children.length) return parentWeight;

  const selectedWeight = getSelectableChildren(assessment).reduce(
    (sum, entry) => sum + Math.max(0, entry.child.weight),
    0
  );

  if (!Number.isFinite(selectedWeight) || selectedWeight <= 0) return parentWeight;
  return selectedWeight;
}

function buildGradeUpdatePayload(
  assessment: Assessment,
  overrides?: {
    raw_score?: number | null;
    total_score?: number | null;
  }
): GradeUpdatePayloadAssessment {
  const payload: GradeUpdatePayloadAssessment = {
    name: assessment.name,
    raw_score:
      overrides?.raw_score !== undefined
        ? overrides.raw_score
        : parseNumberOrNull(assessment.raw_score),
    total_score:
      overrides?.total_score !== undefined
        ? overrides.total_score
        : parseNumberOrNull(assessment.total_score),
  };

  if (assessment.children.length) {
    payload.children = assessment.children.map((child) => ({
      name: child.name,
      raw_score: parseNumberOrNull(child.raw_score),
      total_score: parseNumberOrNull(child.total_score),
    }));
  }

  return payload;
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
    () => assessments.reduce((sum, assessment) => sum + computeAssessmentContribution(assessment), 0),
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

  const persistAssessmentGrade = async (
    assessment: Assessment,
    overrides?: { raw_score?: number | null; total_score?: number | null }
  ) => {
    if (!courseId) return;
    await updateCourseGrades(courseId, {
      assessments: [buildGradeUpdatePayload(assessment, overrides)],
    });
  };

  const handleParentScoreBlur = async (assessment: Assessment) => {
    const raw = parseNumberOrNull(assessment.raw_score);
    const total = parseNumberOrNull(assessment.total_score);

    if (raw === null && total === null) {
      try {
        await persistAssessmentGrade(assessment, {
          raw_score: null,
          total_score: null,
        });
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
      await persistAssessmentGrade(syncedAssessment, {
        raw_score: syncedRaw,
        total_score: syncedTotal,
      });
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
      await persistAssessmentGrade(resolvedParent, {
        raw_score: raw,
        total_score: total,
      });
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
        assessments: assessments.map((assessment) =>
          buildGradeUpdatePayload(assessment, {
            raw_score: null,
            total_score: null,
          })
        ),
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
        assessments: [
          buildGradeUpdatePayload(assessment, {
            raw_score: null,
            total_score: null,
          }),
        ],
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
    <div className="mx-auto max-w-4xl px-4 pb-20">
      <h2 className="text-2xl font-bold text-[#3A3530]">Enter Your Grades</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#6B6560]">
        Add grades as you receive them. We&apos;ll calculate your standing in
        real-time.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-6 shadow-sm">
          <p className="text-sm text-[#6B6560]">Current Grade</p>
          <p className="mt-2 text-3xl font-semibold text-[#3A3530]">
            {currentGrade.toFixed(1)}%
          </p>
          <p className="mt-2 text-xs text-[#C4B5A6]">
            Overall standing out of 100
          </p>
        </div>

        <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-6 shadow-sm">
          <p className="text-sm text-[#6B6560]">Graded</p>
          <p className="mt-2 text-3xl font-semibold text-[#6B9B7A]">
            {gradedWeight.toFixed(1)}%
          </p>
          <p className="mt-2 text-xs text-[#C4B5A6]">Of total non-bonus weight</p>
        </div>

        <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-6 shadow-sm">
          <p className="text-sm text-[#6B6560]">Remaining</p>
          <p className="mt-2 text-3xl font-semibold text-[#5F7A8A]">
            {remainingWeight.toFixed(1)}%
          </p>
          <p className="mt-2 text-xs text-[#C4B5A6]">Still to be graded</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[#D4CFC7] bg-[#FFFFFF] p-6 shadow-sm">
        <h3 className="mt-2 text font-medium leading-tight text-[#3A3530]">
          Institutional Evaluation ({institutionalMeta.institutionName})
        </h3>
        <p className="mt-2 text-base text-[#6B6560]">
          Your current standing expressed using the selected institutional grading rules.
        </p>

        {gradedWeight > 0 ? (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-[#F5F1EB] px-4 py-3">
              <span className="text-sm text-[#6B6560]">Current Percentage</span>
              <span className="mt-2 text-[#3A3530]">{currentGrade.toFixed(1)}%</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-[#F5F1EB] px-4 py-3">
              <span className="text-sm text-[#6B6560]">Letter Grade</span>
              <span className="mt-2 text-[#3A3530]">{institutionalMeta.letter}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-[#F5F1EB] px-4 py-3">
              <span className="text-sm text-[#6B6560]">Grade Point</span>
              <span className="mt-2 text-[#5F7A8A]">
                {institutionalMeta.points.toFixed(1)} / {institutionalMeta.scale}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-[#F5F1EB] px-4 py-3">
              <span className="text-sm text-[#6B6560]">Descriptor</span>
              <span className="mt-2 text-[#C4B5A6]">
                {institutionalMeta.descriptor}
              </span>
            </div>

            <div className="border-t border-[#E8E3DC] pt-4">
              <p className="text-xs text-[#6B6560]">
                Based on graded assessments only. This does not modify your stored grades.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-[#C4D6E4] bg-[#E8EFF5] py-8 text-center">
            <p className="text-sm text-[#6B6560]">
              No graded work yet — enter a grade to see your institutional evaluation.
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-6 shadow-sm">
        <div className="space-y-4">
          {assessments.map((a) => {
            const raw = parseNumberOrNull(a.raw_score);
            const total = parseNumberOrNull(a.total_score);
            const hasChildren = a.children.length > 0;
            const hasGrade = isAssessmentGraded(a);
            const mandatoryPassThreshold = getMandatoryPassThreshold(a);
            const livePercent = hasChildren
              ? computeParentPercentFromChildren(a)
              : raw !== null && total !== null && total > 0
                ? toPercentage(raw, total)
                : null;
            const mandatoryPassStatus =
              mandatoryPassThreshold === null
                ? null
                : livePercent === null
                  ? "pending"
                  : livePercent >= mandatoryPassThreshold
                    ? "passed"
                    : "failed";
            const percent = hasGrade
              ? hasChildren
                ? (computeParentPercentFromChildren(a) ?? 0)
                : raw !== null && total !== null
                  ? toPercentage(raw, total)
                  : 0
              : 0;
            const effectiveWeight = getEffectiveAssessmentWeight(a);
            const contribution = hasGrade ? (percent * effectiveWeight) / 100 : 0;
            const isExpanded = !!expandedByKey[String(a.id)];
            const childWeightSum = a.children.reduce((sum, child) => sum + child.weight, 0);
            const bestOfEffectiveCount = getBestOfEffectiveCount(a);
            const dropLowestCount = getDropLowestCount(a);
            const bestOfChildWeightSum = [...a.children]
              .map((child) => child.weight)
              .sort((left, right) => right - left)
              .slice(0, bestOfEffectiveCount)
              .reduce((sum, weight) => sum + weight, 0);
            const dropLowestChildWeightSum = [...a.children]
              .map((child) => child.weight)
              .sort((left, right) => right - left)
              .slice(0, Math.max(0, a.children.length - dropLowestCount))
              .reduce((sum, weight) => sum + weight, 0);
            const childWeightMismatch = hasChildren
              ? a.rule_type === "best_of"
                ? Math.abs(bestOfChildWeightSum - a.weight) > CHILD_WEIGHT_TOLERANCE
                : a.rule_type === "drop_lowest"
                  ? Math.abs(dropLowestChildWeightSum - a.weight) > CHILD_WEIGHT_TOLERANCE
                : Math.abs(childWeightSum - a.weight) > CHILD_WEIGHT_TOLERANCE
              : false;

            return (
              <div
                key={a.id}
                className="rounded-2xl border border-[#E8E3DC] bg-[#F5F1EB] p-5"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {hasGrade ? (
                      <CheckCircle2 className="h-5 w-5 text-[#6B9B7A]" />
                    ) : (
                      <Circle className="h-5 w-5 text-[#C4B5A6]" />
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
                              className="inline-flex items-center text-[#6B6560]"
                              aria-label={isExpanded ? "Collapse children" : "Expand children"}
                            >
                              <ChevronDown
                                size={16}
                                className={`transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`}
                              />
                            </button>
                          ) : null}
                          <h4 className="font-semibold text-[#3A3530]">{a.name}</h4>
                          {mandatoryPassThreshold !== null ? (
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                                mandatoryPassStatus === "passed"
                                  ? "bg-[#E8F2EA] text-[#6B9B7A]"
                                  : mandatoryPassStatus === "failed"
                                    ? "bg-[#F9EAEA] text-[#B86B6B]"
                                    : "bg-[#FDF3E7] text-[#C9945F]"
                              }`}
                            >
                              Must pass {"\u2265"} {mandatoryPassThreshold.toFixed(1)}%
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-[#6B6560]">
                          {a.weight}% of final grade
                        </p>
                        {mandatoryPassThreshold !== null ? (
                          <p
                            className={`mt-1 text-xs ${
                              mandatoryPassStatus === "passed"
                                ? "text-[#6B9B7A]"
                                : mandatoryPassStatus === "failed"
                                  ? "text-[#B86B6B]"
                                  : "text-[#C9945F]"
                            }`}
                          >
                            {mandatoryPassStatus === "pending"
                              ? "Enter a score to check if you meet the pass requirement."
                              : mandatoryPassStatus === "passed"
                                ? `You passed with ${livePercent?.toFixed(1) ?? "0.0"}%.`
                                : `Your score of ${livePercent?.toFixed(1) ?? "0.0"}% is below the required ${mandatoryPassThreshold.toFixed(1)}%.`}
                          </p>
                        ) : null}
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
                          className="h-10 w-28 rounded-xl border border-[#D4CFC7] bg-[#FFFFFF] px-3 text-center text-sm leading-5 shadow-sm focus:outline-none"
                        />
                        <span className="text-sm text-[#6B6560]">/</span>
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
                          className="h-10 w-28 rounded-xl border border-[#D4CFC7] bg-[#FFFFFF] px-3 text-center text-sm leading-5 shadow-sm focus:outline-none"
                        />
                        {hasGrade && (
                          <button
                            onClick={() => handleClearSingleGrade(a)}
                            className="ml-2 p-1 text-[#C4B5A6] transition hover:text-[#B86B6B]"
                            title="Clear this grade"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {hasGrade && (
                      <div>
                        <div className="h-2 w-full rounded-full bg-[#E8E3DC]">
                          <div
                            className="h-2 rounded-full bg-[#6B9B7A]"
                            style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-[#C4B5A6]">
                          Contributing {contribution.toFixed(1)}% to your final
                          grade
                        </p>
                      </div>
                    )}

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
                              className="ml-4 rounded-xl border border-[#D4CFC7] bg-[#FFFFFF] px-4 py-3"
                            >
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="text-sm text-[#3A3530]">{child.name}</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[#3A3530]">
                                    {formatScore(child.weight)}
                                  </span>
                                  <p className="text-sm text-[#6B6560]">%</p>
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
                                  className="h-9 w-28 rounded-lg border border-[#D4CFC7] bg-[#FFFFFF] px-3 text-center text-xs leading-5 shadow-sm focus:outline-none"
                                />
                                <span className="text-xs text-[#6B6560]">/</span>
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
                                  className="h-9 w-28 rounded-lg border border-[#D4CFC7] bg-[#FFFFFF] px-3 text-center text-xs leading-5 shadow-sm focus:outline-none"
                                />
                              </div>

                              <p className="mt-2 text-xs text-[#6B6560]">
                                {childHasGrade
                                  ? `Received ${child.raw_score}/${child.total_score}`
                                  : "No score entered yet"}
                              </p>
                            </div>
                          );
                        })}
                        {childWeightMismatch ? (
                          <p className="ml-4 text-xs text-[#C9945F]">
                            {a.rule_type === "best_of"
                              ? `Top ${bestOfEffectiveCount} child weights should sum to ${a.weight}% (current: ${formatScore(bestOfChildWeightSum)}%).`
                              : a.rule_type === "drop_lowest"
                                ? `All but the lowest ${dropLowestCount} child weights should sum to ${a.weight}% (current: ${formatScore(dropLowestChildWeightSum)}%).`
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

      <div className="mt-6 rounded-2xl border border-[#C4D6E4] bg-[#E8EFF5] p-5">
        <p className="text-sm font-semibold text-[#5F7A8A]">
          About &quot;Not graded yet&quot;
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[#6B8BA8]">
          Empty grades are treated as 0 contribution to your overall standing
          out of 100.
        </p>
      </div>
      {error ? <p className="mt-4 text-sm text-[#B86B6B]">{error}</p> : null}

      <div className="mt-8 flex flex-col gap-4 md:flex-row">
        <button
          onClick={handleResetAllGrades}
          className="flex items-center justify-center gap-2 rounded-xl border border-[#B86B6B] bg-[#F9EAEA] px-6 py-4 text-sm font-medium text-[#B86B6B] transition hover:opacity-90 md:w-[240px]"
        >
          <RotateCcw size={16} />
          Reset All Grades
        </button>

        <button
          onClick={() => router.push("/setup/goals")}
          className="flex-1 rounded-xl bg-[#5F7A8A] py-4 font-semibold text-white shadow-lg transition hover:opacity-90"
        >
          Continue to Goals
        </button>
      </div>
    </div>
  );
}
