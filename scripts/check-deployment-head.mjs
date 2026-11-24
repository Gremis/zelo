import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function checkDeploymentHead(env = process.env, request = fetch) {
  const {
    GITHUB_EVENT_NAME,
    GITHUB_REF,
    GITHUB_SHA,
    GITHUB_REPOSITORY,
    GITHUB_TOKEN,
  } = env;
  if (
    GITHUB_EVENT_NAME !== "push" ||
    !["refs/heads/develop", "refs/heads/production"].includes(
      GITHUB_REF ?? "",
    ) ||
    !/^[a-f0-9]{40}$/.test(GITHUB_SHA ?? "") ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(GITHUB_REPOSITORY ?? "") ||
    !GITHUB_TOKEN
  ) {
    throw new Error(
      "Deployment requires a supported branch push and complete GitHub context.",
    );
  }

  const branch = GITHUB_REF.slice("refs/heads/".length);
  const response = await request(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/git/ref/heads/${branch}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      "Could not verify the current branch head; deployment is blocked.",
    );
  }
  const ref = await response.json();
  if (ref.object?.sha !== GITHUB_SHA) {
    throw new Error(
      "This commit is no longer the branch head; deployment is blocked.",
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await checkDeploymentHead();
  } catch {
    console.error(
      "Branch-head verification failed. Refusing stale or unverified deployment.",
    );
    process.exitCode = 1;
  }
}
