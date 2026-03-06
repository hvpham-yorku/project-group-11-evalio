"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Target, TrendingUp } from "lucide-react";
import { checkTarget, listCourses, type TargetCheckResponse } from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";
import { getApiErrorMessage } from "@/lib/errors";

const TARGET_STORAGE_KEY = "evalio_target_grade";

function resolveCurrentGrade(result: { current_standing: number; final_total?: number }): number {
  return Number.isFinite(result.final_total) ? Number(result.final_total) : result.current_standing;
}

function getBestOfEffectiveCount(assessment: {
  effective_count?: number | null;
  rule_config?: Record<string, unknown> | null;
  children?: Array<{ weight: number }> | null;
}): number {
  if (typeof assessment.effective_count === "number" && assessment.effective_count > 0) {
    return Math.max(1, Math.floor(assessment.effective_count));
  }

  const config = assessment.rule_config ?? {};
  const bestCountRaw =
    typeof config.best_count === "number"
      ? config.best_count
      : typeof config.best === "number"
      ? config.best
      : null;

  if (typeof bestCountRaw === "number" && bestCountRaw > 0) {
    return Math.max(1, Math.floor(bestCountRaw));
  }

  return 1;
}

function getEffectiveWeight(assessment: {
  weight: number;
  rule_type?: string | null;
  children?: Array<{ weight: number }> | null;
  effective_count?: number | null;
  rule_config?: Record<string, unknown> | null;
}): number {
  const parentWeight = Number.isFinite(assessment.weight) ? Math.max(0, assessment.weight) : 0;
  if (assessment.rule_type !== "best_of") return parentWeight;

  const children = Array.isArray(assessment.children) ? assessment.children : [];
  if (!children.length) return parentWeight;

  const effectiveCount = Math.min(getBestOfEffectiveCount(assessment), children.length);
  if (effectiveCount <= 0) return parentWeight;

  const topWeightSum = [...children]
    .map((child) => (Number.isFinite(child.weight) ? Math.max(0, child.weight) : 0))
    .sort((a, b) => b - a)
    .slice(0, effectiveCount)
    .reduce((sum, value) => sum + value, 0);

  if (!Number.isFinite(topWeightSum) || topWeightSum <= 0) return parentWeight;
  return Math.min(parentWeight, topWeightSum);
}

