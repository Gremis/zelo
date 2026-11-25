import "server-only";

export function publicTaskOrigin(): string | null {
  const value = process.env.PUBLIC_APP_ORIGIN;
  if (!value || !/^https?:\/\/[^/?#\s\\]+\/?$/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
