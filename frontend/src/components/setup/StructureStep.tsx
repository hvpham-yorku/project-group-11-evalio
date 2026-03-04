"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import { confirmExtraction } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
import { useSetupCourse } from "@/app/setup/course-context";

type EditableAssessment = {
  id: string;
  name: string;
  weight: number;
  rule?: string | null;
  rule_type?: string | null;
  total_count?: number | null;
  effective_count?: number | null;
  children?: EditableAssessment[];
};

function updateAssessmentById(
  items: EditableAssessment[],
  id: string,
  patch: Partial<EditableAssessment>
): EditableAssessment[] {
  return items.map((item) => {
    if (item.id === id) return { ...item, ...patch };
    if (item.children?.length) {
      return { ...item, children: updateAssessmentById(item.children, id, patch) };
    }
    return item;
  });
}

function removeAssessmentById(items: EditableAssessment[], id: string): EditableAssessment[] {
  return items
    .filter((item) => item.id !== id)
    .map((item) =>
      item.children?.length
        ? { ...item, children: removeAssessmentById(item.children, id) }
        : item
    );
}

function addChildToParent(
  items: EditableAssessment[],
  parentId: string,
  child: EditableAssessment
): EditableAssessment[] {
  return items.map((item) => {
    if (item.id === parentId) {
      return { ...item, children: [...(item.children ?? []), child] };
    }
    if (item.children?.length) {
      return { ...item, children: addChildToParent(item.children, parentId, child) };
    }
    return item;
  });
}

type GradeBoundary = {
  letter: string;
  minLabel: string; // e.g., "90–100" or "below 50"
  points: string; // e.g., "9.0"
  descriptor: string; // e.g., "Excellent"
};

