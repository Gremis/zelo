import { Suspense } from "react";
import { PublicOccurrenceForm } from "@/components/public-occurrence-form";

async function PublicCondominium({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicOccurrenceForm key={slug} slug={slug} />;
}

export default function PublicLinkPage(props: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<p role="status">Carregando condomínio…</p>}>
      <PublicCondominium {...props} />
    </Suspense>
  );
}
