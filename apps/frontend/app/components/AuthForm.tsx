"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth";

// Wired to lib/auth (mock-backed via lib/api). Real calls flip on
// when api.USE_MOCK = false.
export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { login, signup, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isSignup = mode === "signup";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4">
      <div className="rounded-2xl border border-border bg-panel p-8">
        <h1 className="text-xl font-semibold">{isSignup ? "Create account" : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-muted">
          {isSignup ? "Start trading perpetual futures." : "Sign in to your account."}
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              if (isSignup) await signup(username, password);
              else await login(username, password);
              router.push("/portfolio");
            } catch (err) {
              setError((err as Error).message || "Something went wrong");
            }
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
              placeholder="satoshi"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </label>

          {error && <p className="text-[12px] text-short">{error}</p>}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full rounded-lg bg-fg py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-40"
          >
            {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {isSignup ? "Already have an account? " : "No account yet? "}
          <Link href={isSignup ? "/login" : "/signup"} className="text-accent hover:underline">
            {isSignup ? "Sign in" : "Sign up"}
          </Link>
        </p>
      </div>
      <p className="mt-4 text-center text-[11px] text-muted">
        Mock — wire to <code className="text-accent">POST /api/v1/{isSignup ? "signup" : "signin"}</code>.
      </p>
    </div>
  );
}