export default function StructureStep() {
  const router = useRouter();
  const { extractionResult, setCourseId, institutionalGradingRules, setInstitutionalGradingRules } =
    useSetupCourse();

  const [courseName, setCourseName] = useState("");
  const [termLabel, setTermLabel] = useState("");
  const [termYear, setTermYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});

  // Local editable copy of extracted assessments
  const [assessments, setAssessments] = useState<EditableAssessment[]>([]);

  // Institutional grading rules UI state
  const [institutionalOpen, setInstitutionalOpen] = useState(false);
  const [institutionName, setInstitutionName] = useState("York University");
  const [scaleName, setScaleName] = useState("9.0");

  const [gradeBoundaries, setGradeBoundaries] = useState<GradeBoundary[]>([
    { letter: "A+", minLabel: "90–100", points: "9.0", descriptor: "Excellent" },
    { letter: "A", minLabel: "80–89", points: "8.0", descriptor: "Excellent" },
    { letter: "B+", minLabel: "75–79", points: "7.0", descriptor: "Very Good" },
    { letter: "B", minLabel: "70–74", points: "6.0", descriptor: "Good" },
    { letter: "C+", minLabel: "65–69", points: "5.0", descriptor: "Competent" },
    { letter: "C", minLabel: "60–64", points: "4.0", descriptor: "Fair" },
    { letter: "D+", minLabel: "55–59", points: "3.0", descriptor: "Pass" },
    { letter: "D", minLabel: "50–54", points: "2.0", descriptor: "Pass" },
    { letter: "F", minLabel: "below 50", points: "0.0", descriptor: "Fail" },
  ]);

  const [boundaryHandling, setBoundaryHandling] = useState<"round-up" | "strict">("round-up");
  const [rounding, setRounding] = useState<"one-decimal" | "none">("one-decimal");
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 1950;
    const endYear = currentYear + 10;
    return Array.from({ length: endYear - startYear + 1 }, (_, index) => String(startYear + index));
  }, []);

  const extractedCourseCode =
    typeof extractionResult?.course_code === "string" ? extractionResult.course_code.trim() : "";

  // Bootstrap course name from extracted course code (if present)
  useEffect(() => {
    if (!extractedCourseCode) return;
    if (courseName.trim()) return;
    setCourseName(extractedCourseCode);
  }, [extractedCourseCode, courseName]);

  useEffect(() => {
    if (!institutionalGradingRules) return;
    setInstitutionName(institutionalGradingRules.institution);
    setScaleName(institutionalGradingRules.scale);
    setGradeBoundaries(institutionalGradingRules.grade_boundaries);
  }, [institutionalGradingRules]);

  // Convert extractionResult.assessments into local editable state (once per new extraction)
  useEffect(() => {
    const incoming = Array.isArray(extractionResult?.assessments) ? extractionResult.assessments : [];
    const normalize = (items: any[], prefix = "a"): EditableAssessment[] =>
      items.map((it, idx) => {
        const id = typeof it?.id === "string" ? it.id : `${prefix}-${idx}-${Date.now()}`;
        const childrenRaw = Array.isArray(it?.children) ? it.children : [];
        return {
          id,
          name: typeof it?.name === "string" ? it.name : "",
          weight: Number.isFinite(Number(it?.weight)) ? Number(it.weight) : 0,
          rule: typeof it?.rule === "string" ? it.rule : it?.rule ?? "",
          rule_type: typeof it?.rule_type === "string" ? it.rule_type : null,
          total_count: Number.isFinite(Number(it?.total_count)) ? Number(it.total_count) : null,
          effective_count: Number.isFinite(Number(it?.effective_count)) ? Number(it.effective_count) : null,
          children: childrenRaw.length ? normalize(childrenRaw, `${prefix}-${idx}`) : [],
        };
      });

    setAssessments(normalize(incoming));
  }, [extractionResult]);

  const totalWeight = useMemo(() => {
    const sumTopLevel = assessments.reduce((sum, a) => sum + (Number.isFinite(a.weight) ? a.weight : 0), 0);
    return Number(sumTopLevel.toFixed(2));
  }, [assessments]);

  const weightStatus = useMemo(() => {
    if (totalWeight === 100) {
      return {
        bg: "bg-[#DFE9E0]",
        border: "border-[#D0DED2]",
        text: "text-[#4F7E5A]",
        message: "Perfect! Your weights add up to 100%.",
      };
    }
    if (totalWeight < 100) {
      return {
        bg: "bg-[#F3EBD9]",
        border: "border-[#E7D8B8]",
        text: "text-[#8E7340]",
        message: `You need ${(100 - totalWeight).toFixed(0)}% more to reach 100%.`,
      };
    }
    return {
      bg: "bg-[#F4DEDE]",
      border: "border-[#E4C2C2]",
      text: "text-[#9C5D5D]",
      message: `Weights exceed 100% by ${(totalWeight - 100).toFixed(0)}%. Please adjust to continue.`,
    };
  }, [totalWeight]);

  const updateAssessment = (id: string, patch: Partial<EditableAssessment>) => {
    setAssessments((prev) => updateAssessmentById(prev, id, patch));
  };

  const deleteAssessment = (id: string) => {
    setAssessments((prev) => removeAssessmentById(prev, id));
  };

  const addAssessment = () => {
    setAssessments((prev) => [
      ...prev,
      {
        id: `assessment-${Date.now()}`,
        name: "",
        weight: Number.NaN,
        rule: "",
        children: [],
      },
    ]);
  };

  const handleAddChild = (parentId: string) => {
    setAssessments((prev) => {
      const parent = prev.find((assessment) => assessment.id === parentId);
      const currentChildren = Array.isArray(parent?.children) ? parent.children : [];
      const nextIndex = currentChildren.length + 1;
      const newChild: EditableAssessment = {
        id: `${parentId}-child-${Date.now()}-${nextIndex}`,
        name: "",
        weight: Number.NaN,
        rule: "",
        children: [],
      };
      return addChildToParent(prev, parentId, newChild);
    });
    setExpandedByKey((prev) => ({ ...prev, [parentId]: true }));
  };

  const toggleExpanded = (key: string) => {
    setExpandedByKey((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const bestOfLabel = (a: EditableAssessment) => {
    if (a.rule_type !== "best_of") return null;
    const effectiveCount = Number(a.effective_count);
    const totalCount = Number(a.total_count);
    if (
      Number.isFinite(effectiveCount) &&
      Number.isFinite(totalCount) &&
      effectiveCount > 0 &&
      totalCount > 0
    ) {
      return `Best ${effectiveCount} of ${totalCount} count`;
    }
    return "Best-of grading applied";
  };

  const addGradeBoundary = () => {
    setGradeBoundaries((prev) => [
      ...prev,
      { letter: "", minLabel: "", points: "", descriptor: "" },
    ]);
  };

  const removeGradeBoundary = (index: number) => {
    setGradeBoundaries((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleContinue = async () => {
    setError("");

    if (!extractionResult) {
      setError("Please upload an outline first.");
      return;
    }

    if (!courseName.trim()) {
      setError("Please enter a course name.");
      return;
    }

    if (totalWeight !== 100) {
      setError("Total assessment weight must equal 100% to continue.");
      return;
    }

    try {
      setSaving(true);
      const combinedTerm = [termLabel.trim(), termYear.trim()].filter(Boolean).join(" ");
      const selectedRules = {
        institution: institutionName,
        scale: scaleName,
        grade_boundaries: gradeBoundaries,
      };

      // Build a modified extraction payload that keeps the original extractionResult
      // but overrides editable fields from this page.
      const patchedExtraction = {
        ...extractionResult,
        course_name: courseName.trim(),
        term: combinedTerm || null,
        assessments: assessments,
        institutional_grading_rules: {
          institution: selectedRules.institution,
          scale: selectedRules.scale,
          grade_boundaries: gradeBoundaries,
          boundary_handling: boundaryHandling,
          rounding: rounding,
        },
      };

      const response = await confirmExtraction({
        course_name: courseName.trim() || "Untitled Course",
        term: combinedTerm || null,
        extraction_result: patchedExtraction,
      });

      setInstitutionalGradingRules(selectedRules);
      setCourseId(response.course_id);
      router.push("/setup/grades");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to confirm extracted structure."));
    } finally {
      setSaving(false);
    }
  };

  const renderAssessmentCard = (a: EditableAssessment, depth = 0, nodeKey = "root") => {
    const children = Array.isArray(a.children) ? a.children : [];
    const hasChildren = children.length > 0;
    const expanded = !!expandedByKey[a.id];
    const bestLabel = bestOfLabel(a);

    return (
      <div key={nodeKey} className="space-y-3" style={{ marginLeft: `${depth * 16}px` }}>
        <div className="bg-[#EAE6E0] rounded-2xl border border-[#E2DDD6] px-4 py-4">
          <div className="flex items-start gap-3">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpanded(a.id)}
                className="mt-2 text-gray-500 hover:text-gray-700 transition"
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            ) : (
              <div className="w-[18px]" />
            )}

            <div className="flex-1 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <input
                    value={a.name}
                    onChange={(e) => updateAssessment(a.id, { name: e.target.value })}
                    placeholder="Assessment name"
                    className="w-full rounded-xl border border-[#CAC6C0] bg-[#F9F9F7] px-3 py-2 text-sm text-gray-700"
                  />
                </div>

                <div className="w-24">
                  <input
                    type="number"
                    value={Number.isFinite(a.weight) ? a.weight : ""}
                    onChange={(e) =>
                      updateAssessment(a.id, {
                        weight: e.target.value === "" ? Number.NaN : Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-[#CAC6C0] bg-[#F9F9F7] px-3 py-2 text-sm text-gray-700 text-center"
                    min={0}
                    max={100}
                    step={1}
                  />
                  <p className="mt-1 text-[11px] text-center text-gray-500">% of grade</p>
                </div>
              </div>

              {/* progress bar */}
              <div className="w-full bg-[#DCD8D2] h-2 rounded-full">
                <div
                  className="h-full rounded-full bg-[#5D737E]"
                  style={{ width: `${Math.max(0, Math.min(a.weight, 100))}%` }}
                />
              </div>

              {/* rule input */}
              <div className="rounded-xl bg-[#E8E3DC] border border-[#DDD6CC] px-3 py-3">
                <p className="text-[11px] font-semibold text-gray-500">Rule</p>
                <input
                  value={a.rule ?? ""}
                  onChange={(e) => updateAssessment(a.id, { rule: e.target.value })}
                  placeholder="e.g., Best 10 of 11 quizzes count"
                  className="mt-2 w-full rounded-xl border border-[#CAC6C0] bg-[#F9F9F7] px-3 py-2 text-sm text-gray-700"
                />
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                  {bestLabel ? (
                    <span className="px-2 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                      {bestLabel}
                    </span>
                  ) : null}
                </div>
              </div>

              {!hasChildren ? (
                <div>
                  <button
                    type="button"
                    onClick={() => handleAddChild(a.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    <Plus size={14} /> Add item
                  </button>
                </div>
              ) : null}

              {/* children */}
              {hasChildren && expanded ? (
                <div className="mt-2 space-y-2 pl-3 border-l border-gray-200">
                  {children.map((c, idx) => (
                    <div
                      key={`${nodeKey}-${idx}`}
                      className="rounded-xl bg-[#F3F1ED] border border-[#DFDBD5] px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <input
                          value={c.name}
                          onChange={(e) => updateAssessment(c.id, { name: e.target.value })}
                          placeholder="Assessment name"
                          className="w-full rounded-lg border border-[#CAC6C0] bg-[#F9F9F7] px-3 py-2 text-xs text-gray-700"
                        />
                        <button
                          type="button"
                          onClick={() => deleteAssessment(c.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 transition"
                          aria-label={`Delete ${c.name || "item"}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <input
                          type="number"
                          value={Number.isFinite(c.weight) ? c.weight : ""}
                          onChange={(e) =>
                            updateAssessment(c.id, {
                              weight: e.target.value === "" ? Number.NaN : Number(e.target.value),
                            })
                          }
                          min={0}
                          max={100}
                          step={1}
                          className="w-20 h-9 px-2 bg-[#F9F9F7] rounded-lg text-right text-xs leading-5 border border-[#CAC6C0] shadow-sm focus:outline-none"
                        />
                        <p className="text-xs text-gray-500">% of grade</p>
                      </div>
                    </div>
                  ))}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleAddChild(a.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                    >
                      <Plus size={14} /> Add item
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => deleteAssessment(a.id)}
              className="mt-1 text-gray-400 hover:text-red-500 transition"
              aria-label="Delete assessment"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

      </div>
    );
  };

  if (!extractionResult) {
    return (
      <div className="max-w-5xl mx-auto px-4 pb-20">
        <h2 className="text-[34px] font-semibold text-[#252525]">Course Structure</h2>
        <p className="mt-2 text-[#6C6C6C] text-sm leading-relaxed">
          No extracted outline is available. Upload a course outline first.
        </p>
        <button
          onClick={() => router.push("/setup/upload")}
          className="mt-8 bg-[#607B8A] text-white py-3 px-6 rounded-xl font-semibold shadow-sm hover:bg-[#4E6978] transition"
        >
          Go to Upload
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-24">
      <h2 className="text-[34px] font-semibold text-[#252525]">Course Structure</h2>
      <p className="mt-2 text-[#666666] text-sm leading-relaxed">
        Review and adjust your course assessments, weights, and grading rules.
      </p>

      <div className="mt-6 space-y-4">
        <section className="bg-[#F4F4F3] border border-[#E4E3E1] rounded-2xl p-4 shadow-sm">
          <label className="block text-sm text-[#3D3D3D] mb-2">Course Name</label>
          <input
            type="text"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            className="w-full p-3 rounded-xl border border-[#C7C5C1] bg-[#F6F6F4] text-sm text-[#6A6A6A]"
            placeholder="Untitled course"
          />
        </section>

        <section className="bg-[#F4F4F3] border border-[#E4E3E1] rounded-2xl p-4 shadow-sm">
          <p className="text-sm text-[#3D3D3D] mb-2">Academic Term</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#7A7A78] mb-1">Term</label>
              <select
                value={termLabel}
                onChange={(e) => setTermLabel(e.target.value)}
                className="w-full p-3 rounded-xl border border-[#C7C5C1] bg-[#F6F6F4] text-sm text-[#6A6A6A]"
              >
                <option value="">Select term</option>
                <option value="Fall">Fall</option>
                <option value="Winter">Winter</option>
                <option value="Summer">Summer</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#7A7A78] mb-1">Year</label>
              <select
                value={termYear}
                onChange={(e) => setTermYear(e.target.value)}
                className="w-full p-3 rounded-xl border border-[#C7C5C1] bg-[#F6F6F4] text-sm text-[#6A6A6A]"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* MAIN EDITOR CARD */}
        <section className="bg-[#F4F4F3] border border-[#E4E3E1] rounded-2xl p-4 shadow-sm">

        {/* Assessments header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-[#333333]">Assessments</h3>
            <p className="mt-1 text-sm text-[#737373]">Define your course grading components</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#848484]">Total Weight</p>
            <p
              className={`text-4xl font-semibold leading-none ${
                totalWeight === 100 ? "text-[#5E9B68]" : totalWeight < 100 ? "text-[#8E7340]" : "text-[#9C5D5D]"
              }`}
            >
              {totalWeight}%
            </p>
          </div>
        </div>

        <div className="space-y-3">{assessments.map((a, i) => renderAssessmentCard(a, 0, `top-${i}`))}</div>

        <button
          type="button"
          onClick={addAssessment}
          className="mt-5 w-full rounded-xl border border-[#BFBDB9] py-3 text-sm font-medium text-[#6A6A6A] hover:border-[#607B8A] hover:text-[#607B8A] transition flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Add Assessment
        </button>

        {/* weight status */}
        <div className="mt-6">
          <div className="w-full bg-[#DCD8D2] h-3 rounded-full mb-4">
            <div
              className={`h-full rounded-full ${
                totalWeight === 100 ? "bg-[#5E9B68]" : totalWeight < 100 ? "bg-[#B89B62]" : "bg-[#B97373]"
              }`}
              style={{ width: `${Math.max(0, Math.min(totalWeight, 100))}%` }}
            />
          </div>
          <div className={`flex items-center gap-3 p-4 rounded-xl text-sm border ${weightStatus.bg} ${weightStatus.border} ${weightStatus.text}`}>
            <CheckCircle2 size={18} />
            <p>{weightStatus.message}</p>
          </div>
        </div>
        </section>
      </div>

      {/* Institutional Grading Rules (accordion) */}
      <div className="mt-6 bg-[#F4F4F3] border border-[#E4E3E1] rounded-2xl p-6 shadow-sm">
        <button
          type="button"
          className="w-full flex items-start justify-between gap-4 text-left"
          onClick={() => setInstitutionalOpen((v) => !v)}
        >
          <div>
            <h3 className="text-base font-semibold text-[#333333]">Institutional Grading Rules (York University Default)</h3>
            <p className="mt-1 text-sm text-[#5F7A8A]">
              Optional - Change to match your institution
            </p>
            <p className="mt-1 text-sm text-[#737373]">
              Used to evaluate your final percentage into letter grades and grade points.
            </p>
          </div>
          <div className="mt-1 text-gray-500">{institutionalOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
        </button>

        {institutionalOpen ? (
          <div className="mt-5 space-y-5">
            {/* Institution + Scale rows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F9F8F6] border border-gray-100 px-4 py-3">
                <p className="text-sm text-gray-500">Institution:</p>
                <input
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  className="text-sm font-semibold text-gray-800 text-right px-3 py-2 rounded-xl border border-gray-200 bg-[#F2F2F2] focus:outline-none focus:ring-2 focus:ring-[#5D737E]/30"
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F9F8F6] border border-gray-100 px-4 py-3">
                <p className="text-sm text-gray-500">Scale:</p>
                <select
                  value={scaleName}
                  onChange={(e) => setScaleName(e.target.value)}
                  className="text-sm font-semibold text-gray-800 text-right px-3 py-2 rounded-xl border border-gray-200 bg-[#F2F2F2] focus:outline-none focus:ring-2 focus:ring-[#5D737E]/30"
                >
                  <option value="4.0">4.0</option>
                  <option value="9.0">9.0</option>
                  <option value="10.0">10.0</option>
                </select>
              </div>
            </div>

            {/* Grade boundaries - exact inline format */}
            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Grade Boundaries</h4>
              <div className="space-y-2">
                {gradeBoundaries.map((g, idx) => (
                  <div key={idx} className="rounded-2xl bg-[#F9F8F6] border border-gray-100 px-4 py-3">
                    <div className="flex items-center gap-3 text-sm">
                      <input
                        value={g.letter}
                        onChange={(e) => {
                          setGradeBoundaries((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], letter: e.target.value };
                            return next;
                          });
                        }}
                        className="w-14 text-center font-semibold text-gray-800 px-2 py-1 rounded-lg border border-gray-200 bg-[#F2F2F2] focus:outline-none focus:ring-2 focus:ring-[#5D737E]/30"
                      />

                      <span className="text-gray-500">—</span>

                      <input
                        value={g.minLabel}
                        onChange={(e) => {
                          setGradeBoundaries((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], minLabel: e.target.value };
                            return next;
                          });
                        }}
                        className="w-28 text-center text-gray-700 px-2 py-1 rounded-lg border border-gray-200 bg-[#F2F2F2] focus:outline-none focus:ring-2 focus:ring-[#5D737E]/30"
                      />

                      <span className="text-gray-500">→</span>

                      <input
                        value={g.points}
                        onChange={(e) => {
                          setGradeBoundaries((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], points: e.target.value };
                            return next;
                          });
                        }}
                        className="w-16 text-center text-[#4A6C7A] px-2 py-1 rounded-lg border border-gray-200 bg-[#F2F2F2] focus:outline-none focus:ring-2 focus:ring-[#5D737E]/30"
                      />

                      <span className="text-gray-500">—</span>

                      <input
                        value={g.descriptor}
                        onChange={(e) => {
                          setGradeBoundaries((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], descriptor: e.target.value };
                            return next;
                          });
                        }}
                        className="ml-auto w-32 text-right text-[#B49A86] px-2 py-1 rounded-lg border border-gray-200 bg-[#F2F2F2] focus:outline-none focus:ring-2 focus:ring-[#5D737E]/30"
                      />
                      <button
                        type="button"
                        onClick={() => removeGradeBoundary(idx)}
                        disabled={gradeBoundaries.length <= 1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Delete grade boundary ${idx + 1}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addGradeBoundary}
                  className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-600 hover:border-[#5D737E] hover:text-[#5D737E] transition"
                >
                  + Add item
                </button>
              </div>
            </div>

            {/* Advanced: Boundary handling + rounding */}
            <div className="rounded-2xl bg-[#F9F8F6] border border-gray-100 px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">Advanced</p>
              </div>

              <div className="mt-4 space-y-6">
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">Boundary Handling</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="boundary"
                        checked={boundaryHandling === "round-up"}
                        onChange={() => setBoundaryHandling("round-up")}
                        className="h-4 w-4 accent-[#5D737E]"
                      />
                      79.5 counts as 80
                    </label>
                    <label className="flex items-center gap-3 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="boundary"
                        checked={boundaryHandling === "strict"}
                        onChange={() => setBoundaryHandling("strict")}
                        className="h-4 w-4 accent-[#5D737E]"
                      />
                      Strict boundaries (80.0 only)
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">Rounding</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="rounding"
                        checked={rounding === "one-decimal"}
                        onChange={() => setRounding("one-decimal")}
                        className="h-4 w-4 accent-[#5D737E]"
                      />
                      Round final percentage to 1 decimal
                    </label>
                    <label className="flex items-center gap-3 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="rounding"
                        checked={rounding === "none"}
                        onChange={() => setRounding("none")}
                        className="h-4 w-4 accent-[#5D737E]"
                      />
                      No rounding
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Errors */}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {/* Actions */}
      <button
        onClick={handleContinue}
        disabled={saving}
        className="mt-6 w-full bg-[#607B8A] text-white py-4 rounded-xl font-medium shadow-sm hover:bg-[#4E6978] transition disabled:opacity-60"
      >
        {saving ? "Saving..." : "Continue to Grades"}
      </button>
    </div>
  );
}
