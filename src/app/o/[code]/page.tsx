import { notFound } from "next/navigation";
import { TrackingView } from "@/components/tracking-view";
import type { OccurrenceTracking } from "@/server/occurrences/tracking.contract";
import {
  loadOccurrenceTracking,
  TrackingLookupError,
} from "@/server/occurrences/tracking.service";

export const instant = false;

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  let tracking: OccurrenceTracking | null;
  try {
    tracking = await loadOccurrenceTracking(code);
  } catch (error) {
    if (!(error instanceof TrackingLookupError)) throw error;
    return (
      <main className="min-h-dvh flex-1 bg-[#f6f7f9] px-4 py-6">
        <div className="mx-auto w-full max-w-xl rounded-xl border border-[#e5e7eb] bg-white p-5">
          <h1 className="text-xl font-bold">
            Não foi possível carregar o acompanhamento
          </h1>
          <p role="alert" className="mt-2 text-sm text-[#4b5563]">
            Tente de novo em instantes.
          </p>
        </div>
      </main>
    );
  }
  if (!tracking) notFound();
  return <TrackingView tracking={tracking} code={code} />;
}
