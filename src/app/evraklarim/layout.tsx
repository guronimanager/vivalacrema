import { ClerkProvider } from "@clerk/nextjs";
export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
