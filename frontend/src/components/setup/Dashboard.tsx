import { AlertTriangle, TrendingUp, Info } from "lucide-react";

export function Dashboard() {
  const metrics = [
    { label: "Current Grade", value: "0.0%", sub: "Based on graded work only" },
    { label: "Work Completed", value: "0%", sub: "100% still to go" },
    { label: "Required Average", value: "85.0%", sub: "To reach your target" },
  ];

  const assessments = [
    {
      name: "Midterm Exam",
      weight: "30% of final grade",
      needed: "85.0%",
      contrib: "+25.5%",
    },
    {
      name: "Final Exam",
      weight: "40% of final grade",
      needed: "85.0%",
      contrib: "+34.0%",
    },
    {
      name: "Assignments",
      weight: "20% of final grade",
      needed: "85.0%",
      contrib: "+17.0%",
    },
    {
      name: "Participation",
      weight: "10% of final grade",
      needed: "85.0%",
      contrib: "+8.5%",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 pb-20">
      {/* 1. Header Section */}
      <div className="text-left">
        <h2 className="text-2xl font-bold text-gray-800">
          Your Academic Dashboard
        </h2>
        <p className="text-sm text-gray-500">
          {
            "Here's how everything fits together: your grades, goals, and path forward."
          }
        </p>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-gray-100 bg-[#F9F8F6] p-6 text-center shadow-sm"
          >
            <p className="mb-2 text-[10px] uppercase tracking-widest text-gray-400">
              {m.label}
            </p>
            <p className="text-3xl font-bold text-gray-800">{m.value}</p>
            <p className="mt-2 text-[10px] text-gray-300">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* 3. Target Card */}
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Target: 85%</h3>
          <span className="flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600">
            <TrendingUp size={12} /> Challenging
          </span>
        </div>
        <div className="mb-4 h-2 w-full rounded-full bg-gray-100">
          <div className="h-full w-[2%] rounded-full bg-gray-300" />
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-xs leading-relaxed text-orange-800">
          {
            "Your target is possible but will require strong performance. This target is achievable but will require strong performance ahead."
          }
        </div>
      </div>

      {/* 4. Performance Assumption */}
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <h3 className="mb-6 font-bold text-gray-800">Performance Assumption</h3>
        <div className="mb-8 flex items-center gap-6">
          <div className="h-2 flex-1 rounded-full bg-gray-100">
            <div className="h-full w-[75%] rounded-full bg-gray-300" />
          </div>
          <span className="text-3xl font-bold text-slate-400">75%</span>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#F9F8F6] p-6">
          <div>
            <p className="text-[10px] text-gray-400 uppercase">
              Projected Final Grade
            </p>
            <p className="text-4xl font-bold text-gray-800">75.0%</p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-xs font-bold text-orange-600">
              <AlertTriangle size={14} /> Below Target
            </p>
            <p className="mt-1 text-[10px] text-gray-400">
              With 75% average, you&apos;ll be 10.0% short.
            </p>
          </div>
        </div>
      </div>

      {/* 5. Breakdown List */}
      <div className="space-y-4">
        <h3 className="font-bold text-gray-800">Assessment Breakdown</h3>
        {assessments.map((a) => (
          <div
            key={a.name}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="h-4 w-4 rounded-full border-2 border-orange-200" />
              <div>
                <p className="font-bold text-gray-800">{a.name}</p>
                <p className="text-[10px] text-gray-400">{a.weight}</p>
              </div>
            </div>
            <div className="flex justify-between items-center rounded-xl bg-orange-50/50 p-4 border border-orange-100">
              <div>
                <p className="text-[9px] uppercase text-gray-400">
                  Minimum needed
                </p>
                <p className="text-xl font-bold text-orange-600">{a.needed}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase text-gray-400">
                  Would contribute
                </p>
                <p className="text-sm font-bold text-gray-700">
                  {a.contrib} to final
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 6. Action Button */}
      <div className="text-center">
        <p className="mb-6 text-[10px] text-gray-400">
          This is your complete academic picture. Ready to explore different
          scenarios?
        </p>
        <button className="rounded-xl bg-[#5D737E] px-10 py-4 font-bold text-white shadow-lg hover:bg-[#4A5D66] transition">
          Try the Scenario Explorer
        </button>
      </div>
    </div>
  );
}
