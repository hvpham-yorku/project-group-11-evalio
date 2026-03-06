"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  TrendingUp,
  GraduationCap,
  Calendar,
  Plus,
  Lightbulb,
  ChevronDown,
} from "lucide-react";
import { useSetupCourse } from "@/app/setup/course-context";
import { getApiErrorMessage } from "@/lib/errors";
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
const CONFIRMED_DEADLINES_KEY = "evalio_deadlines_confirmed_v1";

type AssessmentRow = {
  name: string;
  rowType: "graded" | "ungraded";
  weightLabel: string;
  neededLabel: string;
  needed: string;
  contrib: string;
};

type DashboardDeadline = {
  id: string;
  course_id: string;
  title: string;
  due_date: string;
  due_time?: string;
};

// --- Helper Components ---
function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] uppercase text-gray-400">{label}</p>
      <p className="text-sm font-bold text-gray-700">{value}</p>
    </div>
  );
}

// --- Logic Helpers ---
function hasGrade(assessment: CourseAssessment): boolean {
  return (
    typeof assessment.raw_score === "number" &&
    typeof assessment.total_score === "number" &&
    assessment.total_score > 0
  );
}

function getPercent(assessment: CourseAssessment): number | null {
  if (!hasGrade(assessment)) return null;
  const percent =
    ((assessment.raw_score as number) / (assessment.total_score as number)) *
    100;
  if (!Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(percent, 100));
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getDaysLeft(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(isoDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getBestOfEffectiveCount(assessment: CourseAssessment): number {
  if (
    typeof assessment.effective_count === "number" &&
    assessment.effective_count > 0
  ) {
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

function getEffectiveWeight(assessment: CourseAssessment): number {
  const parentWeight = Number.isFinite(assessment.weight)
    ? Math.max(0, assessment.weight)
    : 0;
  if (assessment.rule_type !== "best_of") return parentWeight;
  const children = Array.isArray(assessment.children)
    ? assessment.children
    : [];
  if (!children.length) return parentWeight;
  const effectiveCount = Math.min(
    getBestOfEffectiveCount(assessment),
    children.length
  );
  if (effectiveCount <= 0) return parentWeight;
  const topWeightSum = [...children]
    .map((child) =>
      Number.isFinite(child.weight) ? Math.max(0, child.weight) : 0
    )
    .sort((a, b) => b - a)
    .slice(0, effectiveCount)
    .reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(topWeightSum) || topWeightSum <= 0) return parentWeight;
  return Math.min(parentWeight, topWeightSum);
}

export function Dashboard() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [targetResult, setTargetResult] = useState<TargetCheckResponse | null>(
    null
  );
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [gradedWeight, setGradedWeight] = useState(0);
  const [currentContribution, setCurrentContribution] = useState(0);
  const [targetGrade, setTargetGrade] = useState(DEFAULT_TARGET_GRADE);
  const [assumedPerformance, setAssumedPerformance] = useState(75);
  const [courses, setCourses] = useState<Course[]>([]);
  const [deadlines, setDeadlines] = useState<DashboardDeadline[]>([]);
  const { ensureCourseIdFromList } = useSetupCourse();

  // Local state for the What-If Planner inputs
  const [whatIfGrades, setWhatIfGrades] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const savedTarget = window.localStorage.getItem(TARGET_STORAGE_KEY);
        const parsedTarget =
          savedTarget === null ? NaN : Number.parseFloat(savedTarget);
        const resolvedTarget =
          Number.isFinite(parsedTarget) &&
          parsedTarget >= 0 &&
          parsedTarget <= 100
            ? parsedTarget
            : DEFAULT_TARGET_GRADE;
        setTargetGrade(resolvedTarget);

        const courses = await listCourses();
        setCourses(courses);
        const resolvedCourseId = ensureCourseIdFromList(courses);
        if (!resolvedCourseId) {
          setError("No course found. Complete setup first.");
          setAssessments([]);
          setTargetResult(null);
          return;
        }

        const latest = courses.find(
          (course) => course.course_id === resolvedCourseId
        ) as Course | undefined;
        if (!latest) {
          setError("No course found. Complete setup first.");
          setAssessments([]);
          setTargetResult(null);
          return;
        }

        const graded = latest.assessments.filter(
          (a) => !a.is_bonus && hasGrade(a)
        );

        const confirmedMap =
          safeParse<Record<string, DashboardDeadline[]>>(
            window.localStorage.getItem(CONFIRMED_DEADLINES_KEY)
          ) ?? {};
        const allDeadlines = Object.entries(confirmedMap).flatMap(
          ([storedCourseId, courseDeadlines]) =>
            (courseDeadlines ?? []).map((deadline) => ({
              ...deadline,
              course_id: deadline.course_id || storedCourseId,
            }))
        );
        setDeadlines(allDeadlines);

        const gradedW = graded.reduce(
          (sum, a) => sum + getEffectiveWeight(a),
          0
        );
        const contribution = graded.reduce((sum, assessment) => {
          const percent = getPercent(assessment);
          if (percent === null) return sum;
          const effectiveWeight = getEffectiveWeight(assessment);
          return sum + (percent * effectiveWeight) / 100;
        }, 0);
        setGradedWeight(Math.min(100, Math.max(0, gradedW)));
        setCurrentContribution(contribution);

        const target = await checkTarget(resolvedCourseId, {
          target: resolvedTarget,
        });
        setTargetResult(target);

        const rows = await Promise.all(
          latest.assessments.map(async (assessment) => {
            const actualPercent = getPercent(assessment);
            if (actualPercent !== null) {
              const percentValue = actualPercent;
              const contributionPoints =
                (percentValue * assessment.weight) / 100;
              return {
                name: assessment.name,
                rowType: "graded",
                weightLabel: `${assessment.weight}% of final grade`,
                neededLabel: "Actual Performance",
                needed: `${percentValue.toFixed(
                  1
                )}% (${contributionPoints.toFixed(2)} / ${formatCompactNumber(
                  assessment.weight
                )})`,
                contrib: `+${contributionPoints.toFixed(2)}%`,
              } satisfies AssessmentRow;
            }

            const minimum = await getMinimumRequired(resolvedCourseId, {
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
              needed: `${percentValue.toFixed(
                1
              )}% (${contributionPoints.toFixed(2)} / ${formatCompactNumber(
                assessment.weight
              )})`,
              contrib: `+${contributionPoints.toFixed(2)}%`,
            } satisfies AssessmentRow;
          })
        );
        setAssessments(rows);
        setError("");
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to load dashboard."));
        setCurrentContribution(0);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [ensureCourseIdFromList]);

  const currentGrade = targetResult?.current_standing ?? 0;
  const requiredAverage = targetResult?.required_average_display ?? "0.0%";
  const workCompleted = `${gradedWeight.toFixed(0)}%`;
  const remainingWeight = Math.max(0, Math.min(100, 100 - gradedWeight));
  const progressWidth = `${Math.max(0, Math.min(targetGrade, 100))}%`;
  const clampedPerformanceAssumption = Math.max(
    0,
    Math.min(assumedPerformance, 100)
  );
  const targetClassification = targetResult?.classification ?? "Challenging";

  const targetTone =
    targetClassification === "Not Possible"
      ? "red"
      : targetClassification === "Challenging" ||
        targetClassification === "Very Challenging"
      ? "orange"
      : targetClassification === "Achievable" ||
        targetClassification === "Comfortable" ||
        targetClassification === "Already Achieved" ||
        targetClassification === "Complete"
      ? "green"
      : "orange";

  const targetBadgeClass =
    targetTone === "red"
      ? "bg-red-50 text-red-700"
      : targetTone === "green"
      ? "bg-green-50 text-green-700"
      : "bg-orange-50 text-orange-700";

  const targetBarClass =
    targetTone === "red"
      ? "bg-red-500"
      : targetTone === "green"
      ? "bg-green-500"
      : "bg-orange-400";

  const targetMessageClass =
    targetTone === "red"
      ? "border-red-100 bg-red-50 text-red-800"
      : targetTone === "green"
      ? "border-green-100 bg-green-50 text-green-800"
      : "border-orange-100 bg-orange-50 text-orange-800";

  const targetExplanation =
    targetResult?.explanation ??
    "Your target is possible but will require strong performance.";

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
      sub: `${remainingWeight.toFixed(0)}% still to go`,
    },
    {
      label: "Required Average",
      value: requiredAverage,
      sub: "To reach your target",
    },
  ];

  const upcomingDeadlines = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return deadlines
      .filter((deadline) => {
        const dueDate = new Date(deadline.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= now;
      })
      .sort(
        (a, b) =>
          new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      )
      .slice(0, 3);
  }, [deadlines]);

  // Data for Learning Strategies (Matching Screenshot)
  const learningStrategies = [
    {
      name: "Final Exam",
      weight: 40,
      priority: "High",
      tags: ["80/20 Rule", "Active Recall", "Spaced Repetition"],
    },
    {
      name: "Assignments",
      weight: 20,
      priority: "Medium",
      tags: ["Feynman Technique", "Time Blocking"],
    },
    {
      name: "Participation",
      weight: 10,
      priority: "Low",
      tags: ["Consistency Plan"],
    },
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
            "How everything fits together: your grades, goals, and path forward."
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

      {/* 3. Upcoming Deadlines */}
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-800">
            Upcoming Deadlines
          </h3>
          <button
            onClick={() => router.push("/setup/deadlines")}
            className="rounded-lg bg-[#F6F1EA] px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:opacity-80"
          >
            Manage
          </button>
        </div>

        {upcomingDeadlines.length === 0 ? (
          <div className="rounded-2xl bg-[#F9F8F6] py-14 text-center">
            <Calendar className="mx-auto mb-3 h-10 w-10 text-[#C6B8A8]" />
            <p className="mb-3 text-sm text-gray-500">
              No upcoming deadlines yet
            </p>
            <button
              onClick={() => router.push("/setup/deadlines")}
              className="inline-flex items-center gap-2 rounded-lg bg-[#5D737E] px-4 py-2 text-sm text-white transition hover:bg-[#4A5D66]"
            >
              <Plus size={14} />
              Add Deadline
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingDeadlines.map((deadline) => {
              const dueDate = new Date(deadline.due_date);
              const daysLeft = getDaysLeft(deadline.due_date);
              const courseName =
                courses.find(
                  (course) => course.course_id === deadline.course_id
                )?.course_name || "Unknown Course";

              return (
                <div
                  key={deadline.id}
                  className="flex items-center gap-3 rounded-lg border border-[#E6E2DB] bg-[#F6F1EA] p-3"
                >
                  <div className="flex-1">
                    <div className="mb-0.5 text-sm font-semibold text-gray-800">
                      {deadline.title}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{courseName}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {dueDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {deadline.due_time ? `, ${deadline.due_time}` : ""}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      daysLeft <= 3
                        ? "text-red-600"
                        : daysLeft <= 7
                        ? "text-[#C8833F]"
                        : "text-green-700"
                    }`}
                  >
                    {daysLeft === 0
                      ? "Today"
                      : daysLeft === 1
                      ? "Tomorrow"
                      : `${daysLeft} days`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Target Card */}
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Target: {targetGrade}%</h3>
          <span
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${targetBadgeClass}`}
          >
            <TrendingUp size={12} /> {targetClassification}
          </span>
        </div>
        <div className="mb-4 h-3 w-full rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all ${targetBarClass}`}
            style={{ width: progressWidth }}
          />
        </div>
        <div
          className={`rounded-xl border p-4 text-xs leading-relaxed ${targetMessageClass}`}
        >
          {targetExplanation}
        </div>
      </div>

      {/* 5. Performance Assumption */}
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <h3 className="mb-2 font-bold text-gray-800">Performance Assumption</h3>
        <p className="mb-6 text-xs text-gray-400">
          Adjust the slider to see how different performance levels affect your
          projected grade.
        </p>
        <div className="mb-8 flex items-center gap-6">
          <input
            type="range"
            min="0"
            max="100"
            value={assumedPerformance}
            onChange={(e) => setAssumedPerformance(Number(e.target.value))}
            className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-[#5D737E]"
          />
          <span className="text-3xl font-bold text-[#5D737E]">
            {clampedPerformanceAssumption.toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#F9F8F6] p-6">
          <div>
            <p className="text-[10px] text-gray-400 uppercase">
              Projected Final Grade
            </p>
            <p className="text-4xl font-bold text-gray-800">
              {projectedFinal.toFixed(1)}%
            </p>
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
                ? `Short by ${shortfall.toFixed(1)}%.`
                : `Above by ${(projectedFinal - targetGrade).toFixed(1)}%.`}
            </p>
          </div>
        </div>
      </div>

      {/* 6. Breakdown List */}
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
            <div className="flex justify-between items-center rounded-xl p-4 border border-orange-100 bg-orange-50/50">
              <div>
                <p className="text-[9px] uppercase text-gray-400">
                  {a.neededLabel}
                </p>
                <p
                  className={`text-xl font-bold ${
                    a.rowType === "graded"
                      ? "text-green-600"
                      : "text-orange-600"
                  }`}
                >
                  {a.needed}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase text-gray-400">
                  Would contribute
                </p>
                <p className="text-sm font-bold text-gray-700">
                  {a.contrib} to final
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* NEW: 7. What-If Planner & Learning Strategy */}
      <div className="space-y-10">
        {/* What-If Planner */}
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <h3 className="text-xl font-bold text-gray-800 mb-6">
            What-If Planner
          </h3>
          <div className="space-y-4">
            {learningStrategies.map((item) => (
              <div
                key={item.name}
                className="bg-[#FAF7F2] p-5 rounded-2xl flex flex-col gap-2"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-gray-700">{item.name}</h4>
                    <p className="text-xs text-gray-400">
                      {item.weight}% of final grade
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 bg-[#E6E2DB] text-[10px] font-bold text-gray-600 rounded-lg hover:opacity-80 transition">
                      Use 0
                    </button>
                    <button className="px-3 py-1.5 bg-[#E6E2DB] text-[10px] font-bold text-gray-600 rounded-lg hover:opacity-80 transition">
                      Use 100
                    </button>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        placeholder="NaN"
                        className="w-16 p-1.5 border border-gray-200 rounded-lg text-right text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
                        value={whatIfGrades[item.name] || ""}
                        onChange={(e) =>
                          setWhatIfGrades({
                            ...whatIfGrades,
                            [item.name]: e.target.value,
                          })
                        }
                      />
                      <span className="ml-1 text-xs text-gray-400">%</span>
                    </div>
                  </div>
                </div>
                <button className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-tight">
                  <ChevronDown size={12} /> Show Math
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-blue-50/50 border border-blue-100 text-[#5D737E] text-[10px] rounded-xl font-medium">
            What-if values are temporary and do not change your actual grades.
          </div>
        </div>

        {/* Learning Strategy */}
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Lightbulb size={20} className="text-yellow-500" />
            <h3 className="text-xl font-bold text-gray-800">
              Learning Strategy
            </h3>
          </div>
          <div className="space-y-4">
            {learningStrategies.map((item) => (
              <div key={item.name} className="bg-[#FAF7F2] p-5 rounded-2xl">
                <h4 className="font-bold text-gray-700">{item.name}</h4>
                <p className="text-xs text-gray-400 mb-4">
                  {item.weight}% of final grade
                </p>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider
                    ${
                      item.priority === "High"
                        ? "bg-red-100 text-red-600"
                        : item.priority === "Medium"
                        ? "bg-orange-100 text-orange-600"
                        : "bg-green-100 text-green-600"
                    }`}
                  >
                    {item.priority} Priority
                  </span>
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-blue-50 border border-blue-100 text-[#5D737E] rounded-lg text-[10px] font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <button className="mt-4 flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-tight">
                  <ChevronDown size={12} /> Why this strategy
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GPA Overview Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">GPA Overview</h2>
          <p className="text-xs text-gray-500">
            Track performance across terms and overall
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Term GPA Card */}
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap size={18} className="text-slate-600" />
              <h3 className="font-bold text-gray-800">Term GPA</h3>
            </div>
            <div className="text-center py-6">
              <div className="text-5xl font-bold text-gray-800">4.00</div>
              <p className="text-[10px] text-gray-400 mt-1">
                Based on courses in this semester
              </p>
              <span className="inline-block mt-2 rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                A+
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-b border-gray-50 py-4 my-4">
              <StatItem label="Courses" value="1" />
              <StatItem label="Credits" value="3.0" />
              <StatItem label="Scale" value="4.0" />
            </div>
            <div className="space-y-2">
              <p className="text-[9px] font-bold uppercase text-gray-400">
                Courses in Fall 2026
              </p>
              <div className="flex justify-between items-center rounded-xl bg-gray-50 p-3">
                <div>
                  <p className="text-xs font-bold text-gray-800">
                    EECS 2311 – Software Design
                  </p>
                  <p className="text-[10px] text-gray-400">3 credits</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-green-600">90.0%</p>
                  <p className="text-[10px] text-gray-400">4.00 GP</p>
                </div>
              </div>
            </div>
          </div>

          {/* Cumulative GPA Card */}
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-slate-600" />
              <h3 className="font-bold text-gray-800">Cumulative GPA (cGPA)</h3>
            </div>
            <div className="flex justify-center mb-4">
              <div className="flex rounded-lg bg-gray-100 p-1">
                {["4.0", "9.0", "10.0"].map((s) => (
                  <button
                    key={s}
                    className={`px-4 py-1 text-[10px] rounded-md ${
                      s === "4.0"
                        ? "bg-white shadow-sm font-bold"
                        : "text-gray-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-center py-2">
              <div className="text-5xl font-bold text-gray-800">4.00</div>
              <p className="text-[10px] text-gray-400 mt-1">Out of 4.0</p>
              <span className="inline-block mt-2 rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                A+
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <StatItem label="Total Courses" value="1" />
              <StatItem label="Total Credits" value="3.0" />
              <StatItem label="Average %" value="90.0%" />
              <StatItem label="Terms" value="1" />
            </div>
            <div className="mt-6">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-gray-400 uppercase font-bold">
                  Performance
                </span>
                <span className="text-green-600 font-bold">100%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div className="h-full w-full rounded-full bg-green-500" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Action Button */}
      <div className="text-center">
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
