"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Upload,
  Check,
  ChevronDown,
  TrendingUp,
  Shield,
  Sparkles,
  Calculator,
  Target,
  Zap,
  BookOpen,
} from "lucide-react";

/* ─── scroll-triggered visibility ─── */

function useReveal<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

const fade = (on: boolean, delay = 0) =>
  ({
    opacity: on ? 1 : 0,
    transform: on ? "translateY(0)" : "translateY(24px)",
    transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
  }) as const;

/* ─── page ─── */

export function WelcomePage() {
  const router = useRouter();
  const hero = useReveal<HTMLElement>();
  const journey = useReveal<HTMLDivElement>();
  const features = useReveal<HTMLDivElement>();
  const cta = useReveal<HTMLDivElement>();

  return (
    <div className="min-h-screen bg-[#F5F1EB] text-[#3A3530] antialiased">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-[#E8E3DC] bg-[#F5F1EB]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5F7A8A]">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Evalio</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/login")}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[#5F7A8A] transition hover:bg-[#E8EFF5]"
            >
              Sign In
            </button>
            <button
              onClick={() => router.push("/login")}
              className="rounded-lg bg-[#5F7A8A] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        ref={hero.ref}
        className="relative mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-24 md:pb-28"
      >
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          {/* copy */}
          <div style={fade(hero.visible)}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-[#5F7A8A]">
              Academic Grade Planner
            </p>
            <h1 className="mt-4 text-[2.75rem] font-extrabold leading-[1.08] tracking-tight md:text-[3.5rem]">
              Your grades,
              <br />
              <span className="text-[#5F7A8A]">clarified.</span>
            </h1>
            <p className="mt-5 max-w-[26rem] text-[1.05rem] leading-relaxed text-[#6B6560]">
              Upload your syllabus, track every assessment, and see exactly what
              you need on each remaining exam. No guesswork, no spreadsheets.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={() => router.push("/login")}
                className="group flex items-center gap-2 rounded-lg bg-[#5F7A8A] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Start Planning
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </button>
              <span className="text-sm text-[#C4B5A6]">
                Free &middot; Under 2 min setup
              </span>
            </div>
          </div>

          {/* product preview */}
          <div className="relative" style={fade(hero.visible, 200)}>
            <div className="rounded-2xl border border-[#D4CFC7] bg-[#FFFFFF] p-5 shadow-xl shadow-black/[0.04] md:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-[#6B6560]">
                    EECS 2311 &mdash; Software Dev
                  </p>
                  <p className="mt-1 text-2xl font-bold">78.4%</p>
                </div>
                <span className="rounded-full bg-[#E8F2EA] px-2.5 py-1 text-xs font-semibold text-[#6B9B7A]">
                  On Track
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {(
                  [
                    ["Assignments", 85, "bg-[#5F7A8A]"],
                    ["Midterm", 72, "bg-[#C9945F]"],
                    ["Labs", 90, "bg-[#6B9B7A]"],
                    ["Final Exam", 0, "bg-[#E8E3DC]"],
                  ] as const
                ).map(([name, pct, color]) => (
                  <div key={name}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-[#3A3530]">{name}</span>
                      <span className="text-[#6B6560]">
                        {pct > 0 ? `${pct}%` : "\u2014"}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#E8E3DC]">
                      <div
                        className={`h-full rounded-full ${color}`}
                        style={{
                          width: hero.visible ? `${pct}%` : "0%",
                          transition: "width 1s ease",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {(
                  [
                    ["Target", "80%", "bg-[#FDF3E7]"],
                    ["Need on Final", "74%", "bg-[#E8EFF5]"],
                    ["Best Case", "92%", "bg-[#E8F2EA]"],
                  ] as const
                ).map(([label, value, bg]) => (
                  <div key={label} className={`rounded-xl ${bg} p-3 text-center`}>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-[#6B6560]">
                      {label}
                    </p>
                    <p className="mt-0.5 text-lg font-bold">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* floating chip */}
            <div className="absolute -bottom-4 -left-3 hidden items-center gap-2.5 rounded-xl border border-[#D4CFC7] bg-[#FFFFFF] px-4 py-2.5 shadow-lg shadow-black/[0.04] md:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FDF3E7]">
                <Target size={14} className="text-[#C9945F]" />
              </div>
              <div>
                <p className="text-[11px] text-[#6B6560]">Min. required</p>
                <p className="text-sm font-bold">74% on Final</p>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-20 flex flex-col items-center justify-center text-center md:mt-24"
          style={fade(hero.visible, 350)}
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C4B5A6]">
            Scroll to explore
          </span>
          <div className="mt-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#D4CFC7] bg-[#FFFFFF]/80 text-[#5F7A8A] shadow-sm">
            <ChevronDown className="h-4 w-4 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <div className="border-y border-[#E8E3DC] bg-[#FFFFFF]/50">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 py-3.5 text-xs font-medium text-[#6B6560]">
          {[
            "6-step setup",
            "AI-powered extraction",
            "What-if scenarios",
            "100% free & private",
          ].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <Check size={12} className="text-[#6B9B7A]" />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── How it works ── */}
      <section
        ref={journey.ref}
        className="mx-auto max-w-6xl px-6 py-24 md:py-32"
      >
        <div style={fade(journey.visible)}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-[#5F7A8A]">
            How It Works
          </p>
          <h2 className="mt-3 text-3xl font-bold md:text-4xl">
            Syllabus to strategy in three moves
          </h2>
        </div>

        <div className="mt-16 space-y-20 md:space-y-28">
          {/* step 1 */}
          <div
            className="grid items-center gap-10 md:grid-cols-2 md:gap-16"
            style={fade(journey.visible, 200)}
          >
            <div>
              <span className="text-5xl font-extrabold text-[#E8E3DC]">01</span>
              <h3 className="mt-2 text-xl font-bold md:text-2xl">
                Drop your syllabus
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#6B6560]">
                Upload a PDF or Word doc. Our AI reads it and extracts every
                assessment, weight, and grading rule automatically. Review,
                tweak, done.
              </p>
            </div>
            <div className="rounded-xl border border-dashed border-[#D4CFC7] bg-[#FFFFFF] p-6 text-center">
              <Upload size={28} className="mx-auto text-[#C4B5A6]" />
              <p className="mt-3 text-sm font-medium text-[#3A3530]">
                Drop syllabus here
              </p>
              <p className="mt-1 text-xs text-[#6B6560]">
                PDF, DOCX &mdash; extracted in seconds
              </p>
              <div className="mx-auto mt-4 max-w-[240px] space-y-2">
                {[
                  "Assignments — 30%",
                  "Midterm — 25%",
                  "Labs — 15%",
                  "Final Exam — 30%",
                ].map((t) => (
                  <div
                    key={t}
                    className="flex items-center gap-2 rounded-lg border border-[#D4CFC7] bg-[#FFFFFF] px-3 py-1.5 text-xs"
                  >
                    <Check size={12} className="shrink-0 text-[#6B9B7A]" />
                    <span className="text-[#3A3530]">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* step 2 */}
          <div
            className="grid items-center gap-10 md:grid-cols-2 md:gap-16"
            style={fade(journey.visible, 400)}
          >
            <div className="md:order-2">
              <span className="text-5xl font-extrabold text-[#E8E3DC]">02</span>
              <h3 className="mt-2 text-xl font-bold md:text-2xl">
                Enter grades as you go
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#6B6560]">
                Input scores after each assessment. Your dashboard updates in
                real time &mdash; current standing, projected range, and whether
                you&apos;re on track for your target.
              </p>
            </div>
            <div className="rounded-xl border border-[#D4CFC7] bg-[#FFFFFF] p-5 md:order-1">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#3A3530]">
                  Your progress
                </span>
                <span className="text-xs text-[#6B6560]">3 of 4 graded</span>
              </div>
              <div className="space-y-2">
                {(
                  [
                    ["Assignments", "85%", true],
                    ["Midterm", "72%", true],
                    ["Labs", "90%", true],
                    ["Final Exam", "\u2014", false],
                  ] as const
                ).map(([name, score, done]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-lg bg-[#F5F1EB] px-3 py-2"
                  >
                    <span className="text-xs font-medium text-[#3A3530]">
                      {name}
                    </span>
                    <span
                      className={`text-xs font-semibold ${done ? "text-[#6B9B7A]" : "text-[#6B6560]"}`}
                    >
                      {score}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-[#E8EFF5] px-3 py-2 text-center text-xs font-medium text-[#5F7A8A]">
                Current: 78.4% &middot; Target: 80%
              </div>
            </div>
          </div>

          {/* step 3 */}
          <div
            className="grid items-center gap-10 md:grid-cols-2 md:gap-16"
            style={fade(journey.visible, 600)}
          >
            <div>
              <span className="text-5xl font-extrabold text-[#E8E3DC]">03</span>
              <h3 className="mt-2 text-xl font-bold md:text-2xl">
                Run what-if scenarios
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#6B6560]">
                Slide hypothetical scores to see how each assessment affects your
                final grade. Find out the minimum you need and plan your study
                time around what actually matters.
              </p>
            </div>
            <div className="rounded-xl border border-[#D4CFC7] bg-[#FFFFFF] p-5">
              <p className="mb-4 text-sm font-semibold text-[#3A3530]">
                What if I get&hellip;
              </p>
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-[#3A3530]">Final Exam</span>
                    <span className="font-semibold text-[#5F7A8A]">74%</span>
                  </div>
                  <div className="relative h-2 rounded-full bg-[#E8E3DC]">
                    <div className="h-full w-[74%] rounded-full bg-[#5F7A8A]" />
                    <div className="absolute left-[74%] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-[#5F7A8A] bg-[#FFFFFF] shadow-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-[#E8F2EA] px-3 py-2 text-center">
                    <p className="text-[10px] font-medium text-[#6B9B7A]">
                      PROJECTED
                    </p>
                    <p className="text-lg font-bold text-[#6B9B7A]">80.2%</p>
                  </div>
                  <div className="rounded-lg bg-[#FDF3E7] px-3 py-2 text-center">
                    <p className="text-[10px] font-medium text-[#C9945F]">
                      MIN. FOR TARGET
                    </p>
                    <p className="text-lg font-bold text-[#C9945F]">74%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section ref={features.ref} className="bg-[#3A3530] py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div style={fade(features.visible)}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-[#C4D6E4]">
              Capabilities
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">
              Built for how students actually plan
            </h2>
          </div>

          <div
            className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            style={fade(features.visible, 200)}
          >
            {(
              [
                [
                  Calculator,
                  "What-If Scenarios",
                  "Slide grades up and down to see how each assessment impacts your final mark. Save scenarios and compare outcomes.",
                ],
                [
                  TrendingUp,
                  "Minimum Required",
                  "Know exactly what score you need on each remaining assessment to hit your target grade.",
                ],
                [
                  Shield,
                  "Mandatory Pass",
                  "Courses with pass thresholds are flagged clearly so you\u2019re never blindsided by a hidden requirement.",
                ],
                [
                  Sparkles,
                  "Bonus Marks",
                  "Extra credit tracked separately. Your core grade stays clean, bonus contribution adds on top.",
                ],
                [
                  Zap,
                  "AI Extraction",
                  "Upload a PDF or Word syllabus and get your full grade breakdown extracted in seconds.",
                ],
                [
                  BookOpen,
                  "Study Strategies",
                  "Focus recommendations based on assessment weight, deadline proximity, and your current standing.",
                ],
              ] as const
            ).map(([Icon, title, desc]) => (
              <div
                key={title}
                className="rounded-2xl border border-[#6B6560] bg-[#3A3530] p-5 transition hover:border-[#C4B5A6]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E8EFF5]">
                  <Icon size={16} className="text-[#5F7A8A]" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-white">
                  {title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#E8E3DC]">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section ref={cta.ref} className="py-24 md:py-32">
        <div
          className="mx-auto max-w-3xl px-6 text-center"
          style={fade(cta.visible)}
        >
          <h2 className="text-3xl font-bold leading-tight md:text-[2.75rem] md:leading-[1.12]">
            Stop guessing what you need
            <br />
            <span className="text-[#5F7A8A]">on the final.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-[#6B6560]">
            Set up your first course in under 2 minutes. Free, private, and
            built for students who want to plan with confidence.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="group mt-10 inline-flex items-center gap-2 rounded-lg bg-[#5F7A8A] px-8 py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Get Started Free
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#E8E3DC] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#5F7A8A]">
              <BarChart3 className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-semibold">Evalio</span>
          </div>
          <p className="text-xs text-[#6B6560]">
            EECS 2311 &middot; York University &middot; Group 11
          </p>
        </div>
      </footer>
    </div>
  );
}
