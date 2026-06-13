"use client";

import { AxiosError } from "axios";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { KawaiiCactus, KawaiiCat } from "@/components/Kawaii";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth-context";
import { obtainToken, register } from "@/services/auth";

interface AuthScreenProps {
  mode: "signup" | "login";
}

/** Pulls a friendly message out of a DRF error payload. */
function errorMessage(err: unknown): string {
  if (err instanceof AxiosError && err.response?.data) {
    const data = err.response.data as Record<string, unknown>;
    const firstField = ["email", "password", "detail", "non_field_errors"].find(
      (k) => data[k],
    );
    if (firstField) {
      const value = data[firstField];
      const text = Array.isArray(value) ? value[0] : value;
      if (typeof text === "string") return text;
    }
  }
  return "Something went wrong. Please try again.";
}

const COPY = {
  signup: {
    heading: "Yay, New Friend!",
    button: "Sign Up",
    crossText: "We're already friends!",
    crossHref: "/login",
  },
  login: {
    heading: "Yay, You're Back!",
    button: "Login",
    crossText: "Oops! I've never been here before",
    crossHref: "/signup",
  },
} as const;

const inputClass =
  "h-11 w-full rounded-xl border border-ink-line bg-paper px-4 text-sm text-ink placeholder:text-ink-line focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-linen-soft/60 dark:bg-bark-soft dark:text-linen dark:placeholder:text-linen-soft/70 dark:focus:border-linen";

export default function AuthScreen({ mode }: AuthScreenProps) {
  const copy = COPY[mode];
  const router = useRouter();
  const { ready, isAuthenticated, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Straight to the board.
  useEffect(() => {
    if (ready && isAuthenticated) router.replace("/");
  }, [ready, isAuthenticated, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await register(email, password);
      }
      const tokens = await obtainToken(email, password);
      login(tokens);
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-xs flex-col items-stretch gap-4"
        aria-label={copy.heading}
      >
        <h1 className="mb-4 text-center font-serif text-4xl font-bold text-ink dark:text-linen">
          {copy.heading}
        </h1>

        <label className="sr-only" htmlFor="auth-email">
          Email address
        </label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className={inputClass}
        />

        <div className="relative">
          <label className="sr-only" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type={showPassword ? "text" : "password"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-line transition-colors hover:text-ink dark:text-linen-soft dark:hover:text-linen"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {error && (
          <p role="alert" className="text-center text-sm text-[#B4543E]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 h-11 rounded-full border border-ink-line bg-paper text-sm font-semibold text-ink transition-colors hover:bg-[#EFE3C8] disabled:cursor-not-allowed disabled:opacity-60 dark:border-linen-soft/60 dark:bg-bark-soft dark:text-linen dark:hover:bg-[#46382a]"
        >
          {submitting ? "One moment..." : copy.button}
        </button>

        <Link
          href={copy.crossHref}
          className="mt-1 text-center text-xs text-ink underline underline-offset-2 hover:text-ink-soft dark:text-linen dark:hover:text-linen-soft"
        >
          {copy.crossText}
        </Link>
      </form>

      <KawaiiCactus className="pointer-events-none absolute -left-2 bottom-0 h-32 w-28 sm:left-8 sm:h-40 sm:w-36" />
      <KawaiiCat className="pointer-events-none absolute -right-4 bottom-0 h-24 w-40 sm:right-8 sm:h-28 sm:w-48" />
    </main>
  );
}
