"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { getApiErrorMessage } from "@/lib/errors";
import { getMe, login, register } from "@/lib/api";

type AuthMode = "login" | "register";

function resolveNext(nextParam: string | null): string {
  if (!nextParam) return "/setup/upload";
  if (!nextParam.startsWith("/")) return "/setup/upload";
  return nextParam;
}

export default function LoginPage() {
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
        router.replace(nextRoute);
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
      router.replace(nextRoute);
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
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-[#F7F3ED] to-[#F3EEE7]">
      <div className="w-full max-w-md">
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-800">
              {mode === "login" ? "Sign in to Evalio" : "Create your Evalio account"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {mode === "login" ? "Continue your setup securely." : "It takes less than a minute."}
            </p>
          </div>

          {/* Success */}
          {message ? (
            <div className="mb-4 rounded-2xl p-3 flex items-center gap-2 border border-green-200 bg-green-50">
              <CheckCircle2 size={18} className="text-green-700" />
              <p className="text-sm text-green-700">{message}</p>
            </div>
          ) : null}

          {/* Error */}
          {error ? (
            <div className="mb-4 rounded-2xl p-3 flex items-center gap-2 border border-red-200 bg-red-50">
              <AlertCircle size={18} className="text-red-700" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : null}

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-sm mb-2 text-gray-800">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-xl outline-none transition-all bg-[#FBFAF8] border border-[#E6E2DB] text-gray-800 focus:border-[#5D737E] focus:ring-4 focus:ring-[#DDE7EC]"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="block text-sm mb-2 text-gray-800">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2.5 pr-12 rounded-xl outline-none transition-all bg-[#FBFAF8] border border-[#E6E2DB] text-gray-800 focus:border-[#5D737E] focus:ring-4 focus:ring-[#DDE7EC]"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-500 hover:opacity-70"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-white px-6 py-3 rounded-xl font-medium transition disabled:opacity-60 bg-[#5D737E] hover:bg-[#4A5D66] shadow-sm"
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
              className="text-sm text-gray-500 hover:opacity-70"
            >
              {mode === "login" ? (
                <>
                  Need an account? <span className="text-[#5D737E]">Create one</span>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <span className="text-[#5D737E]">Sign in</span>
                </>
              )}
            </button>
          </div>

          {/* Existing session */}
          <div className="mt-4 text-center pt-4 border-t border-[#E6E2DB]">
            <button
              type="button"
              onClick={onUseExistingSession}
              disabled={loading}
              className="text-sm underline text-[#B8A89A] hover:opacity-70"
            >
              Use existing session
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}