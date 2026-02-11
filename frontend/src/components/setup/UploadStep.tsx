import { Upload, FileText } from "lucide-react";

export function UploadStep() {
  return (
    <div className="max-w-3xl mx-auto px-4">
      <h2 className="text-2xl font-bold text-gray-800">Upload Your Syllabus</h2>
      <p className="mt-2 text-gray-500 text-sm leading-relaxed">
        {
          "We'll extract your course's grading structure automatically. Don't worry, you can review and adjust everything before moving forward."
        }
      </p>

      <div className="mt-8 bg-white border border-gray-200 rounded-3xl p-12 shadow-sm text-center">
        <div className="flex justify-center mb-4">
          <Upload className="w-12 h-12 text-gray-300" />
        </div>
        <h3 className="text-xl font-medium text-gray-700">
          Drop your syllabus here
        </h3>
        <p className="text-gray-400 text-sm mt-1 mb-6">
          or click to browse files
        </p>

        <button className="flex items-center gap-2 mx-auto bg-[#5D737E] text-white px-8 py-3 rounded-xl font-medium hover:bg-[#4A5D66] transition">
          <FileText size={18} />
          Choose File
        </button>

        <p className="mt-4 text-xs text-gray-300">
          Supports PDF, Word, or text files
        </p>

        <div className="my-10 h-[1px] bg-gray-100 w-full" />

        <button className="border border-gray-200 text-gray-600 px-8 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
          Set up course manually
        </button>
      </div>
    </div>
  );
}
