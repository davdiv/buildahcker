import { readdir } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import { exec } from "../src";
import { sshKeygen } from "../src/alpine/ssh";
import { apkCache, containerCache, logger, tempFolder } from "./testUtils";

it("sshKeygen should succeed", { timeout: 30000 }, async () => {
  await exec(["buildah", "pull", "alpine"], { logger });
  const outputFolder = join(tempFolder, "keys");
  await sshKeygen({
    outputFolder,
    types: ["ed25519", "rsa"],
    apkCache,
    containerCache,
    logger,
  });
  const outputFiles = (await readdir(outputFolder)).sort();
  expect(outputFiles).toEqual([
    "ssh_host_ed25519_key",
    "ssh_host_ed25519_key.pub",
    "ssh_host_rsa_key",
    "ssh_host_rsa_key.pub",
  ]);
});
