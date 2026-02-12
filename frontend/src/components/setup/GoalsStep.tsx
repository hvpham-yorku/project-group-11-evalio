"use client";

import { useEffect, useMemo, useState } from "react";
import { Target, TrendingUp } from "lucide-react";
import { checkTarget, listCourses } from "@/lib/api";

export function GoalsStep() {
  const [target, setTarget] = useState<number>(89);
  const [courseIndex, setCourseIndex] = useState<number | null>(null);
  const [currentStanding, setCurrentStanding] = useState(85.0);
  const [explanation, setExplanation] = useState(
    "This target looks realistic based on your current performance and remaining weight."
  );
  const [yorkEquivalent, setYorkEquivalent] = useState({
    letter: "A",
    grade_point: 8,
    description: "Excellent",
  });
  const [gradedWeight, setGradedWeight] = useState<number>(30);
  const [remainingWeight, setRemainingWeight] = useState<number>(70);
  const [requiredAverage, setRequiredAverage] = useState(0);
  const [requiredAverageDisplay, setRequiredAverageDisplay] = useState("0.0%");
  const [requiredFractionDisplay, setRequiredFractionDisplay] = useState(
    "(0.00 / 0 remaining weight)"
  );
  const [classification, setClassification] = useState("Comfortable");
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const courses = (await listCourses()) as Array<{
          assessments: Array<{
            weight: number;
            raw_score?: number | null;
            total_score?: number | null;
          }>;
        }>;
        if (courses.length === 0) {
          setError("No course found. Complete structure first.");
          return;
        }

        const latestIndex = courses.length - 1;
        const latest = courses[latestIndex];
        setCourseIndex(latestIndex);
        const graded = latest.assessments.filter(
          (a) =>
            typeof a.raw_score === "number" && typeof a.total_score === "number"
        );
        const gradedW = graded.reduce((sum, a) => sum + a.weight, 0);
        setGradedWeight(gradedW);
        setRemainingWeight(100 - gradedW);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load goals.");
      }
    };

    loadCourse();
  }, []);

  useEffect(() => {
    if (courseIndex === null) return;
    const run = async () => {
      try {
        const response = (await checkTarget(courseIndex, { target })) as {
          current_standing: number;
          explanation: string;
          york_equivalent: {
            letter: string;
            grade_point: number;
            description: string;
          };
          required_points: number;
          required_average: number;
          required_average_display: string;
          required_fraction_display: string;
          classification: string;
        };
        setCurrentStanding(response.current_standing);
        setExplanation(response.explanation);
        setYorkEquivalent(response.york_equivalent);
        setRequiredAverage(response.required_average);
        setRequiredAverageDisplay(response.required_average_display);
        setRequiredFractionDisplay(response.required_fraction_display);
        setClassification(response.classification);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to evaluate target.");
      }
    };
    run();
  }, [target, courseIndex]);

  const statusUI = useMemo(() => {
    if (
      classification === "Comfortable" ||
      classification === "Achievable" ||
      classification === "Already Achieved" ||
      classification === "Complete"
    ) {
      return {
        label: classification,
        icon: TrendingUp,
        pillBg: "bg-green-50",
        pillText: "text-green-700",
        bar: "bg-green-600",
        noteBg: "bg-green-50",
        noteBorder: "border-green-200",
        noteText: "text-green-700",
      };
    }

    if (classification === "Not Possible") {
      return {
        label: classification,
        icon: TrendingUp,
        pillBg: "bg-red-50",
        pillText: "text-red-700",
        bar: "bg-red-500",
        noteBg: "bg-red-50",
        noteBorder: "border-red-200",
        noteText: "text-red-700",
      };
    }

    return {
      label: classification,
      icon: TrendingUp,
      pillBg: "bg-[#FFF3E6]",
      pillText: "text-[#C8833F]",
      bar: "bg-[#C8833F]",
      noteBg: "bg-[#FFF6EC]",
      noteBorder: "border-[#F2D7BD]",
      noteText: "text-[#C8833F]",
    };
  }, [classification]);

  const StatusIcon = statusUI.icon;

  return (
    <div className="max-w-4xl mx-auto px-4 pb-20">
      <h2 className="text-3xl font-bold text-gray-800">Set Your Target</h2>
      <p className="mt-2 text-gray-500 text-sm leading-relaxed">
        Choose a target grade and we&apos;ll show you exactly what&apos;s needed to reach it.
      </p>

      {/* TARGET CARD */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Target className="text-[#5D737E]" size={22} />
          <h3 className="text-lg font-semibold text-gray-700">Target Grade</h3>
        </div>

        <div className="max-w-xl">
          <div className="flex items-center gap-6 mb-4">
            {/* Slider */}
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={target}
                onChange={(e) => setTarget(parseInt(e.target.value, 10))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: "#E6E2DB",
                  outline: "none",
                }}
              />
            </div>

            {/* % Display */}
            <div className="w-28 text-right">
              <div className="text-4xl font-semibold text-[#5D737E]">
                {target}%
              </div>
            </div>
          </div>

          <div className="flex justify-between text-xs text-[#C6B8A8]">
            <span>Pass (50%)</span>
            <span>Average (70%)</span>
            <span>Excellence (90%)</span>
          </div>

          <p className="mt-2 text-sm text-gray-500">
            YorkU equivalent: {yorkEquivalent.letter} ({yorkEquivalent.grade_point}) -{" "}
            {yorkEquivalent.description}
          </p>
        </div>
      </div>

      {/* WHAT YOU NEED CARD */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-700 mb-6">What You Need</h3>

        <div className="space-y-6">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Required average on remaining work
            </span>

            <div
              className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${statusUI.pillBg} ${statusUI.pillText}`}
            >
              <StatusIcon size={14} />
              {statusUI.label}
            </div>
          </div>

          {/* Big required number box */}
          <div className="rounded-2xl p-8 text-center bg-[#F6F1EA] border border-gray-100">
            <div className={`text-6xl font-semibold ${statusUI.pillText}`}>
              {requiredAverageDisplay}
            </div>
            <div className="mt-2 text-sm text-gray-500">
              {requiredFractionDisplay}
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="w-full bg-[#E6E2DB] h-3 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${statusUI.bar}`}
                style={{ width: `${Math.min(requiredAverage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-[#C6B8A8] mt-2">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Message box */}
          <div
            className={`rounded-2xl p-4 border ${statusUI.noteBg} ${statusUI.noteBorder}`}
          >
            <p className={`text-sm ${statusUI.noteText}`}>{explanation}</p>
          </div>

          {/* Bottom mini cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl p-5 bg-[#F6F1EA] border border-gray-100">
              <div className="text-sm text-gray-500">Current Standing</div>
              <div className="mt-1 text-2xl font-semibold text-gray-800">
                {currentStanding.toFixed(1)}%
              </div>
              <div className="mt-1 text-xs text-[#C6B8A8]">{gradedWeight}% graded</div>
            </div>

            <div className="rounded-2xl p-5 bg-[#F6F1EA] border border-gray-100">
              <div className="text-sm text-gray-500">Remaining Weight</div>
              <div className="mt-1 text-2xl font-semibold text-[#5D737E]">
                {remainingWeight}%
              </div>
              <div className="mt-1 text-xs text-[#C6B8A8]">Still ahead</div>
            </div>
          </div>
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {/* Primary action */}
      <button className="mt-8 w-full bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition">
        Continue to Planning
      </button>
    </div>
  );
}
