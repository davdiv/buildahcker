import { close } from "fs";
import { open } from "fs/promises";
import { pipeline } from "stream/promises";

export interface OffsetAndSize {
  offset: number;
  size: number;
}

export interface PartitionConfig {
  inputFile: string;
  input?: OffsetAndSize;
  output: OffsetAndSize;
}

export interface WritePartitionsOptions {
  outputFile: string;
  partitions: PartitionConfig[];
}

export const writePartitions = async (config: WritePartitionsOptions) => {
  const outputFile = await open(config.outputFile, "r+");
  try {
    for (const partition of config.partitions) {
      const inputFile = await open(partition.inputFile, "r");
      try {
        const inputStart = partition.input?.offset ?? 0;
        const inputStream = inputFile.createReadStream({
          start: inputStart,
          end:
            inputStart +
            Math.min(partition.output.size, partition.input?.size ?? Infinity),
          autoClose: false,
        });
        const outputStream = outputFile.createWriteStream({
          start: partition.output.offset,
          autoClose: false,
        });
        await pipeline(inputStream, outputStream);
      } finally {
        await inputFile.close();
      }
    }
  } finally {
    // FIXME: we should do:
    // await outputFile.close();
    // but it causes node.js to exit (cf https://github.com/nodejs/node/issues/48466)
    // so instead we do:
    await new Promise((resolve) => close(outputFile.fd, resolve));
  }
};
