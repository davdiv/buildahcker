import { createHash } from "crypto";
import type { Writable } from "stream";
import type { AtomicStep, ImageOrContainer } from "../../container";
import { withImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareOutputFile } from "../../fileUtils";
import { prepareApkPackages } from "../prepareApkPackages";
import { cp } from "fs/promises";
import { join } from "path";

export interface GrubMkenvOptions {
  outputFile: string;
  variables?: string[];
  grubSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const grubMkenv = async ({
  outputFile,
  variables,
  grubSource,
  containerCache,
  apkCache,
  logger,
}: GrubMkenvOptions) => {
  outputFile = await prepareOutputFile(outputFile);
  if (!grubSource) {
    grubSource = await prepareApkPackages({
      apkPackages: ["grub", "grub-bios", "grub-efi"],
      containerCache,
      apkCache,
      logger,
    });
  }
  await withImageOrContainer(
    grubSource,
    async (container) => {
      const tempFolder = await container.tempFolder();
      const buildahOptions = ["--workingdir", tempFolder.pathInContainer];
      try {
        await container.run(
          ["grub-editenv", "grubenv", "create"],
          buildahOptions,
        );
        if (variables && variables.length > 0) {
          await container.run(
            ["grub-editenv", "grubenv", "set", ...variables],
            buildahOptions,
          );
        }
        await cp(join(tempFolder.pathInHost, "grubenv"), outputFile);
      } finally {
        await tempFolder.remove();
      }
    },
    { logger },
  );
};

// Note that paths in grubMkimageStep are inside the container
export const grubMkenvStep = ({
  outputFile: outputFileInContainer,
  variables,
  ...otherOptions
}: GrubMkenvOptions) => {
  const step: AtomicStep = async (container) => {
    const outputFile = await container.resolve(outputFileInContainer);
    await grubMkenv({
      outputFile,
      variables,
      ...otherOptions,
    });
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(
      JSON.stringify({
        outputFile: outputFileInContainer,
        variables,
      }),
    );
    return `GRUB-MKENV-${hash.digest("base64url")}`;
  };
  return step;
};
