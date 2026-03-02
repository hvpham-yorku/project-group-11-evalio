"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { confirmExtraction } from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";
import { getApiErrorMessage } from "@/lib/errors";

type ExtractedAssessment = {
  name: string;
  weight: number;
  is_bonus?: boolean;
  rule?: string | null;
  rule_type?: string | null;
  rule_config?: Record<string, unknown> | null;
  children?: ExtractedAssessment[];
};

export function StructureStep() {
  const router = useRouter();
  const [courseName, setCourseName] = useState("Untitled Course");
  const [term, setTerm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});
  const { setCourseId, extractionResult } = useSetupCourse();

  const assessments = useMemo<ExtractedAssessment[]>(
    () => (Array.isArray(extractionResult?.assessments) ? extractionResult.assessments : []),
    [extractionResult]
  );

  const totalWeight = useMemo(
    () =>
      assessments.reduce((sum, item) => {
        const parsed = Number(item.weight);
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }, 0),
    [assessments]
  );

  const weightStatus = useMemo(() => {
    if (totalWeight === 100) {
      return {
        bg: "bg-green-50",
        border: "border-green-200",
        text: "text-green-700",
        icon: "success",
        message: "Perfect! Your weights add up to 100%.",
      };
    }

    if (totalWeight < 100) {
      const diff = (100 - totalWeight).toFixed(0);
      return {
        bg: "bg-yellow-50",
        border: "border-yellow-200",
        text: "text-yellow-700",
        icon: "warning",
        message: `You need ${diff}% more to reach 100%.`,
      };
    }

    const diff = (totalWeight - 100).toFixed(0);
    return {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-700",
      icon: "error",
      message: `Weights exceed 100% by ${diff}%. Please adjust to continue.`,
    };
  }, [totalWeight]);


  const handleContinue = async () => {
    setError("");
    if (!extractionResult) {
      setError("Please upload an outline first.");
      return;
    }
    try {
      setSaving(true);
      const response = await confirmExtraction({
        course_name: courseName.trim() || "Untitled Course",
        term: term.trim() ? term.trim() : null,
        extraction_result: extractionResult,
      });
      setCourseId(response.course_id);
      router.push("/setup/grades");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to confirm extracted structure."));
    } finally {
      setSaving(false);
    }
  };

  const renderAssessment = (assessment: ExtractedAssessment, depth = 0, nodeKey = "root") => {
    const children = Array.isArray(assessment.children) ? assessment.children : [];
    const hasChildren = children.length > 0;
    const expanded = !!expandedByKey[nodeKey];
    const ruleLabel =
      (typeof assessment.rule_type === "string" && assessment.rule_type) ||
      (typeof assessment.rule === "string" && assessment.rule) ||
      "";

    return (
      <div key={nodeKey} className="space-y-2">
        <button
          type="button"
          className="bg-[#F9F8F6] p-4 rounded-2xl border border-gray-100"
          style={{ marginLeft: `${depth * 20}px` }}
          onClick={() => {
            if (!hasChildren) return;
            setExpandedByKey((prev) => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <ChevronDown
                  size={16}
                  className={`text-gray-500 transition-transform ${expanded ? "rotate-180" : "rotate-0"}`}
                />
              ) : null}
              <p className="text-sm text-gray-800 font-medium">{assessment.name}</p>
            </div>
            <p className="text-sm text-gray-600">{assessment.weight}%</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {assessment.is_bonus ? (
              <span className="px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                Bonus
              </span>
            ) : null}
            {ruleLabel ? (
              <span className="px-2 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                Rule: {ruleLabel}
              </span>
            ) : null}
            {hasChildren ? (
              <span className="px-2 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-200">
                {expanded ? "Collapse" : "Expand"}
              </span>
            ) : null}
          </div>
        </button>
        {hasChildren && expanded
          ? children.map((child, index) => renderAssessment(child, depth + 1, `${nodeKey}-${index}`))
          : null}
      </div>
    );
  };

  if (!extractionResult) {
    return (
      <div className="max-w-3xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold text-gray-800">Course Structure</h2>
        <p className="mt-2 text-gray-500 text-sm leading-relaxed">
          No extracted outline is available. Upload a course outline first.
        </p>
        <button
          onClick={() => router.push("/setup/upload")}
          className="mt-8 bg-[#5D737E] text-white py-3 px-6 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition"
        >
          Go to Upload
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pb-20">
      <h2 className="text-2xl font-bold text-gray-800">Course Structure</h2>
      <p className="mt-2 text-gray-500 text-sm leading-relaxed">
        Review your extracted grading components and confirm to save.
      </p>

      {/* MAIN EDITOR CARD */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Course name</label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Term (optional)</label>
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm"
              placeholder="W26"
            />
          </div>
        </div>
        <div className="space-y-6">
          {assessments.map((assessment, index) => renderAssessment(assessment, 0, `parent-${index}`))}
        </div>
      </div>

      {/* STATUS CARD (BOTTOM) */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-500">Total weight</span>
          <span
            className={`text-sm font-bold ${
              totalWeight === 100
                ? "text-green-600"
                : totalWeight < 100
                ? "text-yellow-500"
                : "text-red-500"
            }`}
          >
            {totalWeight}%
          </span>
        </div>

        {/* Large Status Progress Bar */}
        <div className="w-full bg-gray-100 h-3 rounded-full mb-6">
          <div
            className={`h-full rounded-full ${
              totalWeight === 100
                ? "bg-green-600"
                : totalWeight < 100
                ? "bg-yellow-500"
                : "bg-red-500"
            }`}
            style={{ width: `${Math.max(0, Math.min(totalWeight, 100))}%` }}
          />
        </div>

        {/* Success Message */}
        <div
          className={`flex items-center gap-3 p-4 rounded-xl text-sm border ${weightStatus.bg} ${weightStatus.border} ${weightStatus.text}`}
        >
          {weightStatus.icon === "success" ? (
            <CheckCircle2 size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          {weightStatus.message}
        </div>
        {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
      </div>

      {/* PRIMARY ACTION */}
      <button
        onClick={handleContinue}
        disabled={saving}
        className="mt-8 w-full bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition"
      >
        {saving ? "Confirming..." : "Confirm and Continue"}
      </button>
    </div>
  );
}
