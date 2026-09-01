"use client";

import { useState, useTransition } from "react";
import {
  createEmployee,
  resetEmployeePin,
  setEmployeeActive,
  createManager,
} from "@/actions/employees";

export default function StaffManager({ employees, managers }: { employees: any[]; managers: any[] }) {
  return (
    <div className="space-y-8">
      <EmployeeSection employees={employees} />
      <ManagerSection managers={managers} />
    </div>
  );
}

function EmployeeSection({ employees }: { employees: any[] }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");

  return (
    <section className="rounded-2xl border border-linen bg-white p-6">
      <h2 className="mb-4 font-display text-lg text-ink">Employees</h2>

      <ul className="mb-5 divide-y divide-linen">
        {employees.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-ink">{e.name}</p>
              <p className="text-xs text-charcoal/50">{e.active ? "Active" : "Deactivated"}</p>
            </div>
            <div className="flex items-center gap-2">
              {resetTarget === e.id ? (
                <>
                  <input
                    value={newPin}
                    onChange={(ev) => setNewPin(ev.target.value)}
                    placeholder="New PIN"
                    className="focus-ring w-24 rounded-lg border border-linen px-2 py-1 text-sm"
                  />
                  <button
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await resetEmployeePin(e.id, newPin);
                        if (r.ok) {
                          setResetTarget(null);
                          setNewPin("");
                        } else setError(r.error || "Could not reset PIN.");
                      })
                    }
                    className="focus-ring rounded-lg bg-ink px-3 py-1 text-xs text-cream"
                  >
                    Save
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setResetTarget(e.id)}
                  className="focus-ring rounded-lg border border-linen px-3 py-1 text-xs text-charcoal/60 hover:bg-cream"
                >
                  Reset PIN
                </button>
              )}
              <button
                disabled={isPending}
                onClick={() => startTransition(async () => { await setEmployeeActive(e.id, !e.active); })}
                className="focus-ring rounded-lg border border-linen px-3 py-1 text-xs text-charcoal/60 hover:bg-cream"
              >
                {e.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="mb-2 text-sm text-alert">{error}</p>}

      <div className="flex flex-wrap gap-2 border-t border-linen pt-4">
        <input
          placeholder="Employee name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="focus-ring flex-1 rounded-lg border border-linen px-3 py-2 text-sm"
        />
        <input
          placeholder="4-8 digit PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="focus-ring w-32 rounded-lg border border-linen px-3 py-2 text-sm"
        />
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const r = await createEmployee(name, pin);
              if (r.ok) {
                setName("");
                setPin("");
              } else setError(r.error || "Could not add employee.");
            })
          }
          className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm text-cream"
        >
          Add employee
        </button>
      </div>
    </section>
  );
}

function ManagerSection({ managers }: { managers: any[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-linen bg-white p-6">
      <h2 className="mb-4 font-display text-lg text-ink">Managers</h2>
      <ul className="mb-4 divide-y divide-linen">
        {managers.map((m) => (
          <li key={m.id} className="py-3">
            <p className="text-ink">{m.name}</p>
            <p className="text-xs text-charcoal/50">{m.email}</p>
          </li>
        ))}
      </ul>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="focus-ring rounded-lg border border-dashed border-linen px-4 py-2 text-sm text-charcoal/60 hover:border-thread/50"
        >
          + Add manager account
        </button>
      ) : (
        <div className="space-y-2 border-t border-linen pt-4">
          {error && <p className="text-sm text-alert">{error}</p>}
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="focus-ring w-full rounded-lg border border-linen px-3 py-2 text-sm"
          />
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="focus-ring w-full rounded-lg border border-linen px-3 py-2 text-sm"
          />
          <input
            placeholder="Temporary password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring w-full rounded-lg border border-linen px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const r = await createManager({ name, email, password });
                  if (r.ok) {
                    setOpen(false);
                    setName("");
                    setEmail("");
                    setPassword("");
                  } else setError(r.error || "Could not create manager.");
                })
              }
              className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm text-cream"
            >
              Create manager
            </button>
            <button onClick={() => setOpen(false)} className="focus-ring rounded-lg border border-linen px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
