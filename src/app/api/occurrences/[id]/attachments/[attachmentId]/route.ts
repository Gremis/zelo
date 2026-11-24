import { confirmedIdentity } from "@/server/auth/identity";
import {
  loadOccurrenceDetail,
  OccurrenceReadError,
} from "@/server/occurrences/detail.service";
import { signedEvidence } from "@/server/occurrences/uploads";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  try {
    const identity = await confirmedIdentity(headers);
    if (!identity)
      return Response.json(
        { error: "Entre na sua conta." },
        { status: 401, headers },
      );
    const { id, attachmentId } = await context.params;
    await loadOccurrenceDetail(identity.supabase, id);
    const { data, error } = await identity.supabase
      .from("occurrence_attachments")
      .select("storage_path, content_type")
      .eq("occurrence_id", id)
      .eq("id", attachmentId)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return Response.json(
        { error: "Arquivo não encontrado." },
        { status: 404, headers },
      );
    const preview = new URL(request.url).searchParams.get("preview");
    if (
      preview !== null &&
      (preview !== "1" ||
        !["image/jpeg", "image/png", "image/webp"].includes(data.content_type))
    )
      return Response.json(
        { error: "A visualização está disponível apenas para imagens." },
        { status: 400, headers },
      );
    headers.set(
      "Location",
      await signedEvidence(data.storage_path, preview !== "1"),
    );
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return Response.json(
      { error: "Não foi possível abrir o arquivo." },
      {
        status: error instanceof OccurrenceReadError ? error.status : 503,
        headers,
      },
    );
  }
}
