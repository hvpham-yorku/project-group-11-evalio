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
      <div className="flex h-screen items-center justify-center bg-[#F5F1EB] text-sm text-[#6B6560]">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#5F7A8A]" />
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
  const isDashboardView = pathname.startsWith("/setup/dashboard");

  const stepRoutes: Record<number, string> = {
    1: "/setup/upload",
    2: "/setup/structure",
    3: "/setup/grades",
    4: "/setup/goals",
    5: "/setup/deadlines",
    6: "/setup/dashboard",
  };

  return (
    <div className="min-h-screen bg-[#F5F1EB]">
      <div className="border-b border-[#E8E3DC] bg-[#FFFFFF]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-7">
          <div>
            <h1
              onClick={() => router.push("/")}
              className="cursor-pointer text-2xl font-bold text-[#3A3530]"
            >
              Evalio
            </h1>
            <p className="text-sm text-[#6B6560]">
              Plan your academic success with confidence
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push("/setup/dashboard")}
              className={`flex items-center gap-2 rounded-full bg-[#F5F1EB] px-5 py-3 text-sm font-medium transition hover:bg-[#E8E3DC] ${
                isDashboardView ? "text-[#3A3530]" : "text-[#6B6560]"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push("/setup/explore")}
              className={`flex items-center gap-2 rounded-full bg-[#F5F1EB] px-5 py-3 text-sm font-medium transition hover:bg-[#E8E3DC] ${
                isExploreView ? "text-[#3A3530]" : "text-[#6B6560]"
              }`}
            >
              Explore Scenarios
            </button>
            <button
              onClick={() => router.push("/setup/risk-center")}
              className={`flex items-center gap-2 rounded-full bg-[#F5F1EB] px-5 py-3 text-sm font-medium transition hover:bg-[#E8E3DC] ${
                isRiskCenterView ? "text-[#3A3530]" : "text-[#6B6560]"
              }`}
            >
              Risk Center
            </button>
          </div>
        </div>

        <div className={showStepProgress ? "border-t border-[#E8E3DC]" : ""}>
          <div className="mx-auto max-w-6xl px-8 pt-3 pb-1">
            {showCourseSelector ? <CourseSelector /> : null}
          </div>
        </div>

        {showStepProgress ? (
          <div className="border-t border-[#E8E3DC]">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-8 text-sm text-[#6B6560]">
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
                      className={`flex cursor-pointer items-center gap-3 ${
                        activeStep >= step ? "font-medium text-[#3A3530]" : ""
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${
                          activeStep >= step
                            ? "bg-[#6B8BA8] text-white"
                            : "bg-[#F5F1EB] text-[#6B6560]"
                        }`}
                      >
                        {activeStep > step ? <Check size={14} /> : step}
                      </span>
                      {labels[index]}
                    </div>
                    {step < 6 ? (
                      <div className="mx-5 h-[1px] flex-1 bg-[#E8E3DC]" />
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <main className="mx-auto max-w-6xl px-8 pt-7 pb-10">{children}</main>
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
