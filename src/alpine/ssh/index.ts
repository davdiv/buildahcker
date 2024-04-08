import { mkdir, stat } from "fs/promises";
import { join } from "path";
import type { Writable } from "stream";
import type { ImageOrContainer } from "../../container";
import { withImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareApkPackages } from "../prepareApkPackages";

export type SSHKeyType =
  | "dsa"
  | "ecdsa"
  | "ecdsa-sk"
  | "ed25519"
  | "ed25519-sk"
  | "rsa";

export const defaultSSHKeyGenTypes: SSHKeyType[] = ["ed25519"];

export interface SSHKeyGenConfig {
  outputFolder: string;
  types?: SSHKeyType[];
  opensshSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const sshKeygen = async ({
  outputFolder,
  opensshSource,
  types = defaultSSHKeyGenTypes,
  containerCache,
  apkCache,
  logger,
}: SSHKeyGenConfig) => {
  await mkdir(outputFolder, { recursive: true });
  let hasMissingTypes = false;
  const keyTypesInfo = await Promise.all(
    types.map(async (type) => {
      const keyFile = `ssh_host_${type}_key`;
      let alreadyPresent = false;
      try {
        const [pubKeyFileStat, privKeyFileStat] = await Promise.all([
          stat(join(outputFolder, `${keyFile}.pub`)),
          stat(join(outputFolder, keyFile)),
        ]);
        if (!pubKeyFileStat.isFile() || !privKeyFileStat.isFile()) {
          throw new Error(
            `${keyFile}.pub or ${keyFile} exists in ${outputFolder} and is not a regular file.`,
          );
        }
        alreadyPresent = true;
      } catch (error: any) {
        if (error.code != "ENOENT") {
          throw error;
        }
        hasMissingTypes = true;
      }
      return { alreadyPresent, keyFile, type };
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
};
