import { readdir, truncate } from "fs/promises";
import type { Writable } from "stream";
import type { ImageOrContainer } from "../../container";
import { withImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareOutputFile } from "../fileUtils";
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
