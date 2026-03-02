"use client";

import { useRouter } from "next/navigation";
import {
  Upload,
  ListChecks,
  GraduationCap,
  Target,
  CalendarDays,
  LayoutDashboard,
  CheckCircle2,
} from "lucide-react";

type StepItem = {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
};

const steps: StepItem[] = [
  { title: "Upload", subtitle: "Share your course syllabus", icon: Upload },
  { title: "Structure", subtitle: "Define your grade breakdown", icon: ListChecks },
  { title: "Grades", subtitle: "Enter your current scores", icon: GraduationCap },
  { title: "Goals", subtitle: "Set your target grade", icon: Target },
  { title: "Plan", subtitle: "Map out what is needed", icon: CalendarDays },
  { title: "Dashboard", subtitle: "See your complete picture", icon: LayoutDashboard },
];

const benefits = [
  {
    title: "Transparent Calculations",
    subtitle: "See exactly how your grades are calculated and what they mean",
  },
  {
    title: "Safe Exploration",
    subtitle: "Test different scenarios without fear of permanent changes",
  },
  {
    title: "Reduced Anxiety",
    subtitle: "Focus on understanding and planning, not panic",
  },
];

export function WelcomePage() {
  const router = useRouter();

  return (
    <div className="max-w-5xl mx-auto px-4 pb-20">
      {/* HERO */}
      <div className="pt-10 text-center">
        <h1 className="text-4xl md:text-5xl font-semibold text-gray-800">
          Welcome to Evalio
        </h1>
        <p className="mt-3 text-gray-600">
          Your calm, transparent companion for academic planning
        </p>
        <p className="mt-2 text-sm text-[#B8A89A] max-w-2xl mx-auto">
          Understand your grades, explore possibilities, and plan your path forward, without the stress.
        </p>
      </div>

      {/* HOW IT WORKS */}
      <div className="mt-10 bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
        <h2 className="text-sm font-medium text-gray-600 text-center">
          How it works
        </h2>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-10">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-[#EEF3F5] flex items-center justify-center">
                  <Icon className="w-6 h-6 text-[#5D737E]" />
                </div>
                <p className="mt-4 font-semibold text-gray-800">{s.title}</p>
                <p className="mt-1 text-xs text-gray-500">{s.subtitle}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* BENEFITS */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {benefits.map((b) => (
          <div
            key={b.title}
            className="bg-[#F6F1EA] border border-gray-100 rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800">{b.title}</p>
                <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                  {b.subtitle}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-10 text-center">
        <button
          onClick={() => router.push("/login")}
          className="bg-[#5D737E] text-white px-10 py-4 rounded-2xl font-semibold shadow-lg hover:bg-[#4A5D66] transition"
        >
          Get Started
        </button>
        <p className="mt-3 text-xs text-[#B8A89A]">
          Takes about 5 minutes to set up
        </p>
      </div>
    </div>
  );
}