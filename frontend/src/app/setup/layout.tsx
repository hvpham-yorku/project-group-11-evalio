"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { SetupCourseProvider } from "@/app/setup/course-context";
import { getMe } from "@/lib/api";
import { CourseSelector } from "@/components/setup/CourseSelector";

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  // Only show the 6-step progress bar if we aren't in the "Explore" view
  const showStepProgress = !pathname.startsWith("/setup/explore");

  useEffect(() => {
    let mounted = true;

    async function verifySession() {
      try {
        await getMe();
        if (mounted) {
          setAuthChecked(true);
        }
      } catch {
        if (mounted) {
          const next = encodeURIComponent(pathname || "/setup/upload");
          router.replace(`/login?next=${next}`);
        }
      }
    }

    verifySession();

    return () => {
      mounted = false;
    };
  }, [pathname, router]);

  if (!authChecked) {
    return <div className="p-8 text-sm text-gray-500">Checking session...</div>;
  }

  // Calculate which step we are on based on the URL
  const activeStep = (() => {
    if (pathname === "/setup" || pathname === "/setup/") return 1;
    if (pathname.startsWith("/setup/upload")) return 1;
    if (pathname.startsWith("/setup/structure")) return 2;
    if (pathname.startsWith("/setup/grades")) return 3;
    if (pathname.startsWith("/setup/goals")) return 4;
    if (pathname.startsWith("/setup/deadlines")) return 5;
    if (pathname.startsWith("/setup/dashboard")) return 6;
    return 1;
  })();

  // Logic: Only show the multi-course selector bar AFTER the upload step (Step 1)
  const showCourseSelector = activeStep > 1;

  const stepRoutes: Record<number, string> = {
    1: "/setup/upload",
    2: "/setup/structure",
    3: "/setup/grades",
    4: "/setup/goals",
    5: "/setup/deadlines",
    6: "/setup/dashboard",
  };

  const renderStepCircle = (step: number) => {
    if (activeStep > step) {
      return <Check size={12} />;
    }
    return step;
  };

  return (
    <SetupCourseProvider>
      <div className="p-8">
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 border-b pb-4">
          <div>
            <h1
              onClick={() => router.push("/")}
              className="text-2xl font-bold cursor-pointer"
            >
              Evalio
            </h1>
            <p className="text-gray-500 text-sm">
              Plan your academic success with confidence
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push("/setup/dashboard")}
              className="flex items-center gap-2 bg-[#F3F0EC] px-4 py-2 rounded-lg text-sm font-medium transition hover:bg-[#E9E5E0]"
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push("/setup/explore")}
              className="flex items-center gap-2 bg-[#E9E5E0] px-4 py-2 rounded-lg text-sm font-medium transition hover:bg-[#DCD7D0]"
            >
              Explore Scenarios
            </button>
          </div>
        </div>

        {/* 6-STEP PROGRESS BAR */}
        {showStepProgress ? (
          <div className="flex justify-between items-center max-w-6xl mx-auto mb-12 text-sm text-gray-400">
            {[1, 2, 3, 4, 5, 6].map((step, index) => {
              const labels = [
                "Upload",
                "Structure",
                "Grades",
                "Goals",
                "Deadlines",
                "Dashboard",
              ];
              return (
                <>
                  <div
                    key={step}
                    onClick={() => router.push(stepRoutes[step])}
                    className={`flex items-center gap-2 cursor-pointer ${
                      activeStep >= step ? "text-slate-600 font-semibold" : ""
                    }`}
                  >
                    <span
                      className={`w-6 h-6 flex items-center justify-center rounded-full text-xs ${
                        activeStep >= step
                          ? "bg-slate-600 text-white"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {renderStepCircle(step)}
                    </span>
                    {labels[index]}
                  </div>
                  {step < 6 && (
                    <div className="h-[1px] bg-gray-200 flex-1 mx-4" />
                  )}
                </>
              );
            })}
          </div>
        ) : null}

        {/* COURSE SELECTOR (Shows only after Step 1) */}
        {showCourseSelector && <CourseSelector />}

        {/* PAGE CONTENT */}
        <main className="max-w-6xl mx-auto">{children}</main>
      </div>
    </SetupCourseProvider>
  );
}
