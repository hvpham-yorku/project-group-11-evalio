"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, CheckCircle2 } from "lucide-react";
import { createCourse, listCourses, updateCourseWeights } from "@/lib/api";

export function StructureStep() {
  const router = useRouter();
  const [assessments, setAssessments] = useState([
    { id: 1, name: "Midterm Exam", weight: "30" },
    { id: 2, name: "Final Exam", weight: "40" },
  ]);
  const [courseIndex, setCourseIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const courses = (await listCourses()) as Array<{
          assessments: Array<{ name: string; weight: number }>;
        }>;
        if (courses.length === 0) return;
        const latestIndex = courses.length - 1;
        const latest = courses[latestIndex];
        setCourseIndex(latestIndex);
        if (latest.assessments.length > 0) {
          setAssessments(
            latest.assessments.map((a, i) => ({
              id: i + 1,
              name: a.name,
              weight: String(a.weight),
            }))
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load course.");
      }
    };

    loadCourse();
  }, []);

  const totalWeight = useMemo(
    () =>
      assessments.reduce((sum, item) => {
        const parsed = Number.parseFloat(item.weight);
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }, 0),
    [assessments]
  );

  const handleNameChange = (id: number, name: string) => {
    setAssessments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name } : item))
    );
  };

  const handleWeightChange = (id: number, value: string) => {
    setAssessments((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, weight: value } : item
      )
    );
  };

  const handleRemove = (id: number) => {
    setAssessments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAdd = () => {
    setAssessments((prev) => [
      ...prev,
      { id: (prev[prev.length - 1]?.id ?? 0) + 1, name: "", weight: "" },
    ]);
  };

  const handleContinue = async () => {
    setError("");
    const cleaned = assessments.map((a) => ({
      name: a.name.trim(),
      weight: Number.parseFloat(a.weight),
    }));

    if (cleaned.some((a) => !a.name || !Number.isFinite(a.weight))) {
      setError("Assessment names and weights are required.");
      return;
    }
    if (Math.round(totalWeight * 100) / 100 !== 100) {
      setError("Total assessment weight must equal 100.");
      return;
    }

    try {
      setSaving(true);
      if (courseIndex === null) {
        await createCourse({
          name: "Untitled Course",
          term: null,
          assessments: cleaned.map((a) => ({
            ...a,
            raw_score: null,
            total_score: null,
          })),
        });
      } else {
        await updateCourseWeights(courseIndex, { assessments: cleaned });
      }
      router.push("/setup/grades");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save structure.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pb-20">
      <h2 className="text-2xl font-bold text-gray-800">Course Structure</h2>
      <p className="mt-2 text-gray-500 text-sm leading-relaxed">
        Review and adjust your grading components. We&apos;ll watch for
        duplicates and make sure everything adds up.
      </p>

      {/* MAIN EDITOR CARD */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
        <div className="space-y-6">
          {assessments.map((item) => (
            <div
              key={item.id}
              className="bg-[#F9F8F6] p-6 rounded-2xl relative border border-gray-100"
            >
              {/* Name and Trash Row */}
              <div className="flex gap-4 items-center mb-4">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => handleNameChange(item.id, e.target.value)}
                  className="flex-1 p-3 rounded-xl border border-gray-200 bg-white text-sm"
                />
                <button
                  onClick={() => handleRemove(item.id)}
                  className="text-gray-300 hover:text-red-400 transition"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              {/* Slider and Percentage Row */}
              <div className="flex items-center gap-6">
                <div className="flex-1 bg-gray-200 h-2 rounded-full relative">
                  <div
                    className="bg-slate-500 h-full rounded-full"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(Number.parseFloat(item.weight) || 0, 100)
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 font-medium">
                    {(Number.parseFloat(item.weight) || 0)}%
                  </span>
                  <input
                    type="number"
                    value={item.weight}
                    onChange={(e) => handleWeightChange(item.id, e.target.value)}
                    className="w-16 p-2 text-center rounded-xl border border-gray-200 bg-white text-sm"
                  />
                </div>
              </div>
            </div>
          ))}

          {/* ADD ASSESSMENT BUTTON */}
          <button
            onClick={handleAdd}
            className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 flex items-center justify-center gap-2 hover:bg-gray-50 transition text-sm font-medium"
          >
            <Plus size={18} />
            Add Assessment
          </button>
        </div>
      </div>

      {/* STATUS CARD (BOTTOM) */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-500">Total weight</span>
          <span className="text-sm font-bold text-green-600">
            {totalWeight}%
          </span>
        </div>

        {/* Large Status Progress Bar */}
        <div className="w-full bg-gray-100 h-3 rounded-full mb-6">
          <div
            className="bg-green-600 h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(totalWeight, 100))}%` }}
          />
        </div>

        {/* Success Message */}
        <div className="flex items-center gap-3 bg-green-50 p-4 rounded-xl text-green-700 text-sm">
          <CheckCircle2 size={18} />
          Perfect! Your weights add up to 100%.
        </div>
        {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
      </div>

      {/* PRIMARY ACTION */}
      <button
        onClick={handleContinue}
        disabled={saving}
        className="mt-8 w-full bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition"
      >
        Continue to Grades
      </button>
    </div>
  );
}
