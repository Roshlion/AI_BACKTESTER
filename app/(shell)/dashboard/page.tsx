import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-300">Loading dashboard...</div>}>
      <DashboardClient />
    </Suspense>
  );
}