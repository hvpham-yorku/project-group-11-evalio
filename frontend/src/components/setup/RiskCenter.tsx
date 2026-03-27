"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  FileQuestion,
  Target,
} from "lucide-react";

import { getApiErrorMessage } from "@/lib/errors";
import {
  checkTarget,
  listCourses,
  listDeadlines,
  type Course,
  type CourseAssessment,
  type Deadline,
  type TargetCheckResponse,
} from "@/lib/api";

const TARGET_STORAGE_KEY = "evalio_target_grade";
const DEFAULT_TARGET_GRADE = 85;
const HIGH_WEIGHT_THRESHOLD = 25;

type AlertType =
  | "overdue"
  | "due-soon"
  | "impossible-target"
  | "high-weight-ungraded";
type AlertSeverity = "critical" | "high" | "medium";

type FilterType =
  | "all"
  | "critical"
  | "overdue"
  | "due-soon"
  | "target-risk"
  | "ungraded";

type RiskAlert = {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  courseName: string;
  courseId: string;
  itemName: string;
  explanation: string;
  context: string;
  actionLabel: string;
  actionPath: string;
};

type DeadlineWithCourse = Deadline & {
  courseName: string;
};

function normalizeDate(dateValue: string): Date {
  const value = new Date(dateValue);
  value.setHours(0, 0, 0, 0);
  return value;
}

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

function flattenUngradedAssessments(course: Course) {
  return course.assessments.flatMap((assessment) => {
    const children = Array.isArray(assessment.children) ? assessment.children : [];

    if (children.length) {
      return children
        .filter(
          (child) =>
            !(
              typeof child.raw_score === "number" &&
              typeof child.total_score === "number" &&
              child.total_score > 0
            )
        )
        .map((child) => ({
          id: `${course.course_id}-${assessment.name}-${child.name}`,
          name: `${assessment.name} — ${child.name}`,
          weight: child.weight,
        }));
    }

    if (hasGrade(assessment)) {
      return [];
    }

    return [
      {
        id: `${course.course_id}-${assessment.name}`,
        name: assessment.name,
        weight: assessment.weight,
      },
    ];
  });
}

