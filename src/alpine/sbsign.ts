import { createHash } from "crypto";
import type { Writable } from "stream";
import type { AtomicStep, ImageOrContainer } from "../container";
import type { ContainerCache } from "../containerCache";
import { prepareOutputFile } from "../fileUtils";
import { DiskFile, MemDirectory } from "../steps";
import { prepareApkPackagesAndRun } from "./prepareApkPackages";
import { copyFile, rm, truncate } from "fs/promises";

export class SignKey {
  readonly #certificate: DiskFile;
  readonly #privateKey: DiskFile;
  readonly #directory: MemDirectory;

  private constructor(certificate: DiskFile, privateKey: DiskFile) {
    this.#certificate = certificate;
    this.#privateKey = privateKey;
    this.#directory = new MemDirectory({
      content: {
        cert: certificate,
        key: privateKey,
      },
    });
  }

  async certificatePath() {
    return this.#certificate.sourceFilePath;
  }

  async privateKeyPath() {
    return this.#privateKey.sourceFilePath;
  }

  async getHash() {
    return await this.#directory.getContentHash();
  }

  static from(certificateFile: string, privateKeyFile: string) {
    return new SignKey(
      new DiskFile(certificateFile, { uid: 0, gid: 0, mode: 0o600 }),
      new DiskFile(privateKeyFile, { uid: 0, gid: 0, mode: 0o600 }),
    );
  }
}

export interface SbsignOptions {
  inputFile: string;
  outputFile?: string;
  key: SignKey;
  sbsignSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const sbsign = async ({
  inputFile,
  outputFile,
  key,
  sbsignSource,
  containerCache,
  apkCache,
  logger,
}: SbsignOptions) => {
  if (!outputFile) {
    outputFile = `${inputFile}.signed`;
  }
  outputFile = await prepareOutputFile(outputFile);
  await prepareApkPackagesAndRun({
    apkPackages: ["sbsigntool"],
    existingSource: sbsignSource,
    command: [
      "sbsign",
      "--key",
      "/in.key",
      "--cert",
      "/in.crt",
      "--output",
      "/out.efi",
      "/in.efi",
    ],
    buildahRunOptions: [
      "-v",
      `${inputFile}:/in.efi:ro`,
      "-v",
      `${await key.certificatePath()}:/in.crt:ro`,
      "-v",
      `${await key.privateKeyPath()}:/in.key:ro`,
      "-v",
      `${outputFile}:/out.efi:rw`,
    ],
    containerCache,
    apkCache,
    logger,
  });
};

// Note that inputFile and outputFile paths in mkvfatfsStep are inside the container,
// certFile and keyFile paths are outside the container
export const sbsignStep = ({
  inputFile: inputFileInContainer,
  outputFile: outputFileInContainer,
  key,
  ...otherOptions
}: SbsignOptions) => {
  if (!outputFileInContainer) {
    outputFileInContainer = `${inputFileInContainer}.signed`;
  }
  const step: AtomicStep = async (container) => {
    const sameInputOutput = inputFileInContainer === outputFileInContainer;
    const usedInputFileInContainer = sameInputOutput
      ? `${inputFileInContainer}.unsigned`
      : inputFileInContainer;
    const inputFile = await container.resolve(usedInputFileInContainer);
    const outputFile = await container.resolve(outputFileInContainer);
    if (sameInputOutput) {
      await copyFile(outputFile, inputFile);
      await truncate(outputFile);
    }
    await sbsign({ inputFile, outputFile, key, ...otherOptions });
    if (sameInputOutput) {
      await rm(inputFile);
    }
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(
      JSON.stringify({
        inputFile: inputFileInContainer,
        outputFile: outputFileInContainer,
      }),
    );
    hash.update(await key.getHash());
    return `SBSIGN-${hash.digest("base64url")}`;
  };
  return step;
};
