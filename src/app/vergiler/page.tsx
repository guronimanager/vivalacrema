import { RecordManager } from "@/components/finance/record-manager";

const fields = [
  { key: "name", label: "Vergi Adı", required: true },
  { key: "period", label: "Dönem" },
  {
    key: "dueDate",
    label: "Son Ödeme Tarihi",
    type: "date" as const,
    format: "date" as const,
  },
  {
    key: "amount",
    label: "Tutar (EUR)",
    type: "number" as const,
    format: "money" as const,
    required: true,
    defaultValue: 0,
  },
  {
    key: "paid",
    label: "Ödendi",
    type: "checkbox" as const,
    defaultValue: false,
    trueLabel: "Ödendi",
    falseLabel: "Ödenmedi",
  },
];
const summaries = [
  {
    key: "amount",
    label: "Ödenmemiş Vergiler",
    where: { key: "paid", value: false },
  },
  {
    key: "amount",
    label: "Ödenmiş Vergiler",
    where: { key: "paid", value: true },
  },
];

export default function TaxesPage() {
  return (
    <RecordManager
      title="Vergiler"
      description="Vergi yükümlülüklerini, dönemlerini ve ödeme durumlarını takip edin. Ödendi işareti gider veya banka hareketi oluşturmaz; gerçek ödemeyi Giderler'de bir kez kaydedin."
      endpoint="/api/taxes"
      fields={fields}
      summaries={summaries}
    />
  );
}
