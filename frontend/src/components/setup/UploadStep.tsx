export function UploadStep() {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-semibold">Upload Your Syllabus</h2>
      <p className="mt-2 text-gray-600">
        We'll extract your course's grading structure automatically...
      </p>

      <div className="mt-10 border-2 border-dashed border-gray-300 p-20 text-center rounded-lg">
        <div className="mb-4 text-4xl">^</div>
        <p className="mb-2 font-medium">Drop your syllabus here</p>
        <p className="text-sm text-gray-400 mb-6 font-sans">
          or click to browse files
        </p>
        <button className="bg-slate-600 text-white px-6 py-2 rounded hover:bg-slate-700 transition">
          Choose File
        </button>
      </div>
    </div>
  );
}
