import { EmployeeArchive } from "@/components/documents/employee-archive";
export default async function EmployeeDocumentsPage({ searchParams }: { searchParams: Promise<{ connection?: string }> }) {
  const { connection } = await searchParams;
  return <EmployeeArchive connection={connection} />;
}
