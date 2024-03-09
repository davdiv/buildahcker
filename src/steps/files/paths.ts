import { lstat } from "fs/promises";
import { join, normalize, posix, sep } from "path";

export const normalizeRelativePath = (filePath) => {
  const parts = normalize(filePath).split(sep);
  if (parts[parts.length - 1] === "") {
    parts.pop();
  }
  if (parts[0] === "." || parts[0] === "") {
    parts.shift();
  }
  if (parts.length === 0 || parts[0] === "..") {
    throw new Error(`Unsafe path: ${filePath}`);
  }
  return parts.join(posix.sep);
};
export const normalizeEntry = <T>([filePath, file]: [string, T]): [
  string,
  T,
] => [normalizeRelativePath(filePath), file];

export const safelyJoinSubpath = async (
  rootPath: string,
  subPath: string,
  allowNested: boolean,
) => {
  subPath = normalizeRelativePath(subPath);
  const parts = subPath.split(sep);
  if (!allowNested && parts.length !== 1) {
    throw new Error(`Invalid directory entry: ${subPath}`);
  }
  let res = rootPath;
  for (const part of parts) {
    res = join(res, part);
    try {
      const statRes = await lstat(res);
      if (statRes.isSymbolicLink()) {
        throw new Error(`Unsafe path containing a symbolic link: ${res}`);
      }
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return res;
};
