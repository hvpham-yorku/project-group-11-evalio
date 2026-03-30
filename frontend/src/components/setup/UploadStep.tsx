"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Sparkles } from "lucide-react";
import { getApiErrorMessage } from "@/lib/errors";
import { API_BASE_URL } from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";
import type { ExtractionResult } from "@/lib/extraction-types";

const PENDING_DEADLINES_KEY = "evalio_pending_deadlines_v1";

function inferDeadlineType(title: string): "Assignment" | "Test" | "Exam" | "Quiz" | "Other" {
  const lowered = title.toLowerCase();
  if (lowered.includes("assignment") || lowered.includes("homework") || lowered.includes("project")) {
    return "Assignment";
  }
  if (lowered.includes("quiz")) {
    return "Quiz";
  }
  if (lowered.includes("exam") || lowered.includes("final")) {
    return "Exam";
  }
  if (lowered.includes("test") || lowered.includes("midterm")) {
    return "Test";
  }
  return "Other";
}

function toFriendlyExtractionMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("openai_api_key") || normalized.includes("llm_api_key_missing")) {
    return "Extraction is unavailable right now because the backend OpenAI API key is not configured.";
  }

  if (normalized.includes("unsupported file type")) {
    return "Unsupported file type. Please upload PDF, DOCX, TXT, PNG, JPG, or JPEG.";
  }

  if (normalized.includes("file too large")) {
    return "That file is too large. Please upload a file under 10MB.";
  }

  if (normalized.includes("ocr dependencies not available") || normalized.includes("ocr")) {
    return "This outline needs OCR, but OCR tools are missing on the backend (Tesseract/Poppler).";
  }

  if (normalized.includes("authentication required") || normalized.includes("invalid or expired authentication")) {
    return "Your session has expired. Please log in again, then retry upload.";
  }

  if (normalized.includes("no text could be extracted") || normalized.includes("structure_valid")) {
    return "No readable grading content was found. Try a clearer PDF or set up the course manually.";
  }

  return message;
}

function buildFailClosedMessage(response: ExtractionResult): string {
  const base = "Could not extract grading structure from this outline.";
  const failureReason = response.diagnostics?.failure_reason?.trim();
  const firstWarning = response.diagnostics?.trigger_reasons?.[0] ?? response.diagnostics?.parse_warnings?.[0];

  const details = [failureReason, firstWarning]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => toFriendlyExtractionMessage(part));

  if (!details.length) return base;
  return `${base} ${details.join(" ")}`;
}

