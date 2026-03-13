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
  Trash2,
  X,
} from "lucide-react";
import {
  listCourses,
  getGoogleAuthUrl,
  exportToGoogleCalendar,
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
  due_date: string; // YYYY-MM-DD
  due_time?: string; // HH:mm
  type: DeadlineType;
  notes?: string;

  source: DeadlineSource;

  exported?: boolean;
  exported_at?: string;
};

const PENDING_DEADLINES_KEY = "evalio_pending_deadlines_v1"; // upload step can write here
const CONFIRMED_DEADLINES_KEY = "evalio_deadlines_confirmed_v1"; // { [course_id]: Deadline[] }

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
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(year, monthIndex, day);
}

function formatDateLabel(isoDate: string) {
  const d = parseDateOnly(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDaysRemaining(dueDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDateOnly(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function formatCountdown(days: number) {
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days left`;
}

function getCountdownColor(daysRemaining: number) {
  if (daysRemaining <= 3) return "text-red-600";
  if (daysRemaining <= 7) return "text-[#C8833F]";
  return "text-green-700";
}

function inferDeadlineType(title: string): DeadlineType {
  const lowered = title.toLowerCase();
  if (
    lowered.includes("assignment") ||
    lowered.includes("homework") ||
    lowered.includes("project")
  ) {
    return "Assignment";
  }
  if (lowered.includes("quiz")) return "Quiz";
  if (lowered.includes("exam") || lowered.includes("final")) return "Exam";
  if (lowered.includes("test") || lowered.includes("midterm")) return "Test";
  return "Other";
}

function normalizeDeadline(input: Partial<Deadline> & { title: string; due_date: string; type: DeadlineType }): Deadline {
  return {
    id: input.id ?? `deadline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    course_id: input.course_id ?? "",
    title: input.title,
    due_date: input.due_date,
    due_time: input.due_time || undefined,
    type: input.type,
    notes: input.notes || undefined,
    source: (input.source as DeadlineSource) ?? "Manual",
    exported: Boolean(input.exported),
    exported_at: input.exported_at || undefined,
  };
}

function mapApiDeadline(deadline: ApiDeadline): Deadline {
  return normalizeDeadline({
    id: deadline.deadline_id,
    course_id: deadline.course_id,
    title: deadline.title,
    due_date: deadline.due_date,
    due_time: deadline.due_time ?? undefined,
    type: inferDeadlineType(deadline.title),
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

  // extracted (preview mode)
  const [extractedDeadlines, setExtractedDeadlines] = useState<Deadline[]>([]);

  // saved / confirmed deadlines for course
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [selectedDeadlines, setSelectedDeadlines] = useState<Set<string>>(new Set());
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportWithReminder, setExportWithReminder] = useState(true);

  const [error, setError] = useState<string>("");

  // Check for Google Calendar OAuth callback
  useEffect(() => {
    const gcalConnected = searchParams.get("gcal_connected");
    const gcalError = searchParams.get("gcal_error");

    if (gcalConnected === "true") {
      setIsCalendarConnected(true);
      // Store in localStorage so it persists
      window.localStorage.setItem("evalio_gcal_connected", "true");
      // Clear the query param from URL
      router.replace("/setup/deadlines", { scroll: false });
    }

    if (gcalError) {
      setError(`Google Calendar connection failed: ${gcalError}`);
      router.replace("/setup/deadlines", { scroll: false });
    }

    // Check localStorage for previous connection
    const storedConnection = window.localStorage.getItem("evalio_gcal_connected");
    if (storedConnection === "true") {
      setIsCalendarConnected(true);
    }
  }, [searchParams, router]);

  const refreshDeadlines = useCallback(async (resolvedCourseId: string) => {
    const response = await listDeadlinesApi(resolvedCourseId);
    setDeadlines((response.deadlines ?? []).map(mapApiDeadline));
  }, []);

  // load course + initial data
  useEffect(() => {
    const run = async () => {
      try {
        const courses = await listCourses();
        const resolvedCourseId = ensureCourseIdFromList(courses);
        if (!resolvedCourseId) {
          setError("No course found. Complete structure first.");
          return;
        }

        const latest = courses.find((c) => c.course_id === resolvedCourseId);
        setCourseId(resolvedCourseId);
        const latestWithCourseName = latest as (Course & { course_name?: string }) | undefined;
        setCourseName(latestWithCourseName?.course_name ?? latest?.name ?? "Untitled course");

        await refreshDeadlines(resolvedCourseId);

        // load extracted/pending deadlines from localStorage (if any)
        const pending = safeParse<Array<Omit<Deadline, "id" | "course_id" | "source"> & Partial<Deadline>>>(
          window.localStorage.getItem(PENDING_DEADLINES_KEY)
        );

        const extracted = Array.isArray(pending)
          ? pending.map((d, i) =>
              normalizeDeadline({
                ...d,
                id: `extracted-${Date.now()}-${i}`,
                course_id: resolvedCourseId,
                source: "From Outline",
              })
            )
          : [];

        setExtractedDeadlines(extracted);
        setHasConfirmed(extracted.length === 0); // if no extracted, show confirmed mode
        setError("");
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to load deadlines."));
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayDeadlines = useMemo(() => {
    return hasConfirmed ? deadlines : extractedDeadlines;
  }, [hasConfirmed, deadlines, extractedDeadlines]);

  const sortedDisplayDeadlines = useMemo(() => {
    return [...displayDeadlines].sort(
      (a, b) => parseDateOnly(a.due_date).getTime() - parseDateOnly(b.due_date).getTime()
    );
  }, [displayDeadlines]);

  const selectAll = () => setSelectedDeadlines(new Set(displayDeadlines.map((d) => d.id)));
  const deselectAll = () => setSelectedDeadlines(new Set());
  const toggleSelection = (id: string) => {
    setSelectedDeadlines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmSave = async () => {
    if (!courseId) return;

    try {
      setError("");
      await Promise.all(
        extractedDeadlines.map((deadline) =>
          createDeadlineApi(courseId, {
            title: deadline.title,
            due_date: deadline.due_date,
            due_time: deadline.due_time ?? null,
            notes: deadline.notes ?? null,
          })
        )
      );

      await refreshDeadlines(courseId);
      setHasConfirmed(true);
      setExtractedDeadlines([]);
      window.localStorage.removeItem(PENDING_DEADLINES_KEY);
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save extracted deadlines."));
    }
  };

  const handleDiscardOCR = () => {
    setExtractedDeadlines([]);
    setHasConfirmed(true);
    window.localStorage.removeItem(PENDING_DEADLINES_KEY);
  };

  const handleAddManual = async (newDeadline: Omit<Deadline, "id" | "course_id" | "source" | "exported" | "exported_at">) => {
    if (!courseId) return;

    const deadline = normalizeDeadline({
      ...newDeadline,
      id: `deadline-${Date.now()}`,
      course_id: courseId,
      source: "Manual",
    });

    if (hasConfirmed) {
      try {
        setError("");
        await createDeadlineApi(courseId, {
          title: deadline.title,
          due_date: deadline.due_date,
          due_time: deadline.due_time ?? null,
          notes: deadline.notes ?? null,
        });
        await refreshDeadlines(courseId);
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to add deadline."));
        return;
      }
    } else {
      setExtractedDeadlines((prev) => [...prev, deadline]);
    }

    setShowAddModal(false);
  };

  const handleSaveEdits = async (id: string, updates: Partial<Deadline>) => {
    if (!courseId) return;

    if (hasConfirmed) {
      try {
        const existing = deadlines.find((deadline) => deadline.id === id);
        if (!existing) return;

        await updateDeadlineApi(courseId, id, {
          title: updates.title ?? existing.title,
          due_date: updates.due_date ?? existing.due_date,
          due_time:
            updates.due_time !== undefined
              ? updates.due_time ?? null
              : existing.due_time ?? null,
          notes:
            updates.notes !== undefined
              ? updates.notes ?? null
              : existing.notes ?? null,
        });
        await refreshDeadlines(courseId);
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to update deadline."));
        return;
      }
    } else {
      setExtractedDeadlines((prev) => prev.map((d) => (d.id === id ? normalizeDeadline({ ...d, ...updates }) : d)));
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!courseId) return;

    if (hasConfirmed) {
      try {
        await deleteDeadlineApi(courseId, id);
        await refreshDeadlines(courseId);
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to delete deadline."));
        return;
      }
    } else {
      setExtractedDeadlines((prev) => prev.filter((d) => d.id !== id));
    }
    setSelectedDeadlines((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (editingId === id) setEditingId(null);
  };

  const handleConnectCalendar = async () => {
    setIsConnecting(true);
    setError("");
    try {
      const { authorization_url } = await getGoogleAuthUrl();
      // Redirect to Google OAuth - will come back to /setup/deadlines?gcal_connected=true
      window.location.href = authorization_url;
    } catch (e) {
      const msg = getApiErrorMessage(e, "Failed to connect Google Calendar.");
      // If backend returns 501, it means Google Calendar is not configured
      if (msg.includes("not configured")) {
        setError("Google Calendar integration is not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.");
      } else {
        setError(msg);
      }
      setIsConnecting(false);
    }
  };

  const handleDisconnectCalendar = () => {
    setIsCalendarConnected(false);
    window.localStorage.removeItem("evalio_gcal_connected");
  };

  const handleExport = async () => {
    if (!courseId) return;

    setIsExporting(true);
    setError("");

    const ids = Array.from(selectedDeadlines);

    try {
      const result = await exportToGoogleCalendar(
        courseId,
        ids.length > 0 ? { deadlineIds: ids } : undefined
      );

      // Mark exported deadlines in local state
      const exportedIds = new Set(result.events.map((e) => e.deadline_id));

      const markExported = (d: Deadline) => {
        if (!exportedIds.has(d.id)) return d;
        return {
          ...d,
          exported: true,
          exported_at: new Date().toISOString(),
        };
      };

      if (hasConfirmed) {
        await refreshDeadlines(courseId);
      } else {
        setExtractedDeadlines((prev) => prev.map(markExported));
      }

      setSelectedDeadlines(new Set());
      setShowExportModal(false);

      // Show success message briefly
      if (result.exported_count > 0) {
        setError(""); // Clear any previous error
      }
    } catch (e) {
      const msg = getApiErrorMessage(e, "Failed to export to Google Calendar.");
      if (msg.includes("not configured")) {
        setError("Google Calendar integration is not configured. Please ask an admin to set it up.");
      } else if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
        setError("Google Calendar authorization expired. Please reconnect.");
        setIsCalendarConnected(false);
        window.localStorage.removeItem("evalio_gcal_connected");
      } else {
        setError(msg);
      }
    } finally {
      setIsExporting(false);
    }
  };

  if (!courseId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm text-center">
          <p className="text-sm text-gray-500">{error || "Please upload a course first."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-20">
      {/* Header */}
      <div className="mt-2">
        <h2 className="text-3xl font-bold text-gray-800">Deadline Management</h2>
        <p className="mt-2 text-gray-500 text-sm leading-relaxed">
          Review, edit, and export your assignments and tests.{" "}
          {!hasConfirmed ? "Nothing will be saved until you confirm." : "Your deadlines are saved locally for now."}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mt-4 rounded-2xl p-4 border border-red-200 bg-red-50">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Status row */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-800">{courseName}</div>
            <div className="text-xs text-gray-500 mt-1">Course deadlines</div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
            {!isCalendarConnected ? (
              <button
                type="button"
                onClick={handleConnectCalendar}
                disabled={isConnecting}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-[#5D737E] text-white hover:bg-[#4A5D66] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <LinkIcon size={14} />
                )}
                {isConnecting ? "Connecting..." : "Connect Google Calendar"}
              </button>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-green-50 text-green-700 border border-green-200">
                  <Check size={12} />
                  Connected
                </span>

                <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white text-gray-700 border border-gray-200">
                  Primary Calendar
                </span>

                <button
                  type="button"
                  onClick={handleDisconnectCalendar}
                  className="text-xs px-3 py-2 rounded-xl text-gray-500 hover:text-gray-700 transition"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Review banner */}
      {!hasConfirmed && extractedDeadlines.length > 0 && (
        <div className="mt-6 rounded-2xl p-4 border border-[#D7E7F0] bg-[#EEF6FB]">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-[#5D737E]" />
            <p className="text-sm font-semibold text-[#5D737E]">Review and confirm deadlines before saving.</p>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="mt-6 bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold text-gray-700">Deadlines</h3>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-[#5D737E] text-white hover:bg-[#4A5D66] transition"
          >
            <Plus size={16} />
            Add Deadline
          </button>
        </div>

        {/* Export controls */}
        {displayDeadlines.length > 0 && (
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4 pb-4 border-b border-[#E6E2DB]">
            <button
              type="button"
              onClick={selectedDeadlines.size === displayDeadlines.length ? deselectAll : selectAll}
              className="text-xs px-3 py-2 rounded-xl bg-[#F6F1EA] border border-gray-100 text-gray-700 hover:border-gray-200 transition"
            >
              {selectedDeadlines.size === displayDeadlines.length ? "Deselect All" : "Select All"}
            </button>

            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              disabled={!hasConfirmed || !isCalendarConnected || selectedDeadlines.size === 0}
              className={`text-xs px-3 py-2 rounded-xl transition ${
                !hasConfirmed || !isCalendarConnected || selectedDeadlines.size === 0
                  ? "bg-[#E6E2DB] text-gray-400 cursor-not-allowed"
                  : "bg-[#5D737E] text-white hover:bg-[#4A5D66]"
              }`}
            >
              Export Selected ({selectedDeadlines.size})
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedDeadlines(new Set(displayDeadlines.map((d) => d.id)));
                setShowExportModal(true);
              }}
              disabled={!hasConfirmed || !isCalendarConnected}
              className={`text-xs px-3 py-2 rounded-xl transition ${
                !hasConfirmed || !isCalendarConnected ? "bg-[#E6E2DB] text-gray-400 cursor-not-allowed" : "bg-[#5D737E] text-white hover:bg-[#4A5D66]"
              }`}
            >
              Export All
            </button>

            <span className="text-xs lg:ml-auto text-gray-500">
              Exports are idempotent; already-exported deadlines won&apos;t export twice.
            </span>
          </div>
        )}

        {/* List / empty */}
        {sortedDisplayDeadlines.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-[#C6B8A8]" />
            <p className="text-sm mb-4 text-gray-500">No deadlines detected from your outline.</p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-[#5D737E] text-white hover:bg-[#4A5D66] transition"
            >
              <Plus size={16} />
              Add Deadline
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedDisplayDeadlines.map((deadline) => (
              <DeadlineRow
                key={deadline.id}
                deadline={deadline}
                isEditing={editingId === deadline.id}
                isSelected={selectedDeadlines.has(deadline.id)}
                onToggleSelect={() => toggleSelection(deadline.id)}
                onEdit={() => setEditingId(deadline.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={(updates) => handleSaveEdits(deadline.id, updates)}
                onDelete={() => handleDelete(deadline.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm / continue actions */}
      {!hasConfirmed && extractedDeadlines.length > 0 && (
        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={handleDiscardOCR}
            className="px-4 py-3 text-sm rounded-xl bg-[#F6F1EA] border border-gray-100 text-gray-600 hover:border-gray-200 transition"
          >
            Discard OCR Results
          </button>
          <button
            type="button"
            onClick={handleConfirmSave}
            className="px-4 py-3 text-sm rounded-xl bg-[#5D737E] text-white hover:bg-[#4A5D66] transition"
          >
            Confirm and Save Deadlines
          </button>
        </div>
      )}

      {hasConfirmed && (
        <button
          type="button"
          onClick={() => router.push("/setup/dashboard")}
          className="mt-8 w-full bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition"
        >
          Continue to Dashboard
        </button>
      )}

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      <AddDeadlineModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddManual}
      />

      <ExportModal
        open={showExportModal}
        selectedCount={selectedDeadlines.size}
        deadlines={displayDeadlines.filter((d) => selectedDeadlines.has(d.id))}
        exportWithReminder={exportWithReminder}
        setExportWithReminder={setExportWithReminder}
        selectedCalendar="Primary Calendar"
        isLoading={isExporting}
        onClose={() => setShowExportModal(false)}
        onConfirm={handleExport}
      />
    </div>
  );
}

function DeadlineRow({
  deadline,
  isEditing,
  isSelected,
  onToggleSelect,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  deadline: Deadline;
  isEditing: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (updates: Partial<Deadline>) => void;
  onDelete: () => void;
}) {
  const [editTitle, setEditTitle] = useState(deadline.title);
  const [editDate, setEditDate] = useState(deadline.due_date);
  const [editTime, setEditTime] = useState(deadline.due_time ?? "");
  const [editType, setEditType] = useState<DeadlineType>(deadline.type);
  const [editNotes, setEditNotes] = useState(deadline.notes ?? "");

  useEffect(() => {
    // keep form in sync when switching rows
    setEditTitle(deadline.title);
    setEditDate(deadline.due_date);
    setEditTime(deadline.due_time ?? "");
    setEditType(deadline.type);
    setEditNotes(deadline.notes ?? "");
  }, [deadline]);

  const daysRemaining = getDaysRemaining(deadline.due_date);

  const handleSave = () => {
    if (!editTitle.trim() || !editDate) return;
    onSave({
      title: editTitle.trim(),
      due_date: editDate,
      due_time: editTime || undefined,
      type: editType,
      notes: editNotes.trim() || undefined,
    });
  };

  if (isEditing) {
    return (
      <div className="rounded-2xl p-4 bg-[#F6F1EA] border border-gray-100">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Title</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D7E7F0]"
              placeholder="e.g., Assignment 1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D7E7F0]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Time (optional)</label>
              <input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D7E7F0]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as DeadlineType)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D7E7F0]"
            >
              <option value="Assignment">Assignment</option>
              <option value="Test">Test</option>
              <option value="Exam">Exam</option>
              <option value="Quiz">Quiz</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D7E7F0]"
              placeholder="Anything you want to remember…"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-xl bg-[#5D737E] text-white hover:bg-[#4A5D66] transition"
            >
              <Check size={14} />
              Save
            </button>

            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-xl bg-white border border-gray-200 text-gray-600 hover:border-gray-300 transition"
            >
              <X size={14} />
              Cancel
            </button>

            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition sm:ml-auto"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-2xl bg-[#F6F1EA] border border-gray-100 hover:border-gray-200 transition cursor-pointer"
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" ? onEdit() : null)}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 h-4 w-4 accent-[#5D737E]"
      />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-gray-800 truncate">{deadline.title}</span>

          <span
            className={`px-2 py-0.5 rounded-full text-[11px] border ${
              deadline.source === "From Outline"
                ? "bg-[#EEF6FB] text-[#5D737E] border-[#D7E7F0]"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {deadline.source}
          </span>

          {deadline.exported ? (
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-green-50 text-green-700 border border-green-200">
              Exported
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} />
            {formatDateLabel(deadline.due_date)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            {deadline.due_time || "No time set"}
          </span>
          <span>{deadline.type}</span>
        </div>

        {deadline.exported_at ? (
          <div className="text-xs mt-1 text-[#C6B8A8]">
            Exported {new Date(deadline.exported_at).toLocaleDateString()}
          </div>
        ) : null}
      </div>

      <div className="text-right flex items-center gap-2">
        <div className={`text-sm font-semibold ${getCountdownColor(daysRemaining)}`}>
          {formatCountdown(daysRemaining)}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-white/60 transition"
          aria-label="Edit deadline"
        >
          <Edit2 size={16} />
        </button>
      </div>
    </div>
  );
}

function AddDeadlineModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (deadline: Omit<Deadline, "id" | "course_id" | "source" | "exported" | "exported_at">) => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [type, setType] = useState<DeadlineType>("Assignment");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    // reset each time it opens (feels clean)
    setTitle("");
    setDueDate("");
    setDueTime("");
    setType("Assignment");
    setNotes("");
  }, [open]);

  const canSubmit = title.trim().length > 0 && dueDate.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onAdd({
      title: title.trim(),
      due_date: dueDate,
      due_time: dueTime || undefined,
      type,
      notes: notes.trim() || undefined,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-800">Add Deadline</h3>
        <p className="mt-1 text-sm text-gray-500">Create a deadline manually.</p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D7E7F0]"
              placeholder="e.g., Lab 2"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D7E7F0]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Time (optional)</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D7E7F0]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DeadlineType)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D7E7F0]"
            >
              <option value="Assignment">Assignment</option>
              <option value="Test">Test</option>
              <option value="Exam">Exam</option>
              <option value="Quiz">Quiz</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#D7E7F0]"
              placeholder="Additional notes…"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 text-sm rounded-xl bg-[#F6F1EA] border border-gray-100 text-gray-600 hover:border-gray-200 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex-1 px-4 py-3 text-sm rounded-xl transition ${
              canSubmit ? "bg-[#5D737E] text-white hover:bg-[#4A5D66]" : "bg-[#E6E2DB] text-gray-400 cursor-not-allowed"
            }`}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportModal({
  open,
  selectedCount,
  deadlines,
  exportWithReminder,
  setExportWithReminder,
  selectedCalendar,
  isLoading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  selectedCount: number;
  deadlines: Deadline[];
  exportWithReminder: boolean;
  setExportWithReminder: (value: boolean) => void;
  selectedCalendar: string;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-800">Export to Google Calendar</h3>
        <p className="mt-1 text-sm text-gray-500">
          Exporting {selectedCount} deadline{selectedCount !== 1 ? "s" : ""} to{" "}
          <span className="font-semibold text-gray-700">{selectedCalendar}</span>.
        </p>

        <div className="mt-4 max-h-48 overflow-y-auto rounded-2xl bg-[#F6F1EA] border border-gray-100 p-4">
          {deadlines.map((d) => (
            <div key={d.id} className="text-sm text-gray-700 mb-2 last:mb-0">
              • {d.title} — {formatDateLabel(d.due_date)}
              {d.due_time ? ` @ ${d.due_time}` : ""}
            </div>
          ))}
        </div>

        <label className="mt-4 flex items-center gap-2 rounded-2xl bg-[#F6F1EA] border border-gray-100 p-4">
          <input
            type="checkbox"
            checked={exportWithReminder}
            onChange={(e) => setExportWithReminder(e.target.checked)}
            className="h-4 w-4 accent-[#5D737E]"
          />
          <span className="text-sm text-gray-700">Add 1-week reminder automatically</span>
        </label>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-3 text-sm rounded-xl bg-[#F6F1EA] border border-gray-100 text-gray-600 hover:border-gray-200 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-3 text-sm rounded-xl bg-[#5D737E] text-white hover:bg-[#4A5D66] transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Exporting...
              </>
            ) : (
              "Confirm Export"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
