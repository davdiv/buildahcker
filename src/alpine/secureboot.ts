import { randomUUID } from "crypto";
import { lstat } from "fs/promises";
import { join } from "path";
import { type Writable } from "stream";
import { type ImageOrContainer } from "../container";
import type { ContainerCache } from "../containerCache";
import { readOrCreateStringFile } from "../fileUtils";
import { certToEfiSigList, signEfiSigList } from "./efitools";
import { type CertificateOptions, mkcert } from "./openssl";
import { SignKey } from "./sbsign";
import { DiskLocation } from "../steps";

export type SecureBootKeys = "PK" | "KEK" | "db";

export interface SecureBootOptions {
  outputDirectory: string;
  defaultCertOptions?: CertificateOptions;
  certOptions?: Record<SecureBootKeys, CertificateOptions>;
  guid?: string;
  opensslSource?: ImageOrContainer;
  efitoolsSource?: string;
  logger: Writable;
  apkCache: string;
  containerCache: ContainerCache;
}

const fileExists = async (file: string) => {
  try {
    const stat = await lstat(file);
    if (stat.isFile()) {
      return true;
    } else {
      throw new Error(`Expected a regular file in ${file}`);
    }
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return false;
    }
    throw e;
  }
};

export const secureBoot = async ({
  outputDirectory,
  defaultCertOptions = { subject: "/CN=Secure boot key/", validDays: 36500 },
  certOptions,
  guid = randomUUID(),
  opensslSource,
  efitoolsSource,
  logger,
  apkCache,
  containerCache,
}: SecureBootOptions) => {
  let lastKeyFile = "PK";

  guid = await readOrCreateStringFile(
    join(outputDirectory, "guid"),
    () => guid,
  );

  let createdNewFile = false;
  for (const fileName of ["PK", "KEK", "db"]) {
    const certificateFile = join(outputDirectory, `${fileName}.crt`);
    const keyFile = join(outputDirectory, `${fileName}.key`);
    const eslFile = join(outputDirectory, `${fileName}.esl`);
    const authFile = join(outputDirectory, `${fileName}.auth`);
    const certificateFileExists = await fileExists(certificateFile);
    const keyFileExists = await fileExists(keyFile);
    if (!certificateFileExists !== !keyFileExists) {
      throw new Error(
        `${certificateFile} and ${keyFile} must both exist or both not exist.`,
      );
    }
    if (!certificateFileExists && !keyFileExists) {
      await mkcert({
        certificateFile,
        keyFile,
        options: certOptions?.[fileName] ?? defaultCertOptions,
        opensslSource,
        containerCache,
        apkCache,
        logger,
      });
      createdNewFile = true;
    } else if (createdNewFile) {
      throw new Error(
        `${certificateFile} and ${keyFile} already exist. Please remove the existing files and try again.`,
      );
    }
    if (!(await fileExists(eslFile))) {
      await certToEfiSigList({
        inputFile: certificateFile,
        outputFile: eslFile,
        guid,
        efitoolsSource,
        containerCache,
        apkCache,
        logger,
      });
      createdNewFile = true;
    } else if (createdNewFile) {
      throw new Error(
        `${eslFile} already exists. Please remove the existing file and try again.`,
      );
    }
    if (!(await fileExists(authFile))) {
      await signEfiSigList({
        keyFile: join(outputDirectory, `${lastKeyFile}.key`),
        certificateFile: join(outputDirectory, `${lastKeyFile}.crt`),
        inputFile: eslFile,
        outputFile: authFile,
        efiVar: fileName,
        guid,
        efitoolsSource,
        containerCache,
        apkCache,
        logger,
      });
      createdNewFile = true;
    } else if (createdNewFile) {
      throw new Error(
        `${authFile} already exists. Please remove the existing file and try again.`,
      );
    }
    lastKeyFile = fileName;
  }

  return {
    key: SignKey.from(
      join(outputDirectory, `db.crt`),
      join(outputDirectory, `db.key`),
    ),
    authFiles: {
      "PK.auth": new DiskLocation(join(outputDirectory, `PK.auth`)),
      "KEK.auth": new DiskLocation(join(outputDirectory, `KEK.auth`)),
      "db.auth": new DiskLocation(join(outputDirectory, `db.auth`)),
    },
  };
};
