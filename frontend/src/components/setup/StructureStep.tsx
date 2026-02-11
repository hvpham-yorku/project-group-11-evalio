import { Trash2, Plus, CheckCircle2 } from "lucide-react";

export function StructureStep() {
  // Static data for GUI placement
  const assessments = [
    { id: 1, name: "Midterm Exam", weight: 30 },
    { id: 2, name: "Final Exam", weight: 40 },
  ];

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
                  defaultValue={item.name}
                  className="flex-1 p-3 rounded-xl border border-gray-200 bg-white text-sm"
                />
                <button className="text-gray-300 hover:text-red-400 transition">
                  <Trash2 size={20} />
                </button>
              </div>

              {/* Slider and Percentage Row */}
              <div className="flex items-center gap-6">
                <div className="flex-1 bg-gray-200 h-2 rounded-full relative">
                  <div
                    className="bg-slate-500 h-full rounded-full"
                    style={{ width: `${item.weight}%` }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 font-medium">
                    {item.weight}%
                  </span>
                  <input
                    type="number"
                    defaultValue={item.weight}
                    className="w-16 p-2 text-center rounded-xl border border-gray-200 bg-white text-sm"
                  />
                </div>
              </div>
            </div>
          ))}

          {/* ADD ASSESSMENT BUTTON */}
          <button className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 flex items-center justify-center gap-2 hover:bg-gray-50 transition text-sm font-medium">
            <Plus size={18} />
            Add Assessment
          </button>
        </div>
      </div>

      {/* STATUS CARD (BOTTOM) */}
      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-500">Total weight</span>
          <span className="text-sm font-bold text-green-600">100%</span>
        </div>

        {/* Large Status Progress Bar */}
        <div className="w-full bg-gray-100 h-3 rounded-full mb-6">
          <div className="bg-green-600 h-full rounded-full w-full" />
        </div>

        {/* Success Message */}
        <div className="flex items-center gap-3 bg-green-50 p-4 rounded-xl text-green-700 text-sm">
          <CheckCircle2 size={18} />
          Perfect! Your weights add up to 100%.
        </div>
      </div>

      {/* PRIMARY ACTION */}
      <button className="mt-8 w-full bg-[#5D737E] text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-[#4A5D66] transition">
        Continue to Grades
      </button>
    </div>
  );
}
