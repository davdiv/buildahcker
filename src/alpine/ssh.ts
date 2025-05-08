import { mkdir, stat } from "fs/promises";
import { join } from "path";
import type { Writable } from "stream";
import type { ImageOrContainer } from "../container";
import { withImageOrContainer } from "../container";
import type { ContainerCache } from "../containerCache";
import { DiskFile } from "../steps";
import { prepareApkPackages } from "./prepareApkPackages";

export type SSHKeyType =
  | "dsa"
  | "ecdsa"
  | "ecdsa-sk"
  | "ed25519"
  | "ed25519-sk"
  | "rsa";

export const defaultSSHKeyGenTypes: SSHKeyType[] = ["ed25519"];

export interface SSHKeyGenConfig<
  T extends SSHKeyType,
  P extends string,
  S extends string,
> {
  outputFolder: string;
  types?: T[];
  prefix?: P;
  suffix?: S;
  opensshSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const sshKeygen = async <
  T extends SSHKeyType = "ed25519",
  P extends string = "ssh_host_",
  S extends string = "_key",
>({
  outputFolder,
  opensshSource,
  types = defaultSSHKeyGenTypes as any as T[],
  prefix = "ssh_host_" as any as P,
  suffix = "_key" as any as S,
  containerCache,
  apkCache,
  logger,
}: SSHKeyGenConfig<T, P, S>): Promise<
  Record<`${P}${T}${S}.pub` | `${P}${T}${S}`, DiskFile>
> => {
  const files: Record<`${P}${T}${S}.pub` | `${P}${T}${S}`, DiskFile> =
    {} as any;
  await mkdir(outputFolder, { recursive: true });
  let hasMissingTypes = false;
  const keyTypesInfo = await Promise.all(
    types.map(async (type) => {
      const privKeyFileName: `${P}${T}${S}` = `${prefix}${type}${suffix}`;
      const pubKeyFileName = `${privKeyFileName}.pub`;
      let alreadyPresent = false;
      const pubKeyFilePath = join(outputFolder, pubKeyFileName);
      const privKeyFilePath = join(outputFolder, privKeyFileName);
      files[privKeyFileName] = new DiskFile(privKeyFilePath, { mode: 0o600 });
      files[pubKeyFileName] = new DiskFile(pubKeyFilePath, { mode: 0o600 });
      try {
        const [pubKeyFileStat, privKeyFileStat] = await Promise.all([
          stat(pubKeyFilePath),
          stat(privKeyFilePath),
        ]);
        if (!pubKeyFileStat.isFile() || !privKeyFileStat.isFile()) {
          throw new Error(
            `${privKeyFileName}.pub or ${privKeyFileName} exists in ${outputFolder} and is not a regular file.`,
          );
        }
        alreadyPresent = true;
      } catch (error: any) {
        if (error.code != "ENOENT") {
          throw error;
        }
        hasMissingTypes = true;
      }
      return { alreadyPresent, keyFile: privKeyFileName, type };
    }),
  );
  if (hasMissingTypes) {
    await withImageOrContainer(
      opensshSource ??
        (await prepareApkPackages({
          apkPackages: ["openssh"],
          containerCache,
          apkCache,
          logger,
        })),
      async (container) => {
        const tempFolder = await container.tempFolder();
        try {
          for (const { alreadyPresent, type, keyFile } of keyTypesInfo) {
            if (!alreadyPresent) {
              await container.run(
                ["ssh-keygen", "-t", type, "-f", keyFile, "-N", ""],
                [
                  "-v",
                  `${outputFolder}:${tempFolder.pathInContainer}`,
                  "--workingdir",
                  tempFolder.pathInContainer,
                ],
              );
            }
          }
        } finally {
          await tempFolder.remove();
        }
      },
      { logger },
    );
  }
  return files;
};
