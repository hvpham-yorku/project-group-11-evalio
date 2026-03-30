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
  Layers,
  Target,
  Zap,
} from "lucide-react";

import { getApiErrorMessage } from "@/lib/errors";
import {
  getPlanningAlerts,
  getWeeklyPlanner,
  type PlanningAlert,
  type PlanningAlertSeverity,
  type PlanningAlertType,
  type PlanningAlertsResponse,
  type WeeklyPlannerConflict,
  type WeeklyPlannerItem,
  type WeeklyPlannerResponse,
} from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";

// ─── Shared config ──────────────────────────────────────────────────────────

type ViewMode = "alerts" | "weekly";
const RESOLVED_OVERDUE_STORAGE_KEY = "evalio_resolved_overdue_deadlines";
type DisplayAlertSeverity = PlanningAlertSeverity | "submitted";
type DisplayAlertType = PlanningAlertType | "submitted";

type DisplayAlert = PlanningAlert & {
  displaySeverity: DisplayAlertSeverity;
  displayType: DisplayAlertType;
  displayMessage: string;
  displayContext: string;
  isSubmitted: boolean;
};

const SEVERITY_CONFIG = {
  critical: {
    color: "text-[#B86B6B]",
    bgColor: "bg-[#F9EAEA]",
    borderColor: "border-[#F1DCC4]",
    icon: AlertTriangle,
    label: "Critical",
    accent: "#B86B6B",
  },
  high: {
    color: "text-[#C9945F]",
    bgColor: "bg-[#FDF3E7]",
    borderColor: "border-[#F1DCC4]",
    icon: AlertCircle,
    label: "High",
    accent: "#C9945F",
  },
  medium: {
    color: "text-[#6B8BA8]",
    bgColor: "bg-[#E8EFF5]",
    borderColor: "border-[#C4D6E4]",
    icon: AlertCircle,
    label: "Medium",
    accent: "#6B8BA8",
  },
  low: {
    color: "text-[#6B9B7A]",
    bgColor: "bg-[#E8F5EE]",
    borderColor: "border-[#C4E4D0]",
    icon: AlertCircle,
    label: "Low",
    accent: "#6B9B7A",
  },
  submitted: {
    color: "text-[#6B9B7A]",
    bgColor: "bg-[#EAF4EC]",
    borderColor: "border-[#CFE3D5]",
    icon: CheckCircle,
    label: "Submitted",
    accent: "#6B9B7A",
  },
} as const;

const ALERT_TYPE_CONFIG: Record<
  DisplayAlertType,
  { label: string; icon: typeof Clock }
> = {
  overdue_deadline: { label: "Overdue", icon: Clock },
  near_term_deadline: { label: "Due Soon", icon: Calendar },
  impossible_target: { label: "Impossible Target", icon: Target },
  high_weight_ungraded: { label: "High-Weight Ungraded", icon: FileQuestion },
  submitted: { label: "Submitted", icon: CheckCircle },
};

