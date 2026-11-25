import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmployeeTaskPage } from "@/components/employee-task-page";
import { EmployeeTaskActions } from "@/components/employee-task-actions";
import type { EmployeeTask } from "@/server/occurrences/task.contract";
const task: EmployeeTask = {
  canAct: true,
  condominiumName: "Condomínio Sintético",
  number: 103,
  description: "Synthetic task",
  location: null,
  reporterName: null,
  reporterUnitOrRole: null,
  registeredAt: "2026-11-25T10:00:00Z",
  startedAt: null,
  completedAt: null,
  status: "pending",
};
afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
function open() {
  const onChanged = vi.fn();
  render(
    <EmployeeTaskActions
      code={"a".repeat(64)}
      task={task}
      onChanged={onChanged}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Mandar recado ao síndico" }),
  );
  return onChanged;
}
test("empty and whitespace messages focus the field without preparing uploads", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  open();
  fireEvent.change(screen.getByLabelText("Recado"), {
    target: { value: " \n " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Escreva o recado ou anexe um arquivo.",
  );
  expect(screen.getByLabelText("Recado")).toHaveFocus();
  expect(fetch).not.toHaveBeenCalled();
});
test("text only recovers the original command after response loss without upload preparation", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("lost response"))
    .mockResolvedValueOnce(Response.json(task));
  vi.stubGlobal("fetch", fetch);
  const changed = open();
  fireEvent.change(screen.getByLabelText("Recado"), {
    target: { value: "Preciso de escada." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Recuperar operação" }),
  );
  await waitFor(() => expect(changed).toHaveBeenCalledWith(task));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toContain("/commands");
  expect(fetch.mock.calls[0][1].body).toEqual(fetch.mock.calls[1][1].body);
  expect(JSON.parse(fetch.mock.calls[0][1].body).type).toBe("message");
  expect(await screen.findByText("Recado enviado ao síndico.")).toBeVisible();
});
test("selected files can be removed and cancel never writes a message", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  open();
  fireEvent.change(screen.getByLabelText("Anexar foto, vídeo ou PDF"), {
    target: {
      files: [
        new File(["synthetic"], "synthetic.pdf", { type: "application/pdf" }),
      ],
    },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Remover synthetic.pdf" }),
  );
  expect(
    screen.queryByRole("button", { name: "Remover synthetic.pdf" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Mandar recado ao síndico" }),
    ).toHaveFocus(),
  );
  expect(fetch).not.toHaveBeenCalled();
});

test("a failed message upload is canceled through its own scope without creating an event", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("lost preparation"))
    .mockResolvedValueOnce(Response.json({ state: "cancelled", files: [] }));
  vi.stubGlobal("fetch", fetch);
  open();
  fireEvent.change(screen.getByLabelText("Anexar foto, vídeo ou PDF"), {
    target: {
      files: [
        new File(["synthetic"], "synthetic.pdf", { type: "application/pdf" }),
      ],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Mandar recado ao síndico" }),
    ).toHaveFocus(),
  );
  expect(fetch.mock.calls[0][0]).toContain("/message-uploads");
  expect(fetch.mock.calls[1][0]).toContain("/message-uploads/");
  expect(fetch.mock.calls[1][1].method).toBe("DELETE");
  expect(
    fetch.mock.calls.every((call) => !String(call[0]).includes("/commands")),
  ).toBe(true);
});

test("confirmed messages return to the summary and focus the accessible top confirmation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(Response.json(task))),
  );
  render(<EmployeeTaskPage code={"b".repeat(64)} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Mandar recado ao síndico" }),
  );
  fireEvent.change(screen.getByLabelText("Recado"), {
    target: { value: "Recado sintético" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await waitFor(() =>
    expect(screen.getByText("Recado enviado ao síndico.")).toHaveFocus(),
  );
  expect(
    screen.getByRole("heading", { name: "O que aconteceu" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
