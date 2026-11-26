"use client";

import Image from "next/image";
import { useId, useState } from "react";

type Attachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};
export function OccurrenceAttachment({
  occurrenceId,
  file,
}: {
  occurrenceId: string;
  file: Attachment;
}) {
  const [expanded, setExpanded] = useState(false),
    [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false),
    [attempt, setAttempt] = useState(0);
  const imageId = useId();
  const path = `/api/occurrences/${encodeURIComponent(occurrenceId)}/attachments/${encodeURIComponent(file.id)}`;
  const image = ["image/jpeg", "image/png", "image/webp"].includes(
    file.contentType,
  );
  const linkClass =
    "mt-1 inline-block min-h-10 text-sm font-semibold text-[#0b5e58] underline [overflow-wrap:anywhere]";
  if (!image)
    return (
      <a
        className={linkClass}
        href={path}
        target="_blank"
        rel="noopener noreferrer"
      >
        {file.name} (interno)
      </a>
    );
  return (
    <div className="mt-2 min-w-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={imageId}
        aria-label={`${expanded ? "Recolher" : "Ampliar"} imagem ${file.name}`}
        className="block max-w-full rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]"
        onClick={() => setExpanded((value) => !value)}
      >
        <span id={imageId} className="block">
          {!failed && (
            <Image
              key={attempt}
              src={`${path}?preview=1`}
              alt={`Anexo interno: ${file.name}`}
              width={960}
              height={720}
              unoptimized
              onLoad={() => setLoaded(true)}
              onError={() => {
                setFailed(true);
                setLoaded(false);
              }}
              className={
                expanded
                  ? "h-auto max-h-[60vh] w-auto max-w-full rounded-lg border border-[#e5e7eb] object-contain"
                  : "h-24 w-36 rounded-lg border border-[#e5e7eb] object-cover"
              }
            />
          )}
        </span>
        <span className="mt-1 block text-sm font-semibold text-[#0b5e58] underline [overflow-wrap:anywhere]">
          {file.name} (interno)
        </span>
      </button>
      {!failed && !loaded && (
        <p role="status" className="mt-1 text-xs text-[#6b7280]">
          Carregando imagem…
        </p>
      )}
      {failed && (
        <p role="alert" className="mt-1 text-xs text-[#b42318]">
          Não foi possível carregar a imagem.{" "}
          <button
            type="button"
            className="min-h-8 underline"
            onClick={() => {
              setFailed(false);
              setLoaded(false);
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      <a
        className={linkClass}
        href={path}
        target="_blank"
        rel="noopener noreferrer"
      >
        Baixar {file.name}
      </a>
    </div>
  );
}
