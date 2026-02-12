import { CheckCircle2, Circle, RotateCcw } from "lucide-react";

type Assessment = {
  id: number;
  name: string;
  weight: number;
  grade?: number;
};

export function GradesStep() {
  const assessments: Assessment[] = [
    { id: 1, name: "Midterm Exam", weight: 30, grade: 80 },
    { id: 2, name: "Final Exam", weight: 40, grade: 45 },
    { id: 3, name: "Assignments", weight: 20 },
    { id: 4, name: "Participation", weight: 10 },
  ];

  const graded = assessments.filter((a) => typeof a.grade === "number");
  const gradedWeight: number = graded.reduce((sum, a) => sum + a.weight, 0);
  const remainingWeight = 100 - gradedWeight;

  const currentGrade =
    gradedWeight === 0
      ? 0
      : graded.reduce((sum, a) => sum + (a.grade as number) * a.weight, 0) /
        gradedWeight;

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
            Based on graded assessments only
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
            const hasGrade = typeof a.grade === "number";
            const contribution = hasGrade
              ? ((a.grade as number) * a.weight) / 100
              : 0;

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
                        <h4 className="font-semibold text-gray-800">
                          {a.name}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {a.weight}% of final grade
                        </p>
                      </div>

                      {/* grade input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          defaultValue={hasGrade ? a.grade : undefined}
                          placeholder="Not graded"
                          min={0}
                          max={100}
                          step={0.1}
                          className="w-24 px-3 py-2 bg-white rounded-xl text-right text-sm border border-gray-200 shadow-sm focus:outline-none"
                        />
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                    </div>

                    {/* progress + contribution only when graded */}
                    {hasGrade && (
                      <div>
                        <div className="w-full bg-gray-200 h-2 rounded-full">
                          <div
                            className="h-2 rounded-full bg-[#6D9A7C]"
                            style={{ width: `${a.grade}%` }}
                          />
                        </div>
                        <p className="text-xs mt-2 text-[#B8A89A]">
                          Contributing {contribution.toFixed(1)}% to your final
                          grade
                        </p>
                      </div>
                    )}
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
          Empty grades are not counted as 0%. Your current grade only reflects
          completed assessments. This gives you an accurate view of your
          performance so far.
        </p>
      </div>

      {/* ACTIONS */}
      <div className="mt-8 flex flex-col md:flex-row gap-4">
        <button className="md:w-[240px] bg-white border border-gray-200 rounded-xl px-6 py-4 text-sm font-medium text-red-500 hover:bg-gray-50 transition flex items-center justify-center gap-2">
          <RotateCcw size={16} />
          Reset All Grades
        </button>

        <button className="flex-1 bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition">
          Continue to Goals
        </button>
      </div>
    </div>
  );
}
