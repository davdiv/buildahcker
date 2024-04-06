import { stat } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import { exec } from "../src";
import { mksquashfs } from "../src/alpine/mksquashfs";
import { apkCache, containerCache, logger, tempFolder } from "./testUtils";

it("mksquashfs should succeed", { timeout: 30000 }, async () => {
  await exec(["buildah", "pull", "alpine"], { logger });
  const outputFile = join(tempFolder, "output.img");
  await mksquashfs({
    inputFolder: __dirname,
    outputFile,
    apkCache,
    containerCache,
    logger,
  });
  const outputImg = await stat(outputFile);
  expect(outputImg.isFile()).toBeTruthy();
  expect(outputImg.size).toBeGreaterThan(10);
});
