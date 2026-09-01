import { requireManager } from "@/lib/auth";
import { listEmployees, listManagers } from "@/actions/employees";
import { TopNav } from "@/components/TopNav";
import StaffManager from "@/components/StaffManager";

export default async function EmployeesPage() {
  const session = await requireManager();
  const [employees, managers] = await Promise.all([listEmployees(), listManagers()]);

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 font-display text-2xl text-ink">Staff accounts</h1>
        <p className="mb-6 text-sm text-charcoal/60">
          Manage employee PIN logins and manager credentials.
        </p>
        <StaffManager employees={employees} managers={managers} />
      </main>
    </>
  );
}
