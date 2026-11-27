import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OccurrenceReopen } from "@/components/occurrence-reopen";
import { occurrenceDetailFixture } from "../fixtures/occurrence-detail";
const request = vi.fn();
const detail = () =>
  occurrenceDetailFixture({
    status: "completed",
    completedAt: "2026-11-24T15:00:00Z",
    canDecidePriority: false,
    version: 3,
  });
function mount() {
  const onChanged = vi.fn(),
    onBusy = vi.fn();
  render(
    <OccurrenceReopen
      detail={detail()}
      onChanged={onChanged}
      onBusy={onBusy}
    />,
  );
  return { onChanged, onBusy };
}
beforeEach(() => {
  request.mockReset();
  sessionStorage.clear();
  vi.stubGlobal("fetch", request);
  request.mockResolvedValue(
    Response.json(occurrenceDetailFixture({ version: 4 })),
  );
});
afterEach(() => vi.unstubAllGlobals());
test.each(["Cancel", "Escape"])(
  "cancel via %s makes no request and restores trigger focus",
  async (method) => {
    mount();
    const button = screen.getByRole("button", { name: "Reabrir" });
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Reabrir #7704?" });
    expect(within(dialog).getByLabelText("Motivo (opcional)")).toHaveFocus();
    fireEvent.change(within(dialog).getByLabelText("Motivo (opcional)"), {
      target: { value: "Internal draft" },
    });
    if (method === "Cancel")
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    else fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
    expect(request).not.toHaveBeenCalled();
  },
);
test("confirmation trims the internal reason and reopens once", async () => {
  const { onChanged } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Motivo (opcional)"), {
    target: { value: "  Internal recurrence  " },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reabrir" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
    type: "reopen",
    version: 3,
    payload: { reason: "Internal recurrence" },
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});
test("double submission and lost response reuse the exact command and preserve the reason", async () => {
  request.mockRejectedValueOnce(new Error("response lost"));
  const { onChanged } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Motivo (opcional)"), {
    target: { value: "Private draft" },
  });
  const button = within(dialog).getByRole("button", { name: "Reabrir" });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByRole("alert");
  expect(request).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByLabelText("Motivo (opcional)")).toHaveValue(
    "Private draft",
  );
  request.mockResolvedValueOnce(
    Response.json(occurrenceDetailFixture({ version: 4 })),
  );
  fireEvent.click(button);
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual(
    JSON.parse(request.mock.calls[1][1].body),
  );
});
test("version conflict offers refresh without discarding the reason", async () => {
  request.mockResolvedValueOnce(Response.json({}, { status: 409 }));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Motivo (opcional)"), {
    target: { value: "Private reason" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reabrir" }));
  await screen.findByRole("button", { name: "Atualizar dados" });
  expect(within(dialog).getByLabelText("Motivo (opcional)")).toHaveValue(
    "Private reason",
  );
});
test("Tab and Shift+Tab wrap inside the confirmation", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
  const dialog = screen.getByRole("dialog");
  const field = within(dialog).getByLabelText("Motivo (opcional)");
  fireEvent.keyDown(field, { key: "Tab", shiftKey: true });
  expect(within(dialog).getByRole("button", { name: "Reabrir" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Tab" });
  expect(field).toHaveFocus();
});

test("an old idempotent receipt cannot overwrite a newer completion cycle in the card", async () => {
  request
    .mockResolvedValueOnce(
      Response.json(occurrenceDetailFixture({ version: 1 })),
    )
    .mockResolvedValueOnce(Response.json(detail()));
  const { onChanged } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Reabrir" }),
  );
  await waitFor(() =>
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", version: 3 }),
    ),
  );
  expect(request).toHaveBeenCalledTimes(2);
});
