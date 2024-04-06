import { readdir, truncate } from "fs/promises";
import type { Writable } from "stream";
import type { ImageOrContainer } from "../../container";
import { withImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareOutputFile } from "../fileUtils";
import { prepareApkPackages } from "../prepareApkPackages";

export interface MkvfatfsOptions {
  source: ImageOrContainer;
  mtoolsSource?: ImageOrContainer;
  outputFileSize: number;
  outputFile: string;
  pathInSource?: string;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const mkvfatfs = async ({
  source,
  mtoolsSource: mtoolsSource,
  outputFileSize,
  outputFile,
  pathInSource = ".",
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
    source,
    async (container) => {
      const sourcePath = await container.resolve(pathInSource);
      await withImageOrContainer(
        mtoolsSource,
        async (container) => {
          await container.run(
            ["mformat", "-i", "/out", "-F", "::"],
            ["-v", `${outputFile}:/out:rw`],
          );
          const sourceFiles = await readdir(sourcePath);
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
                `${sourcePath}:/in:ro`,
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
    },
    { logger },
  );
};
