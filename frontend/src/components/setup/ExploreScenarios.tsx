"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, RotateCcw } from "lucide-react";
import { listCourses } from "@/lib/api";

type Assessment = {
  id: number;
  name: string;
  weight: number;
  raw_score?: number | null;
  total_score?: number | null;
};

type LoadedCourse = {
  assessments: Assessment[];
};

export function ExploreScenarios() {
  const router = useRouter();

  const [courseIndex, setCourseIndex] = useState<number | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [error, setError] = useState("");

  const [activeScenario, setActiveScenario] = useState<Record<number, number>>(
    {}
  );

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const courses = (await listCourses()) as LoadedCourse[];
        if (!courses.length) {
          setError("No course found. Complete setup first.");
          return;
        }

        const latestIndex = courses.length - 1;
        const latest = courses[latestIndex];
        setCourseIndex(latestIndex);

        const normalized = (latest.assessments ?? []).map((a, i) => ({
          ...a,
          id: typeof a.id === "number" ? a.id : i + 1,
        }));

        setAssessments(normalized);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load course.");
      }
    };

    loadCourse();
  }, []);

  const getActualGrade = (a: Assessment): number | undefined => {
    const raw = a.raw_score;
    const total = a.total_score;
    if (typeof raw !== "number" || typeof total !== "number") return undefined;
    if (!Number.isFinite(raw) || !Number.isFinite(total) || total <= 0)
      return undefined;
    return Math.max(0, Math.min((raw / total) * 100, 100));
  };

  const getScenarioValue = (a: Assessment) => {
    const override = activeScenario[a.id];
    if (typeof override === "number") return override;

    const actual = getActualGrade(a);
    if (typeof actual === "number") return actual;

    return 75;
  };

  const hasChanges = Object.keys(activeScenario).length > 0;

  const projectedFinal = useMemo(() => {
    if (!assessments.length) return 0;
    const sum = assessments.reduce((acc, a) => {
      const v = getScenarioValue(a);
      return acc + (v * a.weight) / 100;
    }, 0);
    return Number.isFinite(sum) ? sum : 0;
  }, [assessments, activeScenario]);

  const handleSliderChange = (id: number, value: number) => {
    setActiveScenario((prev) => ({ ...prev, [id]: value }));
  };

  const handleResetAll = () => setActiveScenario({});

  const handleApplyToGrades = () => {
    sessionStorage.setItem(
      "evalio_activeScenario",
      JSON.stringify(activeScenario)
    );

    router.push("/setup/grades");
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-20">
      <h2 className="text-3xl font-bold text-gray-800">Scenario Explorer</h2>
      <p className="mt-2 text-gray-500 text-sm leading-relaxed max-w-4xl">
        This is your sandbox. Experiment freely with different grade
        possibilities. Nothing here affects your actual grades unless you choose
        to apply it.
      </p>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT: WHAT-IF */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <Lightbulb className="text-[#C8833F]" size={22} />
              <h3 className="text-lg font-semibold text-gray-800">
                What-If Exploration
              </h3>
            </div>

            <div className="space-y-5">
              {assessments.map((a) => {
                const actual = getActualGrade(a);
                const value = getScenarioValue(a);

                const isModified = typeof activeScenario[a.id] === "number";

                return (
                  <div
                    key={a.id}
                    className={`rounded-2xl p-5 border ${
                      isModified
                        ? "border-[#5D737E] bg-[#E9EFF1]"
                        : "border-gray-100 bg-[#F6F1EA]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-6 mb-4">
                      <div>
                        <h4 className="font-semibold text-gray-800">
                          {a.name}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {a.weight}% •{" "}
                          {typeof actual === "number"
                            ? `Current: ${actual.toFixed(0)}%`
                            : "Not graded"}
                        </p>
                      </div>

                      <div className="text-3xl font-semibold text-[#5D737E]">
                        {value.toFixed(0)}%
                      </div>
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={value}
                        onChange={(e) =>
                            handleSliderChange(a.id, Number(e.target.value))
                        }
                        className="mt-4 w-full h-2 rounded-full appearance-none cursor-pointer"
                        style={{
                            background: `linear-gradient(to right, #5D737E 0%, #5D737E ${value}%, #E6E2DB ${value}%, #E6E2DB 100%)`,
                            WebkitAppearance: "none",
                        }}
                    />

                    <style jsx>{`
                        input[type="range"]::-webkit-slider-thumb {
                            -webkit-appearance: none;
                            appearance: none;
                            width: 18px;
                            height: 18px;
                            background: #5D737E;
                            border-radius: 9999px;
                            border: none;
                            cursor: pointer;
                            margin-top: -5px;
                        }

                        input[type="range"]::-moz-range-thumb {
                            width: 18px;
                            height: 18px;
                            background: #5D737E;
                            border-radius: 9999px;
                            border: none;
                            cursor: pointer;
                        }
                    `}</style>
                    
                  </div>
                );
              })}
            </div>

            {/* Controls appear only when changed */}
            {hasChanges ? (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={handleResetAll}
                  className="inline-flex items-center gap-2 bg-[#E6E2DB] text-gray-800 px-5 py-3 rounded-xl font-medium hover:opacity-90 transition shadow-sm"
                >
                  <RotateCcw size={16} />
                  Reset All
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT: LIVE PROJECTION */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-lg lg:sticky lg:top-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-6">
              Live Projection
            </h3>

            <div className="rounded-3xl p-8 text-center bg-[#EEF3F5] border border-gray-100">
              <p className="text-sm text-gray-500">Projected Final Grade</p>
              <p className="mt-3 text-6xl font-semibold text-[#5D737E]">
                {projectedFinal.toFixed(1)}%
              </p>
            </div>

            <div className="mt-8 space-y-4">
              {assessments.map((a) => {
                const v = getScenarioValue(a);
                const contribution = (v * a.weight) / 100;

                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-500">{a.name}</span>
                    <span className="font-semibold text-gray-800">
                      +{contribution.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>

            {hasChanges ? (
              <div className="mt-8">
                <button
                  onClick={handleApplyToGrades}
                  className="w-full bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition"
                >
                  Apply to Actual Grades
                </button>
                <p className="mt-2 text-xs text-center text-[#B8A89A]">
                  This will update your grades page with these values
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