function alertActionFor(alert: PlanningAlert): {
  label: string;
  path: string;
} {
  switch (alert.type) {
    case "overdue_deadline":
    case "near_term_deadline":
      return { label: "View Deadlines", path: "/setup/deadlines" };
    case "impossible_target":
      return { label: "Adjust Goals", path: "/setup/goals" };
    case "high_weight_ungraded":
      return { label: "View Grades", path: "/setup/grades" };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

// ─── Alert filter types ─────────────────────────────────────────────────────

type AlertFilterType =
  | "all"
  | "critical"
  | "overdue"
  | "due-soon"
  | "target-risk"
  | "ungraded"
  | "submitted";

// ─── Weekly filter types ────────────────────────────────────────────────────

type WeeklyFilterType = "all" | "conflicts" | "today" | "this-week";

const WEEKLY_FILTERS: Array<{ value: WeeklyFilterType; label: string }> = [
  { value: "all", label: "All" },
  { value: "conflicts", label: "Conflicts" },
  { value: "today", label: "Today" },
  { value: "this-week", label: "This Week" },
];

function matchesWeeklyFilter(
  item: WeeklyPlannerItem,
  filter: WeeklyFilterType,
  conflictItemIds: Set<string>,
  todayIso: string
): boolean {
  if (filter === "all") return true;
  if (filter === "conflicts") return conflictItemIds.has(item.deadline_id);
  if (filter === "today") return item.due_date === todayIso;
  if (filter === "this-week") return item.days_until_due >= 0 && item.days_until_due <= 6;
  return true;
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function RiskCenter() {
  const router = useRouter();
  const { setCourseId } = useSetupCourse();

  const [viewMode, setViewMode] = useState<ViewMode>("alerts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Alert state
  const [alertsData, setAlertsData] = useState<PlanningAlertsResponse | null>(null);
  const [alertFilter, setAlertFilter] = useState<AlertFilterType>("all");
  const [resolvedOverdueIds, setResolvedOverdueIds] = useState<string[]>([]);
  const [showUndoBanner, setShowUndoBanner] = useState(false);

  // Weekly state
  const [weeklyData, setWeeklyData] = useState<WeeklyPlannerResponse | null>(null);
  const [weeklyFilter, setWeeklyFilter] = useState<WeeklyFilterType>("all");

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(RESOLVED_OVERDUE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setResolvedOverdueIds(
          parsed.filter((value): value is string => typeof value === "string")
        );
      }
    } catch {
      window.localStorage.removeItem(RESOLVED_OVERDUE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      RESOLVED_OVERDUE_STORAGE_KEY,
      JSON.stringify(resolvedOverdueIds)
    );
  }, [resolvedOverdueIds]);

  useEffect(() => {
    if (!showUndoBanner) return;
    const timeoutId = window.setTimeout(() => {
      setShowUndoBanner(false);
    }, 6000);
    return () => window.clearTimeout(timeoutId);
  }, [showUndoBanner]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [alertsResponse, weeklyResponse] = await Promise.all([
          getPlanningAlerts(),
          getWeeklyPlanner(),
        ]);
        setAlertsData(alertsResponse);
        setWeeklyData(weeklyResponse);
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to load risk center."));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Alert derived data ──────────────────────────────────────────────────

  const alerts = useMemo(
    () => alertsData?.alerts ?? [],
    [alertsData]
  );

  const displayAlerts = useMemo<DisplayAlert[]>(() => {
    return alerts.map((alert) => {
      const isSubmitted =
        alert.type === "overdue_deadline" &&
        typeof alert.deadline_id === "string" &&
        resolvedOverdueIds.includes(alert.deadline_id);

      let displayContext = alert.message;
      if (alert.type === "overdue_deadline" && alert.hours_overdue != null) {
        const hours = Math.round(alert.hours_overdue);
        displayContext =
          hours >= 24
            ? `Overdue by ${Math.floor(hours / 24)} day${Math.floor(hours / 24) !== 1 ? "s" : ""}`
            : `Overdue by ${hours} hour${hours !== 1 ? "s" : ""}`;
      } else if (
        alert.type === "near_term_deadline" &&
        alert.hours_until_due != null
      ) {
        const hours = Math.round(alert.hours_until_due);
        if (hours <= 1) displayContext = "Due within the hour";
        else if (hours < 24) displayContext = `Due in ${hours} hours`;
        else {
          const days = Math.floor(hours / 24);
          displayContext =
            days === 0
              ? "Due today"
              : days === 1
                ? "Due tomorrow"
                : `Due in ${days} days`;
        }
      } else if (alert.type === "impossible_target") {
        displayContext = `Target ${alert.target ?? ""}% is not achievable (max possible: ${alert.maximum_possible?.toFixed(1) ?? "?"}%)`;
      } else if (alert.type === "high_weight_ungraded") {
        displayContext = `Worth ${alert.assessment_weight ?? "?"}% of final grade`;
      }

      return {
        ...alert,
        displaySeverity: isSubmitted ? "submitted" : alert.severity,
        displayType: isSubmitted ? "submitted" : alert.type,
        displayMessage: isSubmitted
          ? "Marked as submitted and removed from active overdue risks."
          : alert.message,
        displayContext: isSubmitted ? "Submitted" : displayContext,
        isSubmitted,
      };
    });
  }, [alerts, resolvedOverdueIds]);

  const filteredAlerts = useMemo(() => {
    return displayAlerts.filter((alert) => {
      if (alertFilter === "submitted") {
        return alert.displayType === "submitted";
      }
      if (alert.isSubmitted) return false;
      if (alertFilter === "all") return true;
      if (alertFilter === "critical") return alert.displaySeverity === "critical";
      if (alertFilter === "overdue") return alert.displayType === "overdue_deadline";
      if (alertFilter === "due-soon") return alert.displayType === "near_term_deadline";
      if (alertFilter === "target-risk") return alert.displayType === "impossible_target";
      if (alertFilter === "ungraded") return alert.displayType === "high_weight_ungraded";
      return true;
    });
  }, [alertFilter, displayAlerts]);

  const criticalCount = displayAlerts.filter(
    (alert) => alert.displaySeverity === "critical" && !alert.isSubmitted
  ).length;
  const dueSoonCount = displayAlerts.filter(
    (alert) => alert.displayType === "near_term_deadline"
  ).length;
  const impossibleCount = displayAlerts.filter(
    (alert) => alert.displayType === "impossible_target"
  ).length;
  const ungradedCount = displayAlerts.filter(
    (alert) => alert.displayType === "high_weight_ungraded"
  ).length;
  const submittedCount = displayAlerts.filter(
    (alert) => alert.displayType === "submitted"
  ).length;

  // ── Weekly derived data ─────────────────────────────────────────────────

  const weeklyItems = useMemo(
    () => weeklyData?.items ?? [],
    [weeklyData]
  );
  const weeklyConflicts = useMemo(
    () => weeklyData?.conflicts ?? [],
    [weeklyData]
  );
  const weeklySummary = weeklyData?.summary;

  const conflictItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conflict of weeklyConflicts) {
      for (const item of conflict.items) {
        ids.add(item.deadline_id);
      }
    }
    return ids;
  }, [weeklyConflicts]);

  const todayIso = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  const filteredWeeklyItems = useMemo(
    () =>
      weeklyItems.filter((item) =>
        matchesWeeklyFilter(item, weeklyFilter, conflictItemIds, todayIso)
      ),
    [weeklyItems, weeklyFilter, conflictItemIds, todayIso]
  );

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleAlertAction = (alert: PlanningAlert) => {
    setCourseId(alert.course_id);
    const action = alertActionFor(alert);
    router.push(action.path);
  };

  const handleResolveOverdue = (deadlineId: string) => {
    setResolvedOverdueIds((current) =>
      current.includes(deadlineId) ? current : [...current, deadlineId]
    );
    setShowUndoBanner(true);
  };

  const handleUndoResolved = () => {
    setResolvedOverdueIds([]);
    setShowUndoBanner(false);
  };

  const handleRestoreSubmitted = (deadlineId: string) => {
    setResolvedOverdueIds((current) => current.filter((id) => id !== deadlineId));
  };

  // ── Loading ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 text-sm text-[#6B6560]">Loading risk center...</div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h2 className="mb-2 text-2xl font-bold text-[#3A3530]">
          Risk &amp; Alerts Center
        </h2>
        <p className="text-[#6B6560]">
          See urgent academic issues across all your courses in one place.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-[#B86B6B]">{error}</p>
        ) : null}
      </div>

      {/* Segmented toggle */}
      <div className="mb-6">
        <div className="inline-flex rounded-lg border border-[#D4CFC7] bg-[#F5F1EB] p-1">
          <button
            onClick={() => setViewMode("alerts")}
            className={`rounded-md px-5 py-2 text-sm font-medium transition ${
              viewMode === "alerts"
                ? "bg-[#5F7A8A] text-white shadow-sm"
                : "text-[#6B6560] hover:text-[#3A3530]"
            }`}
          >
            Risk Alerts
          </button>
          <button
            onClick={() => setViewMode("weekly")}
            className={`rounded-md px-5 py-2 text-sm font-medium transition ${
              viewMode === "weekly"
                ? "bg-[#5F7A8A] text-white shadow-sm"
                : "text-[#6B6560] hover:text-[#3A3530]"
            }`}
          >
            Weekly Overview
          </button>
        </div>
      </div>

      {viewMode === "alerts" ? (
        <AlertsView
          alerts={filteredAlerts}
          criticalCount={criticalCount}
          dueSoonCount={dueSoonCount}
          impossibleCount={impossibleCount}
          ungradedCount={ungradedCount}
          submittedCount={submittedCount}
          activeFilter={alertFilter}
          onFilterChange={setAlertFilter}
          onAlertAction={handleAlertAction}
          resolvedCount={resolvedOverdueIds.length}
          showUndoBanner={showUndoBanner}
          onUndoResolved={handleUndoResolved}
          onResolveOverdue={handleResolveOverdue}
          onRestoreSubmitted={handleRestoreSubmitted}
          onNavigateDashboard={() => router.push("/setup/dashboard")}
        />
      ) : (
        <WeeklyView
          items={filteredWeeklyItems}
          conflicts={weeklyConflicts}
          summary={weeklySummary}
          activeFilter={weeklyFilter}
          onFilterChange={setWeeklyFilter}
          onItemClick={(item) => {
            setCourseId(item.course_id);
            router.push("/setup/deadlines");
          }}
          onNavigateDashboard={() => router.push("/setup/dashboard")}
        />
      )}
    </div>
  );
}

