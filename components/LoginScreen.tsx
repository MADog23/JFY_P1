"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { employeeLogin, managerLogin } from "@/actions/auth";

type Employee = { id: string; name: string };

export default function LoginScreen({ employees }: { employees: Employee[] }) {
  const [mode, setMode] = useState<"employee" | "manager">("employee");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="Just For You Alterations"
            width={168}
            height={168}
            priority
            className="mx-auto mb-3 h-20 w-20"
          />
          <p className="text-xs uppercase tracking-widest text-thread">Mt Juliet, TN</p>
          <h1 className="mt-1 font-display text-3xl text-ink">Just For You Alterations</h1>
          <p className="mt-1 text-sm text-charcoal/70">Digital ticket desk</p>
        </div>

        <div className="mb-6 flex rounded-full border border-linen bg-white p-1">
          <button
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              mode === "employee" ? "bg-ink text-cream" : "text-charcoal/60"
            }`}
            onClick={() => setMode("employee")}
          >
            Employee
          </button>
          <button
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              mode === "manager" ? "bg-ink text-cream" : "text-charcoal/60"
            }`}
            onClick={() => setMode("manager")}
          >
            Manager
          </button>
        </div>

        {mode === "employee" ? <EmployeeLogin employees={employees} /> : <ManagerLogin />}
      </div>
    </main>
  );
}

function EmployeeLogin({ employees }: { employees: Employee[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function press(digit: string) {
    setError(null);
    if (digit === "back") return setPin((p) => p.slice(0, -1));
    if (pin.length >= 8) return;
    setPin((p) => p + digit);
  }

  function submit() {
    if (!employeeId) return setError("Choose your name first.");
    startTransition(async () => {
      const result = await employeeLogin(employeeId, pin);
      if (result && !result.ok) {
        setError(result.error);
        setPin("");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-linen bg-white p-6 shadow-sm">
      <label htmlFor="employee-login-name" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
        Your name
      </label>
      <select
        id="employee-login-name"
        className="focus-ring mb-5 w-full rounded-lg border border-linen bg-cream px-3 py-2 text-ink"
        value={employeeId}
        onChange={(e) => {
          setEmployeeId(e.target.value);
          setPin("");
          setError(null);
        }}
      >
        <option value="">Select your name…</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>

      <div className="mb-4 flex justify-center gap-2">
        {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full border border-thread ${
              i < pin.length ? "bg-thread" : "bg-transparent"
            }`}
          />
        ))}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "go"].map((key) =>
          key === "go" ? (
            <button
              key={key}
              onClick={submit}
              disabled={isPending || !employeeId || pin.length < 4}
              className="focus-ring rounded-xl bg-ink py-3 text-sm font-medium text-cream disabled:opacity-40"
            >
              {isPending ? "…" : "Enter"}
            </button>
          ) : (
            <button
              key={key}
              onClick={() => press(key)}
              className="focus-ring rounded-xl border border-linen bg-cream py-3 text-lg text-ink hover:bg-linen"
            >
              {key === "back" ? "⌫" : key}
            </button>
          )
        )}
      </div>

      {error && <p className="text-center text-sm text-alert">{error}</p>}
    </div>
  );
}

function ManagerLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await managerLogin(email, password);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-linen bg-white p-6 shadow-sm">
      <label htmlFor="manager-login-email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
        Email
      </label>
      <input
        id="manager-login-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="focus-ring mb-4 w-full rounded-lg border border-linen bg-cream px-3 py-2 text-ink"
        placeholder="manager@justforyoualterations.com"
      />
      <label htmlFor="manager-login-password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
        Password
      </label>
      <input
        id="manager-login-password"
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="focus-ring mb-5 w-full rounded-lg border border-linen bg-cream px-3 py-2 text-ink"
      />
      <button
        type="submit"
        disabled={isPending}
        className="focus-ring w-full rounded-xl bg-ink py-3 text-sm font-medium text-cream disabled:opacity-40"
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
      {error && <p className="mt-3 text-center text-sm text-alert">{error}</p>}
    </form>
  );
}
