import { stat } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import { exec } from "../src";
import {
  PartitionType,
  parted,
  writePartitions,
} from "../src/alpine/partitions";
import { cacheOptions, logger, tempFolder } from "./testUtils";

it(
  "parted and writePartitions should succeed",
  { timeout: 30000 },
  async () => {
    const source = "alpine";
    await exec(["buildah", "pull", source], { logger });
    const outputFile = join(tempFolder, "output.img");
    const partitions = await parted({
      outputFile,
      partitions: [
        {
          name: "mypart",
          size: 1000000,
          type: PartitionType.LinuxData,
        },
      ],
      cacheOptions,
      logger,
    });
    await writePartitions({
      outputFile,
      partitions: [
        {
          inputFile: __filename,
          output: partitions[0],
        },
      ],
    });
    const outputImg = await stat(outputFile);
    expect(outputImg.isFile()).toBeTruthy();
    expect(outputImg.size).toBeGreaterThan(1000000);
  },
);