// ─── Alerts View ────────────────────────────────────────────────────────────

function AlertsView({
  alerts,
  criticalCount,
  dueSoonCount,
  impossibleCount,
  ungradedCount,
  submittedCount,
  activeFilter,
  onFilterChange,
  onAlertAction,
  resolvedCount,
  showUndoBanner,
  onUndoResolved,
  onResolveOverdue,
  onRestoreSubmitted,
  onNavigateDashboard,
}: {
  alerts: DisplayAlert[];
  criticalCount: number;
  dueSoonCount: number;
  impossibleCount: number;
  ungradedCount: number;
  submittedCount: number;
  activeFilter: AlertFilterType;
  onFilterChange: (f: AlertFilterType) => void;
  onAlertAction: (a: PlanningAlert) => void;
  resolvedCount: number;
  showUndoBanner: boolean;
  onUndoResolved: () => void;
  onResolveOverdue: (deadlineId: string) => void;
  onRestoreSubmitted: (deadlineId: string) => void;
  onNavigateDashboard: () => void;
}) {
  return (
    <>
      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { value: criticalCount, label: "Critical Alerts", color: "text-[#B86B6B]" },
          { value: dueSoonCount, label: "Due in 72 Hours", color: "text-[#C9945F]" },
          { value: impossibleCount, label: "Impossible Targets", color: "text-[#C9945F]" },
          { value: ungradedCount, label: "High-Weight Ungraded", color: "text-[#6B8BA8]" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[#D4CFC7] bg-white p-5 text-center shadow-sm"
          >
            <div className={`mb-1 text-3xl font-semibold ${card.color}`}>
              {card.value}
            </div>
            <div className="text-sm text-[#6B6560]">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {[
            { value: "all", label: "All" },
            { value: "critical", label: "Critical" },
            { value: "overdue", label: "Overdue" },
            { value: "due-soon", label: "Due Soon" },
            { value: "target-risk", label: "Target Risk" },
            { value: "ungraded", label: "Ungraded" },
            { value: "submitted", label: `Submitted (${submittedCount})` },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => onFilterChange(filter.value as AlertFilterType)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeFilter === filter.value
                  ? "bg-[#5F7A8A] text-white"
                  : "border border-[#D4CFC7] bg-[#F5F1EB] text-[#6B6560] hover:bg-[#E8E3DC]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        {showUndoBanner && resolvedCount > 0 ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#D4CFC7] bg-white px-4 py-3 text-sm text-[#6B6560]">
            <span>
              {resolvedCount} overdue alert
              {resolvedCount !== 1 ? "s" : ""} marked as submitted.
            </span>
            <button
              onClick={onUndoResolved}
              className="rounded-lg border border-[#D4CFC7] px-3 py-1.5 text-sm font-medium text-[#5F7A8A] transition hover:bg-[#F5F1EB]"
            >
              Undo All
            </button>
          </div>
        ) : null}
      </div>

      {/* Alert cards */}
      {alerts.length > 0 ? (
        <div className="space-y-4">
          {alerts.map((alert) => {
            const config =
              SEVERITY_CONFIG[alert.displaySeverity] ?? SEVERITY_CONFIG.medium;
            const typeInfo =
              ALERT_TYPE_CONFIG[alert.displayType] ?? ALERT_TYPE_CONFIG.high_weight_ungraded;
            const SeverityIcon = config.icon;
            const TypeIcon = typeInfo.icon;
            const action = alertActionFor(alert);

            return (
              <div
                key={alert.alert_id}
                className={`rounded-2xl border bg-white p-6 shadow-sm ${config.borderColor}`}
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
                      <span className="inline-flex items-center gap-1 rounded bg-[#F5F1EB] px-2 py-0.5 text-xs text-[#6B6560]">
                        <TypeIcon size={12} />
                        {typeInfo.label}
                      </span>
                    </div>

                    <div className="mb-1">
                      <span className="font-medium text-[#3A3530]">
                        {alert.course_name}
                      </span>
                      <span className="text-[#C4B5A6]"> - </span>
                      <span className="text-[#3A3530]">{alert.item_label}</span>
                    </div>

                    <p className="mb-2 text-sm text-[#6B6560]">
                      {alert.displayMessage}
                    </p>

                    <div className="flex items-center justify-between gap-4">
                      <span className={`text-sm font-medium ${config.color}`}>
                        {alert.displayContext}
                      </span>
                      <div className="flex items-center gap-2">
                        {alert.displayType === "overdue_deadline" && alert.deadline_id ? (
                          <button
                            onClick={() => onResolveOverdue(alert.deadline_id!)}
                            className="rounded-lg border border-[#D4CFC7] bg-white px-3 py-1.5 text-sm text-[#6B6560] transition hover:bg-[#F5F1EB]"
                          >
                            Mark Submitted
                          </button>
                        ) : null}
                        {alert.displayType === "submitted" && alert.deadline_id ? (
                          <button
                            onClick={() => onRestoreSubmitted(alert.deadline_id!)}
                            className="rounded-lg border border-[#D4CFC7] bg-white px-3 py-1.5 text-sm text-[#6B6560] transition hover:bg-[#F5F1EB]"
                          >
                            Undo Submit
                          </button>
                        ) : null}
                        <button
                          onClick={() => onAlertAction(alert)}
                          className="rounded-lg bg-[#5F7A8A] px-3 py-1.5 text-sm text-white transition hover:bg-[#6B8BA8]"
                        >
                          {action.label}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          message="No urgent academic risks across your saved courses."
          onNavigate={onNavigateDashboard}
        />
      )}
    </>
  );
}

// ─── Weekly View ────────────────────────────────────────────────────────────

function WeeklyView({
  items,
  conflicts,
  summary,
  activeFilter,
  onFilterChange,
  onItemClick,
  onNavigateDashboard,
}: {
  items: WeeklyPlannerItem[];
  conflicts: WeeklyPlannerConflict[];
  summary: WeeklyPlannerResponse["summary"] | undefined;
  activeFilter: WeeklyFilterType;
  onFilterChange: (f: WeeklyFilterType) => void;
  onItemClick: (item: WeeklyPlannerItem) => void;
  onNavigateDashboard: () => void;
}) {
  const busiestLabel = summary?.busiest_day
    ? formatDate(summary.busiest_day.date)
    : "None";

  return (
    <>
      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            value: summary?.item_count ?? 0,
            label: "Items This Week",
            color: "text-[#5F7A8A]",
          },
          {
            value: summary?.course_count ?? 0,
            label: "Courses Involved",
            color: "text-[#6B8BA8]",
          },
          {
            value: summary?.conflict_count ?? 0,
            label: "Conflicts",
            color:
              (summary?.conflict_count ?? 0) > 0
                ? "text-[#C9945F]"
                : "text-[#6B9B7A]",
          },
          {
            value: busiestLabel,
            label: "Busiest Day",
            color: "text-[#3A3530]",
            small: true,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[#D4CFC7] bg-white p-5 text-center shadow-sm"
          >
            <div
              className={`mb-1 font-semibold ${card.color} ${
                "small" in card && card.small ? "text-lg" : "text-3xl"
              }`}
            >
              {card.value}
            </div>
            <div className="text-sm text-[#6B6560]">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {WEEKLY_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => onFilterChange(filter.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeFilter === filter.value
                  ? "bg-[#5F7A8A] text-white"
                  : "border border-[#D4CFC7] bg-[#F5F1EB] text-[#6B6560] hover:bg-[#E8E3DC]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conflict blocks */}
      {activeFilter !== "today" && conflicts.length > 0 && (
        <div className="mb-6 space-y-3">
          {conflicts.map((conflict) => {
            const config =
              conflict.severity === "high"
                ? SEVERITY_CONFIG.high
                : SEVERITY_CONFIG.medium;
            return (
              <div
                key={conflict.conflict_id}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${config.borderColor}`}
                style={{ borderLeft: `4px solid ${config.accent}` }}
              >
                <div className="flex items-start gap-3">
                  <div className={`rounded-lg p-2 ${config.bgColor}`}>
                    <Zap size={18} className={config.color} />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${config.bgColor} ${config.color}`}
                      >
                        {config.label} Conflict
                      </span>
                      <span className="text-xs text-[#6B6560]">
                        {conflict.item_count} items &middot;{" "}
                        {conflict.course_count} course
                        {conflict.course_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="mb-2 text-sm text-[#6B6560]">
                      {conflict.reason}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {conflict.items.map((ci) => (
                        <span
                          key={ci.deadline_id}
                          className="rounded bg-[#F5F1EB] px-2 py-1 text-xs text-[#3A3530]"
                        >
                          {ci.course_name} &mdash; {ci.title}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Item list */}
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => {
            const isConflict = conflicts.some((c) =>
              c.items.some((ci) => ci.deadline_id === item.deadline_id)
            );
            return (
              <button
                key={item.deadline_id}
                onClick={() => onItemClick(item)}
                className={`w-full rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:shadow-md ${
                  isConflict
                    ? "border-[#F1DCC4]"
                    : "border-[#D4CFC7]"
                }`}
                style={
                  isConflict
                    ? { borderLeft: "4px solid #C9945F" }
                    : undefined
                }
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-[#E8EFF5] p-2">
                    <Layers size={18} className="text-[#5F7A8A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-[#3A3530] truncate">
                        {item.course_name}
                      </span>
                      <span className="text-[#C4B5A6]">&mdash;</span>
                      <span className="text-[#3A3530] truncate">
                        {item.title}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B6560]">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(item.due_date)}
                        {item.due_time ? ` at ${formatTime(item.due_time)}` : ""}
                      </span>
                      {item.assessment_weight != null && (
                        <span className="inline-flex items-center gap-1">
                          <Target size={12} />
                          {item.assessment_weight}% weight
                        </span>
                      )}
                      {item.assessment_name && (
                        <span className="rounded bg-[#F5F1EB] px-1.5 py-0.5">
                          {item.assessment_name}
                        </span>
                      )}
                      {isConflict && (
                        <span className="inline-flex items-center gap-1 text-[#C9945F] font-medium">
                          <Zap size={12} />
                          Conflict
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm shrink-0">
                    {item.days_until_due === 0 ? (
                      <span className="font-medium text-[#B86B6B]">Today</span>
                    ) : item.days_until_due === 1 ? (
                      <span className="font-medium text-[#C9945F]">
                        Tomorrow
                      </span>
                    ) : (
                      <span className="text-[#6B6560]">
                        {item.days_until_due}d
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          message="No upcoming items for this week."
          onNavigate={onNavigateDashboard}
        />
      )}
    </>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState({
  message,
  onNavigate,
}: {
  message: string;
  onNavigate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#D4CFC7] bg-white p-12 text-center shadow-sm">
      <CheckCircle className="mx-auto mb-4 h-16 w-16 text-[#6B9B7A]" />
      <h3 className="mb-2 text-xl font-semibold text-[#3A3530]">
        You&apos;re in good shape.
      </h3>
      <p className="mb-6 text-[#6B6560]">{message}</p>
      <button
        onClick={onNavigate}
        className="rounded-xl bg-[#5F7A8A] px-6 py-3 text-white transition hover:bg-[#6B8BA8]"
      >
        Go to Dashboard
      </button>
    </div>
  );
}
