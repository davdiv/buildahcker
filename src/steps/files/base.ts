import { createHash } from "crypto";
import {
  chmod,
  constants,
  lchown,
  mkdir,
  symlink,
  writeFile,
} from "fs/promises";
import { normalizeEntry, safelyJoinSubpath } from "./paths";

export interface CopyableFile {
  getHash(): Promise<Buffer>;
  writeTo(destinationPath: string): Promise<void>;
}

export type DirectoryContent = Record<string, CopyableFile>;

const naturalSort = <T>(a: T, b: T) => (a < b ? -1 : a > b ? 1 : 0);
const sortKeys = <T extends [string, any]>([a]: T, [b]: T) => naturalSort(a, b);

export const normalizeDirectoryEntries = (
  content: DirectoryContent,
): Map<string, CopyableFile> => {
  return new Map(Object.entries(content).map(normalizeEntry).sort(sortKeys));
};

export const hashDirectoryContent = async (
  content: Map<string, CopyableFile>,
) => {
  const hash = createHash("sha256");
  for (const [filePath, file] of content) {
    const fileHash = await file.getHash();
    hash.update(`${filePath.length},${fileHash.length},`);
    hash.update(filePath);
    hash.update(fileHash);
  }
  return hash.digest();
};

export const writeDirectoryContent = async (
  destinationPath: string,
  content: Map<string, CopyableFile>,
  allowNested: boolean,
) => {
  for (const [filePath, file] of content) {
    const fullPath = await safelyJoinSubpath(
      destinationPath,
      filePath,
      allowNested,
    );
    await file.writeTo(fullPath);
  }
};

export interface FileAttributes {
  mode: number;
  uid: number;
  gid: number;
}
export type SymbolicLinkAttributes = Omit<FileAttributes, "mode">;

const isSymbolicLink = (mode: number) =>
  (mode & constants.S_IFMT) === constants.S_IFLNK;

export abstract class BaseFile implements CopyableFile {
  abstract getAttributes(): Promise<FileAttributes>;
  abstract getContentHash(): Promise<Buffer>;
  abstract writeContentTo(destinationPath: string): Promise<void>;

  async getHash() {
    const hash = createHash("sha256");
    const attributes = await this.getAttributes();
    hash.update(
      `${attributes.mode.toString(8)},${attributes.uid},${attributes.gid}`,
    );
    const contentHash = await this.getContentHash();
    hash.update(contentHash);
    return hash.digest();
  }

  async writeTo(destinationPath: string) {
    await this.writeContentTo(destinationPath);
    const attributes = await this.getAttributes();
    await lchown(destinationPath, attributes.uid, attributes.gid);
    if (!isSymbolicLink(attributes.mode)) {
      await chmod(destinationPath, attributes.mode);
    }
  }
}

export abstract class ProxyFile extends BaseFile {
  #file: BaseFile | undefined;
  protected abstract _getFile(): Promise<BaseFile>;

  async getUnderlyingFile() {
    if (!this.#file) {
      this.#file = await this._getFile();
    }
    return this.#file;
  }

  override async getAttributes() {
    return await (await this.getUnderlyingFile()).getAttributes();
  }

  override async getContentHash() {
    return await (await this.getUnderlyingFile()).getContentHash();
  }

  override async writeContentTo(destinationPath: string) {
    return await (
      await this.getUnderlyingFile()
    ).writeContentTo(destinationPath);
  }
}

export abstract class BaseFileWithLoadedAttributes extends BaseFile {
  protected _modeAllow = 0xffff;
  protected _modeMandatory = 0;
  attributes: FileAttributes;

  constructor(attributes: Partial<FileAttributes>) {
    super();
    this.attributes = {
      uid: 0,
      gid: 0,
      mode: 0o644,
      ...attributes,
    };
  }

  async getAttributes() {
    return {
      ...this.attributes,
      mode: (this.attributes.mode & this._modeAllow) | this._modeMandatory,
    };
  }
}

export abstract class BaseFileWithCachedContent<
  T,
> extends BaseFileWithLoadedAttributes {
  #content: T | undefined;
  #contentHash: Buffer | undefined;

  protected abstract _getContent(): Promise<T>;
  protected abstract _getContentHash(): Promise<Buffer>;

  async getContent() {
    if (!this.#content) {
      this.#content = await this._getContent();
    }
    return this.#content;
  }

  async getContentHash() {
    if (!this.#contentHash) {
      this.#contentHash = await this._getContentHash();
    }
    return this.#contentHash;
  }
}

export abstract class BaseRegularFile extends BaseFileWithCachedContent<Buffer> {
  constructor(attributes: Partial<FileAttributes>) {
    super(attributes);
    this._modeAllow = ~constants.S_IFMT;
    this._modeMandatory = constants.S_IFREG;
  }
  protected async _getContentHash() {
    const hash = createHash("sha256");
    hash.update(await this.getContent());
    return hash.digest();
  }
  async writeContentTo(destinationPath: string) {
    await writeFile(destinationPath, await this.getContent());
  }
}

export abstract class BaseSymbolicLink extends BaseFileWithCachedContent<string> {
  constructor(attributes: Partial<SymbolicLinkAttributes>) {
    super(attributes);
    this._modeAllow = 0;
    this._modeMandatory = constants.S_IFLNK | 0o777;
  }
  protected async _getContentHash() {
    const hash = createHash("sha256");
    hash.update(await this.getContent());
    return hash.digest();
  }
  async writeContentTo(destinationPath: string) {
    await symlink(await this.getContent(), destinationPath);
  }
}

export abstract class BaseDirectory extends BaseFileWithCachedContent<
  Map<string, CopyableFile>
> {
  constructor(attributes: Partial<FileAttributes>) {
    super({ mode: 0o755, ...attributes });
    this._modeAllow = ~constants.S_IFMT;
    this._modeMandatory = constants.S_IFDIR;
  }
  protected abstract _getDirectoryContent(): Promise<DirectoryContent>;
  protected async _getContent() {
    return normalizeDirectoryEntries(await this._getDirectoryContent());
  }
  protected async _getContentHash() {
    return await hashDirectoryContent(await this.getContent());
  }
  async writeContentTo(destinationPath: string) {
    await mkdir(destinationPath);
    await writeDirectoryContent(
      destinationPath,
      await this.getContent(),
      false,
    );
  }
}
