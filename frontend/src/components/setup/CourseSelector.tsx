"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Settings, Check } from "lucide-react";
import { listCourses, type Course } from "@/lib/api";
import { useSetupCourse } from "@/app/setup/course-context";

export function CourseSelector() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const { courseId, setCourseId } = useSetupCourse();

  useEffect(() => {
    listCourses().then(setCourses).catch(console.error);
  }, []);

  const currentCourse = courses.find((c) => c.course_id === courseId);

  return (
    <div className="max-w-6xl mx-auto mb-6 relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between bg-[#F9F8F6] border border-gray-200 rounded-lg px-4 py-2 cursor-pointer hover:bg-gray-50 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-800 text-sm">
            {currentCourse?.course_name || "Select Course"}
          </span>
          <ChevronDown
            size={14}
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <span className="text-gray-400">
            Current: <b className="text-gray-700">0.0%</b>
          </span>
          <span className="text-gray-400">
            Target: <b className="text-gray-700">85%</b>
          </span>
          <span className="px-2 py-0.5 rounded-full font-bold uppercase bg-orange-50 text-orange-600">
            Risky
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
          {courses.map((course) => (
            <div
              key={course.course_id}
              onClick={() => {
                setCourseId(course.course_id);
                setIsOpen(false);
              }}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 text-sm"
            >
              <span>{course.course_name}</span>
              {course.course_id === courseId && (
                <Check size={14} className="text-slate-600" />
              )}
            </div>
          ))}

          <div
            onClick={() => router.push("/setup/upload")}
            className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600 hover:bg-gray-50 cursor-pointer border-b border-gray-50"
          >
            <Plus size={14} />
            <span>Add New Course</span>
          </div>

          <div
            onClick={() => router.push("/setup/manage")} // Adjust path to wherever your manage page is
            className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600 hover:bg-gray-50 cursor-pointer"
          >
            <Settings size={14} />
            <span>Manage Courses</span>
          </div>
        </div>
      )}
    </div>
  );
}
