import { readlink } from "fs/promises";
import { basename, dirname, isAbsolute, join, normalize, sep } from "path";

export const resolveParentInContainer = async (
  containerPath: string,
  subPath: string,
  strictDotDot = false,
) => {
  const lastItem = basename(subPath);
  if (lastItem === "." || lastItem === ".." || lastItem === "") {
    throw new Error(`Invalid path: ${subPath}`);
  }
  return join(
    await resolveInContainer(containerPath, dirname(subPath), strictDotDot),
    lastItem,
  );
};

export const resolveInContainer = async (
  containerPath: string,
  subPath: string,
  strictDotDot = false,
) => {
  const linksFollowed = new Set<string>();
  const parts = normalize(subPath).split(sep);
  for (let i = 0; i < parts.length; i++) {
    const curPart = parts[i];
    if (
      !curPart ||
      curPart === "." ||
      (i < 1 && curPart === ".." && !strictDotDot)
    ) {
      parts.splice(i, 1);
      i--;
      continue;
    } else if (curPart === "..") {
      if (i < 1) {
        throw new Error(`Invalid path: ${subPath}`);
      }
      parts.splice(i - 1, 2);
      i -= 2;
      continue;
    }
    const curFullPath = join(containerPath, ...parts.slice(0, i + 1));
    if (linksFollowed.has(curFullPath)) {
      throw new Error(`Recursive link in path: ${curFullPath}`);
    }
    linksFollowed.add(curFullPath);
    try {
      const linkTarget = await readlink(curFullPath, "utf8");
      const linkTargetParts = normalize(linkTarget).split(sep);
      if (isAbsolute(linkTarget)) {
        parts.splice(0, i + 1, ...linkTargetParts);
        i = -1;
      } else {
        parts.splice(i, 1, ...linkTargetParts);
        i--;
      }
    } catch {}
  }
  return join(containerPath, ...parts);
};
