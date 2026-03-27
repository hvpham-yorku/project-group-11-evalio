"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check } from "lucide-react";

import {
  SetupCourseProvider,
  useSetupCourse,
} from "@/app/setup/course-context";
import { getMe, listCourses } from "@/lib/api";
import { CourseSelector } from "@/components/setup/CourseSelector";

function SetupLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const { setCourseId } = useSetupCourse();

  const [authChecked, setAuthChecked] = useState(false);
  const checkInProgress = useRef(false);

  const isExploreView = pathname.startsWith("/setup/explore");
  const isManageView = pathname.startsWith("/setup/manage");
  const isRiskCenterView = pathname.startsWith("/setup/risk-center");

  const showStepProgress =
    !isExploreView && !isManageView && !isRiskCenterView;

  useEffect(() => {
    let mounted = true;

    async function verifyAndRoute() {
      if (checkInProgress.current || !pathname.startsWith("/setup")) {
        setAuthChecked(true);
        return;
      }

      checkInProgress.current = true;

      try {
        const user = await getMe().catch(() => null);

        if (!user) {
          if (mounted) {
            if (pathname.includes("dashboard") || pathname.includes("structure")) {
              router.replace(`/login?next=${encodeURIComponent(pathname)}`);
              return;
            }
            setAuthChecked(true);
          }
          return;
        }

        const courses = await listCourses().catch(() => []);
        const hasCourses = Array.isArray(courses) && courses.length > 0;

        if (mounted) {
          if (hasCourses) {
            const savedId = window.localStorage.getItem("evalio_active_course_id");
            const validSavedId = courses.find((course) => course.course_id === savedId);
            const targetId = validSavedId ? savedId : courses[0].course_id;

            if (targetId) {
              setCourseId(targetId);
            }

            if (
              pathname === "/setup" ||
              pathname === "/setup/" ||
              pathname === "/setup/upload"
            ) {
              router.replace("/setup/dashboard");
              return;
            }
          } else if (
            pathname !== "/setup/upload" &&
            !isExploreView &&
            !isManageView
          ) {
            router.replace("/setup/upload");
            return;
          }

          setAuthChecked(true);
        }
      } catch (err) {
        console.error("Layout Guard caught an error:", err);
        if (mounted) {
          setAuthChecked(true);
        }
      } finally {
        checkInProgress.current = false;
      }
    }

    verifyAndRoute();

    return () => {
      mounted = false;
    };
  }, [pathname, router, setCourseId, isExploreView, isManageView]);

  if (!authChecked && pathname.startsWith("/setup")) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-600" />
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
    ) {
      return 2;
    }
    if (pathname.startsWith("/setup/grades")) return 3;
    if (pathname.startsWith("/setup/goals")) return 4;
    if (pathname.startsWith("/setup/deadlines")) return 5;
    if (pathname.startsWith("/setup/dashboard")) return 6;
    return 1;
  })();

  const showCourseSelector = activeStep > 1;

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
      <div className="mb-8 flex items-center justify-between border-b pb-4">
        <div>
          <h1
            onClick={() => router.push("/")}
            className="cursor-pointer text-2xl font-bold"
          >
            Evalio
          </h1>
          <p className="text-sm text-gray-500">
            Plan your academic success with confidence
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => router.push("/setup/dashboard")}
            className="flex items-center gap-2 rounded-lg bg-[#F3F0EC] px-4 py-2 text-sm font-medium transition hover:bg-[#E9E5E0]"
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push("/setup/explore")}
            className="flex items-center gap-2 rounded-lg bg-[#E9E5E0] px-4 py-2 text-sm font-medium transition hover:bg-[#DCD7D0]"
          >
            Explore Scenarios
          </button>
          <button
            onClick={() => router.push("/setup/risk-center")}
            className="flex items-center gap-2 rounded-lg bg-[#E9E5E0] px-4 py-2 text-sm font-medium transition hover:bg-[#DCD7D0]"
          >
            Risk Center
          </button>
        </div>
      </div>

      {showCourseSelector && <CourseSelector />}

      {showStepProgress ? (
        <div className="mx-auto mb-12 flex max-w-6xl items-center justify-between text-sm text-gray-400">
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
                  className={`cursor-pointer items-center gap-2 ${
                    activeStep >= step ? "font-semibold text-slate-600" : ""
                  } flex`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      activeStep >= step
                        ? "bg-slate-600 text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {activeStep > step ? <Check size={12} /> : step}
                  </span>
                  {labels[index]}
                </div>
                {step < 6 ? <div className="mx-4 h-[1px] flex-1 bg-gray-200" /> : null}
              </Fragment>
            );
          })}
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl">{children}</main>
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
