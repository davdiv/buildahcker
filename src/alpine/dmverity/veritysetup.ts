import { createReadStream, createWriteStream } from "fs";
import { readFile, rm, stat, writeFile } from "fs/promises";
import type { Writable } from "stream";
import { pipeline } from "stream/promises";
import { withImageOrContainer, type ImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareApkPackages } from "../prepareApkPackages";

const readFileSize = async (file: string) => (await stat(file)).size;

const appendFile = async (srcFile: string, dstFile: string) => {
  const srcStream = createReadStream(srcFile);
  const dstStream = createWriteStream(dstFile, { flags: "a" });
  await pipeline(srcStream, dstStream);
};

export interface VerityMetadata {
  uuid?: string;
  rootHash: string;
  hashOffset: number;
  fecOffset: number;
}

export interface VeritySetupOptions {
  file: string;
  metadataFile?: string;
  salt?: string;
  uuid?: string;
  cryptsetupSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const veritySetup = async ({
  file,
  metadataFile = `${file}.json`,
  salt = "",
  uuid = "00000000-0000-0000-0000-000000000000",
  cryptsetupSource,
  containerCache,
  apkCache,
  logger,
}: VeritySetupOptions) => {
  if (!cryptsetupSource) {
    cryptsetupSource = await prepareApkPackages({
      apkPackages: ["cryptsetup"],
      containerCache,
      apkCache,
      logger,
    });
  }
  await withImageOrContainer(
    cryptsetupSource,
    async (container) => {
      const verityResult = await container.run(
        [
          "veritysetup",
          "format",
          "/image",
          "/image.hash",
          "--fec-device=/image.fec",
          `--salt=${salt}`,
          `--uuid=${uuid}`,
        ],
        ["-v", `${file}:/image:rw`],
      );
      const output = verityResult.stdout.toString("utf8");
      const [, rootHash] = /Root hash:\s*([0-9a-f]{64})/.exec(output)!;
      const hashOffset = await readFileSize(file);
      const hashFile = await container.resolve("/image.hash");
      await appendFile(hashFile, file);
      const fecOffset = await readFileSize(file);
      const fecFile = await container.resolve("/image.fec");
      await appendFile(fecFile, file);
      await rm(hashFile);
      await rm(fecFile);
      let existingMetadata = {};
      try {
        existingMetadata = JSON.parse(await readFile(metadataFile, "utf8"));
      } catch {}
      const metadata: VerityMetadata = {
        ...existingMetadata,
        rootHash,
        hashOffset,
        fecOffset,
      };
      await writeFile(metadataFile, JSON.stringify(metadata));
    },
    { logger },
  );
};
