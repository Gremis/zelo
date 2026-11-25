"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { OccurrenceDetail } from "@/server/occurrences/detail.contract";
import {
  loadOccurrenceDetail,
  OccurrenceRequestError,
} from "@/lib/occurrences/detail-request";
import {
  sendWorkflowCommand,
  whatsappUrl,
  workflowRequest,
  type EligibleEmployee,
  type WorkflowCommand,
} from "@/lib/occurrences/workflow-request";
import {
  validateUploadManifest,
  type UploadState,
} from "@/lib/occurrences/uploads";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[#d0d5dd] bg-white p-2 text-sm text-[#111827] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#0f766e]";
const buttonClass =
  "min-h-10 rounded-lg bg-[#0b5e58] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]";
type UploadAttempt = { key: string; secret: string };
const uploadLabels = {
  reserved: "Aguardando envio",
  inspecting: "Verificando…",
  valid: "Verificado",
  invalid: "Arquivo inválido",
};
function matchesFiles(files: File[], state: UploadState) {
  if (!files.length) return true;
  const selected = files
    .map((file) => JSON.stringify([file.name, file.type, file.size]))
    .sort();
  const prepared = state.files
    .map((file) => JSON.stringify([file.name, file.contentType, file.size]))
    .sort();
  return JSON.stringify(selected) === JSON.stringify(prepared);
}
function forgetAttempt(key: string) {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function OccurrenceWorkflow({
  detail,
  onChanged,
  onBusy,
}: {
  detail: OccurrenceDetail;
  onChanged: (value: OccurrenceDetail) => void;
  onBusy: (value: boolean) => void;
}) {
  const id = useId();
  const [selection, setSelection] = useState(
    detail.responsibleKind === "employee"
      ? (detail.responsibleEmployeeId ?? "")
      : (detail.responsibleKind ?? ""),
  );
  const [name, setName] = useState(
    detail.responsibleKind === "provider" ? (detail.responsibleName ?? "") : "",
  );
  const [date, setDate] = useState(detail.dueDate ?? "");
  const [employees, setEmployees] = useState<EligibleEmployee[]>([]);
  const [employeeError, setEmployeeError] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [message, setMessage] = useState("");
  const [comment, setComment] = useState("");
  const [completing, setCompleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<WorkflowCommand | null>(null);
  const [conflict, setConflict] = useState(false);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileSelectionError, setFileSelectionError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<UploadAttempt | null>(null);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [fileStatus, setFileStatus] = useState<Record<string, string>>({});
  const [employeeAttempt, setEmployeeAttempt] = useState(0);
  const storageKey = `occurrence-command:${detail.id}`;
  const uploadStorageKey = `occurrence-upload:${detail.id}`;
  const terminal = detail.status === "completed";
  const selectedEmployee = employees.find(
    (employee) => employee.id === selection,
  );
  const frozen = busy || pending !== null;

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = sessionStorage.getItem(storageKey);
        const savedUpload = sessionStorage.getItem(uploadStorageKey);
        if (saved) {
          setPending(JSON.parse(saved) as WorkflowCommand);
          setError(
            "Há uma operação sem confirmação. Consulte o resultado antes de alterar os dados.",
          );
        }
        if (savedUpload) {
          setUpload(JSON.parse(savedUpload) as UploadAttempt);
          setStatus(
            "Envio recuperado. Consulte os arquivos e selecione os originais se necessário.",
          );
        }
      } catch {
        setError("Não foi possível recuperar a tentativa anterior.");
      }
    });
    return () => {
      active = false;
    };
  }, [storageKey, uploadStorageKey]);

  useEffect(() => {
    if (terminal) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setLoadingEmployees(true);
    });
    void workflowRequest(`/api/occurrences/${detail.id}/eligible-employees`)
      .then((value) => {
        const result = value as { employees: EligibleEmployee[] };
        if (!Array.isArray(result.employees)) throw new Error();
        if (active) {
          setEmployees(result.employees);
          setEmployeeError(false);
        }
      })
      .catch(() => {
        if (active) setEmployeeError(true);
      })
      .finally(() => {
        if (active) setLoadingEmployees(false);
      });
    return () => {
      active = false;
    };
  }, [detail.id, terminal, employeeAttempt]);

  function progress(value: boolean) {
    inFlight.current = value;
    setBusy(value);
    onBusy(value);
  }
  function clearPending() {
    setPending(null);
    forgetAttempt(storageKey);
  }
  function restoreSelection(value: OccurrenceDetail) {
    setSelection(
      value.responsibleKind === "employee"
        ? (value.responsibleEmployeeId ?? "")
        : (value.responsibleKind ?? ""),
    );
    setName(
      value.responsibleKind === "provider" ? (value.responsibleName ?? "") : "",
    );
    setDate(value.dueDate ?? "");
  }
  async function execute(
    command: WorkflowCommand,
    phone?: string,
    popup?: Window | null,
  ) {
    if (inFlight.current) return;
    progress(true);
    setError(null);
    setStatus("Salvando…");
    setPending(command);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(command));
    } catch {
      setStatus(
        "Salvando… Mantenha esta janela aberta para recuperar o resultado.",
      );
    }
    try {
      const result = await sendWorkflowCommand(detail.id, command);
      const link =
        phone && command.type === "delegate"
          ? (() => {
              if (!result.delegation) throw new OccurrenceRequestError(503);
              return whatsappUrl(phone, result.delegation.message);
            })()
          : undefined;
      clearPending();
      setConflict(false);
      onChanged(result);
      restoreSelection(result);
      if (command.type === "complete") {
        setCompleting(false);
        setFiles([]);
        setFileSelectionError(false);
        if (fileInput.current) fileInput.current.value = "";
        setUpload(null);
        setUploadState(null);
        forgetAttempt(uploadStorageKey);
      }
      setStatus(
        command.type === "delegate"
          ? "Delegação salva. O envio da mensagem não é confirmado pelo sistema."
          : "Alteração salva.",
      );
      if (link) {
        setWhatsapp(link);
        if (popup && !popup.closed) {
          try {
            popup.location.href = link;
          } catch {
            popup.close();
          }
        }
      }
      const fresh = await loadOccurrenceDetail(detail.id).catch(() => null);
      if (fresh) {
        onChanged(fresh);
        restoreSelection(fresh);
      }
    } catch (cause) {
      popup?.close();
      setStatus(null);
      const code = cause instanceof OccurrenceRequestError ? cause.status : 503;
      if (code === 409) {
        setConflict(true);
        clearPending();
        setError(
          "A ocorrência mudou ou o envio não está pronto. Atualize os dados para revisar antes de tentar novamente.",
        );
      } else if (code === 400 || code === 404 || code === 401 || code === 403) {
        clearPending();
        setError(
          code === 400
            ? "Confira os dados e a disponibilidade do funcionário."
            : "Sessão ou acesso indisponível. Entre novamente e consulte a ocorrência.",
        );
      } else
        setError(
          "Não foi possível confirmar o resultado. Repita a mesma operação para recuperar com segurança.",
        );
    } finally {
      progress(false);
    }
  }
  function command(
    type: WorkflowCommand["type"],
    payload: WorkflowCommand["payload"],
  ) {
    return {
      key: crypto.randomUUID(),
      version: detail.version ?? 0,
      type,
      payload,
    };
  }
  function saveProvider() {
    if (
      name.trim() &&
      !(
        detail.responsibleKind === "provider" &&
        detail.responsibleName === name.trim()
      ) &&
      !frozen &&
      !terminal
    )
      void execute(
        command("responsible", { kind: "provider", name: name.trim() }),
      );
  }
  async function refresh() {
    if (inFlight.current) return;
    progress(true);
    try {
      const value = await loadOccurrenceDetail(detail.id);
      onChanged(value);
      restoreSelection(value);
      setConflict(false);
      setError(null);
      setStatus("Dados atualizados. Revise sua alteração.");
    } catch {
      setError("Não foi possível atualizar os dados.");
    } finally {
      progress(false);
    }
  }
  function delegate() {
    if (!selectedEmployee || !message.trim() || frozen) return;
    try {
      whatsappUrl(selectedEmployee.celular, message);
    } catch {
      setError("O telefone do funcionário é inválido.");
      return;
    }
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    void execute(
      command("delegate", {
        employeeId: selectedEmployee.id,
        message: message.trim(),
      }),
      selectedEmployee.celular,
      popup,
    );
  }
  async function uploadRequest(
    attempt: UploadAttempt,
    path = "",
    method = "GET",
    body?: unknown,
  ) {
    return (await workflowRequest(
      `/api/occurrences/${detail.id}/uploads${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "Upload-Token": attempt.secret,
          "Idempotency-Key": attempt.key,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    )) as UploadState;
  }
  async function prepareFiles() {
    if (inFlight.current || frozen) return;
    progress(true);
    setError(null);
    let attempt = upload;
    try {
      if (!attempt) {
        validateUploadManifest(
          files.map((file) => ({
            name: file.name,
            contentType: file.type,
            size: file.size,
          })),
        );
        attempt = {
          key: crypto.randomUUID(),
          secret: Array.from(
            crypto.getRandomValues(new Uint8Array(32)),
            (byte) => byte.toString(16).padStart(2, "0"),
          ).join(""),
        };
        setUpload(attempt);
        try {
          sessionStorage.setItem(uploadStorageKey, JSON.stringify(attempt));
        } catch {
          setStatus("Mantenha esta janela aberta para recuperar o envio.");
        }
      }
      let state: UploadState;
      if (upload) {
        try {
          state = await uploadRequest(attempt, `/${attempt.key}`);
        } catch (cause) {
          if (
            cause instanceof OccurrenceRequestError &&
            cause.status === 404 &&
            files.length
          )
            state = await uploadRequest(
              attempt,
              "",
              "POST",
              files.map((file) => ({
                name: file.name,
                contentType: file.type,
                size: file.size,
              })),
            );
          else throw cause;
        }
      } else
        state = await uploadRequest(
          attempt,
          "",
          "POST",
          files.map((file) => ({
            name: file.name,
            contentType: file.type,
            size: file.size,
          })),
        );
      setUploadState(state);
      if (!matchesFiles(files, state)) throw new Error("manifest_conflict");
      for (const reserved of state.files) {
        if (reserved.state === "valid") {
          setFileStatus((current) => ({
            ...current,
            [reserved.name]: "Verificado",
          }));
          continue;
        }
        if (reserved.state === "invalid") throw new Error("invalid");
        const original = files.find(
          (file) =>
            file.name === reserved.name &&
            file.size === reserved.size &&
            file.type === reserved.contentType,
        );
        if (reserved.state === "inspecting" || !original) {
          setFileStatus((current) => ({
            ...current,
            [reserved.name]: "Verificando…",
          }));
          await workflowRequest(
            `/api/occurrences/${detail.id}/uploads/${attempt.key}/${reserved.id}/validate`,
            { method: "POST", headers: { "Upload-Token": attempt.secret } },
          );
          setFileStatus((current) => ({
            ...current,
            [reserved.name]: "Verificado",
          }));
          continue;
        }
        setFileStatus((current) => ({
          ...current,
          [reserved.name]: "Enviando…",
        }));
        const authorization = (await workflowRequest(
          `/api/occurrences/${detail.id}/uploads/${attempt.key}/${reserved.id}/authorize`,
          { method: "POST", headers: { "Upload-Token": attempt.secret } },
        )) as { bucket: string; path: string; token: string };
        const { error: uploadError } = await createClient()
          .storage.from(authorization.bucket)
          .uploadToSignedUrl(
            authorization.path,
            authorization.token,
            original,
            { upsert: false },
          );
        if (
          uploadError &&
          !uploadError.message.toLowerCase().includes("already exists") &&
          !uploadError.message.toLowerCase().includes("duplicate")
        )
          throw uploadError;
        setFileStatus((current) => ({
          ...current,
          [reserved.name]: "Verificando…",
        }));
        await workflowRequest(
          `/api/occurrences/${detail.id}/uploads/${attempt.key}/${reserved.id}/validate`,
          { method: "POST", headers: { "Upload-Token": attempt.secret } },
        );
        setFileStatus((current) => ({
          ...current,
          [reserved.name]: "Verificado",
        }));
      }
      state = await uploadRequest(attempt, `/${attempt.key}`);
      setUploadState(state);
      setStatus("Arquivos verificados. A ocorrência ainda não foi concluída.");
    } catch {
      setError(
        "Não foi possível verificar todos os arquivos. Consulte ou retome o envio com os originais; para substituir arquivos, cancele o envio. Nenhum arquivo será descartado ao concluir.",
      );
    } finally {
      progress(false);
    }
  }
  async function consultUpload() {
    if (!upload || inFlight.current) return;
    progress(true);
    try {
      setUploadState(await uploadRequest(upload, `/${upload.key}`));
      setError(null);
    } catch {
      setError(
        "Não foi possível consultar o envio. Você pode retomar a preparação com os mesmos arquivos.",
      );
    } finally {
      progress(false);
    }
  }
  async function cancelUpload() {
    if (!upload || inFlight.current || pending) return;
    progress(true);
    try {
      await uploadRequest(upload, `/${upload.key}`, "DELETE");
      forgetAttempt(uploadStorageKey);
      setUpload(null);
      setUploadState(null);
      setFiles([]);
      setFileSelectionError(false);
      if (fileInput.current) fileInput.current.value = "";
      setFileStatus({});
      setStatus("Envio cancelado. Evidências já vinculadas são preservadas.");
      setError(null);
    } catch {
      setError(
        "Cancelamento não confirmado. Consulte o envio antes de remover os arquivos.",
      );
    } finally {
      progress(false);
    }
  }
  const verified =
    uploadState?.state === "open" &&
    uploadState.files.length > 0 &&
    uploadState.files.every((file) => file.state === "valid") &&
    matchesFiles(files, uploadState);
  return (
    <div className="space-y-4 text-sm" aria-busy={busy}>
      <div>
        <label
          htmlFor={`${id}-responsible`}
          className="text-[11px] font-bold tracking-wide text-[#6b7280] uppercase"
        >
          Responsável
        </label>
        {terminal ? (
          <p className="mt-1 font-semibold">
            {detail.responsibleName ?? "Não informado"}
          </p>
        ) : (
          <>
            <select
              id={`${id}-responsible`}
              className={inputClass}
              value={selection}
              disabled={frozen || conflict}
              onChange={(event) => {
                const value = event.target.value;
                setSelection(value);
                setWhatsapp(null);
                if (value === "manager") {
                  if (detail.responsibleKind !== "manager")
                    void execute(command("responsible", { kind: "manager" }));
                } else if (value !== "provider") {
                  const employee = employees.find((item) => item.id === value);
                  if (employee)
                    setMessage(
                      `Olá, ${employee.nome}. Você pode cuidar da ocorrência #${detail.number} do ${detail.condominium.name}?\n${detail.description}${detail.location ? `\nLocal: ${detail.location}` : ""}`,
                    );
                }
              }}
            >
              <option value="" disabled>
                Definir responsável
              </option>
              <option value="manager">Eu</option>
              <option value="provider">Prestador ou administradora</option>
              <optgroup label="Funcionários do prédio">
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.nome}
                    {employee.funcao ? ` · ${employee.funcao.nome}` : ""}
                  </option>
                ))}
              </optgroup>
            </select>
            {loadingEmployees && <p role="status">Carregando funcionários…</p>}
            {employeeError && (
              <p role="alert">
                Não foi possível carregar funcionários.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setEmployeeAttempt((value) => value + 1)}
                >
                  Tentar novamente
                </button>
              </p>
            )}
            {selection === "provider" && (
              <div className="mt-2">
                <label htmlFor={`${id}-provider`}>
                  Nome do prestador ou administradora
                </label>
                <input
                  id={`${id}-provider`}
                  className={inputClass}
                  maxLength={200}
                  value={name}
                  disabled={frozen || conflict}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={saveProvider}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveProvider();
                    }
                  }}
                />
                <span className="text-xs text-[#6b7280]">
                  Salvo ao sair do campo.
                </span>
              </div>
            )}
            {selectedEmployee && selection !== detail.responsibleEmployeeId && (
              <div className="mt-2 space-y-2">
                <label htmlFor={`${id}-message`}>Mensagem de delegação</label>
                <textarea
                  id={`${id}-message`}
                  className={inputClass}
                  rows={5}
                  maxLength={10000}
                  disabled={frozen || conflict}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <button
                  type="button"
                  className={buttonClass}
                  disabled={frozen || conflict || !message.trim()}
                  onClick={delegate}
                >
                  Enviar pelo WhatsApp
                </button>
                <button
                  type="button"
                  className="ml-2 min-h-10 underline"
                  disabled={frozen}
                  onClick={() => restoreSelection(detail)}
                >
                  Cancelar seleção
                </button>
                <p className="text-xs text-[#6b7280]">
                  A delegação será salva. O sistema não confirma envio ou
                  recebimento da mensagem.
                </p>
              </div>
            )}
            {detail.responsibleName && (
              <p className="mt-1 text-xs">
                Responsável salvo: {detail.responsibleName}
              </p>
            )}
          </>
        )}
        {detail.firstResponsibleAt && (
          <p className="mt-1 text-xs text-[#6b7280]">
            Primeira definição:{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "America/Sao_Paulo",
            }).format(new Date(detail.firstResponsibleAt))}
          </p>
        )}
      </div>
      {detail.status === "in_progress" && (
        <div>
          <label
            htmlFor={`${id}-date`}
            className="text-[11px] font-bold text-[#6b7280] uppercase"
          >
            Previsão
          </label>
          <input
            id={`${id}-date`}
            type="date"
            className={inputClass}
            value={date}
            disabled={frozen || conflict}
            onChange={(event) => setDate(event.target.value)}
            onBlur={() => {
              if (date !== (detail.dueDate ?? "") && !frozen)
                void execute(command("deadline", { date: date || null }));
            }}
          />
          <button
            type="button"
            className="mt-1 min-h-10 underline"
            disabled={frozen || conflict || !detail.dueDate}
            onClick={() => void execute(command("deadline", { date: null }))}
          >
            Remover previsão
          </button>
        </div>
      )}
      {!terminal && detail.status !== "new" && (
        <div>
          <button
            type="button"
            className={buttonClass}
            disabled={frozen || conflict}
            onClick={() => setCompleting(true)}
          >
            Concluir ocorrência
          </button>
          {completing && (
            <div className="mt-3 space-y-2 rounded-lg border border-[#d0d5dd] p-3">
              <h3 className="font-semibold">Conclusão</h3>
              <p className="text-xs">
                Após concluir, os campos ficam bloqueados. Comentário e anexos
                são internos.
              </p>
              <label htmlFor={`${id}-comment`}>Comentário (opcional)</label>
              <textarea
                id={`${id}-comment`}
                className={inputClass}
                value={comment}
                maxLength={10000}
                disabled={frozen}
                onChange={(event) => setComment(event.target.value)}
              />
              <label htmlFor={`${id}-files`}>Anexos (opcional)</label>
              <input
                ref={fileInput}
                id={`${id}-files`}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4"
                disabled={frozen}
                className="block w-full min-w-0 text-xs"
                onChange={(event) => {
                  setFileSelectionError(false);
                  setError(null);
                  const chosen = Array.from(event.target.files ?? []);
                  if (
                    new Set(
                      chosen.map((file) =>
                        JSON.stringify([file.name, file.type, file.size]),
                      ),
                    ).size !== chosen.length
                  ) {
                    setFileSelectionError(true);
                    setError(
                      "Arquivos com o mesmo nome, formato e tamanho devem ser enviados separadamente. Renomeie um deles antes de preparar o envio.",
                    );
                    return;
                  }

                  if (!upload) {
                    try {
                      if (chosen.length)
                        validateUploadManifest(
                          chosen.map((file) => ({
                            name: file.name,
                            contentType: file.type,
                            size: file.size,
                          })),
                        );
                      setError(null);
                    } catch {
                      setFileSelectionError(true);
                      setError(
                        "Selecione até 5 arquivos JPEG, PNG, WebP, PDF ou MP4 nos limites permitidos.",
                      );
                      return;
                    }
                  }
                  setFiles(chosen);
                }}
              />
              <p className="text-xs text-[#6b7280]">
                Até 5 arquivos, 40 MiB no total. Imagens: 8 MiB; PDF: 10 MiB;
                MP4 H.264: 25 MiB. Para trocar arquivos de um envio preparado,
                cancele-o primeiro.
              </p>
              <ul>
                {(uploadState?.files ?? files).map((file, index) => (
                  <li key={index} className="text-xs [overflow-wrap:anywhere]">
                    {file.name}:{" "}
                    {fileStatus[file.name] ??
                      ("state" in file
                        ? uploadLabels[file.state]
                        : "Aguardando envio")}
                  </li>
                ))}
              </ul>
              {(files.length > 0 || upload) && (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={frozen}
                  onClick={() => void prepareFiles()}
                >
                  Enviar e verificar anexos
                </button>
              )}
              {!upload && (files.length > 0 || fileSelectionError) && (
                <button
                  type="button"
                  className="min-h-10 underline"
                  disabled={frozen}
                  onClick={() => {
                    setFiles([]);
                    setFileSelectionError(false);
                    setFileStatus({});
                    setError(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                >
                  Remover seleção de arquivos
                </button>
              )}
              {upload && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="min-h-10 underline"
                    disabled={frozen}
                    onClick={() => void consultUpload()}
                  >
                    Consultar envio
                  </button>
                  <button
                    type="button"
                    className="min-h-10 underline"
                    disabled={frozen}
                    onClick={() => void cancelUpload()}
                  >
                    Cancelar envio de anexos
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    frozen ||
                    conflict ||
                    fileSelectionError ||
                    ((files.length > 0 || !!upload) && !verified)
                  }
                  onClick={() =>
                    void execute(
                      command("complete", {
                        comment: comment.trim(),
                        ...(upload
                          ? {
                              uploadKey: upload.key,
                              uploadSecret: upload.secret,
                            }
                          : {}),
                      }),
                    )
                  }
                >
                  Confirmar conclusão
                </button>
                <button
                  type="button"
                  className="min-h-10 underline"
                  disabled={frozen}
                  onClick={() => setCompleting(false)}
                >
                  Voltar sem concluir
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="block min-h-10 font-semibold text-[#0b5e58] underline"
        >
          Abrir WhatsApp
        </a>
      )}
      {status && (
        <p role="status" className="text-xs text-[#0b5e58]">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-[#b42318]">
          {error}
        </p>
      )}
      {pending && (
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => {
            let url: string | undefined;
            let popup: Window | null = null;
            if (pending.type === "delegate") {
              const employee = employees.find(
                (item) => item.id === pending.payload.employeeId,
              );
              if (employee) {
                url = employee.celular;
                popup = window.open("about:blank", "_blank");
                if (popup) popup.opener = null;
              }
            }
            void execute(pending, url, popup);
          }}
        >
          Recuperar operação
        </button>
      )}
      {conflict && (
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => void refresh()}
        >
          Atualizar dados
        </button>
      )}
    </div>
  );
}
