import { RecordManager } from "@/components/finance/record-manager";

const fields = [
  { key: "name", label: "Tedarikçi Adı", required: true },
  { key: "taxNumber", label: "Vergi Numarası" },
  { key: "phone", label: "Telefon" },
  { key: "email", label: "E-posta", type: "email" as const },
];

export default function SuppliersPage() {
  return (
    <RecordManager
      title="Tedarikçiler"
      description="Tedarikçi iletişim ve vergi bilgilerini kaydedin, arayın ve güncelleyin."
      endpoint="/api/suppliers"
      fields={fields}
    />
  );
}
