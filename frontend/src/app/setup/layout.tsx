"use client";

import { usePathname } from "next/navigation";

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";

  const activeStep = (() => {
    if (pathname === "/setup" || pathname === "/setup/") return 1;
    if (pathname.startsWith("/setup/upload")) return 1;
    if (pathname.startsWith("/setup/structure")) return 2;
    if (pathname.startsWith("/setup/grades")) return 3;
    if (pathname.startsWith("/setup/goals")) return 4;
    if (pathname.startsWith("/setup/dashboard")) return 5;
    return 1;
  })();

  return (
    <div className="p-8">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Evalio</h1>
          <p className="text-gray-500 text-sm">
            Plan your academic success with confidence
          </p>
        </div>
        <div className="flex gap-4">
          <button className="flex items-center gap-2 bg-[#F3F0EC] px-4 py-2 rounded-lg text-sm font-medium">
            Dashboard
          </button>
          <button className="flex items-center gap-2 bg-[#E9E5E0] px-4 py-2 rounded-lg text-sm font-medium">
            Explore Scenarios
          </button>
        </div>
      </div>

      {/* UPDATED 5-STEP PROGRESS BAR */}
      <div className="flex justify-between items-center max-w-4xl mx-auto mb-12 text-sm text-gray-400">
        <div className={activeStep === 1 ? "flex items-center gap-2 text-slate-600 font-semibold" : "flex items-center gap-2"}>
          <span className={activeStep === 1 ? "bg-slate-600 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs" : "bg-gray-200 text-gray-500 w-6 h-6 flex items-center justify-center rounded-full text-xs"}>
            1
          </span>
          Upload
        </div>
        <div className="h-[1px] bg-gray-200 flex-1 mx-4" />
        <div className={activeStep === 2 ? "flex items-center gap-2 text-slate-600 font-semibold" : "flex items-center gap-2"}>
          <span className={activeStep === 2 ? "bg-slate-600 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs" : "bg-gray-200 text-gray-500 w-6 h-6 flex items-center justify-center rounded-full text-xs"}>
            2
          </span>{" "}
          Structure
        </div>
        <div className="h-[1px] bg-gray-200 flex-1 mx-4" />
        <div className={activeStep === 3 ? "flex items-center gap-2 text-slate-600 font-semibold" : "flex items-center gap-2"}>
          <span className={activeStep === 3 ? "bg-slate-600 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs" : "bg-gray-200 text-gray-500 w-6 h-6 flex items-center justify-center rounded-full text-xs"}>
            3
          </span>{" "}
          Grades
        </div>
        <div className="h-[1px] bg-gray-200 flex-1 mx-4" />
        <div className={activeStep === 4 ? "flex items-center gap-2 text-slate-600 font-semibold" : "flex items-center gap-2"}>
          <span className={activeStep === 4 ? "bg-slate-600 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs" : "bg-gray-200 text-gray-500 w-6 h-6 flex items-center justify-center rounded-full text-xs"}>
            4
          </span>{" "}
          Goals
        </div>
        <div className="h-[1px] bg-gray-200 flex-1 mx-4" />
        <div className={activeStep === 5 ? "flex items-center gap-2 text-slate-600 font-semibold" : "flex items-center gap-2"}>
          <span className={activeStep === 5 ? "bg-slate-600 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs" : "bg-gray-200 text-gray-500 w-6 h-6 flex items-center justify-center rounded-full text-xs"}>
            5
          </span>{" "}
          Dashboard
        </div>
      </div>

      {children}
    </div>
  );
}
