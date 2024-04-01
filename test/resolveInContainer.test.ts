import { mkdir, symlink } from "fs/promises";
import { join } from "path";
import { describe, expect, test } from "vitest";
import {
  resolveParentInContainer,
  resolveInContainer,
} from "../src/resolveInContainer";
import { tempFolder } from "./testUtils";

describe("resolveInContainer", () => {
  test("valid cases", async () => {
    const binFolder = join(tempFolder, "usr", "bin");
    await mkdir(binFolder, { recursive: true });
    await symlink("/usr/bin", join(tempFolder, "bin"));
    await symlink("./usr/bin", join(tempFolder, "sbin"));
    await expect(resolveInContainer(tempFolder, "usr/bin")).resolves.toBe(
      binFolder,
    );
    await expect(resolveInContainer(tempFolder, "bin")).resolves.toBe(
      binFolder,
    );
    await expect(resolveInContainer(tempFolder, "sbin")).resolves.toBe(
      binFolder,
    );
    await expect(resolveInContainer(tempFolder, "usr/bin/env")).resolves.toBe(
      join(binFolder, "env"),
    );
    await expect(resolveInContainer(tempFolder, "bin/bash")).resolves.toBe(
      join(binFolder, "bash"),
    );
    await expect(resolveInContainer(tempFolder, "sbin/parted")).resolves.toBe(
      join(binFolder, "parted"),
    );
  });

  test("edge case (.. in root)", async () => {
    await expect(resolveInContainer(tempFolder, "..")).resolves.toBe(
      tempFolder,
    );
    await expect(resolveInContainer(tempFolder, "..", false)).resolves.toBe(
      tempFolder,
    );
    await expect(resolveInContainer(tempFolder, "..", true)).rejects.toThrow(
      "Invalid path: ..",
    );
  });

  test("recursive case", async () => {
    await symlink("./rec-a", join(tempFolder, "rec-b"));
    await symlink("./rec-b", join(tempFolder, "rec-a"));
    await expect(resolveInContainer(tempFolder, "rec-a")).rejects.toThrow(
      "Recursive link",
    );
  });
});

describe("resolveParentInContainer", () => {
  test("invalid cases", async () => {
    await expect(resolveParentInContainer(tempFolder, "..")).rejects.toThrow(
      "Invalid path",
    );
  });
});
