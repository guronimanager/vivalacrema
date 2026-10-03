import { RecordManager } from "@/components/finance/record-manager";

const fields = [
  { key: "name", label: "Ad Soyad", required: true },
  { key: "role", label: "Görev" },
  {
    key: "salary",
    label: "Aylık Maaş (EUR)",
    type: "number" as const,
    format: "money" as const,
    required: true,
    defaultValue: 0,
  },
  {
    key: "active",
    label: "Aktif Personel",
    type: "checkbox" as const,
    defaultValue: true,
    trueLabel: "Aktif",
    falseLabel: "Pasif",
  },
];
const summaries = [
  {
    key: "salary",
    label: "Aktif Personel Aylık Maaş Planı",
    where: { key: "active", value: true },
  },
];

export default function EmployeesPage() {
  return (
    <RecordManager
      title="Personel"
      description="Personel, görev ve aylık maaş planını yönetin. Maaş planı otomatik gider veya banka hareketi oluşturmaz; gerçek ödemeleri Giderler'de bir kez kaydedin."
      endpoint="/api/employees"
      employeeDocuments
      fields={fields}
      summaries={summaries}
    />
  );
}
