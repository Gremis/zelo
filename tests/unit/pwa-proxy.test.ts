import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { expect, test } from "vitest";
import { config } from "@/proxy";

test.each([
  "/sw.js",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-512.png",
])(
  "does not attach authentication processing to public PWA asset %s",
  (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  },
);

test.each([
  "/login",
  "/criar-conta",
  "/confirmar-codigo",
  "/api/auth/login",
  "/fila",
])("preserves the existing authentication proxy for %s", (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
});
