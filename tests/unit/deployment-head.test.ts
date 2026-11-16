import { expect, test, vi } from "vitest";
import { checkDeploymentHead } from "../../scripts/check-deployment-head.mjs";

const sha = "a".repeat(40);
const context = {
  NODE_ENV: "test" as const,
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/heads/develop",
  GITHUB_SHA: sha,
  GITHUB_REPOSITORY: "example/zelo",
  GITHUB_TOKEN: "test-only-token",
};

test.each(["develop", "main"])(
  "accepts the current %s commit",
  async (branch) => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ object: { sha } }),
    });
    await expect(
      checkDeploymentHead(
        { ...context, GITHUB_REF: `refs/heads/${branch}` },
        request,
      ),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      `https://api.github.com/repos/example/zelo/git/ref/heads/${branch}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  },
);

test.each([
  { GITHUB_EVENT_NAME: "pull_request" },
  { GITHUB_EVENT_NAME: "workflow_dispatch" },
  { GITHUB_REF: "refs/heads/chore/deployment-pipeline" },
  { GITHUB_TOKEN: "" },
  { GITHUB_SHA: "" },
])(
  "rejects unsupported or incomplete context before requesting GitHub: %j",
  async (override) => {
    const request = vi.fn();
    await expect(
      checkDeploymentHead({ ...context, ...override }, request),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  },
);

test("rejects an obsolete commit", async () => {
  const request = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ object: { sha: "b".repeat(40) } }),
  });
  await expect(checkDeploymentHead(context, request)).rejects.toThrow(
    "no longer the branch head",
  );
});

test.each([{ ok: false }, { ok: true, json: async () => ({}) }])(
  "fails closed when the remote ref cannot be verified: %j",
  async (response) => {
    await expect(
      checkDeploymentHead(context, vi.fn().mockResolvedValue(response)),
    ).rejects.toThrow();
  },
);

test("fails closed on network errors", async () => {
  await expect(
    checkDeploymentHead(
      context,
      vi.fn().mockRejectedValue(new Error("Network unavailable")),
    ),
  ).rejects.toThrow();
});
