"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { getApiErrorMessage } from "@/lib/errors";
import { getMe, listCourses, login, register } from "@/lib/api";

type AuthMode = "login" | "register";

function resolveNext(nextParam: string | null): string {
  if (!nextParam) return "/setup/upload";
  if (!nextParam.startsWith("/")) return "/setup/upload";
  return nextParam;
}

async function resolveDefaultPostLoginRoute(): Promise<string> {
  try {
    const courses = await listCourses();
    return courses.length > 0 ? "/setup/dashboard" : "/setup/upload";
  } catch {
    return "/setup/upload";
  }
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nextRoute = useMemo(
    () => resolveNext(searchParams.get("next")),
    [searchParams]
  );

  const nextParam = useMemo(() => searchParams.get("next"), [searchParams]);

  async function navigateAfterAuth() {
    if (nextParam && nextParam.startsWith("/")) {
      router.replace(nextRoute);
      return;
    }

    const postLoginRoute = await resolveDefaultPostLoginRoute();
    router.replace(postLoginRoute);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (!email || !password) {
        setError("Please fill in all fields");
        return;
      }

      if (mode === "register") {
        await register({ email, password });
        setMessage("Account created. Please sign in.");
        setPassword("");
        setMode("login");
      } else {
        await login({ email, password });
        await navigateAfterAuth();
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Authentication failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onUseExistingSession() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await getMe();
      await navigateAfterAuth();
    } catch (err) {
      setError(getApiErrorMessage(err, "No active session found"));
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError(null);
    setMessage(null);
    setPassword("");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F1EB] p-6">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-8 shadow-sm">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-[#3A3530]">
              {mode === "login" ? "Sign in to Evalio" : "Create your Evalio account"}
            </h2>
            <p className="mt-1 text-sm text-[#6B6560]">
              {mode === "login" ? "Continue your setup securely." : "It takes less than a minute."}
            </p>
          </div>

          {/* Success */}
          {message ? (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-[#6B9B7A] bg-[#E8F2EA] p-3">
              <CheckCircle2 size={18} className="text-[#6B9B7A]" />
              <p className="text-sm text-[#6B9B7A]">{message}</p>
            </div>
          ) : null}

          {/* Error */}
          {error ? (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-[#B86B6B] bg-[#F9EAEA] p-3">
              <AlertCircle size={18} className="text-[#B86B6B]" />
              <p className="text-sm text-[#B86B6B]">{error}</p>
            </div>
          ) : null}

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-[#3A3530]">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-[#D4CFC7] bg-[#F5F1EB] px-4 py-2.5 text-[#3A3530] outline-none transition-all focus:border-[#5F7A8A] focus:ring-4 focus:ring-[#E8EFF5]"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-[#3A3530]">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#D4CFC7] bg-[#F5F1EB] px-4 py-2.5 pr-12 text-[#3A3530] outline-none transition-all focus:border-[#5F7A8A] focus:ring-4 focus:ring-[#E8EFF5]"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#6B6560] hover:opacity-70"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5F7A8A] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>

          {/* Mode toggle */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              disabled={loading}
              className="text-sm text-[#6B6560] hover:opacity-70"
            >
              {mode === "login" ? (
                <>
                  Need an account? <span className="text-[#5F7A8A]">Create one</span>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <span className="text-[#5F7A8A]">Sign in</span>
                </>
              )}
            </button>
          </div>

          {/* Existing session */}
          <div className="mt-4 border-t border-[#E8E3DC] pt-4 text-center">
            <button
              type="button"
              onClick={onUseExistingSession}
              disabled={loading}
              className="text-sm text-[#C4B5A6] underline hover:opacity-70"
            >
              Use existing session
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#F5F1EB]" />}>
      <LoginPageContent />
    </Suspense>
  );
}
