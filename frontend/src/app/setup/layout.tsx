export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-8">
      {/* HEADER - Stays forever */}
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Evalio</h1>
          <p className="text-gray-500">
            Plan your academic success with confidence
          </p>
        </div>
        <div className="flex gap-4">
          <button className="border p-2 rounded">Dashboard</button>
          <button className="border p-2 rounded">Explore Scenarios</button>
        </div>
      </div>

      {/* PROGRESS BAR - Stays forever */}
      <div className="flex justify-between border-b pb-4 mb-10 text-sm font-medium">
        <div>1 Upload</div>
        <div className="text-gray-400">2 Structure</div>
        <div className="text-gray-400">3 Grades</div>
        <div className="text-gray-400">4 Goals</div>
        <div className="text-gray-400">5 Plan</div>
        <div className="text-gray-400">6 Dashboard</div>
      </div>

      {/* This is where the specific step (like Upload) will plug in */}
      {children}
    </div>
  );
}
