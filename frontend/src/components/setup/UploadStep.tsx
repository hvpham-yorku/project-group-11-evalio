"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2 } from "lucide-react";
import { getApiErrorMessage } from "@/lib/errors";

type ExtractedAssessment = {
  name: string;
  weight: number;
  is_bonus?: boolean;
};

type ExtractionResponse = {
  structure_valid: boolean;
  assessments: ExtractedAssessment[];
  deadlines: Array<{
    title: string;
    due_date?: string | null;
    due_time?: string | null;
  }>;
  diagnostics: {
    confidence_score: number;
    confidence_level: string;
    trigger_gpt: boolean;
    trigger_reasons: string[];
    failure_reason?: string | null;
  };
};

export function UploadStep() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failClosedMessage, setFailClosedMessage] = useState<string | null>(null);
  const [extractedAssessments, setExtractedAssessments] = useState<ExtractedAssessment[]>([]);
  const [diagnostics, setDiagnostics] = useState<ExtractionResponse["diagnostics"] | null>(null);

  const handleChooseFile = () => {
    if (loading) return;
    fileInputRef.current?.click();
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
    setFailClosedMessage(null);
    setExtractedAssessments([]);
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
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/extraction/outline`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      const body = (await response.json().catch(() => null)) as ExtractionResponse | null;
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

      setDiagnostics(body.diagnostics ?? null);
      if (body.structure_valid === false) {
        setExtractedAssessments([]);
        setFailClosedMessage("Could not extract grading structure from this outline.");
        return;
      }

      setExtractedAssessments(Array.isArray(body.assessments) ? body.assessments : []);
    } catch (err) {
      setError(getApiErrorMessage(err, "Extraction failed. Please try again."));
      setExtractedAssessments([]);
      setDiagnostics(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4">
      <h2 className="text-2xl font-bold text-gray-800">Upload Your Syllabus</h2>
      <p className="mt-2 text-gray-500 text-sm leading-relaxed">
        {
          "We'll extract your course's grading structure automatically. Don't worry, you can review and adjust everything before moving forward."
        }
      </p>

      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-12 shadow-sm text-center">
        <div className="flex justify-center mb-4">
          <Upload className="w-12 h-12 text-gray-300" />
        </div>
        <h3 className="text-xl font-medium text-gray-700">
          Drop your syllabus here
        </h3>
        <p className="text-gray-400 text-sm mt-1 mb-6">
          or click to browse files
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={handleFileSelected}
          disabled={loading}
        />

        <button
          onClick={handleChooseFile}
          disabled={loading}
          className="flex items-center gap-2 mx-auto bg-[#5D737E] text-white px-8 py-3 rounded-xl font-medium hover:bg-[#4A5D66] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <FileText size={18} />
          {selectedFile ? "Choose Different File" : "Choose File"}
        </button>

        {selectedFile ? (
          <p className="mt-3 text-sm text-gray-600">{selectedFile.name}</p>
        ) : null}

        <button
          onClick={handleUpload}
          disabled={!selectedFile || loading}
          className="mt-4 flex items-center justify-center gap-2 mx-auto border border-gray-200 text-gray-700 px-8 py-3 rounded-xl font-medium hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          {loading ? "Extracting..." : "Upload and Extract"}
        </button>

        {loading ? (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-600">
            <Loader2 size={16} className="animate-spin" />
            <p>Extracting outline...</p>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-red-500">{error}</p>
        ) : null}

        {failClosedMessage ? (
          <p className="mt-4 text-sm text-amber-700">{failClosedMessage}</p>
        ) : null}

        {extractedAssessments.length > 0 ? (
          <div className="mt-6 text-left bg-[#F9F8F6] border border-gray-200 rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Extracted Assessments</h4>
            <ul className="space-y-2">
              {extractedAssessments.map((assessment, index) => (
                <li key={`${assessment.name}-${index}`} className="text-sm text-gray-700">
                  {assessment.name} — {assessment.weight}%
                  {assessment.is_bonus ? " (Bonus)" : ""}
                </li>
              ))}
            </ul>
            {diagnostics ? (
              <p className="mt-3 text-xs text-gray-500">
                Confidence: {diagnostics.confidence_score} ({diagnostics.confidence_level})
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 text-xs text-gray-300">
          Supports PDF, Word, or text files
        </p>

        <div className="my-10 h-[1px] bg-gray-100 w-full" />

        <button
          onClick={() => router.push("/setup/structure")}
          className="border border-gray-200 text-gray-600 px-8 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
        >
          Set up course manually
        </button>
      </div>
    </div>
  );
}
