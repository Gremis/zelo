import { expect, test, vi } from "vitest";
import Home from "@/app/page";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));

test("redirects the homepage to login", () => {
  Home();

  expect(redirect).toHaveBeenCalledWith("/login");
});
