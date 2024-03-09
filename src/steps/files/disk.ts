import { lstat, readFile, readdir, readlink } from "fs/promises";
import { join } from "path";
import {
  BaseDirectory,
  BaseFile,
  BaseRegularFile,
  BaseSymbolicLink,
  DirectoryContent,
  FileAttributes,
  ProxyFile,
  SymbolicLinkAttributes,
} from "./base";

export interface DiskLocationOptions {
  overrideAttributes?: Partial<FileAttributes>;
}

export class DiskLocation extends ProxyFile {
  constructor(
    public readonly sourceFilePath: string,
    public options?: DiskLocationOptions,
  ) {
    super();
  }

  protected override async _getFile(): Promise<BaseFile> {
    const sourceFilePath = this.sourceFilePath;
    const statRes = await lstat(sourceFilePath);
    const statAttributes: FileAttributes = {
      uid: statRes.uid,
      gid: statRes.gid,
      mode: statRes.mode,
      ...this.options?.overrideAttributes,
    };
    if (statRes.isDirectory()) {
      return new DiskDirectory(sourceFilePath, statAttributes, this.options);
    } else if (statRes.isFile()) {
      return new DiskFile(sourceFilePath, statAttributes);
    } else if (statRes.isSymbolicLink()) {
      return new DiskSymLink(sourceFilePath, statAttributes);
    }
    throw new Error(`Unsupported file type ${statRes.mode.toString(8)}`);
  }
}

export class DiskDirectory extends BaseDirectory {
  constructor(
    public readonly sourceFilePath,
    attributes: FileAttributes,
    public options?: DiskLocationOptions,
  ) {
    super(attributes);
    this.sourceFilePath = sourceFilePath;
  }
  protected override async _getDirectoryContent(): Promise<DirectoryContent> {
    const sourceFilePath = this.sourceFilePath;
    const res: DirectoryContent = {};
    const entries = await readdir(sourceFilePath);
    for (const entry of entries) {
      res[entry] = new DiskLocation(join(sourceFilePath, entry), this.options);
    }
    return res;
  }
}

export class DiskFile extends BaseRegularFile {
  constructor(
    public readonly sourceFilePath: string,
    attributes: Partial<FileAttributes>,
  ) {
    super(attributes);
    this.sourceFilePath = sourceFilePath;
  }
  protected override async _getContent(): Promise<Buffer> {
    return await readFile(this.sourceFilePath);
  }
}

export class DiskSymLink extends BaseSymbolicLink {
  constructor(
    public readonly sourceFilePath: string,
    attributes: Partial<SymbolicLinkAttributes>,
  ) {
    super(attributes);
    this.sourceFilePath = sourceFilePath;
  }
  protected override async _getContent(): Promise<string> {
    return await readlink(this.sourceFilePath);
  }
}
