import {
  publicFailure,
  publicReply,
  resolvePublicCondominium,
} from "@/server/occurrences/public.http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    return publicReply(await resolvePublicCondominium((await params).slug));
  } catch (error) {
    return publicFailure(error);
  }
}
