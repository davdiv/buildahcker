import { readFile } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import { exec } from "../src";
import {
  PartitionType,
  parted,
  writePartitions,
} from "../src/alpine/partitions";
import { logger, tempFolder } from "./testUtils";

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
          name: "p1",
          size: 10000,
          type: PartitionType.LinuxData,
        },
        {
          name: "p2",
          size: 10000,
          type: PartitionType.LinuxData,
        },
      ],
    });
    await writePartitions({
      outputFile,
      partitions: [
        { inputFile: __filename, output: partitions[0] },
        { inputBuffer: Buffer.from("Hello!!", "utf8"), output: partitions[1] },
      ],
    });
    const thisFile = await readFile(__filename);
    const outputImg = await readFile(outputFile);
    expect(outputImg.subarray(512, 512 + 8).toString("ascii")).toBe("EFI PART");
    expect(
      outputImg.subarray(
        partitions[0].offset,
        partitions[0].offset + thisFile.length,
      ),
    ).toEqual(thisFile);
    expect(
      outputImg
        .subarray(partitions[1].offset, partitions[1].offset + 7)
        .toString("utf8"),
    ).toBe("Hello!!");
  },
);