export function GoalsStep() {
  const router = useRouter();

  const [target, setTarget] = useState<number>(75);
  const [isTargetLoaded, setIsTargetLoaded] = useState(false);

  const [currentStanding, setCurrentStanding] = useState(85.0);
  const [explanation, setExplanation] = useState(
    "This target looks realistic based on your current performance and remaining weight."
  );
  const [yorkEquivalent, setYorkEquivalent] = useState({
    letter: "A",
    grade_point: 8,
    description: "Excellent",
  });

  const [gradedWeight, setGradedWeight] = useState<number>(30);
  const [remainingWeight, setRemainingWeight] = useState<number>(70);

  const [requiredAverage, setRequiredAverage] = useState(0);
  const [requiredAverageDisplay, setRequiredAverageDisplay] = useState("0.0%");
  const [requiredFractionDisplay, setRequiredFractionDisplay] = useState("(0.00 / 0 remaining weight)");
  const [classification, setClassification] = useState("Comfortable");
  const [error, setError] = useState("");

  // NEW: accordion state
  const [isEvaluationExpanded, setIsEvaluationExpanded] = useState(false);

  const { courseId, ensureCourseIdFromList } = useSetupCourse();

  useEffect(() => {
    const saved = window.localStorage.getItem(TARGET_STORAGE_KEY);
    if (saved === null) {
      setTarget(75);
    } else {
      const parsed = Number.parseFloat(saved);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
        setTarget(parsed);
      } else {
        setTarget(75);
      }
    }
    setIsTargetLoaded(true);
  }, []);

  useEffect(() => {
    if (isTargetLoaded) {
      window.localStorage.setItem(TARGET_STORAGE_KEY, String(target));
    }
  }, [target, isTargetLoaded]);

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

        const graded = latest.assessments.filter(
          (a) =>
            !a.is_bonus &&
            typeof a.raw_score === "number" &&
            typeof a.total_score === "number" &&
            a.total_score > 0
        );

        const gradedW = graded.reduce((sum, a) => sum + getEffectiveWeight(a), 0);
        const clampedGraded = Math.max(0, Math.min(100, gradedW));
        setGradedWeight(clampedGraded);
        setRemainingWeight(Math.max(0, Math.min(100, 100 - clampedGraded)));
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to load goals."));
      }
    };

    loadCourse();
  }, [ensureCourseIdFromList]);

  useEffect(() => {
    if (!courseId) return;

    const run = async () => {
      try {
        const response = (await checkTarget(courseId, { target })) as TargetCheckResponse;

        setCurrentStanding(resolveCurrentGrade(response));
        setExplanation(response.explanation);
        setYorkEquivalent(response.york_equivalent);

        setRequiredAverage(response.required_average);
        setRequiredAverageDisplay(response.required_average_display);
        setRequiredFractionDisplay(response.required_fraction_display);
        setClassification(response.classification);

        setError("");
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to evaluate target."));
      }
    };

    run();
  }, [target, courseId]);

  const statusUI = useMemo(() => {
    if (
      classification === "Comfortable" ||
      classification === "Achievable" ||
      classification === "Already Achieved" ||
      classification === "Complete"
    ) {
      return {
        label: classification,
        icon: TrendingUp,
        pillBg: "bg-green-50",
        pillText: "text-green-700",
        bar: "bg-green-600",
        noteBg: "bg-green-50",
        noteBorder: "border-green-200",
        noteText: "text-green-700",
      };
    }

    if (classification === "Not Possible") {
      return {
        label: classification,
        icon: TrendingUp,
        pillBg: "bg-red-50",
        pillText: "text-red-700",
        bar: "bg-red-500",
        noteBg: "bg-red-50",
        noteBorder: "border-red-200",
        noteText: "text-red-700",
      };
    }

    return {
      label: classification,
      icon: TrendingUp,
      pillBg: "bg-[#FFF3E6]",
      pillText: "text-[#C8833F]",
      bar: "bg-[#C8833F]",
      noteBg: "bg-[#FFF6EC]",
      noteBorder: "border-[#F2D7BD]",
      noteText: "text-[#C8833F]",
    };
  }, [classification]);

  const StatusIcon = statusUI.icon;

  // NEW: values used in Evaluation Breakdown
  const earnedSoFar = useMemo(() => {
    const earned = (Number(currentStanding) * Number(gradedWeight)) / 100;
    return Number.isFinite(earned) ? earned : 0;
  }, [currentStanding, gradedWeight]);

  const formulaText = useMemo(() => {
    const t = Number.isFinite(target) ? target : 0;
    const earned = Number.isFinite(earnedSoFar) ? earnedSoFar : 0;
    const rem = Number.isFinite(remainingWeight) ? remainingWeight : 0;

    if (rem <= 0) return "No remaining weight — required average is not applicable.";

    const req = Number.isFinite(requiredAverage) ? requiredAverage : 0;
    return `(${t.toFixed(1)} − ${earned.toFixed(1)}) ÷ ${rem.toFixed(1)} = ${req.toFixed(1)}%`;
  }, [target, earnedSoFar, remainingWeight, requiredAverage]);

  return (
    <div className="max-w-4xl mx-auto px-4 pb-20">
      <h2 className="text-3xl font-bold text-gray-800">Set Your Target</h2>
      <p className="mt-2 text-gray-500 text-sm leading-relaxed">
        Choose a target grade and we&apos;ll show you exactly what&apos;s needed to reach it.
      </p>

      {/* TARGET CARD */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Target className="text-[#5D737E]" size={22} />
          <h3 className="text-lg font-semibold text-gray-700">Target Grade</h3>
        </div>

        <div className="max-w-xl">
          <div className="flex items-center gap-6 mb-4">
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={target}
                onChange={(e) => setTarget(parseInt(e.target.value, 10))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: "#E6E2DB",
                  outline: "none",
                }}
              />
            </div>

            <div className="w-28 text-right">
              <div className="text-4xl font-semibold text-[#5D737E]">{target}%</div>
            </div>
          </div>

          <div className="flex justify-between text-xs text-[#C6B8A8]">
            <span>Pass (50%)</span>
            <span>Average (70%)</span>
            <span>Excellence (90%)</span>
          </div>

          <p className="mt-2 text-sm text-gray-500">
            YorkU equivalent: {yorkEquivalent.letter} ({yorkEquivalent.grade_point}) -{" "}
            {yorkEquivalent.description}
          </p>
        </div>
      </div>

      {/* WHAT YOU NEED CARD */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-700 mb-6">What You Need</h3>

        <div className="space-y-6">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Required average on remaining work</span>

            <div
              className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${statusUI.pillBg} ${statusUI.pillText}`}
            >
              <StatusIcon size={14} />
              {statusUI.label}
            </div>
          </div>

          {/* Big required number box */}
          <div className="rounded-2xl p-8 text-center bg-[#F6F1EA] border border-gray-100">
            <div className={`text-6xl font-semibold ${statusUI.pillText}`}>
              {requiredAverageDisplay}
            </div>
            <div className="mt-2 text-sm text-gray-500">{requiredFractionDisplay}</div>
          </div>

          {/* NEW: Evaluation Breakdown (Collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setIsEvaluationExpanded((v) => !v)}
              className="w-full flex items-center justify-between rounded-2xl px-5 py-4 bg-[#F6F1EA] border border-gray-100 hover:border-gray-200 transition"
            >
              <span className="text-base font-semibold text-gray-700">Evaluation Breakdown</span>
              {isEvaluationExpanded ? (
                <ChevronUp className="text-gray-500" size={20} />
              ) : (
                <ChevronDown className="text-gray-500" size={20} />
              )}
            </button>

            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
                isEvaluationExpanded ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="mt-4 rounded-2xl bg-[#F6F1EA] border border-gray-100 p-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-gray-100">
                    <span className="text-sm text-gray-500">Target percentage</span>
                    <span className="text-sm font-semibold text-gray-800">{target.toFixed(1)}%</span>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-gray-100">
                    <span className="text-sm text-gray-500">Earned so far</span>
                    <span className="text-sm font-semibold text-green-700">
                      {earnedSoFar.toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-gray-100">
                    <span className="text-sm text-gray-500">Remaining weight</span>
                    <span className="text-sm font-semibold text-[#5D737E]">
                      {Number.isFinite(remainingWeight) ? remainingWeight.toFixed(1) : "0.0"}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-gray-100">
                    <span className="text-sm text-gray-500">Required remaining average</span>
                    <span className={`text-sm font-semibold ${statusUI.pillText}`}>
                      {Number.isFinite(requiredAverage) ? requiredAverage.toFixed(1) : "0.0"}%
                    </span>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-[#E6E2DB]">
                  <div className="text-xs font-semibold text-[#C6B8A8] mb-2">Formula</div>
                  <div className="px-4 py-3 rounded-2xl bg-white border border-gray-100 text-sm text-gray-500">
                    {formulaText}
                  </div>

                  <p className="mt-3 text-xs text-gray-500">
                    This evaluation is deterministic and does not modify stored grade data.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="w-full bg-[#E6E2DB] h-3 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${statusUI.bar}`}
                style={{ width: `${Math.min(requiredAverage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-[#C6B8A8] mt-2">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Message box */}
          <div className={`rounded-2xl p-4 border ${statusUI.noteBg} ${statusUI.noteBorder}`}>
            <p className={`text-sm ${statusUI.noteText}`}>{explanation}</p>
          </div>

          {/* Bottom mini cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl p-5 bg-[#F6F1EA] border border-gray-100">
              <div className="text-sm text-gray-500">Current Standing</div>
              <div className="mt-1 text-2xl font-semibold text-gray-800">
                {currentStanding.toFixed(1)}%
              </div>
              <div className="mt-1 text-xs text-[#C6B8A8]">{gradedWeight}% graded</div>
            </div>

            <div className="rounded-2xl p-5 bg-[#F6F1EA] border border-gray-100">
              <div className="text-sm text-gray-500">Remaining Weight</div>
              <div className="mt-1 text-2xl font-semibold text-[#5D737E]">{remainingWeight}%</div>
              <div className="mt-1 text-xs text-[#C6B8A8]">Still ahead</div>
            </div>
          </div>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      <button
        onClick={() => router.push("/setup/deadlines")}
        className="mt-8 w-full bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition"
      >
        Continue to Deadlines
      </button>
    </div>
  );
}