export default function RiskCenter() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [courses, setCourses] = useState<Course[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineWithCourse[]>([]);
  const [targetResults, setTargetResults] = useState<Record<string, TargetCheckResponse>>({});

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

        const courseList = await listCourses();
        setCourses(courseList);

        if (!courseList.length) {
          setError("No course found. Complete setup first.");
          setDeadlines([]);
          setTargetResults({});
          return;
        }

        const [deadlineResults, targetChecks] = await Promise.all([
          Promise.all(
            courseList.map(async (course) => {
              try {
                const response = await listDeadlines(course.course_id);
                return (response.deadlines ?? []).map((deadline) => ({
                  ...deadline,
                  courseName: course.course_name?.trim() || course.name,
                }));
              } catch {
                return [] as DeadlineWithCourse[];
              }
            })
          ),
          Promise.all(
            courseList.map(async (course) => {
              try {
                const result = await checkTarget(course.course_id, { target: resolvedTarget });
                return [course.course_id, result] as const;
              } catch {
                return null;
              }
            })
          ),
        ]);

        setDeadlines(deadlineResults.flat());
        setTargetResults(
          Object.fromEntries(
            targetChecks.filter(
              (entry): entry is readonly [string, TargetCheckResponse] => entry !== null
            )
          )
        );
        setError("");
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to load risk center."));
        setCourses([]);
        setDeadlines([]);
        setTargetResults({});
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const allAlerts = useMemo(() => {
    const alerts: RiskAlert[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    deadlines.forEach((deadline) => {
      const dueDate = normalizeDate(deadline.due_date);
      const dayDifference = Math.floor(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (dayDifference < 0) {
        const daysOverdue = Math.abs(dayDifference);
        alerts.push({
          id: `overdue-${deadline.deadline_id}`,
          type: "overdue",
          severity: "critical",
          courseName: deadline.courseName,
          courseId: deadline.course_id,
          itemName: deadline.title,
          explanation: "This deadline has passed and needs immediate attention.",
          context: `Overdue by ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}`,
          actionLabel: "View Deadlines",
          actionPath: "/setup/deadlines",
        });
      }

      if (dayDifference >= 0 && dayDifference <= 3) {
        alerts.push({
          id: `due-soon-${deadline.deadline_id}`,
          type: "due-soon",
          severity: dayDifference <= 1 ? "critical" : "high",
          courseName: deadline.courseName,
          courseId: deadline.course_id,
          itemName: deadline.title,
          explanation: "Upcoming deadline requires your attention.",
          context:
            dayDifference === 0
              ? "Due today"
              : dayDifference === 1
                ? "Due tomorrow"
                : `Due in ${dayDifference} days`,
          actionLabel: "View Deadlines",
          actionPath: "/setup/deadlines",
        });
      }
    });

    courses.forEach((course) => {
      const targetCheck = targetResults[course.course_id];
      if (targetCheck?.classification === "Not Possible") {
        alerts.push({
          id: `impossible-${course.course_id}`,
          type: "impossible-target",
          severity: "high",
          courseName: course.course_name?.trim() || course.name,
          courseId: course.course_id,
          itemName: "Target grade",
          explanation: "Current target grade is not mathematically achievable.",
          context: `Would need ${targetCheck.required_average.toFixed(1)}% average on remaining work`,
          actionLabel: "Adjust Goals",
          actionPath: "/setup/goals",
        });
      }

      flattenUngradedAssessments(course)
        .filter((assessment) => assessment.weight >= HIGH_WEIGHT_THRESHOLD)
        .forEach((assessment) => {
          alerts.push({
            id: `ungraded-${assessment.id}`,
            type: "high-weight-ungraded",
            severity: "medium",
            courseName: course.course_name?.trim() || course.name,
            courseId: course.course_id,
            itemName: assessment.name,
            explanation: "High-weight assessment not yet graded.",
            context: `Worth ${assessment.weight}% of final grade`,
            actionLabel: "View Grades",
            actionPath: "/setup/grades",
          });
        });
    });

    const severityOrder: Record<AlertSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
    };

    return alerts.sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
  }, [courses, deadlines, targetResults]);

  const filteredAlerts = useMemo(() => {
    return allAlerts.filter((alert) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "critical") return alert.severity === "critical";
      if (activeFilter === "overdue") return alert.type === "overdue";
      if (activeFilter === "due-soon") return alert.type === "due-soon";
      if (activeFilter === "target-risk") return alert.type === "impossible-target";
      if (activeFilter === "ungraded") return alert.type === "high-weight-ungraded";
      return true;
    });
  }, [activeFilter, allAlerts]);

  const criticalCount = allAlerts.filter((alert) => alert.severity === "critical").length;
  const dueSoonCount = allAlerts.filter((alert) => alert.type === "due-soon").length;
  const impossibleTargetsCount = allAlerts.filter(
    (alert) => alert.type === "impossible-target"
  ).length;
  const highWeightUngradedCount = allAlerts.filter(
    (alert) => alert.type === "high-weight-ungraded"
  ).length;

  const severityConfig = {
    critical: {
      color: "text-red-700",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      icon: AlertTriangle,
      label: "Critical",
      accent: "#dc2626",
    },
    high: {
      color: "text-amber-700",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-200",
      icon: AlertCircle,
      label: "High",
      accent: "#d97706",
    },
    medium: {
      color: "text-sky-700",
      bgColor: "bg-sky-50",
      borderColor: "border-sky-200",
      icon: AlertCircle,
      label: "Medium",
      accent: "#0369a1",
    },
  } as const;

  const typeConfig = {
    overdue: { label: "Overdue", icon: Clock },
    "due-soon": { label: "Due Soon", icon: Calendar },
    "impossible-target": { label: "Impossible Target", icon: Target },
    "high-weight-ungraded": { label: "High-Weight Ungraded", icon: FileQuestion },
  } as const;

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading risk center...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h2 className="mb-2 text-2xl font-bold text-gray-800">Risk &amp; Alerts Center</h2>
        <p className="text-gray-500">
          See urgent academic issues across all your courses in one place.
        </p>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            value: criticalCount,
            label: "Critical Alerts",
            color: "text-red-700",
          },
          {
            value: dueSoonCount,
            label: "Due in 72 Hours",
            color: "text-amber-700",
          },
          {
            value: impossibleTargetsCount,
            label: "Impossible Targets",
            color: "text-amber-700",
          },
          {
            value: highWeightUngradedCount,
            label: "High-Weight Ungraded",
            color: "text-sky-700",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-gray-100"
          >
            <div className={`mb-1 text-3xl font-semibold ${card.color}`}>{card.value}</div>
            <div className="text-sm text-gray-500">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {[
            { value: "all", label: "All" },
            { value: "critical", label: "Critical" },
            { value: "overdue", label: "Overdue" },
            { value: "due-soon", label: "Due Soon" },
            { value: "target-risk", label: "Target Risk" },
            { value: "ungraded", label: "Ungraded" },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setActiveFilter(filter.value as FilterType)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeFilter === filter.value
                  ? "bg-[#5D737E] text-white"
                  : "border border-[#E6E2DB] bg-[#F6F1EA] text-gray-700 hover:bg-[#EFE8DE]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filteredAlerts.length > 0 ? (
        <div className="space-y-4">
          {filteredAlerts.map((alert, index) => {
            const config = severityConfig[alert.severity];
            const typeInfo = typeConfig[alert.type];
            const SeverityIcon = config.icon;
            const TypeIcon = typeInfo.icon;

            return (
              <div
                key={alert.id}
                className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
                style={{ borderLeft: `4px solid ${config.accent}` }}
              >
                <div className="flex items-start gap-4">
                  <div className={`rounded-lg p-2 ${config.bgColor}`}>
                    <SeverityIcon size={20} className={config.color} />
                  </div>

                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${config.bgColor} ${config.color}`}
                      >
                        {config.label}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-[#F6F1EA] px-2 py-0.5 text-xs text-gray-500">
                        <TypeIcon size={12} />
                        {typeInfo.label}
                      </span>
                    </div>

                    <div className="mb-1">
                      <span className="font-medium text-gray-800">{alert.courseName}</span>
                      <span className="text-gray-400"> - </span>
                      <span className="text-gray-800">{alert.itemName}</span>
                    </div>

                    <p className="mb-2 text-sm text-gray-500">{alert.explanation}</p>

                    <div className="flex items-center justify-between gap-4">
                      <span className={`text-sm font-medium ${config.color}`}>{alert.context}</span>

                      <button
                        onClick={() => router.push(alert.actionPath)}
                        className="rounded-lg bg-[#5D737E] px-3 py-1.5 text-sm text-white transition hover:bg-[#4A5D66]"
                      >
                        {alert.actionLabel}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-100">
          <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-600" />
          <h3 className="mb-2 text-xl font-semibold text-gray-800">You&apos;re in good shape.</h3>
          <p className="mb-6 text-gray-500">
            No urgent academic risks across your saved courses.
          </p>
          <button
            onClick={() => router.push("/setup/dashboard")}
            className="rounded-xl bg-[#5D737E] px-6 py-3 text-white transition hover:bg-[#4A5D66]"
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
