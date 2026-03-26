"use client";

import { Fragment, useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  SetupCourseProvider,
  useSetupCourse,
} from "@/app/setup/course-context";
import { getMe, getCourses } from "@/lib/api";
import { CourseSelector } from "@/components/setup/CourseSelector";

function SetupLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const { setCourseId } = useSetupCourse();
  const [authChecked, setAuthChecked] = useState(false);
  const checkInProgress = useRef(false);

  const isExploreView = pathname.startsWith("/setup/explore");
  const isManageView = pathname.startsWith("/setup/manage");

  useEffect(() => {
    let mounted = true;

    async function verifyAndRoute() {
      // Safety: Don't run if already checking or if not in a setup route
      if (checkInProgress.current || !pathname.startsWith("/setup")) {
        setAuthChecked(true);
        return;
      }

      checkInProgress.current = true;

      try {
        // 1. Try to get the user, but don't let a failure kill the app
        const user = await getMe().catch(() => null);

        if (!user) {
          if (mounted) {
            // Only redirect if trying to access sensitive dashboard/structure areas
            if (
              pathname.includes("dashboard") ||
              pathname.includes("structure")
            ) {
              router.replace(`/login?next=${encodeURIComponent(pathname)}`);
              return;
            }
            // Otherwise, let them stay and try to load the page
            setAuthChecked(true);
          }
          return;
        }

        // 2. User exists, check for courses
        const courses = await getCourses().catch(() => []);
        const hasCourses = Array.isArray(courses) && courses.length > 0;

        if (mounted) {
          if (hasCourses) {
            const savedId = window.localStorage.getItem(
              "evalio_active_course_id"
            );
            const validSavedId = courses.find(
              (c: any) => c.course_id === savedId
            );
            const targetId = validSavedId ? savedId : courses[0].course_id;

            if (targetId) setCourseId(targetId);

            // If landing on setup root or upload, skip to dashboard
            if (
              pathname === "/setup" ||
              pathname === "/setup/" ||
              pathname === "/setup/upload"
            ) {
              router.replace("/setup/dashboard");
              return;
            }
          } else {
            // New user routing: force upload if not on utility pages
            if (
              pathname !== "/setup/upload" &&
              !isExploreView &&
              !isManageView
            ) {
              router.replace("/setup/upload");
              return;
            }
          }
          setAuthChecked(true);
        }
      } catch (err) {
        console.error("Layout Guard caught an error:", err);
        if (mounted) setAuthChecked(true); // Fail open to prevent loops
      } finally {
        checkInProgress.current = false;
      }
    }

    verifyAndRoute();
    return () => {
      mounted = false;
    };
  }, [pathname, router, setCourseId, isExploreView, isManageView]);

  // Loading state
  if (!authChecked && pathname.startsWith("/setup")) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
          <span>Loading workspace...</span>
        </div>
      </div>
    );
  }

  const activeStep = (() => {
    if (pathname.startsWith("/setup/upload")) return 1;
    if (
      pathname.startsWith("/setup/manage") ||
      pathname.startsWith("/setup/structure")
    )
      return 2;
    if (pathname.startsWith("/setup/grades")) return 3;
    if (pathname.startsWith("/setup/goals")) return 4;
    if (pathname.startsWith("/setup/deadlines")) return 5;
    if (pathname.startsWith("/setup/dashboard")) return 6;
    return 1;
  })();

  const showCourseSelector = activeStep > 1;
  const showStepProgress = !isExploreView && !isManageView;

  const stepRoutes: Record<number, string> = {
    1: "/setup/upload",
    2: "/setup/structure",
    3: "/setup/grades",
    4: "/setup/goals",
    5: "/setup/deadlines",
    6: "/setup/dashboard",
  };

  return (
    <div className="p-8">
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
            className="bg-[#F3F0EC] px-4 py-2 rounded-lg text-sm font-medium transition hover:bg-[#E9E5E0]"
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push("/setup/explore")}
            className="bg-[#E9E5E0] px-4 py-2 rounded-lg text-sm font-medium transition hover:bg-[#DCD7D0]"
          >
            Explore Scenarios
          </button>
        </div>
      </div>

      {showCourseSelector && <CourseSelector />}

      {showStepProgress && (
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
              <Fragment key={step}>
                <div
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
                    {activeStep > step ? <Check size={12} /> : step}
                  </span>
                  {labels[index]}
                </div>
                {step < 6 && (
                  <div className="h-[1px] bg-gray-200 flex-1 mx-4" />
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      <main className="max-w-6xl mx-auto">{children}</main>
    </div>
  );
}

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SetupCourseProvider>
      <SetupLayoutContent>{children}</SetupLayoutContent>
    </SetupCourseProvider>
  );
}
