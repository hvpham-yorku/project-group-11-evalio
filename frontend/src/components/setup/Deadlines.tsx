"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Link as LinkIcon,
  Loader2,
  Pencil,
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
  listDeadlines as listDeadlinesApi,
  createDeadline as createDeadlineApi,
  deleteDeadline as deleteDeadlineApi,
  updateDeadline as updateDeadlineApi,
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

type DeadlineFormState = {
  title: string;
  assessment_name: string;
  due_date: string;
  due_time: string;
  type: DeadlineType;
  notes: string;
};

const PENDING_DEADLINES_KEY = "evalio_pending_deadlines_v1";
const GCAL_CONNECTED_KEY = "evalio_gcal_connected";

const EMPTY_DEADLINE_FORM: DeadlineFormState = {
  title: "",
  assessment_name: "",
  due_date: "",
  due_time: "",
  type: "Assignment",
  notes: "",
};

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [draftDeadline, setDraftDeadline] =
    useState<DeadlineFormState>(EMPTY_DEADLINE_FORM);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);
  const [selectedDeadlines, setSelectedDeadlines] = useState<Set<string>>(
    new Set()
  );
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingDeadline, setIsSavingDeadline] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Deadline | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>("");
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
      setSuccessMessage(
        `Exported ${ids.length === 0 ? "selected" : ids.length} deadline${
          ids.length === 1 ? "" : "s"
        } to Google Calendar.`
      );
    } catch (e) {
      setError(getApiErrorMessage(e, "Export failed."));
    } finally {
      setIsExporting(false);
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setEditingDeadline(null);
    setDraftDeadline(EMPTY_DEADLINE_FORM);
    setError("");
  };

  const handleEditDeadline = (deadline: Deadline) => {
    setSuccessMessage("");
    setEditingDeadline(deadline);
    setDraftDeadline({
      title: deadline.title,
      assessment_name: deadline.assessment_name ?? "",
      due_date: deadline.due_date,
      due_time: deadline.due_time ?? "",
      type: deadline.type,
      notes: deadline.notes ?? "",
    });
    setError("");
    setShowAddModal(true);
  };

  const handleDeleteDeadline = (deadline: Deadline) => {
    if (!courseId || !hasConfirmed) return;
    setSuccessMessage("");
    setError("");
    setDeleteTarget(deadline);
  };

  const confirmDelete = async () => {
    if (!courseId || !deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDeadlineApi(courseId, deleteTarget.id);
      await refreshDeadlines(courseId);
      setSelectedDeadlines((previous) => {
        const next = new Set(previous);
        next.delete(deleteTarget.id);
        return next;
      });
      setSuccessMessage(`Deleted deadline "${deleteTarget.title}".`);
      setError("");
      setDeleteTarget(null);
    } catch (e) {
      setError(getApiErrorMessage(e, "Error deleting deadline."));
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveDeadline = async () => {
    if (!courseId) {
      setError("Choose a course before adding a deadline.");
      return;
    }

    if (!draftDeadline.title.trim()) {
      setError("Deadline title is required.");
      return;
    }

    if (!draftDeadline.due_date) {
      setError("Deadline date is required.");
      return;
    }

    setIsSavingDeadline(true);
    try {
      const payload = {
        title: draftDeadline.title.trim(),
        deadline_type: draftDeadline.type,
        assessment_name:
          draftDeadline.assessment_name.trim() || draftDeadline.title.trim(),
        due_date: draftDeadline.due_date,
        due_time: draftDeadline.due_time || null,
        notes: draftDeadline.notes.trim() || null,
      };

      if (editingDeadline) {
        await updateDeadlineApi(courseId, editingDeadline.id, payload);
      } else {
        await createDeadlineApi(courseId, payload);
      }
      await refreshDeadlines(courseId);
      setError("");
      closeAddModal();
    } catch (e) {
      setError(
        getApiErrorMessage(
          e,
          editingDeadline ? "Error updating deadline." : "Error creating deadline."
        )
      );
    } finally {
      setIsSavingDeadline(false);
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
        {successMessage ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#C4E4D0] bg-[#E8F5EE] px-4 py-3 text-sm text-[#4F7F5F]">
            <Check size={16} />
            <span>{successMessage}</span>
          </div>
        ) : null}
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
            onClick={() => {
              setEditingDeadline(null);
              setDraftDeadline(EMPTY_DEADLINE_FORM);
              setSuccessMessage("");
              setError("");
              setShowAddModal(true);
            }}
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
                canEdit={hasConfirmed}
                onEdit={() => handleEditDeadline(d)}
                onDelete={() => handleDeleteDeadline(d)}
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

      <div className="mt-12 flex justify-center">
        <button
          onClick={() => router.push("/setup/dashboard")}
          className="rounded-2xl bg-[#5F7A8A] px-10 py-4 text-base font-bold text-white shadow-lg transition hover:bg-[#6B8BA8]"
        >
          Continue to Dashboard
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3A3530]/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] border border-[#D4CFC7] bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-[#3A3530]">
                  {editingDeadline ? "Edit Deadline" : "Add Deadline"}
                </h3>
                <p className="mt-1 text-sm text-[#6B6560]">
                  {editingDeadline
                    ? `Update the saved deadline for ${courseName || "your course"}.`
                    : `Create a manual deadline for ${courseName || "your course"}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                className="rounded-full border border-[#E8E3DC] p-2 text-[#6B6560] transition hover:bg-[#F5F1EB]"
                aria-label="Close add deadline dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-[#3A3530]">
                Title
                <input
                  type="text"
                  value={draftDeadline.title}
                  onChange={(event) =>
                    setDraftDeadline((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Final exam, Lab 3, Assignment 2..."
                  className="rounded-xl border border-[#D4CFC7] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5F7A8A]"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[#3A3530]">
                Linked Assessment Name
                <input
                  type="text"
                  value={draftDeadline.assessment_name}
                  onChange={(event) =>
                    setDraftDeadline((current) => ({
                      ...current,
                      assessment_name: event.target.value,
                    }))
                  }
                  placeholder="Optional, defaults to title"
                  className="rounded-xl border border-[#D4CFC7] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5F7A8A]"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium text-[#3A3530] md:col-span-1">
                  Type
                  <select
                    value={draftDeadline.type}
                    onChange={(event) =>
                      setDraftDeadline((current) => ({
                        ...current,
                        type: event.target.value as DeadlineType,
                      }))
                    }
                    className="rounded-xl border border-[#D4CFC7] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5F7A8A]"
                  >
                    <option value="Assignment">Assignment</option>
                    <option value="Quiz">Quiz</option>
                    <option value="Test">Test</option>
                    <option value="Exam">Exam</option>
                    <option value="Other">Other</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium text-[#3A3530] md:col-span-1">
                  Due Date
                  <input
                    type="date"
                    value={draftDeadline.due_date}
                    onChange={(event) =>
                      setDraftDeadline((current) => ({
                        ...current,
                        due_date: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-[#D4CFC7] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5F7A8A]"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium text-[#3A3530] md:col-span-1">
                  Due Time
                  <input
                    type="time"
                    value={draftDeadline.due_time}
                    onChange={(event) =>
                      setDraftDeadline((current) => ({
                        ...current,
                        due_time: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-[#D4CFC7] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5F7A8A]"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium text-[#3A3530]">
                Notes
                <textarea
                  value={draftDeadline.notes}
                  onChange={(event) =>
                    setDraftDeadline((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Optional notes"
                  className="rounded-xl border border-[#D4CFC7] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5F7A8A]"
                />
              </label>

              {error ? (
                <div className="flex items-center gap-2 rounded-xl border border-[#F1D2D2] bg-[#FFF5F5] px-4 py-3 text-sm text-[#B86B6B]">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeAddModal}
                className="rounded-xl border border-[#D4CFC7] px-5 py-3 text-sm font-bold text-[#6B6560] transition hover:bg-[#F5F1EB]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDeadline}
                disabled={isSavingDeadline}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#5F7A8A] px-5 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {isSavingDeadline ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : editingDeadline ? (
                  <Check size={16} />
                ) : (
                  <Plus size={16} />
                )}
                {editingDeadline ? "Update Deadline" : "Save Deadline"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3A3530]/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-[#D4CFC7] bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-[#3A3530]">
                  Export to Google Calendar
                </h3>
                <p className="mt-1 text-sm text-[#6B6560]">
                  Send the selected deadlines to your connected Google Calendar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isExporting) return;
                  setShowExportModal(false);
                }}
                className="rounded-full border border-[#E8E3DC] p-2 text-[#6B6560] transition hover:bg-[#F5F1EB]"
                aria-label="Close export dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-2xl border border-[#E8E3DC] bg-[#F5F1EB] p-5">
              <p className="text-sm font-semibold text-[#3A3530]">
                {selectedDeadlines.size} deadline
                {selectedDeadlines.size === 1 ? "" : "s"} selected
              </p>
              <p className="mt-2 text-xs leading-5 text-[#6B6560]">
                Only the checked deadlines will be exported. Existing Google
                Calendar duplicate protection still applies.
              </p>
            </div>

            {error ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#F1D2D2] bg-[#FFF5F5] px-4 py-3 text-sm text-[#B86B6B]">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                disabled={isExporting}
                className="rounded-xl border border-[#D4CFC7] px-5 py-3 text-sm font-bold text-[#6B6560] transition hover:bg-[#F5F1EB] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting || selectedDeadlines.size === 0}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#5F7A8A] px-5 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {isExporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                Export Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3A3530]/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-[#D4CFC7] bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-[#3A3530]">
                  Delete deadline?
                </h3>
                <p className="mt-1 text-sm text-[#6B6560]">
                  &ldquo;{deleteTarget.title}&rdquo; will be permanently removed.
                  This action cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isDeleting) return;
                  setDeleteTarget(null);
                }}
                className="rounded-full border border-[#E8E3DC] p-2 text-[#6B6560] transition hover:bg-[#F5F1EB]"
                aria-label="Close delete confirmation"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-2xl border border-[#F1D2D2] bg-[#FFF5F5] p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-[#F9EAEA] p-2">
                  <Trash2 size={18} className="text-[#B86B6B]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#3A3530]">
                    {deleteTarget.title}
                  </p>
                  <p className="text-xs text-[#6B6560]">
                    Due {formatDateLabel(deleteTarget.due_date)}
                    {deleteTarget.due_time ? ` at ${deleteTarget.due_time}` : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-xl border border-[#D4CFC7] px-5 py-3 text-sm font-bold text-[#6B6560] transition hover:bg-[#F5F1EB] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#B86B6B] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#A95858] disabled:opacity-60"
              >
                {isDeleting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeadlineRow({
  deadline,
  isSelected,
  canEdit,
  onEdit,
  onDelete,
  onToggleSelect,
}: {
  deadline: Deadline;
  isSelected: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
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
      {canEdit ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-xl border border-[#D4CFC7] p-2 text-[#6B6560] transition hover:bg-[#F5F1EB] hover:text-[#3A3530]"
            aria-label={`Edit ${deadline.title}`}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl border border-[#E6CFCF] p-2 text-[#B86B6B] transition hover:bg-[#FFF5F5] hover:text-[#A95858]"
            aria-label={`Delete ${deadline.title}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
