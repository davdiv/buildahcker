import { createHash } from "crypto";
import { readdir, truncate } from "fs/promises";
import type { Writable } from "stream";
import type { AtomicStep, ImageOrContainer } from "../../container";
import { withImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareOutputFile } from "../../fileUtils";
import { prepareApkPackages } from "../prepareApkPackages";

export interface MkvfatfsOptions {
  inputFolder: string;
  mtoolsSource?: ImageOrContainer;
  outputFileSize: number;
  outputFile: string;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const mkvfatfs = async ({
  inputFolder,
  mtoolsSource,
  outputFileSize,
  outputFile,
  containerCache,
  apkCache,
  logger,
}: MkvfatfsOptions) => {
  if (!mtoolsSource) {
    mtoolsSource = await prepareApkPackages({
      apkPackages: ["mtools"],
      containerCache,
      apkCache,
      logger,
    });
  }
  outputFile = await prepareOutputFile(outputFile);
  await truncate(outputFile, outputFileSize);
  await withImageOrContainer(
    mtoolsSource,
    async (container) => {
      await container.run(
        ["mformat", "-i", "/out", "-F", "::"],
        ["-v", `${outputFile}:/out:rw`],
      );
      const sourceFiles = await readdir(inputFolder);
      if (sourceFiles.length > 0) {
        await container.run(
          [
            "mcopy",
            "-i",
            "/out",
            "-s",
            "-b",
            "-p",
            ...sourceFiles.map((file) => `./${file}`),
            "::/",
          ],
          [
            "-v",
            `${inputFolder}:/in:ro`,
            "-v",
            `${outputFile}:/out:rw`,
            "--workingdir",
            "/in",
          ],
        );
      }
    },
    { logger },
  );
};

// Note that paths in mkvfatfsStep are inside the container
export const mkvfatfsStep = ({
  inputFolder: inputFolderInContainer,
  outputFile: outputFileInContainer,
  ...otherOptions
}: MkvfatfsOptions) => {
  const step: AtomicStep = async (container) => {
    const inputFolder = await container.resolve(inputFolderInContainer);
    const outputFile = await container.resolve(outputFileInContainer);
    await mkvfatfs({ inputFolder, outputFile, ...otherOptions });
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(
      JSON.stringify({
        inputFolder: inputFolderInContainer,
        outputFile: outputFileInContainer,
        outputFileSize: otherOptions.outputFileSize,
      }),
    );
    return `MKVFATFS-${hash.digest("base64url")}`;
  };
  return step;
};
