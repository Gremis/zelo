import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { OccurrenceAttachment } from "@/components/occurrence-attachment";
const file = {
  id: "synthetic-file",
  name: "synthetic.png",
  contentType: "image/png",
  size: 100,
};
test("private images expand inline while keeping download explicit", async () => {
  render(<OccurrenceAttachment occurrenceId="synthetic-case" file={file} />);
  const image = screen.getByRole("img", {
    name: "Anexo interno: synthetic.png",
  });
  const url = new URL((image as HTMLImageElement).src);
  expect(url.pathname + url.search).toBe(
    "/api/occurrences/synthetic-case/attachments/synthetic-file?preview=1",
  );
  fireEvent.load(image);
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  fireEvent.click(
    screen.getByRole("button", { name: "Ampliar imagem synthetic.png" }),
  );
  expect(
    screen.getByRole("button", { name: "Recolher imagem synthetic.png" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(
    screen.getByRole("link", { name: "Baixar synthetic.png" }),
  ).toHaveAttribute(
    "href",
    "/api/occurrences/synthetic-case/attachments/synthetic-file",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Recolher imagem synthetic.png" }),
  );
  expect(
    screen.getByRole("button", { name: "Ampliar imagem synthetic.png" }),
  ).toHaveAttribute("aria-expanded", "false");
});
test("image errors offer a retry without navigating or losing the download", async () => {
  render(<OccurrenceAttachment occurrenceId="synthetic-case" file={file} />);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Não foi possível carregar",
  );
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  fireEvent.load(screen.getByRole("img"));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(
    screen.getByRole("link", { name: "Baixar synthetic.png" }),
  ).toBeInTheDocument();
});
test("non-image evidence keeps the existing download link", () => {
  render(
    <OccurrenceAttachment
      occurrenceId="synthetic-case"
      file={{ ...file, name: "synthetic.pdf", contentType: "application/pdf" }}
    />,
  );
  expect(screen.queryByRole("img")).toBeNull();
  expect(
    screen.getByRole("link", { name: "synthetic.pdf (interno)" }),
  ).toBeInTheDocument();
});
