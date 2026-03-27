"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  GraduationCap,
  Calendar,
  Plus,
  ChevronDown,
  Sigma,
  XCircle,
} from "lucide-react";
import { useSetupCourse } from "@/app/setup/course-context";
import { getApiErrorMessage } from "@/lib/errors";
import {
  checkTarget,
  computeCgpa,
  getCourseGpa,
  getDashboardSummary,
  getMinimumRequired,
  listDeadlines as listDeadlinesApi,
  listCourses,
  type CgpaResponse,
  type Course,
  type CourseAssessment,
  type CourseGpaResponse,
  type DashboardSummaryResponse,
  type DashboardWhatIfResponse,
  type Deadline as ApiDeadline,
  type TargetCheckResponse,
  runDashboardWhatIf,
} from "@/lib/api";

const DEFAULT_TARGET_GRADE = 85;
const TARGET_STORAGE_KEY = "evalio_target_grade";
const GPA_SCALES = ["4.0", "9.0", "10.0"] as const;
const CHILD_ASSESSMENT_SEPARATOR = "::";

type GpaScale = (typeof GPA_SCALES)[number];

type AssessmentBreakdownRow = {
  key: string;
  name: string;
  rowType: "graded" | "ungraded";
  weight: number;
  weightLabel: string;
  neededLabel: string;
  needed: string;
  contrib: string;
  isMandatoryPass?: boolean;
  passThreshold?: number | null;
  passStatus?: "passed" | "failed" | "pending" | null;
  mandatoryWarning?: string | null;
};

type AssessmentTarget = {
  key: string;
  assessmentName: string;
  displayName: string;
  weight: number;
  isBonus: boolean;
  percent: number | null;
  graded: boolean;
  isMandatoryPass: boolean;
  passThreshold: number | null;
};

type AssessmentTargetGroup = {
  key: string;
  parent: AssessmentTarget;
  children: AssessmentTarget[];
};

type AssessmentBreakdownGroup = {
  key: string;
  parent: AssessmentBreakdownRow;
  children: AssessmentBreakdownRow[];
};

type DashboardDeadline = {
  id: string;
  course_id: string;
  title: string;
  due_date: string;
  due_time?: string;
  assessment_name?: string | null;
  minimum_required?: number | null;
  source?: string;
};

type RiskSummaryAlert = {
  text: string;
  severity: "critical" | "warning";
};

function resolveCurrentGrade(result: TargetCheckResponse | null): number {
  if (!result) return 0;
  return Number.isFinite(result.final_total) ? Number(result.final_total) : result.current_standing;
}

// --- Helper Components ---
function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] uppercase text-[#6B6560]">{label}</p>
      <p className="text-sm font-bold text-[#3A3530]">{value}</p>
    </div>
  );
}

// --- Logic Helpers ---
function hasGrade(assessment: CourseAssessment): boolean {
  const children = Array.isArray(assessment.children) ? assessment.children : [];
  if (children.length) {
    return children.every(
      (child) =>
        typeof child.raw_score === "number" &&
        typeof child.total_score === "number" &&
        child.total_score > 0
    );
  }

  return (
    typeof assessment.raw_score === "number" &&
    typeof assessment.total_score === "number" &&
    assessment.total_score > 0
  );
}

