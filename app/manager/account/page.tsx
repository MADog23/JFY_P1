import { requireManager } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export default async function ManagerAccountPage() {
  const session = await requireManager();

  return (
    <>
      <TopNav name={session.name} role={session.role} />
      <main className="mx-auto max-w-sm px-4 py-8">
        <h1 className="mb-1 font-display text-2xl text-ink">My account</h1>
        <p className="mb-6 text-sm text-charcoal/60">
          Change the password for your own manager login, {session.name}.
        </p>
        <ChangePasswordForm />
      </main>
    </>
  );
}
