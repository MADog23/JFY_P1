"use client";

import { useState, useTransition } from "react";
import { changeMyPassword } from "@/actions/auth";

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }

    startTransition(async () => {
      const result = await changeMyPassword(currentPassword, newPassword);
      if (result.ok) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-linen bg-white p-6 shadow-sm">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
        Current password
      </label>
      <input
        type="password"
        required
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className="focus-ring mb-4 w-full rounded-lg border border-linen px-3 py-2 text-sm"
      />
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
        New password
      </label>
      <input
        type="password"
        required
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="At least 8 characters"
        className="focus-ring mb-4 w-full rounded-lg border border-linen px-3 py-2 text-sm"
      />
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-charcoal/60">
        Confirm new password
      </label>
      <input
        type="password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="focus-ring mb-5 w-full rounded-lg border border-linen px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={isPending}
        className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-40"
      >
        {isPending ? "Saving…" : "Update password"}
      </button>
      {error && <p className="mt-3 text-sm text-alert">{error}</p>}
      {success && <p className="mt-3 text-sm text-sage">Password updated.</p>}
    </form>
  );
}
