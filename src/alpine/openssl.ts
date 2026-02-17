import type { Writable } from "stream";
import type { ImageOrContainer } from "../container";
import type { ContainerCache } from "../containerCache";
import { prepareOutputFile } from "../fileUtils";
import { prepareApkPackagesAndRun } from "./prepareApkPackages";

export interface CertificateOptions {
  subject: string;
  validDays: number;
}

export interface MkcertOptions {
  certificateFile: string;
  keyFile: string;
  keyType?: string;
  options: CertificateOptions;
  opensslSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const mkcert = async ({
  certificateFile,
  keyFile,
  keyType = "rsa:4096",
  options: { subject, validDays },
  opensslSource: existingSource,
  containerCache,
  apkCache,
  logger,
}: MkcertOptions) => {
  certificateFile = await prepareOutputFile(certificateFile);
  keyFile = await prepareOutputFile(keyFile);

  const command = [
    "openssl",
    "req",
    "-newkey",
    keyType,
    "-nodes",
    "-keyout",
    "/key.key",
    "-new",
    "-x509",
    "-out",
    "/cert.pem",
    "-days",
    validDays.toString(),
    "-subj",
    subject,
  ];

  await prepareApkPackagesAndRun({
    apkPackages: ["openssl"],
    existingSource,
    command,
    buildahRunOptions: [
      "-v",
      `${certificateFile}:/cert.pem:rw`,
      "-v",
      `${keyFile}:/key.key:rw`,
    ],
    containerCache,
    apkCache,
    logger,
  });
};
