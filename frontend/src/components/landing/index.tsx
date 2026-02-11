"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar } from "./navbar"
import {
  ArrowRight,
  BarChart3,
  Target,
  Zap,
  Shield,
  Calculator,
  Sparkles,
  TrendingUp,
  BookOpen,
} from "lucide-react"

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
}

const stagger = {
  animate: { transition: { staggerChildren: 0.1 } },
}

export function Landing() {
  return (
    <div className="min-h-screen bg-background relative">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Glow orbs */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[600px] opacity-30 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-[120px]" />
          <div className="absolute top-20 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-[100px]" />
        </div>

        <motion.div
          className="relative max-w-4xl mx-auto text-center"
          initial="initial"
          animate="animate"
          variants={stagger}
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-8"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Smart Grade Planning for Students
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight mb-6"
          >
            Your{" "}
            <span className="gradient-text">Academic</span>
            <br className="hidden sm:block" />
            Superpower
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Upload your course syllabus and instantly understand exactly what
            scores you need on every remaining assessment to hit your target grade.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/dashboard">
              <button className="btn-primary group inline-flex items-center gap-2 text-lg px-8 py-4 relative overflow-hidden">
                <span className="relative z-10">Start Planning</span>
                <ArrowRight className="relative z-10 h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                <div className="absolute inset-0 shimmer animate-shimmer" />
              </button>
            </Link>
            <a href="#how-it-works">
              <button className="btn-secondary text-lg px-8 py-4">
                See How It Works
              </button>
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats bar */}
      <section className="py-8 px-6 border-y border-border/40">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-12 sm:gap-20">
          {[
            { label: "Grade Scenarios", value: "Unlimited" },
            { label: "Assessment Types", value: "All" },
            { label: "Price", value: "Free" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="text-center"
            >
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-sm font-bold text-primary uppercase tracking-widest mb-3">
              How It Works
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
              Three Simple Steps
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              From course setup to grade mastery in minutes
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: BookOpen,
                step: "01",
                title: "Set Up Your Course",
                description:
                  "Add your course assessments and their weights. Enter scores for completed work.",
              },
              {
                icon: BarChart3,
                step: "02",
                title: "Analyze Feasibility",
                description:
                  "See if your target grade is achievable and exactly what scores you need going forward.",
              },
              {
                icon: Zap,
                step: "03",
                title: "Run Scenarios",
                description:
                  "Use the what-if simulator to test different score combinations and plan your study strategy.",
              },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="group glass rounded-2xl p-8 glass-hover"
                >
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
                      <Icon size={22} className="text-white" />
                    </div>
                    <span className="text-4xl font-bold text-muted-foreground/20">{item.step}</span>
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{item.description}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-sm font-bold text-accent uppercase tracking-widest mb-3">
              Features
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
              Everything You Need
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Built for students who want to take control of their academic performance
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Target, title: "Target Analysis", desc: "Set your target grade and see exactly what you need to achieve it" },
              { icon: BarChart3, title: "Feasibility Check", desc: "Know if your goal is realistic based on your current progress" },
              { icon: Zap, title: "What-If Simulator", desc: "Test unlimited scenarios with interactive sliders in real-time" },
              { icon: Calculator, title: "GPA Converter", desc: "Convert grades between percentage, 4.0, 9.0, and letter scales" },
              { icon: Shield, title: "Grading Rules", desc: "Support for best-of, drop-lowest, mandatory-pass, and bonus rules" },
              { icon: TrendingUp, title: "Risk Ranges", desc: "See minimum, safe, and stretch score ranges for planning" },
            ].map((feature, i) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="group glass rounded-2xl p-6 glass-hover"
                >
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative rounded-3xl overflow-hidden p-12 sm:p-16"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-primary/5" />
            <div className="absolute inset-0 glass" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                Ready to Take Control?
              </h2>
              <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto">
                Stop guessing about your grades. Start planning with precision and confidence.
              </p>
              <Link href="/dashboard">
                <button className="btn-primary inline-flex items-center gap-2 text-lg px-8 py-4 relative overflow-hidden">
                  <span className="relative z-10">Open Dashboard</span>
                  <ArrowRight className="relative z-10 h-5 w-5" />
                  <div className="absolute inset-0 shimmer animate-shimmer" />
                </button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border/40">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-sm text-muted-foreground">
            Evalio &middot; EECS 2311 Group 11 &middot; Winter 2026
          </p>
        </div>
      </footer>
    </div>
  )
}
