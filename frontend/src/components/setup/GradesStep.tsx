"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Circle, RotateCcw, X } from "lucide-react";
import { listCourses, updateCourseGrades } from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";
import { getApiErrorMessage } from "@/lib/errors";

type ChildAssessment = {
  id: string;
  name: string;
  weight: number;
  raw_score?: string;
  total_score?: string;
};

type Assessment = {
  id: number;
  name: string;
  weight: number;
  raw_score?: string;
  total_score?: string;
  children?: ChildAssessment[];
};

const PARTIAL_SCORES_ERROR = "Please enter both received and total score.";

function parseNumberOrNull(value?: string): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPartial(raw: number | null, total: number | null): boolean {
  return (raw === null) !== (total === null);
}

export function GradesStep() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const { courseId, ensureCourseIdFromList } = useSetupCourse();

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const courses = await listCourses();
        const resolvedCourseId = ensureCourseIdFromList(courses);
        if (!resolvedCourseId) {
          setError("No course found. Complete structure first.");
          return;
        }
        const latest = courses.find((course) => course.course_id === resolvedCourseId);
        if (!latest) {
          setError("No course found. Complete structure first.");
          return;
        }
        setAssessments(
          latest.assessments.map((a, i) => ({
            id: i + 1,
            name: a.name,
            weight: a.weight,
            raw_score:
              typeof a.raw_score === "number" ? String(a.raw_score) : "",
            total_score:
              typeof a.total_score === "number" ? String(a.total_score) : "",
            children: Array.isArray(a.children)
              ? a.children.map((child, index) => ({
                  id: `${i + 1}-${index + 1}`,
                  name: child.name,
                  weight: child.weight,
                  raw_score:
                    typeof child.raw_score === "number" ? String(child.raw_score) : "",
                  total_score:
                    typeof child.total_score === "number" ? String(child.total_score) : "",
                }))
              : [],
          }))
        );
      } catch (e) {
        setError(getApiErrorMessage(e, "Failed to load grades."));
      }
    };

    loadCourse();
  }, [ensureCourseIdFromList]);

  const graded = assessments.filter((a) => {
    const raw = parseNumberOrNull(a.raw_score);
    const total = parseNumberOrNull(a.total_score);
    return raw !== null && total !== null && total > 0;
  });
  const gradedWeight: number = graded.reduce((sum, a) => sum + a.weight, 0);
  const remainingWeight = 100 - gradedWeight;

  const currentGrade = assessments.reduce((sum, a) => {
    const raw = parseNumberOrNull(a.raw_score);
    const total = parseNumberOrNull(a.total_score);
    if (raw === null || total === null || total <= 0) return sum;
    const percent = (raw / total) * 100;
    return sum + (percent * a.weight) / 100;
  }, 0);

  const handleScoreChange = (
    id: number,
    field: "raw_score" | "total_score",
    value: string
  ) => {
    setAssessments((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, [field]: value } : a));
      const updated = next.find((a) => a.id === id);
      if (updated) {
        const raw = parseNumberOrNull(updated.raw_score);
        const total = parseNumberOrNull(updated.total_score);
        if (!isPartial(raw, total)) {
          setError((curr) => (curr === PARTIAL_SCORES_ERROR ? "" : curr));
        }
      }
      return next;
    });
  };

  const handleScoreBlur = async (assessment: Assessment) => {
    if (!courseId) return;

    const raw = parseNumberOrNull(assessment.raw_score);
    const total = parseNumberOrNull(assessment.total_score);

    if (raw === null && total === null) return;
    if (raw === null || total === null) {
      setError(PARTIAL_SCORES_ERROR);
      return;
    }
    if (raw < 0 || total <= 0 || raw > total) {
      setError("Scores must satisfy: raw_score >= 0, total_score > 0, raw_score <= total_score.");
      return;
    }

    try {
      await updateCourseGrades(courseId, {
        assessments: [{ name: assessment.name, raw_score: raw, total_score: total }],
      });
      setError("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save grade."));
    }
  };

  const handleResetAllGrades = async () => {
    if (!courseId) {
      setError("No course found. Complete structure first.");
      return;
    }

    try {
      await updateCourseGrades(courseId, {
        assessments: assessments.map((assessment) => ({
          name: assessment.name,
          raw_score: null,
          total_score: null,
        })),
      });
      setAssessments((prev) =>
        prev.map((assessment) => ({
          ...assessment,
          raw_score: "",
          total_score: "",
        }))
      );
      setError("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to reset grades."));
    }
  };

  const handleClearSingleGrade = async (assessment: Assessment) => {
    if (!courseId) {
      setError("No course found. Complete structure first.");
      return;
    }

    try {
      await updateCourseGrades(courseId, {
        assessments: [{ name: assessment.name, raw_score: null, total_score: null }],
      });
      setAssessments((prev) =>
        prev.map((a) =>
          a.id === assessment.id ? { ...a, raw_score: "", total_score: "" } : a
        )
      );
      setError("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to clear grade."));
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pb-20">
      <h2 className="text-2xl font-bold text-gray-800">Enter Your Grades</h2>
      <p className="mt-2 text-gray-500 text-sm leading-relaxed">
        Add grades as you receive them. We&apos;ll calculate your standing in
        real-time.
      </p>

      {/* SUMMARY CARDS */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Current Grade</p>
          <p className="mt-2 text-3xl font-semibold text-gray-800">
            {currentGrade.toFixed(1)}%
          </p>
          <p className="mt-2 text-xs text-[#B8A89A]">
            Overall standing out of 100
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Graded</p>
          <p className="mt-2 text-3xl font-semibold text-green-600">
            {gradedWeight}%
          </p>
          <p className="mt-2 text-xs text-[#B8A89A]">Of total course weight</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Remaining</p>
          <p className="mt-2 text-3xl font-semibold text-[#5D737E]">
            {remainingWeight}%
          </p>
          <p className="mt-2 text-xs text-[#B8A89A]">Still to be graded</p>
        </div>
      </div>

      {/* MAIN GRADES CARD */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
        <div className="space-y-4">
          {assessments.map((a) => {
            const raw = parseNumberOrNull(a.raw_score);
            const total = parseNumberOrNull(a.total_score);
            const hasGrade = raw !== null && total !== null && total > 0;
            const percent = hasGrade ? (raw / total) * 100 : 0;
            const contribution = hasGrade ? (percent * a.weight) / 100 : 0;
            const hasChildren = Array.isArray(a.children) && a.children.length > 0;
            const isExpanded = !!expandedByKey[String(a.id)];

            return (
              <div
                key={a.id}
                className="rounded-2xl p-5 border border-gray-100 bg-[#F3F0EA]"
              >
                <div className="flex items-start gap-4">
                  {/* icon */}
                  <div className="mt-1">
                    {hasGrade ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300" />
                    )}
                  </div>

                  {/* content */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedByKey((prev) => ({
                                  ...prev,
                                  [String(a.id)]: !prev[String(a.id)],
                                }))
                              }
                              className="inline-flex items-center text-gray-500"
                              aria-label={isExpanded ? "Collapse children" : "Expand children"}
                            >
                              <ChevronDown
                                size={16}
                                className={`transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`}
                              />
                            </button>
                          ) : null}
                          <h4 className="font-semibold text-gray-800">{a.name}</h4>
                        </div>
                        <p className="text-sm text-gray-500">
                          {a.weight}% of final grade
                        </p>
                      </div>

                      {/* grade input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={a.raw_score ?? ""}
                          onChange={(e) =>
                            handleScoreChange(a.id, "raw_score", e.target.value)
                          }
                          onBlur={() => handleScoreBlur(a)}
                          placeholder="Received"
                          min={0}
                          step={0.1}
                          className="w-24 px-3 py-2 bg-white rounded-xl text-right text-sm border border-gray-200 shadow-sm focus:outline-none"
                        />
                        <span className="text-sm text-gray-500">/</span>
                        <input
                          type="number"
                          value={a.total_score ?? ""}
                          onChange={(e) =>
                            handleScoreChange(a.id, "total_score", e.target.value)
                          }
                          onBlur={() => handleScoreBlur(a)}
                          placeholder="Total"
                          min={0}
                          step={0.1}
                          className="w-24 px-3 py-2 bg-white rounded-xl text-right text-sm border border-gray-200 shadow-sm focus:outline-none"
                        />
                        {hasGrade && (
                          <button
                            onClick={() => handleClearSingleGrade(a)}
                            className="ml-2 p-1 text-gray-400 hover:text-red-500 transition"
                            title="Clear this grade"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* progress + contribution only when graded */}
                    {hasGrade && (
                      <div>
                        <div className="w-full bg-gray-200 h-2 rounded-full">
                          <div
                            className="h-2 rounded-full bg-[#6D9A7C]"
                            style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
                          />
                        </div>
                        <p className="text-xs mt-2 text-[#B8A89A]">
                          Contributing {contribution.toFixed(1)}% to your final
                          grade
                        </p>
                      </div>
                    )}
                    {hasChildren && isExpanded ? (
                      <div className="mt-4 space-y-2">
                        {a.children?.map((child) => {
                          const childRaw = parseNumberOrNull(child.raw_score);
                          const childTotal = parseNumberOrNull(child.total_score);
                          const childHasGrade =
                            childRaw !== null && childTotal !== null && childTotal > 0;
                          return (
                            <div
                              key={child.id}
                              className="ml-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-gray-700">{child.name}</p>
                                <p className="text-xs text-gray-500">{child.weight}%</p>
                              </div>
                              <p className="mt-1 text-xs text-gray-500">
                                {childHasGrade
                                  ? `Received ${child.raw_score}/${child.total_score}`
                                  : "No score entered yet"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* INFO CALLOUT */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <p className="text-sm font-semibold text-blue-800">
          About &quot;Not graded yet&quot;
        </p>
        <p className="mt-1 text-sm text-blue-700 leading-relaxed">
          Empty grades are treated as 0 contribution to your overall standing
          out of 100.
        </p>
      </div>
      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {/* ACTIONS */}
      <div className="mt-8 flex flex-col md:flex-row gap-4">
        <button
          onClick={handleResetAllGrades}
          className="md:w-[240px] bg-white border border-gray-200 rounded-xl px-6 py-4 text-sm font-medium text-red-500 hover:bg-gray-50 transition flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} />
          Reset All Grades
        </button>

        <button
          onClick={() => router.push("/setup/goals")}
          className="flex-1 bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition"
        >
          Continue to Goals
        </button>
      </div>
    </div>
  );
}
