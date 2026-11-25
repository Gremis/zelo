import type { Metadata } from "next";
import { EmployeeTaskPage } from "@/components/employee-task-page";

export const instant = false;

export const metadata: Metadata = {
  title: "Tarefa | Sindicondo",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function TaskPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <EmployeeTaskPage code={code} />;
}
