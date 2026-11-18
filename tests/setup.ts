import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(cleanup);

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "signup-ui-font" }),
  Space_Grotesk: () => ({ variable: "signup-heading-font" }),
  JetBrains_Mono: () => ({ variable: "signup-code-font" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
