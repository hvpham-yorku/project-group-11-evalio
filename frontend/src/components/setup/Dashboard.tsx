"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, TrendingUp } from "lucide-react";
import {
  checkTarget,
  getMinimumRequired,
  listCourses,
  type Course,
  type CourseAssessment,
  type TargetCheckResponse,
} from "@/lib/api";

const DEFAULT_TARGET_GRADE = 85;
const TARGET_STORAGE_KEY = "evalio_target_grade";

type AssessmentRow = {
  name: string;
  rowType: "graded" | "ungraded";
  weightLabel: string;
  neededLabel: string;
  needed: string;
  contrib: string;
};

function hasGrade(assessment: CourseAssessment): boolean {
  return (
    typeof assessment.raw_score === "number" &&
    typeof assessment.total_score === "number" &&
    assessment.total_score > 0
  );
}

function getPercent(assessment: CourseAssessment): number | null {
  if (!hasGrade(assessment)) return null;
  const percent = ((assessment.raw_score as number) / (assessment.total_score as number)) *
    100;
  if (!Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(percent, 100));
}

function toBadgeClass(classification: string): string {
  if (
    classification === "Comfortable" ||
    classification === "Achievable" ||
    classification === "Already Achieved" ||
    classification === "Complete"
  ) {
    return "bg-green-50 text-green-700";
  }
  if (classification === "Not Possible") {
    return "bg-red-50 text-red-700";
  }
  return "bg-orange-50 text-orange-600";
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function Dashboard() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [targetResult, setTargetResult] = useState<TargetCheckResponse | null>(null);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [gradedWeight, setGradedWeight] = useState(0);
  const [currentContribution, setCurrentContribution] = useState(0);
  const [targetGrade, setTargetGrade] = useState(DEFAULT_TARGET_GRADE);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const savedTarget = window.localStorage.getItem(TARGET_STORAGE_KEY);
        const parsedTarget =
          savedTarget === null ? NaN : Number.parseFloat(savedTarget);
        const resolvedTarget =
          Number.isFinite(parsedTarget) && parsedTarget >= 0 && parsedTarget <= 100
            ? parsedTarget
            : DEFAULT_TARGET_GRADE;
        setTargetGrade(resolvedTarget);

        const courses = await listCourses();
        if (courses.length === 0) {
          setError("No course found. Complete setup first.");
          setAssessments([]);
          setTargetResult(null);
          return;
        }

        const latestIndex = courses.length - 1;
        const latest: Course = courses[latestIndex];

        const graded = latest.assessments.filter((a) => hasGrade(a));
        const gradedW = graded.reduce((sum, a) => sum + a.weight, 0);
        const contribution = graded.reduce((sum, assessment) => {
          const percent = getPercent(assessment);
          if (percent === null) return sum;
          return sum + (percent * assessment.weight) / 100;
        }, 0);
        setGradedWeight(gradedW);
        setCurrentContribution(contribution);

        const target = await checkTarget(latestIndex, { target: resolvedTarget });
        setTargetResult(target);

        const rows = await Promise.all(
          latest.assessments.map(async (assessment) => {
            const actualPercent = getPercent(assessment);
            if (actualPercent !== null) {
              const percentValue = actualPercent;
              const contributionPoints = (percentValue * assessment.weight) / 100;
              return {
                name: assessment.name,
                rowType: "graded",
                weightLabel: `${assessment.weight}% of final grade`,
                neededLabel: "Actual Performance",
                needed: `${percentValue.toFixed(1)}% (${contributionPoints.toFixed(2)} / ${formatCompactNumber(assessment.weight)})`,
                contrib: `+${contributionPoints.toFixed(2)}%`,
              } satisfies AssessmentRow;
            }

            const minimum = await getMinimumRequired(latestIndex, {
              target: resolvedTarget,
              assessment_name: assessment.name,
            });
            const percentValue = minimum.minimum_required;
            const contributionPoints = (percentValue * assessment.weight) / 100;

            return {
              name: assessment.name,
              rowType: "ungraded",
              weightLabel: `${assessment.weight}% of final grade`,
              neededLabel: "Minimum Needed",
              needed: `${percentValue.toFixed(1)}% (${contributionPoints.toFixed(2)} / ${formatCompactNumber(assessment.weight)})`,
              contrib: `+${contributionPoints.toFixed(2)}%`,
            } satisfies AssessmentRow;
          })
        );

        setAssessments(rows);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard.");
        setCurrentContribution(0);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const currentGrade = targetResult?.current_standing ?? 0;
  const requiredAverage = targetResult?.required_average_display ?? "0.0%";
  const workCompleted = `${gradedWeight.toFixed(0)}%`;
  const remainingWeight = Math.max(0, 100 - gradedWeight);
  const progressWidth = `${Math.max(0, Math.min(gradedWeight, 100))}%`;
  const performanceAssumption =
    gradedWeight > 0 ? (currentContribution / gradedWeight) * 100 : 0;
  const clampedPerformanceAssumption = Math.max(
    0,
    Math.min(performanceAssumption, 100)
  );
  const targetClassification = targetResult?.classification ?? "Challenging";
  const targetExplanation =
    targetResult?.explanation ??
    "Your target is possible but will require strong performance. This target is achievable but will require strong performance ahead.";

  const projectedFinal = useMemo(() => {
    return (
      currentContribution +
      (remainingWeight * clampedPerformanceAssumption) / 100
    );
  }, [currentContribution, remainingWeight, clampedPerformanceAssumption]);

  const shortfall = targetGrade - projectedFinal;
  const belowTarget = shortfall > 0;

  const metrics = [
    {
      label: "Current Grade",
      value: `${currentGrade.toFixed(1)}%`,
      sub: "Based on graded work only",
    },
    {
      label: "Work Completed",
      value: workCompleted,
      sub: `${Math.max(0, 100 - gradedWeight).toFixed(0)}% still to go`,
    },
    { label: "Required Average", value: requiredAverage, sub: "To reach your target" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 pb-20">
      {/* 1. Header Section */}
      <div className="text-left">
        <h2 className="text-2xl font-bold text-gray-800">
          Your Academic Dashboard
        </h2>
        <p className="text-sm text-gray-500">
          {
            "Here's how everything fits together: your grades, goals, and path forward."
          }
        </p>
        {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-gray-100 bg-[#F9F8F6] p-6 text-center shadow-sm"
          >
            <p className="mb-2 text-[10px] uppercase tracking-widest text-gray-400">
              {m.label}
            </p>
            <p className="text-3xl font-bold text-gray-800">{m.value}</p>
            <p className="mt-2 text-[10px] text-gray-300">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* 3. Target Card */}
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Target: {targetGrade}%</h3>
          <span
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${toBadgeClass(
              targetClassification
            )}`}
          >
            <TrendingUp size={12} /> {targetClassification}
          </span>
        </div>
        <div className="mb-4 h-2 w-full rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-gray-300" style={{ width: progressWidth }} />
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-xs leading-relaxed text-orange-800">
          {targetExplanation}
        </div>
      </div>

      {/* 4. Performance Assumption */}
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <h3 className="mb-6 font-bold text-gray-800">Performance Assumption</h3>
        <div className="mb-8 flex items-center gap-6">
          <div className="h-2 flex-1 rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-300"
              style={{ width: `${clampedPerformanceAssumption}%` }}
            />
          </div>
          <span className="text-3xl font-bold text-slate-400">
            {clampedPerformanceAssumption.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#F9F8F6] p-6">
          <div>
            <p className="text-[10px] text-gray-400 uppercase">Projected Final Grade</p>
            <p className="text-4xl font-bold text-gray-800">{projectedFinal.toFixed(1)}%</p>
          </div>
          <div className="text-right">
            {belowTarget ? (
              <p className="flex items-center justify-end gap-1 text-xs font-bold text-orange-600">
                <AlertTriangle size={14} /> Below Target
              </p>
            ) : (
              <p className="text-xs font-bold text-green-600">On Track</p>
            )}
            <p className="mt-1 text-[10px] text-gray-400">
              {belowTarget
                ? `With ${clampedPerformanceAssumption.toFixed(1)}% average, you'll be ${shortfall.toFixed(1)}% short.`
                : `With ${clampedPerformanceAssumption.toFixed(1)}% average, you'll be ${(projectedFinal - targetGrade).toFixed(1)}% above target.`}
            </p>
          </div>
        </div>
      </div>

      {/* 5. Breakdown List */}
      <div className="space-y-4">
        <h3 className="font-bold text-gray-800">Assessment Breakdown</h3>
        {(loading ? [] : assessments).map((a) => (
          <div
            key={a.name}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="h-4 w-4 rounded-full border-2 border-orange-200" />
              <div>
                <p className="font-bold text-gray-800">{a.name}</p>
                <p className="text-[10px] text-gray-400">{a.weightLabel}</p>
              </div>
            </div>
            <div
              className="flex justify-between items-center rounded-xl p-4 border border-orange-100 bg-orange-50/50"
            >
              <div>
                <p className="text-[9px] uppercase text-gray-400">{a.neededLabel}</p>
                <p
                  className={`text-xl font-bold ${
                    a.rowType === "graded" ? "text-green-600" : "text-orange-600"
                  }`}
                >
                  {a.needed}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase text-gray-400">Would contribute</p>
                <p className="text-sm font-bold text-gray-700">{a.contrib} to final</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 6. Action Button */}
      <div className="text-center">
        <p className="mb-6 text-[10px] text-gray-400">
          This is your complete academic picture. Ready to explore different
          scenarios?
        </p>
        <button
          onClick={() => router.push("/setup/explore")}
          className="rounded-xl bg-[#5D737E] px-10 py-4 font-bold text-white shadow-lg hover:bg-[#4A5D66] transition"
        >
          Try the Scenario Explorer
        </button>
      </div>
    </div>
  );
}
