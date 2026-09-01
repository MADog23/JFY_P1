import { listActiveEmployeesForLogin } from "@/actions/auth";
import LoginScreen from "@/components/LoginScreen";

export default async function LoginPage() {
  const employees = await listActiveEmployeesForLogin();
  return <LoginScreen employees={employees} />;
}
