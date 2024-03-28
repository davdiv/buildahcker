import type { ExecOptions } from "./exec";
import { exec } from "./exec";

export const buildahInspect = async (
  object: string,
  type?: "container" | "image" | "manifest",
  options?: ExecOptions,
) => {
  const result = await exec(
    ["buildah", "inspect", ...(type ? ["--type", type] : []), "--", object],
    options,
  );
  return JSON.parse(result.stdout.toString("utf8"));
};

export const getFullImageID = async (
  imageRef: string,
  options?: ExecOptions,
) => {
  const result = await exec(
    [
      "buildah",
      "inspect",
      "--format",
      "{{.FromImageID}}",
      "--type",
      "image",
      "--",
      imageRef,
    ],
    options,
  );
  return result.stdout.toString("utf8").trim();
};
