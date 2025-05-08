import { createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import type { AtomicStep } from "../../container";
import type { VerityMetadata } from "./veritysetup";

export interface VeritytabVolume {
  name: string;
  metadataFile: string;
  device?: string;
  options?: string[];
}

export interface VeritytabOptions {
  replace?: boolean;
  volumes: VeritytabVolume[];
}

export const veritytab = (options: VeritytabOptions) => {
  const step: AtomicStep = async (container) => {
    const verityTabFile = await container.resolve("/etc/veritytab");
    const verityTabFileContent: string[] = [];
    for (const volume of options.volumes) {
      const metadata: VerityMetadata = JSON.parse(
        await readFile(await container.resolve(volume.metadataFile), "utf8"),
      );
      const device =
        volume.device ??
        (metadata.uuid ? `/dev/disk/by-uuid/${metadata.uuid}` : null);
      if (!device) {
        throw new Error(`No device specified for ${volume.name}`);
      }
      const options = [
        `hash-offset=${metadata.hashOffset}`,
        `fec-device=${device}`,
        `fec-offset=${metadata.fecOffset}`,
        ...(volume.options ?? []),
      ];
      verityTabFileContent.push(
        `${volume.name} ${device} ${device} ${metadata.rootHash} ${options.join(",")}`,
      );
    }
    await writeFile(verityTabFile, verityTabFileContent.join("\n") + "\n", {
      mode: 0o644,
      flag: options.replace ? "w" : "a",
    });
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(options));
    return `VERITYTAB-${hash.digest("base64url")}`;
  };
  return step;
};