export function UploadStep() {
  const router = useRouter();
  const { setExtractionResult } = useSetupCourse();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failClosedMessage, setFailClosedMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<ExtractionResult["diagnostics"] | null>(null);

  const handleManualSetup = () => {
    setError(null);
    setFailClosedMessage(null);
    setDiagnostics(null);
    setSelectedFile(null);
    window.localStorage.removeItem(PENDING_DEADLINES_KEY);
    setExtractionResult({
      course_code: null,
      structure_valid: true,
      assessments: [],
      deadlines: [],
      diagnostics: {
        confidence_score: 0,
        confidence_level: "Manual",
        trigger_gpt: false,
        trigger_reasons: [],
        failure_reason: null,
      },
    });
    router.push("/setup/structure");
  };

  const handleChooseFile = () => {
    if (loading) return;
    fileInputRef.current?.click();
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
    setFailClosedMessage(null);
    setExtractionResult(null);
    setDiagnostics(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || loading) return;

    setLoading(true);
    setError(null);
    setFailClosedMessage(null);
    setDiagnostics(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(
        `${API_BASE_URL}/extraction/outline`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      const body = (await response.json().catch(() => null)) as ExtractionResult | null;
      if (!response.ok) {
        const detail =
          body &&
          typeof body === "object" &&
          "detail" in body &&
          typeof (body as { detail?: unknown }).detail === "string"
            ? ((body as { detail: string }).detail as string)
            : `Request failed: ${response.status}`;
        throw new Error(detail);
      }

      if (!body || typeof body !== "object") {
        throw new Error("Invalid extraction response.");
      }

      const pendingDeadlines = (Array.isArray(body.deadlines) ? body.deadlines : [])
        .filter(
          (deadline) =>
            typeof deadline?.title === "string" &&
            deadline.title.trim() &&
            typeof deadline?.due_date === "string" &&
            deadline.due_date.trim()
        )
        .map((deadline) => ({
          title: deadline.title.trim(),
          due_date: deadline.due_date!,
          due_time: deadline.due_time ?? undefined,
          type: inferDeadlineType(deadline.title),
          notes: undefined,
        }));
      if (pendingDeadlines.length) {
        window.localStorage.setItem(PENDING_DEADLINES_KEY, JSON.stringify(pendingDeadlines));
      } else {
        window.localStorage.removeItem(PENDING_DEADLINES_KEY);
      }

      setDiagnostics(body.diagnostics ?? null);
      if (body.structure_valid === false) {
        setExtractionResult(null);
        setFailClosedMessage(buildFailClosedMessage(body));
        return;
      }

      setExtractionResult(body);
      router.push("/setup/structure");
    } catch (err) {
      const apiMessage = getApiErrorMessage(err, "Extraction failed. Please try again.");
      setError(toFriendlyExtractionMessage(apiMessage));
      setExtractionResult(null);
      setDiagnostics(null);
      window.localStorage.removeItem(PENDING_DEADLINES_KEY);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4">
      <h2 className="text-2xl font-bold text-[#3A3530]">Upload Your Syllabus</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#6B6560]">
        {
          "We'll extract your course's grading structure automatically. Don't worry, you can review and adjust everything before moving forward."
        }
      </p>

      <div className="relative mt-8 min-h-[340px] overflow-hidden rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] shadow-sm">

        {/* ── Extraction loading overlay ── */}
        {loading ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center px-12 py-14 text-center">
            {/* animated sparkle icon */}
            <div className="relative flex h-20 w-20 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#5F7A8A]/8" />
              <Sparkles
                className="text-[#5F7A8A]"
                style={{
                  width: 52,
                  height: 52,
                  animation: "sparkle-spin 2s cubic-bezier(.4,0,.2,1) infinite",
                }}
              />
            </div>

            <style>{`
              @keyframes sparkle-spin {
                0%   { transform: rotate(0deg)   scale(1);    }
                20%  { transform: rotate(72deg)  scale(1.12); }
                40%  { transform: rotate(144deg) scale(1);    }
                60%  { transform: rotate(216deg) scale(1.12); }
                80%  { transform: rotate(288deg) scale(1);    }
                100% { transform: rotate(360deg) scale(1);    }
              }
              @keyframes extraction-progress {
                0%   { transform: translateX(-120%); }
                100% { transform: translateX(380%);  }
              }
            `}</style>

            <h3 className="mt-5 text-lg font-semibold text-[#3A3530]">
              Extracting grading structure&hellip;
            </h3>
            <p className="mt-1.5 text-sm text-[#6B6560]">
              Analyzing assessment components and grading rules
            </p>

            {/* indeterminate progress bar */}
            <div className="mt-7 h-1.5 w-64 overflow-hidden rounded-full bg-[#E8E3DC]">
              <div
                className="h-full rounded-full bg-[#5F7A8A]"
                style={{
                  animation: "extraction-progress 1.8s cubic-bezier(.4,0,.2,1) infinite",
                  width: "45%",
                }}
              />
            </div>

          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="flex justify-center mb-4">
              <Upload className="h-12 w-12 text-[#C4B5A6]" />
            </div>
            <h3 className="text-xl font-medium text-[#3A3530]">
              Drop your syllabus here
            </h3>
            <p className="mb-6 mt-1 text-sm text-[#6B6560]">
              or click to browse files
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
              className="hidden"
              onChange={handleFileSelected}
            />

            <button
              onClick={handleChooseFile}
              className="mx-auto flex items-center gap-2 rounded-xl bg-[#5F7A8A] px-8 py-3 font-medium text-white transition hover:opacity-90"
            >
              <FileText size={18} />
              {selectedFile ? "Choose Different File" : "Choose File"}
            </button>

            {selectedFile ? (
              <p className="mt-3 text-sm text-[#6B6560]">{selectedFile.name}</p>
            ) : null}

            <button
              onClick={handleUpload}
              disabled={!selectedFile}
              className="mx-auto mt-4 flex items-center justify-center gap-2 rounded-xl border border-[#D4CFC7] bg-[#F5F1EB] px-8 py-3 font-medium text-[#3A3530] transition hover:bg-[#E8E3DC] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Upload and Extract
            </button>

            {error ? (
              <p className="mt-4 text-sm text-[#B86B6B]">{error}</p>
            ) : null}

            {failClosedMessage ? (
              <p className="mt-4 text-sm text-[#C9945F]">{failClosedMessage}</p>
            ) : null}

            {diagnostics ? (
              <div className="mt-6 rounded-2xl border border-[#E8E3DC] bg-[#F5F1EB] p-4 text-left">
                <p className="text-xs text-[#6B6560]">
                  Confidence: {diagnostics.confidence_score} ({diagnostics.confidence_level})
                </p>
              </div>
            ) : null}

            <p className="mt-4 text-xs text-[#C4B5A6]">
              Supports PDF, DOCX, text, and image files (PNG/JPG)
            </p>

            <div className="my-10 h-[1px] w-full bg-[#E8E3DC]" />

            <button
              onClick={handleManualSetup}
              className="rounded-xl border border-[#C4D6E4] bg-[#E8EFF5] px-8 py-2 text-sm font-medium text-[#5F7A8A] transition hover:opacity-90"
            >
              Set up course manually
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
