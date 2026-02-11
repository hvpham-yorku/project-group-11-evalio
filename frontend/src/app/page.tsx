export default function UploadPage() {
  return (
    <div className="p-8 ">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Evalio</h1>
          <p className="text-gray-500">
            Plan your academic success with confidence
          </p>
        </div>
        <div className="flex gap-4">
          <button className="border p-2">Dashboard</button>
          <button className="border p-2">Explore Scenarios</button>
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div className="flex justify-between border-b pb-4 mb-10 text-sm">
        <div>1 Upload</div>
        <div>2 Structure</div>
        <div>3 Grades</div>
        <div>4 Goals</div>
        <div>5 Plan</div>
        <div>6 Dashboard</div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-semibold">Upload Your Syllabus</h2>
        <p className="mt-2 text-gray-600">
          We'll extract your course's grading structure automatically...
        </p>

        {/* UPLOAD BOX */}
        <div className="mt-10 border-2 border-dashed border-gray-300 p-20 text-center rounded-lg">
          <div className="mb-4 text-4xl">^</div> {/* Icon placeholder */}
          <p className="mb-2 font-medium">Drop your syllabus here</p>
          <p className="text-sm text-gray-400 mb-6">or click to browse files</p>
          <button className="bg-slate-600 text-white px-6 py-2 rounded">
            Choose File
          </button>
          <p className="mt-4 text-xs text-gray-400">
            Supports PDF, Word, or text files
          </p>
        </div>
      </div>
    </div>
  );
}
