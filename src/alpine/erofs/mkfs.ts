import { createHash } from "crypto";
import { createReadStream } from "fs";
import { relative, sep } from "path";
import type { Writable } from "stream";
import { pipeline } from "stream/promises";
import type { AtomicStep, ImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareOutputFile } from "../../fileUtils";
import { prepareApkPackagesAndRun } from "../prepareApkPackages";
import { veritySetup, type VeritySetupOptions } from "../dmverity/veritysetup";
import { erofsSetUUID } from "./setUUID";
import { writeFile } from "fs/promises";

export interface MkerofsOptions {
  inputFolder: string;
  outputFile: string;
  excludeRegex?: string[];
  metadataFile?: string;
  veritySetup?: Omit<VeritySetupOptions, "file" | "metadataFile">;
  timestamp?: string | number;
  uuid?: string;
  erofsUtilsSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const mkerofs = async ({
  inputFolder,
  erofsUtilsSource,
  excludeRegex,
  timestamp = 0,
  uuid = "hash",
  veritySetup: veritySetupOptions,
  outputFile,
  metadataFile = `${outputFile}.json`,
  containerCache,
  apkCache,
  logger,
}: MkerofsOptions) => {
  outputFile = await prepareOutputFile(outputFile);
  const relativeOutputFile = relative(inputFolder, outputFile);
  const extraOptions: string[] = [];
  if (!relativeOutputFile.startsWith(`..${sep}`)) {
    extraOptions.push(`--exclude-path=${relativeOutputFile}`);
  }
  excludeRegex?.forEach((e) => extraOptions.push(`--exclude-regex=${e}`));
  if (uuid !== "random" && uuid !== "hash") {
    extraOptions.push("-U", uuid);
  }
  await prepareApkPackagesAndRun({
    apkPackages: ["erofs-utils"],
    existingSource: erofsUtilsSource,
    command: [
      "mkfs.erofs",
      ...extraOptions,
      "-T",
      `${timestamp}`,
      "/out",
      "--",
      "/in",
    ],
    buildahRunOptions: [
      "-v",
      `${inputFolder}:/in:ro`,
      "-v",
      `${outputFile}:/out:rw`,
    ],
    containerCache,
    apkCache,
    logger,
  });
  if (uuid === "hash") {
    const outputFileStream = createReadStream(outputFile);
    const hash = createHash("sha256");
    await pipeline(outputFileStream, hash);
    const hashResult = hash.digest();
    logger?.write(`Hash: ${hashResult.toString("hex")} \n`);
    const uuid = await erofsSetUUID(outputFile, hashResult);
    await writeFile(metadataFile, JSON.stringify({ uuid }));
  }
  if (veritySetupOptions) {
    await veritySetup({
      file: outputFile,
      metadataFile,
      ...veritySetupOptions,
    });
  }
};

// Note that paths in mkerofsStep are inside the container
export const mkerofsStep = ({
  inputFolder: inputFolderInContainer,
  outputFile: outputFileInContainer,
  metadataFile: metadataFileInContainer,
  ...otherOptions
}: MkerofsOptions) => {
  const step: AtomicStep = async (container) => {
    const inputFolder = await container.resolve(inputFolderInContainer);
    const outputFile = await container.resolve(outputFileInContainer);
    const metadataFile = metadataFileInContainer
      ? await container.resolve(metadataFileInContainer)
      : undefined;
    await mkerofs({ inputFolder, outputFile, metadataFile, ...otherOptions });
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(
      JSON.stringify({
        inputFolder: inputFolderInContainer,
        outputFile: outputFileInContainer,
        metadataFile: metadataFileInContainer,
        excludeRegex: otherOptions.excludeRegex ?? undefined,
        uuid: otherOptions.uuid ?? undefined,
        timestamp: otherOptions.timestamp ?? undefined,
        veritySetup: otherOptions.veritySetup
          ? {
              salt: otherOptions.veritySetup.salt ?? undefined,
              uuid: otherOptions.veritySetup.uuid ?? undefined,
            }
          : undefined,
      }),
    );
    return `MKEROFS-${hash.digest("base64url")}`;
  };
  return step;
};
