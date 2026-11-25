"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseEmployeeTask,
  type EmployeeTask,
} from "@/server/occurrences/task.contract";
import {
  validateUploadManifest,
  type UploadState,
} from "@/lib/occurrences/uploads";

type Command = {
  key: string;
  type: "start" | "complete" | "message";
  payload: Record<string, string>;
};
type Attempt = {
  key: string;
  secret: string;
  purpose?: "message" | "complete";
};
const primary =
  "min-h-12 w-full rounded-xl bg-[#0f766e] px-4 py-3 text-base font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e] disabled:opacity-60";
const secondary =
  "min-h-12 w-full rounded-xl border border-[#cfd5df] bg-white px-4 py-3 text-base font-bold text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e] disabled:opacity-60";

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}
function transfer(url: string, file: File, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.timeout = 120_000;
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 409)
        resolve();
      else reject(new Error("Transfer unavailable."));
    };
    xhr.onerror = xhr.ontimeout = () =>
      reject(new Error("Transfer interrupted."));
    xhr.send(file);
  });
}

export function EmployeeTaskActions({
  code,
  task,
  onChanged,
  onMessageSent,
  onEditing,
}: {
  code: string;
  task: EmployeeTask;
  onChanged: (task: EmployeeTask) => void;
  onMessageSent?: () => void;
  onEditing?: (editing: boolean) => void;
}) {
  const [messaging, setMessaging] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Command | null>(null);
  const [upload, setUpload] = useState<Attempt | null>(null);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const lock = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const messageButton = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);
  const completeButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const storageKey = `employee-task:${code}`;
  const uploadKey = `${storageKey}:upload`;
  const base = `/api/public/tasks/${code}`;

  useEffect(() => {
    async function restore() {
      try {
        const value = sessionStorage.getItem(storageKey);
        if (value) {
          const saved = JSON.parse(value) as Command;
          if (
            typeof saved.key === "string" &&
            ["start", "complete", "message"].includes(saved.type) &&
            saved.payload &&
            typeof saved.payload === "object"
          ) {
            setPending(saved);
            setCompleting(
              saved.type === "complete" || saved.type === "message",
            );
            setMessaging(saved.type === "message");
            setComment(saved.payload.comment ?? "");
            setError(
              "Uma operação ficou sem confirmação. Recupere a tentativa original.",
            );
          }
        }
        const attempt = sessionStorage.getItem(uploadKey);
        if (attempt) {
          const saved = JSON.parse(attempt) as Attempt;
          if (
            typeof saved.key === "string" &&
            /^[0-9a-f]{64}$/.test(saved.secret)
          ) {
            setUpload(saved);
            setMessaging(saved.purpose === "message");
            setCompleting(true);
          }
        }
      } catch {
        setStatus(
          "Mantenha esta janela aberta para recuperar operações interrompidas.",
        );
      }
    }
    void restore();
  }, [storageKey, uploadKey]);

  useEffect(() => {
    if (completing) title.current?.focus();
    onEditing?.(completing);
  }, [completing, onEditing]);

  function persist(key: string, value: unknown) {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      setStatus("Mantenha esta janela aberta para recuperar a operação.");
    }
  }
  async function execute(command: Command) {
    setPending(command);
    persist(storageKey, command);
    const value = parseEmployeeTask(
      await request(`${base}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      }),
    );
    persist(storageKey, null);
    persist(uploadKey, null);
    setPending(null);
    setUpload(null);
    setCompleting(false);
    setMessaging(false);
    setComment("");
    setFiles([]);
    onChanged(value);
    if (command.type === "message") {
      onMessageSent?.();
      if (!onMessageSent)
        requestAnimationFrame(() => confirmation.current?.focus());
    }
    if (command.type === "start")
      requestAnimationFrame(() => completeButton.current?.focus());
    setStatus(
      command.type === "start"
        ? "Início registrado."
        : command.type === "message"
          ? onMessageSent
            ? ""
            : "Recado enviado ao síndico."
          : "Tarefa concluída.",
    );
  }
  async function guarded(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      if (cause instanceof Error && ["409", "404"].includes(cause.message)) {
        try {
          onChanged(parseEmployeeTask(await request(base)));
        } catch {}
      }
      setError(
        "Não foi possível confirmar a operação. Seus dados foram preservados. Tente novamente ou recupere a operação pendente.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      setProgress(null);
    }
  }
  async function uploadFiles(): Promise<Record<string, string>> {
    if (!files.length && !upload) return {};
    let attempt = upload;
    if (!attempt) {
      const manifest = validateUploadManifest(
        files.map((file) => ({
          name: file.name,
          contentType: file.type,
          size: file.size,
        })),
      );
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      attempt = {
        key: crypto.randomUUID(),
        purpose: messaging ? "message" : "complete",
        secret: Array.from(bytes, (value) =>
          value.toString(16).padStart(2, "0"),
        ).join(""),
      };
      setUpload(attempt);
      persist(uploadKey, attempt);
      setStatus("Preparando envio…");
      await uploadRequest(attempt, "", "POST", manifest);
    }
    let state: UploadState;
    try {
      state = await uploadRequest(attempt, `/${attempt.key}`);
    } catch (cause) {
      if (!(cause instanceof Error) || cause.message !== "404" || !files.length)
        throw cause;
      state = await uploadRequest(
        attempt,
        "",
        "POST",
        validateUploadManifest(
          files.map((file) => ({
            name: file.name,
            contentType: file.type,
            size: file.size,
          })),
        ),
      );
    }
    for (const reserved of state.files) {
      if (reserved.state === "valid") continue;
      const path = `/${attempt.key}/${reserved.id}`;
      if (reserved.state === "invalid") throw new Error("Invalid file.");
      try {
        setStatus(`Verificando ${reserved.name}…`);
        await uploadRequest(attempt, `${path}/validate`, "POST");
        continue;
      } catch {}
      const file = files.find(
        (value) =>
          value.name === reserved.name &&
          value.type === reserved.contentType &&
          value.size === reserved.size,
      );
      if (!file) throw new Error("Select original file.");
      const signed = (await uploadRequest(
        attempt,
        `${path}/authorize`,
        "POST",
      )) as unknown as { signedUrl: string };
      setStatus(`Enviando ${file.name}…`);
      setProgress(0);
      await transfer(signed.signedUrl, file, setProgress);
      setProgress(null);
      setStatus(`Verificando ${file.name}…`);
      await uploadRequest(attempt, `${path}/validate`, "POST");
    }
    state = await uploadRequest(attempt, `/${attempt.key}`);
    if (
      state.state !== "open" ||
      state.files.some((file) => file.state !== "valid")
    )
      throw new Error("Validation pending.");
    return { uploadKey: attempt.key, uploadSecret: attempt.secret };
  }
  async function uploadRequest(
    attempt: Attempt,
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<UploadState> {
    return request(
      `${base}/${attempt.purpose === "message" ? "message-uploads" : "uploads"}${path}`,
      {
        method,
        headers: {
          "Upload-Token": attempt.secret,
          "Idempotency-Key": attempt.key,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
  }
  function selectFiles(selected: FileList | null) {
    if (!selected || upload) return;
    const next = [...files, ...Array.from(selected)];
    try {
      validateUploadManifest(
        next.map((file) => ({
          name: file.name,
          contentType: file.type,
          size: file.size,
        })),
      );
      setFiles(next);
      setError(null);
    } catch {
      setError(
        "Selecione até 5 arquivos: fotos JPG, PNG ou WebP até 8 MB, vídeo MP4 até 25 MB ou PDF até 10 MB. Total máximo: 40 MB.",
      );
      fileInput.current?.focus();
    }
  }
  async function cancel() {
    if (busy || pending) return;
    await guarded(async () => {
      if (upload) await uploadRequest(upload, `/${upload.key}`, "DELETE");
      persist(uploadKey, null);
      setUpload(null);
      setFiles([]);
      setComment("");
      setCompleting(false);
      setMessaging(false);
      setError(null);
      setStatus("");
      requestAnimationFrame(() =>
        (messaging ? messageButton : completeButton).current?.focus(),
      );
    });
  }
  function openCompletion(message = false) {
    setMessaging(message);
    setStatus("");
    setCompleting(true);
    setError(null);
  }
  const commentField = (
    <div className="mt-5 rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <label htmlFor="task-comment" className="font-semibold">
        {messaging ? "Recado" : "Comentário (opcional)"}
      </label>
      <textarea
        id="task-comment"
        ref={commentInput}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={10000}
        rows={4}
        disabled={busy || Boolean(pending)}
        aria-describedby="task-action-error"
        className="mt-3 w-full rounded-xl border border-[#cfd5df] p-3 focus-visible:outline-2 focus-visible:outline-[#0f766e]"
        placeholder={
          messaging
            ? "Ex.: Preciso de escada, a lâmpada fica alta."
            : "Ex.: Lâmpada trocada, testei e está acendendo."
        }
      />
    </div>
  );
  if (!task.canAct || task.completedAt) return null;
  return (
    <section aria-label="Ações da tarefa" className="mt-5 pb-48">
      {completing ? (
        <>
          <h2
            ref={title}
            tabIndex={-1}
            className="mb-4 text-2xl font-bold outline-none"
          >
            {messaging ? "Mandar recado ao síndico" : "Concluir tarefa"}
          </h2>
          {!messaging && (
            <>
              <button
                type="button"
                disabled={busy || Boolean(upload) || Boolean(pending)}
                onClick={() => cameraInput.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed border-[#0f766e] bg-[#effcf9] px-5 py-8 text-center text-[#115e59] disabled:opacity-60"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="mx-auto mb-3 size-9"
                >
                  <path d="M3 7h4l2-3h6l2 3h4v14H3z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span className="block text-lg font-bold">
                  Tirar foto do serviço feito
                </span>
                <span className="mt-2 block text-sm">
                  A foto mostra ao síndico que ficou resolvido.
                </span>
              </button>
              <input
                ref={cameraInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                aria-label="Foto pela câmera"
                className="sr-only"
                disabled={busy || Boolean(upload) || Boolean(pending)}
                onChange={(event) => selectFiles(event.target.files)}
              />
            </>
          )}
          {messaging && commentField}
          <label
            className="mt-5 block font-semibold text-[#0f766e]"
            htmlFor="task-files"
          >
            Anexar foto, vídeo ou PDF
          </label>
          <input
            id="task-files"
            ref={fileInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
            disabled={busy || Boolean(upload) || Boolean(pending)}
            aria-describedby="task-file-help task-action-error"
            onChange={(event) => selectFiles(event.target.files)}
            className="mt-2 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border file:border-[#cfd5df] file:bg-white file:px-3 file:py-2"
          />
          <p id="task-file-help" className="mt-2 text-xs text-[#4b5563]">
            Até 5 arquivos e 40 MB no total. Fotos até 8 MB, MP4 até 25 MB e PDF
            até 10 MB.
          </p>
          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}:${index}`}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 break-all">{file.name}</span>
                  <button
                    type="button"
                    disabled={busy || Boolean(upload) || Boolean(pending)}
                    className="min-h-10 px-2 text-[#0f766e] underline"
                    onClick={() =>
                      setFiles((value) =>
                        value.filter((_, position) => position !== index),
                      )
                    }
                  >
                    Remover <span className="sr-only">{file.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!messaging && commentField}
          <p className="mt-4 text-sm text-[#4b5563]">
            {messaging
              ? "O síndico vê o recado no Sindicondo, com o seu nome. Se precisar, ele responde pelo WhatsApp."
              : "Ao concluir, o síndico e o morador veem que a tarefa foi resolvida."}
          </p>
        </>
      ) : (
        !task.startedAt && (
          <p className="text-sm text-[#4b5563]">
            Quando você começar, recado e conclusão vão para o síndico com o seu
            nome.
          </p>
        )
      )}
      <p
        ref={confirmation}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="mt-3 text-sm text-[#115e59]"
      >
        {busy ? status || "Salvando…" : status}
      </p>
      {progress !== null && (
        <progress
          aria-label="Progresso da transferência"
          value={progress}
          max={100}
          className="mt-2 w-full"
        />
      )}
      {error && (
        <p
          id="task-action-error"
          role="alert"
          className="mt-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#e5e7eb] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          {pending ? (
            <button
              type="button"
              disabled={busy}
              className={primary}
              onClick={() => void guarded(() => execute(pending))}
            >
              Recuperar operação
            </button>
          ) : completing ? (
            <div className="flex gap-3">
              <button
                type="button"
                className={secondary}
                disabled={busy}
                onClick={() => void cancel()}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={primary}
                disabled={busy}
                onClick={() =>
                  void guarded(async () => {
                    if (
                      messaging &&
                      !comment.trim() &&
                      !files.length &&
                      !upload
                    ) {
                      setError("Escreva o recado ou anexe um arquivo.");
                      commentInput.current?.focus();
                      return;
                    }
                    const credentials = await uploadFiles();
                    setStatus(
                      messaging ? "Enviando recado…" : "Concluindo tarefa…",
                    );
                    await execute({
                      key: crypto.randomUUID(),
                      type: messaging ? "message" : "complete",
                      payload: { comment, ...credentials },
                    });
                  })
                }
              >
                {messaging ? "Enviar" : "Concluir"}
              </button>
            </div>
          ) : (
            <>
              {!task.startedAt && (
                <button
                  type="button"
                  disabled={busy}
                  className={primary}
                  onClick={() =>
                    void guarded(() =>
                      execute({
                        key: crypto.randomUUID(),
                        type: "start",
                        payload: {},
                      }),
                    )
                  }
                >
                  Comecei
                </button>
              )}
              <button
                ref={completeButton}
                type="button"
                disabled={busy}
                className={task.startedAt ? primary : secondary}
                onClick={() => openCompletion()}
              >
                Concluir tarefa
              </button>
              <button
                ref={messageButton}
                type="button"
                disabled={busy}
                className={secondary}
                onClick={() => openCompletion(true)}
              >
                Mandar recado ao síndico
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
