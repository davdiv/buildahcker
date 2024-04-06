import { stat } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import { exec } from "../src";
import { mkvfatfs } from "../src/alpine/mkvfatfs";
import { apkCache, containerCache, logger, tempFolder } from "./testUtils";

it("mkvfatfs should succeed", { timeout: 30000 }, async () => {
  await exec(["buildah", "pull", "alpine"], { logger });
  const outputFile = join(tempFolder, "output.img");
  await mkvfatfs({
    inputFolder: __dirname,
    outputFileSize: 33 * 1024 * 1024,
    outputFile,
    apkCache,
    containerCache,
    logger,
  });
  const outputImg = await stat(outputFile);
  expect(outputImg.isFile()).toBeTruthy();
  expect(outputImg.size).toBe(33 * 1024 * 1024);
});
