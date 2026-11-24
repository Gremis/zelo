import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  inspectAttachment,
  InvalidAttachment,
  parseResidentMemory,
} from "@/server/occurrences/upload-inspection";

vi.mock("server-only", () => ({}));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

test("missing or invalid RSS data never silently disables memory monitoring", () => {
  expect(
    parseResidentMemory("Name:\tnode\nVmRSS:\t20480 kB\nThreads:\t1\n"),
  ).toBe(20480);
  for (const value of [
    "Name: node",
    "VmRSS: unknown kB",
    "VmRSS: 0 kB",
    "VmRSS: 9007199254740993 kB",
  ])
    expect(() => parseResidentMemory(value)).toThrow(
      "inspection_monitor_unavailable",
    );
});

test("an exited zombie has no resident memory and is not an unavailable active monitor", () => {
  expect(
    parseResidentMemory("Name:\tnode\nState:\tZ (zombie)\nThreads:\t1\n"),
  ).toBe(0);
});

test("an inaccessible proc monitor kills inspection but remains retryable", async () => {
  vi.useFakeTimers();
  vi.spyOn(process, "getBuiltinModule").mockReturnValue({
    platform: () => "linux",
  });
  const child = Object.assign(new EventEmitter(), {
    pid: 12345,
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    stdout: new EventEmitter(),
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
  });
  child.kill.mockImplementation(() => {
    child.emit("close", null, "SIGKILL");
    return true;
  });
  vi.mocked(spawn).mockReturnValue(
    child as unknown as ReturnType<typeof spawn>,
  );
  vi.mocked(readFile).mockRejectedValue(
    Object.assign(new Error("denied"), { code: "EACCES" }),
  );
  const result = inspectAttachment(Buffer.from("test"), {
    contentType: "image/png",
    size: 4,
  });
  const assertion = expect(result).rejects.toSatisfy(
    (error: Error) =>
      error.message === "inspection_monitor_unavailable" &&
      !(error instanceof InvalidAttachment),
  );
  await vi.advanceTimersByTimeAsync(50);
  await assertion;
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
});

test("resident memory over budget stops the parser instead of accepting its output", async () => {
  vi.useFakeTimers();
  vi.spyOn(process, "getBuiltinModule").mockReturnValue({
    platform: () => "linux",
  });
  const child = Object.assign(new EventEmitter(), {
    pid: 12345,
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    stdout: new EventEmitter(),
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
  });
  child.kill.mockImplementation(() => {
    child.emit("close", null, "SIGKILL");
    return true;
  });
  vi.mocked(spawn).mockReturnValue(
    child as unknown as ReturnType<typeof spawn>,
  );
  vi.mocked(readFile).mockResolvedValue("Name:\tnode\nVmRSS:\t500000 kB\n");
  const result = inspectAttachment(Buffer.from("test"), {
    contentType: "image/png",
    size: 4,
  });
  const assertion = expect(result).rejects.toBeInstanceOf(InvalidAttachment);
  await vi.advanceTimersByTimeAsync(50);
  await assertion;
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
});
