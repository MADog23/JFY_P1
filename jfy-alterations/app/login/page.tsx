import { listActiveEmployeesForLogin } from "@/actions/auth";
import LoginScreen from "@/components/LoginScreen";

// Belt-and-suspenders alongside the root layout's force-dynamic: this page queries
// the database directly with no cookies()/headers() call, so Next has no automatic
// signal to skip static prerendering without this.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const employees = await listActiveEmployeesForLogin();
  return <LoginScreen employees={employees} />;
}
