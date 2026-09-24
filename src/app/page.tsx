import { Dashboard } from "@/components/dashboard/dashboard";
import { Sidebar } from "@/components/layout/sidebar";

export default function Home() {
  return (
    <main className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <Dashboard />
    </main>
  );
}
