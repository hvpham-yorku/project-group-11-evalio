"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Edit2,
  Link as LinkIcon,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
  FileSearch,
  Sparkles,
} from "lucide-react";
import {
  listCourses,
  getGoogleAuthUrl,
  getGoogleCalendarStatus,
  exportToGoogleCalendar,
  getMinimumRequired,
  listDeadlines as listDeadlinesApi,
  createDeadline as createDeadlineApi,
  updateDeadline as updateDeadlineApi,
  deleteDeadline as deleteDeadlineApi,
  type Course,
  type Deadline as ApiDeadline,
} from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";
import { getApiErrorMessage } from "@/lib/errors";

type DeadlineType = "Assignment" | "Test" | "Exam" | "Quiz" | "Other";
type DeadlineSource = "From Outline" | "Manual";

type Deadline = {
  id: string;
  course_id: string;
  title: string;
  assessment_name?: string;
  due_date: string;
  due_time?: string;
  type: DeadlineType;
  notes?: string;
  source: DeadlineSource;
  exported?: boolean;
  exported_at?: string;
};

const PENDING_DEADLINES_KEY = "evalio_pending_deadlines_v1";
const TARGET_STORAGE_KEY = "evalio_target_grade";
const DEFAULT_TARGET_GRADE = 85;
const GCAL_CONNECTED_KEY = "evalio_gcal_connected";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDateLabel(isoDate: string) {
  const d = parseDateOnly(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDaysRemaining(dueDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDateOnly(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatCountdown(days: number) {
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days left`;
}

function normalizeDeadline(input: any): Deadline {
  return {
    id:
      input.id ??
      `deadline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    course_id: input.course_id ?? "",
    title: input.title,
    assessment_name: input.assessment_name ?? input.title,
    due_date: input.due_date,
    due_time: input.due_time || undefined,
    type: input.type,
    notes: input.notes || undefined,
    source: input.source ?? "Manual",
    exported: Boolean(input.exported),
    exported_at: input.exported_at || undefined,
  };
}

function mapApiDeadline(deadline: ApiDeadline): Deadline {
  return normalizeDeadline({
    id: deadline.deadline_id,
    course_id: deadline.course_id,
    title: deadline.title,
    assessment_name: deadline.assessment_name ?? deadline.title,
    due_date: deadline.due_date,
    due_time: deadline.due_time ?? undefined,
    type: deadline.deadline_type as DeadlineType,
    notes: deadline.notes ?? undefined,
    source: deadline.source === "outline" ? "From Outline" : "Manual",
    exported: deadline.exported_to_gcal,
  });
}

export default function DeadlinesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ensureCourseIdFromList } = useSetupCourse();

  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState<string>("");
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [extractedDeadlines, setExtractedDeadlines] = useState<Deadline[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDeadlines, setSelectedDeadlines] = useState<Set<string>>(
    new Set()
  );
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [error, setError] = useState<string>("");

  const refreshGoogleCalendarStatus = useCallback(async () => {
    try {
      const { connected } = await getGoogleCalendarStatus();
      setIsCalendarConnected(connected);
      connected
        ? window.localStorage.setItem(GCAL_CONNECTED_KEY, "true")
        : window.localStorage.removeItem(GCAL_CONNECTED_KEY);
      return connected;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const gcalConnected = searchParams.get("gcal_connected");
    if (gcalConnected === "true") {
      setIsCalendarConnected(true);
      window.localStorage.setItem(GCAL_CONNECTED_KEY, "true");
      void refreshGoogleCalendarStatus();
      router.replace("/setup/deadlines", { scroll: false });
    }
    void refreshGoogleCalendarStatus();
  }, [searchParams, router, refreshGoogleCalendarStatus]);

  const refreshDeadlines = useCallback(async (resolvedCourseId: string) => {
    const response = await listDeadlinesApi(resolvedCourseId);
    setDeadlines((response.deadlines ?? []).map(mapApiDeadline));
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const courses = await listCourses();
        const resolvedCourseId = ensureCourseIdFromList(courses);
        if (!resolvedCourseId) return;
        const latest = courses.find((c) => c.course_id === resolvedCourseId);
        setCourseId(resolvedCourseId);
        setCourseName((latest as any)?.course_name ?? latest?.name ?? "Course");
        await refreshDeadlines(resolvedCourseId);
        const pending = safeParse<any[]>(
          window.localStorage.getItem(PENDING_DEADLINES_KEY)
        );
        const extracted = (pending || []).map((d, i) =>
          normalizeDeadline({
            ...d,
            source: "From Outline",
            course_id: resolvedCourseId,
          })
        );
        setExtractedDeadlines(extracted);
        setHasConfirmed(extracted.length === 0);
      } catch (e) {
        setError(getApiErrorMessage(e, "Error loading deadlines."));
      }
    };
    run();
  }, [ensureCourseIdFromList, refreshDeadlines]);

  const displayDeadlines = useMemo(
    () => (hasConfirmed ? deadlines : extractedDeadlines),
    [hasConfirmed, deadlines, extractedDeadlines]
  );
  const sortedDisplayDeadlines = useMemo(
    () =>
      [...displayDeadlines].sort(
        (a, b) =>
          parseDateOnly(a.due_date).getTime() -
          parseDateOnly(b.due_date).getTime()
      ),
    [displayDeadlines]
  );

  const handleConfirmSave = async () => {
    if (!courseId) return;
    try {
      await Promise.all(
        extractedDeadlines.map((d) =>
          createDeadlineApi(courseId, {
            title: d.title,
            deadline_type: d.type,
            assessment_name: d.assessment_name ?? d.title,
            due_date: d.due_date,
            due_time: d.due_time ?? null,
            notes: d.notes ?? null,
          })
        )
      );
      await refreshDeadlines(courseId);
      setHasConfirmed(true);
      setExtractedDeadlines([]);
      window.localStorage.removeItem(PENDING_DEADLINES_KEY);
    } catch (e) {
      setError(getApiErrorMessage(e, "Error saving deadlines."));
    }
  };

  const handleConnectCalendar = async () => {
    setIsConnecting(true);
    try {
      const { authorization_url } = await getGoogleAuthUrl();
      window.location.href = authorization_url;
    } catch {
      setIsConnecting(false);
    }
  };

  const handleExport = async () => {
    if (!courseId) return;
    setIsExporting(true);
    const ids = Array.from(selectedDeadlines);
    try {
      await exportToGoogleCalendar(courseId, {
        deadlineIds: ids.length > 0 ? ids : undefined,
      });
      await refreshDeadlines(courseId);
      setSelectedDeadlines(new Set());
      setShowExportModal(false);
    } catch (e) {
      setError(getApiErrorMessage(e, "Export failed."));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pb-20">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-[#3A3530]">Deadline Assistant</h2>
        <p className="mt-2 text-sm text-[#6B6560]">
          {hasConfirmed
            ? "Review and sync your academic schedule."
            : "Confirm the deadlines extracted from your outline."}
        </p>
      </div>

      <div className="flex items-center gap-4 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        {[
          {
            step: 1,
            label: "Review Results",
            active: !hasConfirmed,
            icon: <FileSearch size={14} />,
          },
          {
            step: 2,
            label: "Verify Storage",
            active: hasConfirmed && !isCalendarConnected,
            icon: <ShieldCheck size={14} />,
          },
          {
            step: 3,
            label: "Export Calendar",
            active: isCalendarConnected,
            icon: <Sparkles size={14} />,
          },
        ].map((s) => (
          <div key={s.step} className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                s.active
                  ? "border-[#5F7A8A] bg-[#5F7A8A] text-white shadow-md"
                  : "border-[#E8E3DC] bg-[#F5F1EB] text-[#6B6560]"
              }`}
            >
              {s.icon} {s.label}
            </div>
            {s.step < 3 && <div className="h-[1px] w-4 bg-[#E8E3DC]" />}
          </div>
        ))}
      </div>

      <div className="rounded-[2rem] border border-[#D4CFC7] bg-[#FFFFFF] p-8 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-lg font-bold text-[#3A3530]">{courseName}</h3>
            <p className="text-xs text-[#6B6560]">
              Total Deadlines: {displayDeadlines.length}
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-[#5F7A8A] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            <Plus size={18} /> New Deadline
          </button>
        </div>

        {sortedDisplayDeadlines.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-[#E8E3DC] bg-[#F5F1EB] py-20 text-center">
            <Calendar size={48} className="mx-auto mb-4 text-[#C4B5A6]" />
            <p className="font-medium text-[#6B6560]">
              No deadlines found. Add one to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedDisplayDeadlines.map((d) => (
              <DeadlineRow
                key={d.id}
                deadline={d}
                isSelected={selectedDeadlines.has(d.id)}
                onToggleSelect={() =>
                  setSelectedDeadlines((p) => {
                    const n = new Set(p);
                    n.has(d.id) ? n.delete(d.id) : n.add(d.id);
                    return n;
                  })
                }
              />
            ))}
          </div>
        )}

        {displayDeadlines.length > 0 && (
          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[#E8E3DC] pt-8 md:flex-row">
            {!isCalendarConnected ? (
              <button
                onClick={handleConnectCalendar}
                disabled={isConnecting}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#5F7A8A] px-8 py-4 font-bold text-white shadow-xl md:w-auto"
              >
                {isConnecting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <LinkIcon size={18} />
                )}
                Sync to Google Calendar
              </button>
            ) : (
              <button
                onClick={() => setShowExportModal(true)}
                disabled={selectedDeadlines.size === 0}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#5F7A8A] px-8 py-4 font-bold text-white shadow-lg disabled:opacity-50 md:w-auto"
              >
                Export Selected ({selectedDeadlines.size})
              </button>
            )}
            <p className="text-xs italic text-[#6B6560]">
              Select individual items to export them selectively.
            </p>
          </div>
        )}
      </div>

      {!hasConfirmed && extractedDeadlines.length > 0 && (
        <div className="mt-8 flex animate-in zoom-in-95 flex-col items-center justify-between gap-6 rounded-[2rem] bg-[#5F7A8A] p-8 text-white shadow-2xl fade-in md:flex-row">
          <div>
            <h4 className="text-xl font-bold">Review AI Extraction</h4>
            <p className="text-sm text-white/70">
              We&apos;ve pre-filled your schedule. Review the list above and
              confirm to save.
            </p>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button
              onClick={() => {
                setExtractedDeadlines([]);
                setHasConfirmed(true);
                window.localStorage.removeItem(PENDING_DEADLINES_KEY);
              }}
              className="flex-1 rounded-xl bg-white/10 px-6 py-3 font-bold transition hover:bg-white/20 md:flex-none"
            >
              Discard
            </button>
            <button
              onClick={handleConfirmSave}
              className="flex-1 rounded-xl bg-white px-8 py-3 font-bold text-[#5F7A8A] shadow-lg transition-all hover:scale-105 active:scale-95 md:flex-none"
            >
              Looks Correct
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeadlineRow({
  deadline,
  isSelected,
  onToggleSelect,
}: {
  deadline: Deadline;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const days = getDaysRemaining(deadline.due_date);
  return (
    <div
      className={`group flex items-center gap-4 p-5 rounded-2xl border transition-all ${
        isSelected
          ? "border-[#C4D6E4] bg-[#E8EFF5]"
          : "border-[#E8E3DC] bg-[#FFFFFF] hover:border-[#D4CFC7]"
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="h-5 w-5 cursor-pointer rounded-lg accent-[#5F7A8A]"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-bold text-[#3A3530]">{deadline.title}</h4>
          <span
            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
              deadline.source === "From Outline"
                ? "bg-[#E8EFF5] text-[#6B8BA8]"
                : "bg-[#F5F1EB] text-[#6B6560]"
            }`}
          >
            {deadline.source === "From Outline" ? "AI Identified" : "Manual"}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#6B6560]">
          <span className="flex items-center gap-1">
            <Calendar size={12} /> {formatDateLabel(deadline.due_date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} /> {deadline.due_time || "No Time"}
          </span>
        </div>
      </div>
      <div
        className={`text-sm font-black text-right ${
          days <= 3
            ? "text-[#B86B6B]"
            : days <= 7
            ? "text-[#C9945F]"
            : "text-[#6B9B7A]"
        }`}
      >
        {formatCountdown(days)}
      </div>
    </div>
  );
}
