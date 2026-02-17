import type { Writable } from "stream";
import type { ImageOrContainer } from "../container";
import type { ContainerCache } from "../containerCache";
import { prepareOutputFile } from "../fileUtils";
import { prepareApkPackagesAndRun } from "./prepareApkPackages";

export interface CertToEfiSigListOptions {
  inputFile: string;
  outputFile: string;
  efitoolsSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
  guid?: string;
}

export const certToEfiSigList = async ({
  inputFile,
  outputFile,
  efitoolsSource: existingSource,
  containerCache,
  apkCache,
  logger,
  guid,
}: CertToEfiSigListOptions) => {
  outputFile = await prepareOutputFile(outputFile);

  const command = ["cert-to-efi-sig-list"];

  if (guid) {
    command.push("-g", guid);
  }

  command.push("/input.pem", "/output.esl");

  await prepareApkPackagesAndRun({
    apkPackages: ["efitools"],
    existingSource,
    command,
    buildahRunOptions: [
      "-v",
      `${inputFile}:/input.pem:ro`,
      "-v",
      `${outputFile}:/output.esl:rw`,
    ],
    containerCache,
    apkCache,
    logger,
  });
};

export interface SignEfiSigListOptions {
  keyFile: string;
  certificateFile: string;
  inputFile: string;
  outputFile: string;
  efiVar: string;
  efitoolsSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
  guid?: string;
}

export const signEfiSigList = async ({
  keyFile,
  certificateFile,
  inputFile,
  outputFile,
  efiVar,
  efitoolsSource: existingSource,
  containerCache,
  apkCache,
  logger,
  guid,
}: SignEfiSigListOptions) => {
  outputFile = await prepareOutputFile(outputFile);

  const command = ["sign-efi-sig-list"];

  if (guid) {
    command.push("-g", guid);
  }

  command.push(
    "-c",
    "/cert.pem",
    "-k",
    "/key.key",
    efiVar,
    "/input.esl",
    "/output.auth",
  );

  await prepareApkPackagesAndRun({
    apkPackages: ["efitools"],
    existingSource,
    command,
    buildahRunOptions: [
      "-v",
      `${keyFile}:/key.key:ro`,
      "-v",
      `${certificateFile}:/cert.pem:ro`,
      "-v",
      `${outputFile}:/output.auth:rw`,
      "-v",
      `${inputFile}:/input.esl:ro`,
    ],
    containerCache,
    apkCache,
    logger,
  });
};
