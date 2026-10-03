import { FinancePage } from "@/components/finance/ui";
import { DocumentArchive } from "@/components/documents/archive";
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ connection?: string }> }) {
  const { connection } = await searchParams;
  return <FinancePage title="Evrak Arşivi" description="Faturaları, banka ekstrelerini, personel ve muhasebe belgelerini düzenli saklayın."><DocumentArchive connection={connection} /></FinancePage>;
}