function getPercent(assessment: CourseAssessment): number | null {
  const children = Array.isArray(assessment.children) ? assessment.children : [];
  if (children.length) {
    if (!hasGrade(assessment)) return null;
    const contribution = children.reduce((sum, child) => {
      if (
        typeof child.raw_score !== "number" ||
        typeof child.total_score !== "number" ||
        child.total_score <= 0
      ) {
        return sum;
      }
      return sum + ((child.raw_score / child.total_score) * 100 * child.weight) / 100;
    }, 0);
    const effectiveWeight = children.reduce((sum, child) => sum + child.weight, 0);
    if (effectiveWeight <= 0) return null;
    return Math.max(0, Math.min((contribution / effectiveWeight) * 100, 100));
  }

  if (!hasGrade(assessment)) return null;
  const percent =
    ((assessment.raw_score as number) / (assessment.total_score as number)) *
    100;
  if (!Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(percent, 100));
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

function buildAssessmentTargetGroups(
  assessments: CourseAssessment[]
): AssessmentTargetGroup[] {
  const targets: AssessmentTargetGroup[] = [];

  for (const assessment of assessments) {
    const children = Array.isArray(assessment.children) ? assessment.children : [];
    const isBonus = Boolean(assessment.is_bonus);
    const passThreshold = getMandatoryPassThreshold(assessment);
    const parentPercent = getPercent(assessment);

    const parentTarget: AssessmentTarget = {
      key: assessment.name,
      assessmentName: assessment.name,
      displayName: assessment.name,
      weight: Number.isFinite(assessment.weight) ? assessment.weight : 0,
      isBonus,
      percent: parentPercent,
      graded: parentPercent !== null,
      isMandatoryPass: passThreshold !== null,
      passThreshold,
    };

    if (children.length) {
      const childTargets: AssessmentTarget[] = [];
      for (const child of children) {
        const childHasGrade =
          typeof child.raw_score === "number" &&
          typeof child.total_score === "number" &&
          child.total_score > 0;
        const percent = childHasGrade
          ? Math.max(0, Math.min((child.raw_score! / child.total_score!) * 100, 100))
          : null;

        childTargets.push({
          key: `${assessment.name}${CHILD_ASSESSMENT_SEPARATOR}${child.name}`,
          assessmentName: `${assessment.name}${CHILD_ASSESSMENT_SEPARATOR}${child.name}`,
          displayName: `${assessment.name} — ${child.name}`,
          weight: Number.isFinite(child.weight) ? child.weight : 0,
          isBonus,
          percent,
          graded: childHasGrade,
          isMandatoryPass: false,
          passThreshold: null,
        });
      }
      targets.push({
        key: assessment.name,
        parent: parentTarget,
        children: childTargets,
      });
      continue;
    }

    targets.push({
      key: assessment.name,
      parent: parentTarget,
      children: [],
    });
  }

  return targets;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function getDaysLeft(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(isoDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

async function buildBreakdownRow(
  courseId: string,
  target: number,
  assessment: AssessmentTarget
): Promise<AssessmentBreakdownRow> {
  const actualPercent = assessment.percent;
  const mandatoryPassStatus =
    assessment.isMandatoryPass && typeof assessment.passThreshold === "number"
      ? actualPercent === null
        ? "pending"
        : actualPercent >= assessment.passThreshold
          ? "passed"
          : "failed"
      : null;

  if (actualPercent !== null) {
    const contributionPoints = (actualPercent * assessment.weight) / 100;
    return {
      key: assessment.key,
      name: assessment.displayName,
      rowType: "graded",
      weight: assessment.weight,
      weightLabel: `${assessment.weight}% of final grade`,
      neededLabel: "Actual Performance",
      needed: `${actualPercent.toFixed(1)}% (${contributionPoints.toFixed(2)} / ${formatCompactNumber(
        assessment.weight
      )})`,
      contrib: `+${contributionPoints.toFixed(2)}%`,
      isMandatoryPass: assessment.isMandatoryPass,
      passThreshold: assessment.passThreshold,
      passStatus: mandatoryPassStatus,
      mandatoryWarning: null,
    };
  }

  const minimum = await getMinimumRequired(courseId, {
    target,
    assessment_name: assessment.assessmentName,
  });
  const percentValue = minimum.minimum_required;
  const contributionPoints = (percentValue * assessment.weight) / 100;

  return {
    key: assessment.key,
    name: assessment.displayName,
    rowType: "ungraded",
    weight: assessment.weight,
    weightLabel: `${assessment.weight}% of final grade`,
    neededLabel: "Minimum Needed",
    needed: `${percentValue.toFixed(1)}% (${contributionPoints.toFixed(2)} / ${formatCompactNumber(
      assessment.weight
    )})`,
    contrib: `+${contributionPoints.toFixed(2)}%`,
    isMandatoryPass: assessment.isMandatoryPass,
    passThreshold: assessment.passThreshold,
    passStatus: assessment.isMandatoryPass ? "pending" : null,
    mandatoryWarning: minimum.mandatory_pass_warning ?? null,
  };
}

function normalizeTermKey(term?: string | null): string {
  return (term ?? "").trim().toLowerCase();
}

export function Dashboard() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [targetResult, setTargetResult] = useState<TargetCheckResponse | null>(
    null
  );
  const [assessmentGroups, setAssessmentGroups] = useState<
    AssessmentBreakdownGroup[]
  >([]);
  const [expandedAssessments, setExpandedAssessments] = useState<
    Record<string, boolean>
  >({});
  const [gradedWeight, setGradedWeight] = useState(0);
  const [currentContribution, setCurrentContribution] = useState(0);
  const [targetGrade, setTargetGrade] = useState(DEFAULT_TARGET_GRADE);
  const [assumedPerformance, setAssumedPerformance] = useState(75);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [deadlines, setDeadlines] = useState<DashboardDeadline[]>([]);
  const [riskDeadlines, setRiskDeadlines] = useState<ApiDeadline[]>([]);
  const [riskTargetResults, setRiskTargetResults] = useState<
    Record<string, TargetCheckResponse>
  >({});
  const [gpaScale, setGpaScale] = useState<GpaScale>("4.0");
  const [termGpa, setTermGpa] = useState<CgpaResponse | null>(null);
  const [termGpaCourses, setTermGpaCourses] = useState<CourseGpaResponse[]>([]);
  const [cumulativeGpa, setCumulativeGpa] = useState<CgpaResponse | null>(null);
  const [dashboardSummary, setDashboardSummary] =
    useState<DashboardSummaryResponse | null>(null);
  const [whatIfResult, setWhatIfResult] =
    useState<DashboardWhatIfResponse | null>(null);
  const [showBoundaryMath, setShowBoundaryMath] = useState(false);
  const [showProjectionMath, setShowProjectionMath] = useState(false);
  const { ensureCourseIdFromList } = useSetupCourse();

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
        setActiveCourseId(resolvedCourseId);
        if (!resolvedCourseId) {
          setError("No course found. Complete setup first.");
          setAssessmentGroups([]);
          setExpandedAssessments({});
          setTargetResult(null);
          setDashboardSummary(null);
          setWhatIfResult(null);
          setTermGpa(null);
          setTermGpaCourses([]);
          setCumulativeGpa(null);
          setDeadlines([]);
          return;
        }

        const latest = courses.find(
          (course) => course.course_id === resolvedCourseId
        ) as Course | undefined;
        if (!latest) {
          setError("No course found. Complete setup first.");
          setAssessmentGroups([]);
          setExpandedAssessments({});
          setTargetResult(null);
          setDashboardSummary(null);
          setWhatIfResult(null);
          setTermGpa(null);
          setTermGpaCourses([]);
          setCumulativeGpa(null);
          setDeadlines([]);
          return;
        }

        const sameTermCourses = (() => {
          const termKey = normalizeTermKey(latest.term);
          if (!termKey) return [latest];
          const grouped = courses.filter(
            (course) => normalizeTermKey(course.term) === termKey
          );
          return grouped.length ? grouped : [latest];
        })();
        const assessmentTargetGroups = buildAssessmentTargetGroups(
          latest.assessments
        );

        const [
          target,
          rows,
          termCourseResults,
          allCourseResults,
          summary,
          deadlineResponse,
          allDeadlineResponses,
          allTargetResults,
        ] =
          await Promise.all([
            checkTarget(resolvedCourseId, {
              target: resolvedTarget,
            }),
            Promise.all(
              assessmentTargetGroups.map(async (group) => {
                const parent = await buildBreakdownRow(
                  resolvedCourseId,
                  resolvedTarget,
                  group.parent
                );
                const children = await Promise.all(
                  group.children.map((child) =>
                    buildBreakdownRow(resolvedCourseId, resolvedTarget, child)
                  )
                );
                return {
                  key: group.key,
                  parent,
                  children,
                } satisfies AssessmentBreakdownGroup;
              })
            ),
            Promise.all(
              sameTermCourses.map(async (course) => {
                try {
                  return await getCourseGpa(course.course_id, gpaScale);
                } catch {
                  return null;
                }
              })
            ),
            Promise.all(
              courses.map(async (course) => {
                try {
                  return await getCourseGpa(course.course_id, gpaScale);
                } catch {
                  return null;
                }
              })
            ),
            getDashboardSummary(resolvedCourseId),
            listDeadlinesApi(resolvedCourseId).catch(() => ({
              deadlines: [],
              count: 0,
            })),
            Promise.all(
              courses.map(async (course) => {
                try {
                  return await listDeadlinesApi(course.course_id);
                } catch {
                  return { deadlines: [], count: 0 };
                }
              })
            ),
            Promise.all(
              courses.map(async (course) => {
                try {
                  const result = await checkTarget(course.course_id, {
                    target: resolvedTarget,
                  });
                  return [course.course_id, result] as const;
                } catch {
                  return null;
                }
              })
            ),
          ]);

        setTargetResult(target);
        setAssessmentGroups(rows);
        setExpandedAssessments({});
        setDashboardSummary(summary);
        setGradedWeight(summary.graded_weight);
        setCurrentContribution(summary.current_grade);

        const decoratedDeadlines = await Promise.all(
          (deadlineResponse.deadlines ?? []).map(async (deadline: ApiDeadline) => {
            if (!deadline.assessment_name) {
              return {
                id: deadline.deadline_id,
                course_id: deadline.course_id,
                title: deadline.title,
                due_date: deadline.due_date,
                due_time: deadline.due_time ?? undefined,
                assessment_name: deadline.assessment_name,
                source: deadline.source,
                minimum_required: null,
              } satisfies DashboardDeadline;
            }

            try {
              const minimum = await getMinimumRequired(resolvedCourseId, {
                target: resolvedTarget,
                assessment_name: deadline.assessment_name,
              });
              return {
                id: deadline.deadline_id,
                course_id: deadline.course_id,
                title: deadline.title,
                due_date: deadline.due_date,
                due_time: deadline.due_time ?? undefined,
                assessment_name: deadline.assessment_name,
                source: deadline.source,
                minimum_required: Number.isFinite(minimum.minimum_required)
                  ? minimum.minimum_required
                  : null,
              } satisfies DashboardDeadline;
            } catch {
              return {
                id: deadline.deadline_id,
                course_id: deadline.course_id,
                title: deadline.title,
                due_date: deadline.due_date,
                due_time: deadline.due_time ?? undefined,
                assessment_name: deadline.assessment_name,
                source: deadline.source,
                minimum_required: null,
              } satisfies DashboardDeadline;
            }
          })
        );
        setDeadlines(decoratedDeadlines);
        setRiskDeadlines(
          allDeadlineResponses.flatMap((response) => response.deadlines ?? [])
        );
        setRiskTargetResults(
          Object.fromEntries(
            allTargetResults.filter(
              (entry): entry is readonly [string, TargetCheckResponse] =>
                entry !== null
            )
          )
        );

        const validTermCourseResults = termCourseResults.filter(
          (item): item is CourseGpaResponse => item !== null
        );
        const validAllCourseResults = allCourseResults.filter(
          (item): item is CourseGpaResponse => item !== null
        );
        setTermGpaCourses(validTermCourseResults);

        const [termSummary, cumulativeSummary] = await Promise.all([
          validTermCourseResults.length
            ? computeCgpa({
                scale: gpaScale,
                courses: validTermCourseResults.map((course) => ({
                  name: course.course_name,
                  percentage: course.percentage,
                  credits: 1,
                })),
              })
            : Promise.resolve(null),
          validAllCourseResults.length
            ? computeCgpa({
                scale: gpaScale,
                courses: validAllCourseResults.map((course) => ({
                  name: course.course_name,
                  percentage: course.percentage,
                  credits: 1,
                })),
              })
            : Promise.resolve(null),
        ]);

        setTermGpa(termSummary);
        setCumulativeGpa(cumulativeSummary);
        setError("");
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to load dashboard."));
        setAssessmentGroups([]);
        setExpandedAssessments({});
        setCurrentContribution(0);
        setDashboardSummary(null);
        setWhatIfResult(null);
        setTermGpa(null);
        setTermGpaCourses([]);
        setCumulativeGpa(null);
        setDeadlines([]);
        setRiskDeadlines([]);
        setRiskTargetResults({});
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [ensureCourseIdFromList, gpaScale]);

  const currentGrade = dashboardSummary
    ? dashboardSummary.normalisation_applied
      ? dashboardSummary.current_normalised
      : dashboardSummary.current_grade
    : resolveCurrentGrade(targetResult);
  const boundaryWorstCase = dashboardSummary
    ? dashboardSummary.normalisation_applied
      ? dashboardSummary.min_normalised
      : dashboardSummary.min_grade
    : currentGrade;
  const boundaryBestCase = dashboardSummary
    ? dashboardSummary.normalisation_applied
      ? dashboardSummary.max_normalised
      : dashboardSummary.max_grade
    : currentGrade;
  const requiredAverage = targetResult?.required_average_display ?? "0.0%";
  const workCompleted = `${(
    dashboardSummary?.graded_weight ?? gradedWeight
  ).toFixed(0)}%`;
  const remainingWeight = Math.max(
    0,
    Math.min(100, dashboardSummary?.remaining_weight ?? 100 - gradedWeight)
  );
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
      ? "bg-[#F9EAEA] text-[#B86B6B]"
      : targetTone === "green"
      ? "bg-[#E8F2EA] text-[#6B9B7A]"
      : "bg-[#FDF3E7] text-[#C9945F]";

  const targetBarClass =
    targetTone === "red"
      ? "bg-[#B86B6B]"
      : targetTone === "green"
      ? "bg-[#6B9B7A]"
      : "bg-[#C9945F]";

  const targetMessageClass =
    targetTone === "red"
      ? "border-[#B86B6B] bg-[#F9EAEA] text-[#B86B6B]"
      : targetTone === "green"
      ? "border-[#6B9B7A] bg-[#E8F2EA] text-[#6B9B7A]"
      : "border-[#F1DCC4] bg-[#FDF3E7] text-[#C9945F]";

  const targetExplanation =
    targetResult?.explanation ??
    "Your target is possible but will require strong performance.";

  const projectedFinal = useMemo(() => {
    if (whatIfResult) {
      if (whatIfResult.normalisation_applied) {
        return (
          whatIfResult.projected_normalised ?? whatIfResult.projected_grade
        );
      }
      return whatIfResult.projected_grade;
    }
    return (
      currentContribution +
      (remainingWeight * clampedPerformanceAssumption) / 100
    );
  }, [
    clampedPerformanceAssumption,
    currentContribution,
    remainingWeight,
    whatIfResult,
  ]);

  const projectedMaximum = useMemo(() => {
    if (whatIfResult) {
      if (whatIfResult.normalisation_applied) {
        return (
          whatIfResult.maximum_possible_normalised ??
          whatIfResult.maximum_possible
        );
      }
      return whatIfResult.maximum_possible;
    }
    return boundaryBestCase;
  }, [boundaryBestCase, whatIfResult]);

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

  const boundaryBreakdown = dashboardSummary?.breakdown ?? [];
  const projectionBreakdown = whatIfResult?.breakdown ?? [];
  const mandatoryPassStatus = dashboardSummary?.mandatory_pass_status;
  const bonusContribution =
    dashboardSummary?.bonus_contribution ??
    boundaryBreakdown
      .filter((entry) => entry.is_bonus)
      .reduce((sum, entry) => sum + entry.current_contribution, 0);
  const coreGrade =
    dashboardSummary?.core_grade ??
    (dashboardSummary
      ? Math.max(0, dashboardSummary.current_grade - bonusContribution)
      : 0);

  const activeCourse = useMemo(
    () => courses.find((course) => course.course_id === activeCourseId) ?? null,
    [activeCourseId, courses]
  );

  useEffect(() => {
    if (!activeCourseId || !activeCourse) {
      setWhatIfResult(null);
      return;
    }

    const scenarios = buildAssessmentTargetGroups(activeCourse.assessments)
      .flatMap((group) => (group.children.length ? group.children : [group.parent]))
      .filter((assessment) => !assessment.isBonus && !assessment.graded)
      .map((assessment) => ({
        assessment_name: assessment.assessmentName,
        score: clampedPerformanceAssumption,
      }));

    if (!scenarios.length) {
      setWhatIfResult(null);
      return;
    }

    let cancelled = false;

    runDashboardWhatIf(activeCourseId, { scenarios })
      .then((response) => {
        if (!cancelled) {
          setWhatIfResult(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWhatIfResult(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCourse, activeCourseId, clampedPerformanceAssumption]);

  const termLabel = activeCourse?.term?.trim() || "Current selection";

  const totalTerms = useMemo(() => {
    const termKeys = new Set(
      courses
        .map((course) => normalizeTermKey(course.term))
        .filter((value) => value.length > 0)
    );
    return termKeys.size || (courses.length ? 1 : 0);
  }, [courses]);

  const cumulativeAveragePercent = useMemo(() => {
    if (!cumulativeGpa?.courses.length) return 0;
    return (
      cumulativeGpa.courses.reduce((sum, course) => sum + course.percentage, 0) /
      cumulativeGpa.courses.length
    );
  }, [cumulativeGpa]);

  const cumulativePerformancePercent = useMemo(() => {
    if (!cumulativeGpa) return 0;
    const maxPoint = Number.parseFloat(gpaScale);
    if (!Number.isFinite(maxPoint) || maxPoint <= 0) return 0;
    return Math.max(0, Math.min(100, (cumulativeGpa.cgpa / maxPoint) * 100));
  }, [cumulativeGpa, gpaScale]);

  const riskSummary = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let criticalCount = 0;
    let dueSoonCount = 0;
    let targetRiskCount = 0;
    let highWeightUngradedCount = 0;
    const topAlerts: RiskSummaryAlert[] = [];

    riskDeadlines.forEach((deadline) => {
      const dueDate = new Date(deadline.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor(
        (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysOverdue > 0) {
        criticalCount += 1;
        const courseName =
          courses.find((course) => course.course_id === deadline.course_id)
            ?.course_name ||
          courses.find((course) => course.course_id === deadline.course_id)?.name ||
          "Unknown";

        if (topAlerts.length < 3) {
          topAlerts.push({
            text: `${courseName} - ${deadline.title} overdue`,
            severity: "critical",
          });
        }
      }
    });

    riskDeadlines.forEach((deadline) => {
      const dueDate = new Date(deadline.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const hoursUntil = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntil > 0 && hoursUntil <= 72) {
        dueSoonCount += 1;
        if (hoursUntil <= 24) criticalCount += 1;

        const courseName =
          courses.find((course) => course.course_id === deadline.course_id)
            ?.course_name ||
          courses.find((course) => course.course_id === deadline.course_id)?.name ||
          "Unknown";

        if (topAlerts.length < 3) {
          topAlerts.push({
            text: `${courseName} - ${deadline.title} due in ${Math.ceil(hoursUntil)}h`,
            severity: hoursUntil <= 24 ? "critical" : "warning",
          });
        }
      }
    });

    courses.forEach((course) => {
      const targetCheck = riskTargetResults[course.course_id];
      if (targetCheck?.classification === "Not Possible") {
        targetRiskCount += 1;
        if (topAlerts.length < 3) {
          topAlerts.push({
            text: `${course.course_name || course.name} - Target not achievable`,
            severity: "warning",
          });
        }
      }
    });

    courses.forEach((course) => {
      course.assessments.forEach((assessment) => {
        const children = Array.isArray(assessment.children) ? assessment.children : [];
        if (children.length) {
          children.forEach((child) => {
            const isUngraded = !(
              typeof child.raw_score === "number" &&
              typeof child.total_score === "number" &&
              child.total_score > 0
            );
            if (isUngraded && child.weight >= 25) {
              highWeightUngradedCount += 1;
            }
          });
          return;
        }

        const isUngraded = !(
          typeof assessment.raw_score === "number" &&
          typeof assessment.total_score === "number" &&
          assessment.total_score > 0
        );
        if (isUngraded && assessment.weight >= 25) {
          highWeightUngradedCount += 1;
        }
      });
    });

    const totalAlerts =
      criticalCount + dueSoonCount + targetRiskCount + highWeightUngradedCount;

    return {
      criticalCount,
      dueSoonCount,
      targetRiskCount,
      highWeightUngradedCount,
      totalAlerts,
      topAlerts,
    };
  }, [courses, riskDeadlines, riskTargetResults]);

  const boundaryCurrentContributionTotal = useMemo(
    () =>
      boundaryBreakdown.reduce(
        (sum, entry) => sum + entry.current_contribution,
        0
      ),
    [boundaryBreakdown]
  );

  const boundaryRemainingPotentialTotal = useMemo(
    () =>
      boundaryBreakdown.reduce(
        (sum, entry) => sum + entry.remaining_potential,
        0
      ),
    [boundaryBreakdown]
  );

  const boundaryMaxContributionTotal = useMemo(
    () =>
      boundaryBreakdown.reduce((sum, entry) => sum + entry.max_contribution, 0),
    [boundaryBreakdown]
  );

  const projectionContributionTotal = useMemo(
    () =>
      projectionBreakdown.reduce((sum, entry) => sum + entry.contribution, 0),
    [projectionBreakdown]
  );

  const projectionMaxContributionTotal = useMemo(
    () =>
      projectionBreakdown.reduce((sum, entry) => sum + entry.max_contribution, 0),
    [projectionBreakdown]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 pb-20 text-[#3A3530]">
      {/* 1. Header Section */}
      <div className="text-left">
        <h2 className="text-2xl font-bold text-[#3A3530]">
          Your Academic Dashboard
        </h2>
        <p className="text-sm text-[#6B6560]">
          {
            "How everything fits together: your grades, goals, and path forward."
          }
        </p>
        {error ? <p className="mt-2 text-sm text-[#B86B6B]">{error}</p> : null}
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-[#D4CFC7] bg-[#FFFFFF] p-6 text-center shadow-sm"
          >
            <p className="mb-2 text-[10px] uppercase tracking-widest text-[#6B6560]">
              {m.label}
            </p>
            <p className="text-3xl font-bold text-[#3A3530]">{m.value}</p>
            <p className="mt-2 text-[10px] text-[#C4B5A6]">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* 3. Grade Boundaries */}
      <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-[#3A3530]">Grade Boundaries</h3>
            <p className="mt-1 text-xs text-[#6B6560]">
              Live minimum and maximum outcomes based on saved grades and remaining work.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowBoundaryMath((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#C4D6E4] bg-[#E8EFF5] px-3 py-2 text-xs font-medium text-[#5F7A8A] transition hover:opacity-90"
          >
            <Sigma size={14} />
            {showBoundaryMath ? "Hide Math" : "Show Math"}
          </button>
        </div>

        {mandatoryPassStatus?.has_requirements ? (
          <div
            className={`mb-4 rounded-2xl border p-4 text-sm ${
              mandatoryPassStatus.requirements_met
                ? "border-[#6B9B7A] bg-[#E8F2EA] text-[#6B9B7A]"
                : mandatoryPassStatus.failed_assessments.length > 0
                  ? "border-[#B86B6B] bg-[#F9EAEA] text-[#B86B6B]"
                  : "border-[#F1DCC4] bg-[#FDF3E7] text-[#C9945F]"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {mandatoryPassStatus.requirements_met ? (
                <CheckCircle2 size={16} />
              ) : mandatoryPassStatus.failed_assessments.length > 0 ? (
                <XCircle size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
              Mandatory Pass Requirements
            </div>
            <div className="mt-2 space-y-1 text-xs">
              {mandatoryPassStatus.requirements.map((requirement) => (
                <p key={`mandatory-${requirement.assessment_name}`}>
                  {requirement.assessment_name}: need at least{" "}
                  {requirement.threshold.toFixed(1)}% (
                  {requirement.status === "pending"
                    ? "not yet graded"
                    : `${requirement.status} at ${(
                        requirement.actual_percent ?? 0
                      ).toFixed(1)}%`}
                  )
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#B86B6B] bg-[#F9EAEA] p-5">
            <p className="text-[10px] uppercase tracking-wider text-[#B86B6B]">
              Worst Case
            </p>
            <p className="mt-2 text-3xl font-bold text-[#B86B6B]">
              {boundaryWorstCase.toFixed(1)}%
            </p>
            <p className="mt-1 text-xs text-[#B86B6B]">
              Current grade if remaining work scores 0%.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8E3DC] bg-[#F5F1EB] p-5">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6560]">
              Current
            </p>
            <p className="mt-2 text-3xl font-bold text-[#3A3530]">
              {currentGrade.toFixed(1)}%
            </p>
            <p className="mt-1 text-xs text-[#6B6560]">
              Based on currently saved grades.
            </p>
          </div>
          <div className="rounded-2xl border border-[#6B9B7A] bg-[#E8F2EA] p-5">
            <p className="text-[10px] uppercase tracking-wider text-[#6B9B7A]">
              Best Case
            </p>
            <p className="mt-2 text-3xl font-bold text-[#6B9B7A]">
              {boundaryBestCase.toFixed(1)}%
            </p>
            <p className="mt-1 text-xs text-[#6B9B7A]">
              Maximum reachable if remaining work scores 100%.
            </p>
          </div>
        </div>

        {dashboardSummary?.normalisation_applied ? (
          <p className="mt-4 text-xs text-[#6B6560]">
            Normalisation is applied because the current core syllabus weight totals {dashboardSummary.core_weight.toFixed(1)}%.
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[#E8E3DC] bg-[#F5F1EB] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6560]">
              Core Grade Contribution
            </p>
            <p className="mt-1 text-lg font-semibold text-[#3A3530]">
              {coreGrade.toFixed(2)}%
            </p>
          </div>
          <div className="rounded-xl border border-[#6B9B7A] bg-[#E8F2EA] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#6B9B7A]">
              Bonus Contribution
            </p>
            <p className="mt-1 text-lg font-semibold text-[#6B9B7A]">
              +{bonusContribution.toFixed(2)}%
            </p>
          </div>
        </div>

        {showBoundaryMath ? (
          <div className="mt-6 space-y-3 border-t border-[#E8E3DC] pt-6">
            <div className="rounded-2xl border border-[#E8E3DC] bg-[#F5F1EB] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6560]">
                Boundary Totals
              </p>
              <div className="mt-3 space-y-3 text-xs text-[#6B6560]">
                <div>
                  <p className="font-semibold text-[#3A3530]">Current</p>
                  <p className="font-mono">
                    {boundaryBreakdown
                      .map((entry) => entry.current_contribution.toFixed(2))
                      .join(" + ") || "0.00"}
                    {" = "}
                    {boundaryCurrentContributionTotal.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#3A3530]">Worst Case</p>
                  <p className="font-mono">
                    {boundaryCurrentContributionTotal.toFixed(2)} + 0.00
                    {" = "}
                    {boundaryWorstCase.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#3A3530]">Best Case</p>
                  <p className="font-mono">
                    {boundaryCurrentContributionTotal.toFixed(2)} +{" "}
                    {boundaryRemainingPotentialTotal.toFixed(2)}
                    {" = "}
                    {boundaryBestCase.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#3A3530]">Core + Bonus</p>
                  <p className="font-mono">
                    {coreGrade.toFixed(2)} + {bonusContribution.toFixed(2)}
                    {" = "}
                    {(coreGrade + bonusContribution).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#3A3530]">Max Contribution Sum</p>
                  <p className="font-mono">
                    {boundaryBreakdown
                      .map((entry) => entry.max_contribution.toFixed(2))
                      .join(" + ") || "0.00"}
                    {" = "}
                    {boundaryMaxContributionTotal.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 4. Assessment Breakdown */}
      <div className="space-y-4">
        <h3 className="font-bold text-[#3A3530]">Assessment Breakdown</h3>
        {(loading ? [] : assessmentGroups).map((group) => {
          const parent = group.parent;
          const hasChildren = group.children.length > 0;
          const isExpanded = expandedAssessments[group.key] ?? false;

          return (
            <div
              key={group.key}
              className="rounded-2xl border border-[#D4CFC7] bg-[#FFFFFF] p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAssessments((prev) => ({
                          ...prev,
                          [group.key]: !prev[group.key],
                        }))
                      }
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#D4CFC7] bg-[#FFFFFF] text-[#6B6560] hover:bg-[#F5F1EB]"
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${parent.name}`}
                    >
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-[#F1DCC4]" />
                  )}
                  <div>
                    <p className="font-bold text-[#3A3530]">{parent.name}</p>
                    <p className="text-[10px] text-[#6B6560]">{parent.weightLabel}</p>
                    {parent.isMandatoryPass ? (
                      <p
                        className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
                          parent.passStatus === "passed"
                            ? "bg-[#E8F2EA] text-[#6B9B7A]"
                            : parent.passStatus === "failed"
                              ? "bg-[#F9EAEA] text-[#B86B6B]"
                              : "bg-[#FDF3E7] text-[#C9945F]"
                        }`}
                      >
                        Mandatory {"\u2265"} {(parent.passThreshold ?? 50).toFixed(1)}% •{" "}
                        {parent.passStatus ?? "pending"}
                      </p>
                    ) : null}
                  </div>
                </div>
                {hasChildren ? (
                  <span className="rounded-full border border-[#C4D6E4] bg-[#E8EFF5] px-3 py-1 text-[10px] font-semibold text-[#6B8BA8]">
                    {group.children.length} {parent.name}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[#F1DCC4] bg-[#FDF3E7] p-4">
                <div>
                  <p className="text-[9px] uppercase text-[#6B6560]">
                    {parent.neededLabel}
                  </p>
                  <p
                    className={`text-xl font-bold ${
                      parent.rowType === "graded"
                        ? "text-[#6B9B7A]"
                        : "text-[#C9945F]"
                    }`}
                  >
                    {parent.needed}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase text-[#6B6560]">
                    Would contribute
                  </p>
                  <p className="text-sm font-bold text-[#3A3530]">
                    {parent.contrib} to final
                  </p>
                </div>
              </div>
              {parent.mandatoryWarning ? (
                <p className="mt-2 text-xs text-[#C9945F]">
                  {parent.mandatoryWarning}
                </p>
              ) : null}

              {hasChildren && isExpanded ? (
                <div className="mt-3 space-y-3 border-l border-[#D4CFC7] pl-5">
                  {group.children.map((child) => (
                    <div
                      key={child.key}
                      className="flex items-center justify-between rounded-xl border border-[#E8E3DC] bg-[#F5F1EB] p-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#3A3530]">{child.name}</p>
                        <p className="text-[10px] text-[#6B6560]">{child.weightLabel}</p>
                        <p
                          className={`mt-1 text-sm font-semibold ${
                            child.rowType === "graded"
                              ? "text-[#6B9B7A]"
                              : "text-[#C9945F]"
                          }`}
                        >
                          {child.neededLabel}: {child.needed}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] uppercase text-[#6B6560]">
                          Would contribute
                        </p>
                        <p className="text-sm font-bold text-[#3A3530]">
                          {child.contrib} to final
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 5. Target */}
      <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-8 shadow-sm">
        <div className="mb-6 flex justify-between items-center">
          <h3 className="font-bold text-[#3A3530]">Target: {targetGrade}%</h3>
          <span
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${targetBadgeClass}`}
          >
            <TrendingUp size={12} /> {targetClassification}
          </span>
        </div>
        <div className="mb-4 h-3 w-full rounded-full bg-[#E8E3DC]">
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

      {/* 6. Performance Assumption */}
      <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-8 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h3 className="font-bold text-[#3A3530]">Performance Assumption</h3>
          <button
            type="button"
            onClick={() => setShowProjectionMath((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#C4D6E4] bg-[#E8EFF5] px-3 py-2 text-xs font-medium text-[#5F7A8A] transition hover:opacity-90"
          >
            <Sigma size={14} />
            {showProjectionMath ? "Hide Math" : "Show Math"}
          </button>
        </div>
        <p className="mb-6 text-xs text-[#6B6560]">
          Adjust the slider to apply a temporary what-if score to every remaining assessment.
        </p>
        <div className="mb-8 flex items-center gap-6">
          <input
            type="range"
            min="0"
            max="100"
            value={assumedPerformance}
            onChange={(e) => setAssumedPerformance(Number(e.target.value))}
            className="flex-1 h-2 cursor-pointer appearance-none rounded-full bg-[#E8E3DC] accent-[#C9945F]"
          />
          <span className="text-3xl font-bold text-[#C9945F]">
            {clampedPerformanceAssumption.toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-[#E8E3DC] bg-[#F5F1EB] p-6">
          <div>
            <p className="text-[10px] uppercase text-[#6B6560]">
              Projected Final Grade
            </p>
            <p className="text-4xl font-bold text-[#3A3530]">
              {projectedFinal.toFixed(1)}%
            </p>
            <p className="mt-2 text-[10px] uppercase text-[#6B6560]">
              Max reachable under this plan: {projectedMaximum.toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            {belowTarget ? (
              <p className="flex items-center justify-end gap-1 text-xs font-bold text-[#C9945F]">
                <AlertTriangle size={14} /> Below Target
              </p>
            ) : (
              <p className="text-xs font-bold text-[#6B9B7A]">On Track</p>
            )}
            <p className="mt-1 text-[10px] text-[#6B6560]">
              {belowTarget
                ? `Short by ${shortfall.toFixed(1)}%.`
                : `Above by ${(projectedFinal - targetGrade).toFixed(1)}%.`}
            </p>
          </div>
        </div>

        {showProjectionMath ? (
          <div className="mt-6 space-y-3 border-t border-[#E8E3DC] pt-6">
            <div className="rounded-2xl border border-[#E8E3DC] bg-[#F5F1EB] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6560]">
                Projection Totals
              </p>
              <div className="mt-3 space-y-3 text-xs text-[#6B6560]">
                <div>
                  <p className="font-semibold text-[#3A3530]">Projected Final Grade</p>
                  <p className="font-mono">
                    {(projectionBreakdown.length
                      ? projectionBreakdown
                          .map((entry) => entry.contribution.toFixed(2))
                          .join(" + ")
                      : currentContribution.toFixed(2)) || "0.00"}
                    {" = "}
                    {(projectionBreakdown.length
                      ? projectionContributionTotal
                      : projectedFinal
                    ).toFixed(2)}
                    %
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#3A3530]">Max Reachable Under This Plan</p>
                  <p className="font-mono">
                    {(projectionBreakdown.length
                      ? projectionBreakdown
                          .map((entry) => entry.max_contribution.toFixed(2))
                          .join(" + ")
                      : projectedMaximum.toFixed(2)) || "0.00"}
                    {" = "}
                    {(projectionBreakdown.length
                      ? projectionMaxContributionTotal
                      : projectedMaximum
                    ).toFixed(2)}
                    %
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 7. Upcoming Deadlines */}
      <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-8 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-[#3A3530]">
            Upcoming Deadlines
          </h3>
          <button
            onClick={() => router.push("/setup/deadlines")}
            className="rounded-lg border border-[#C4D6E4] bg-[#E8EFF5] px-3 py-1.5 text-xs font-medium text-[#5F7A8A] transition hover:opacity-90"
          >
            Manage
          </button>
        </div>

        {upcomingDeadlines.length === 0 ? (
          <div className="rounded-2xl border border-[#E8E3DC] bg-[#F5F1EB] py-14 text-center">
            <Calendar className="mx-auto mb-3 h-10 w-10 text-[#C4B5A6]" />
            <p className="mb-3 text-sm text-[#6B6560]">
              No upcoming deadlines yet
            </p>
            <button
              onClick={() => router.push("/setup/deadlines")}
              className="inline-flex items-center gap-2 rounded-lg bg-[#5F7A8A] px-4 py-2 text-sm text-white transition hover:opacity-90"
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
                  className="flex items-center gap-3 rounded-lg border border-[#E8E3DC] bg-[#F5F1EB] p-3"
                >
                  <div className="flex-1">
                    <div className="mb-0.5 text-sm font-semibold text-[#3A3530]">
                      {deadline.title}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#6B6560]">
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
                      {deadline.source ? (
                        <span className="rounded-full border border-[#C4D6E4] bg-[#E8EFF5] px-2 py-0.5 text-[10px] font-medium text-[#6B8BA8]">
                          {deadline.source}
                        </span>
                      ) : null}
                    </div>
                    {typeof deadline.minimum_required === "number" ? (
                      <div className="mt-1 text-[11px] text-[#6B6560]">
                        Need at least {deadline.minimum_required.toFixed(1)}% to hit your target.
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      daysLeft <= 3
                        ? "text-[#B86B6B]"
                        : daysLeft <= 7
                        ? "text-[#C9945F]"
                        : "text-[#6B9B7A]"
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

      {/* 8. Risk Center */}
      <div className="mb-6 rounded-3xl bg-[#FFFFFF] p-6 shadow-sm ring-1 ring-[#D4CFC7]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-[#3A3530]">Risk Center</h3>
          {riskSummary.totalAlerts > 0 ? (
            <div
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                riskSummary.criticalCount > 0
                  ? "bg-[#F9EAEA] text-[#B86B6B]"
                  : "bg-[#FDF3E7] text-[#C9945F]"
              }`}
            >
              {riskSummary.totalAlerts} alert{riskSummary.totalAlerts !== 1 ? "s" : ""}
            </div>
          ) : null}
        </div>

        {riskSummary.totalAlerts > 0 ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-[#B86B6B] bg-[#F9EAEA] p-4 text-center">
                <div className="mb-0.5 text-3xl font-semibold text-[#B86B6B]">
                  {riskSummary.criticalCount}
                </div>
                <div className="text-sm text-[#6B6560]">Critical</div>
              </div>
              <div className="rounded-2xl border border-[#F1DCC4] bg-[#FDF3E7] p-4 text-center">
                <div className="mb-0.5 text-3xl font-semibold text-[#C9945F]">
                  {riskSummary.dueSoonCount}
                </div>
                <div className="text-sm text-[#6B6560]">Due 72h</div>
              </div>
              <div className="rounded-2xl border border-[#F1DCC4] bg-[#FDF3E7] p-4 text-center">
                <div className="mb-0.5 text-3xl font-semibold text-[#C9945F]">
                  {riskSummary.targetRiskCount}
                </div>
                <div className="text-sm text-[#6B6560]">Target Risk</div>
              </div>
              <div className="rounded-2xl border border-[#C4D6E4] bg-[#E8EFF5] p-4 text-center">
                <div className="mb-0.5 text-3xl font-semibold text-[#6B8BA8]">
                  {riskSummary.highWeightUngradedCount}
                </div>
                <div className="text-sm text-[#6B6560]">High-Weight</div>
              </div>
            </div>

            {riskSummary.topAlerts.length > 0 ? (
              <div className="mb-4 space-y-2">
                {riskSummary.topAlerts.map((alert, index) => (
                  <div
                    key={`${alert.text}-${index}`}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                      alert.severity === "critical"
                        ? "border border-[#B86B6B] bg-[#F9EAEA]"
                        : "border border-[#F1DCC4] bg-[#FDF3E7]"
                    }`}
                  >
                    <AlertTriangle
                      size={14}
                      className={
                        alert.severity === "critical"
                          ? "text-[#B86B6B]"
                          : "text-[#C9945F]"
                      }
                    />
                    <span className="flex-1 text-sm text-[#3A3530]">{alert.text}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              onClick={() => router.push("/setup/risk-center")}
              className="w-full rounded-2xl bg-[#5F7A8A] px-4 py-4 text-lg font-medium text-white transition hover:opacity-90"
            >
              View All Alerts
            </button>
          </>
        ) : (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-[#6B9B7A]" />
            <p className="mb-3 text-sm text-[#6B6560]">No urgent issues detected</p>
            <button
              onClick={() => router.push("/setup/risk-center")}
              className="rounded-lg border border-[#C4D6E4] bg-[#E8EFF5] px-4 py-2 text-xs text-[#5F7A8A] transition hover:opacity-90"
            >
              View Risk Center
            </button>
          </div>
        )}
      </div>

      {/* 9. GPA Overview */}
      <div className="space-y-4">
        <div>
          <h3 className="font-bold text-[#3A3530]">GPA Overview</h3>
          <p className="text-xs text-[#6B6560]">
            Track performance across terms and overall
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Term GPA Card */}
          <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap size={18} className="text-[#5F7A8A]" />
              <h3 className="font-bold text-[#3A3530]">Term GPA</h3>
            </div>
            <div className="text-center py-6">
              <div className="text-5xl font-bold text-[#3A3530]">
                {termGpa ? termGpa.cgpa.toFixed(2) : "0.00"}
              </div>
              <p className="mt-1 text-[10px] text-[#6B6560]">
                Equal-weight average for courses in this term
              </p>
              <span className="mt-2 inline-block rounded-full bg-[#E8F2EA] px-3 py-1 text-xs font-bold text-[#6B9B7A]">
                {termGpaCourses.length === 1
                  ? termGpaCourses[0]?.gpa.letter ?? gpaScale
                  : `${termGpaCourses.length} course${termGpaCourses.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <div className="my-4 grid grid-cols-3 gap-2 border-y border-[#E8E3DC] py-4">
              <StatItem label="Courses" value={String(termGpaCourses.length)} />
              <StatItem label="Weighting" value="Equal" />
              <StatItem label="Scale" value={gpaScale} />
            </div>
            <div className="space-y-2">
              <p className="text-[9px] font-bold uppercase text-[#6B6560]">
                Courses in {termLabel}
              </p>
              {termGpaCourses.length === 0 ? (
                <div className="rounded-xl border border-[#E8E3DC] bg-[#F5F1EB] p-3 text-xs text-[#6B6560]">
                  No GPA-ready course data yet.
                </div>
              ) : (
                termGpaCourses.map((course) => (
                  <div
                    key={course.course_id}
                    className="flex items-center justify-between rounded-xl border border-[#E8E3DC] bg-[#F5F1EB] p-3"
                  >
                    <div>
                      <p className="text-xs font-bold text-[#3A3530]">
                        {course.course_name}
                      </p>
                      <p className="text-[10px] text-[#6B6560]">Equal weight</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-[#6B9B7A]">
                        {course.percentage.toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-[#6B6560]">
                        {course.gpa.grade_point.toFixed(2)} GP
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cumulative GPA Card */}
          <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-[#5F7A8A]" />
              <h3 className="font-bold text-[#3A3530]">Cumulative GPA (cGPA)</h3>
            </div>
            <div className="flex justify-center mb-4">
              <div className="flex rounded-lg bg-[#E8EFF5] p-1">
                {GPA_SCALES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setGpaScale(s)}
                    className={`px-4 py-1 text-[10px] rounded-md ${
                      s === gpaScale
                        ? "bg-[#FFFFFF] shadow-sm font-bold text-[#3A3530]"
                        : "text-[#6B8BA8]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-center py-2">
              <div className="text-5xl font-bold text-[#3A3530]">
                {cumulativeGpa ? cumulativeGpa.cgpa.toFixed(2) : "0.00"}
              </div>
              <p className="mt-1 text-[10px] text-[#6B6560]">Out of {gpaScale}</p>
              <span className="mt-2 inline-block rounded-full bg-[#E8F2EA] px-3 py-1 text-xs font-bold text-[#6B9B7A]">
                {cumulativeGpa?.courses.length === 1
                  ? cumulativeGpa.courses[0]?.letter ?? gpaScale
                  : `${cumulativeGpa?.courses.length ?? 0} courses`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <StatItem
                label="Total Courses"
                value={String(cumulativeGpa?.courses.length ?? 0)}
              />
              <StatItem label="Weighting" value="Equal" />
              <StatItem
                label="Average %"
                value={`${cumulativeAveragePercent.toFixed(1)}%`}
              />
              <StatItem label="Terms" value={String(totalTerms)} />
            </div>
            <div className="mt-6">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="font-bold uppercase text-[#6B6560]">
                  Performance
                </span>
                <span className="font-bold text-[#6B9B7A]">
                  {cumulativePerformancePercent.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#E8E3DC]">
                <div
                  className="h-full rounded-full bg-[#6B9B7A]"
                  style={{ width: `${cumulativePerformancePercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="text-center">
        <button
          onClick={() => router.push("/setup/explore")}
          className="rounded-xl bg-[#5F7A8A] px-10 py-4 font-bold text-white shadow-lg transition hover:opacity-90"
        >
          Try the Scenario Explorer
        </button>
      </div>
    </div>
  );
}
