import { createHash } from "crypto";
import { relative, sep } from "path";
import type { Writable } from "stream";
import type { AtomicStep, ImageOrContainer } from "../container";
import type { ContainerCache } from "../containerCache";
import { prepareOutputFile } from "../fileUtils";
import { prepareApkPackagesAndRun } from "./prepareApkPackages";
import { veritySetup, type VeritySetupOptions } from "./dmverity/veritysetup";

export interface MksquashfsOptions {
  inputFolder: string;
  outputFile: string;
  timestamp?: string | number;
  veritySetup?: Omit<VeritySetupOptions, "file">;
  squashfsToolsSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const mksquashfs = async ({
  inputFolder,
  squashfsToolsSource,
  outputFile,
  timestamp = 0,
  veritySetup: veritySetupOptions,
  containerCache,
  apkCache,
  logger,
}: MksquashfsOptions) => {
  outputFile = await prepareOutputFile(outputFile);
  const relativeOutputFile = relative(inputFolder, outputFile);
  const extraOptions: string[] = [];
  if (!relativeOutputFile.startsWith(`..${sep}`)) {
    extraOptions.push("-e", relativeOutputFile);
  }
  await prepareApkPackagesAndRun({
    apkPackages: ["squashfs-tools"],
    existingSource: squashfsToolsSource,
    command: [
      "mksquashfs",
      "/in",
      "/out",
      "-noappend",
      "-no-xattrs",
      "-mkfs-time",
      `${timestamp}`,
      "-all-time",
      `${timestamp}`,
      ...extraOptions,
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
  if (veritySetupOptions) {
    await veritySetup({
      file: outputFile,
      ...veritySetupOptions,
    });
  }
};

// Note that paths in mksquashfsStep are inside the container
export const mksquashfsStep = ({
  inputFolder: inputFolderInContainer,
  outputFile: outputFileInContainer,
  ...otherOptions
}: MksquashfsOptions) => {
  const step: AtomicStep = async (container) => {
    const inputFolder = await container.resolve(inputFolderInContainer);
    const outputFile = await container.resolve(outputFileInContainer);
    await mksquashfs({ inputFolder, outputFile, ...otherOptions });
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(
      JSON.stringify({
        inputFolder: inputFolderInContainer,
        outputFile: outputFileInContainer,
        timestamp: otherOptions.timestamp ?? undefined,
        veritySetup: otherOptions?.veritySetup
          ? {
              salt: otherOptions.veritySetup.salt ?? undefined,
              uuid: otherOptions.veritySetup.uuid ?? undefined,
            }
          : undefined,
      }),
    );
    return `MKSQUASHFS-${hash.digest("base64url")}`;
  };
  return step;
};
