import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { employeeCookie } from "@/lib/personnel/session";
import { FinancePage } from "@/components/finance/ui";
import { DocumentArchive } from "@/components/documents/archive";
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ connection?: string; employeeId?: string }> }) {
  if ((await cookies()).has(employeeCookie)) redirect("/evraklarim");
  const { connection, employeeId } = await searchParams;
  return <FinancePage title="Evrak Arşivi" description="Faturaları, banka ekstrelerini, personel ve muhasebe belgelerini düzenli saklayın."><DocumentArchive connection={connection} selectedEmployeeId={employeeId} /></FinancePage>;
}
