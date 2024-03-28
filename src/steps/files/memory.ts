import type {
  DirectoryContent,
  FileAttributes,
  SymbolicLinkAttributes,
} from "./base";
import { BaseDirectory, BaseRegularFile, BaseSymbolicLink } from "./base";

export class MemDirectory extends BaseDirectory {
  public content: DirectoryContent;
  constructor({
    content,
    ...attributes
  }: { content: DirectoryContent } & Partial<FileAttributes>) {
    super(attributes);
    this.content = content;
  }

  protected async _getDirectoryContent() {
    return this.content;
  }
}

export class MemFile extends BaseRegularFile {
  public content: Buffer | string;
  constructor({
    content,
    ...attributes
  }: { content: Buffer | string } & Partial<FileAttributes>) {
    super(attributes);
    this.content = content;
  }

  protected override async _getContent(): Promise<Buffer> {
    const content = this.content;
    return Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  }
}

export class MemSymLink extends BaseSymbolicLink {
  public content: string;
  constructor({
    content,
    ...attributes
  }: { content: string } & Partial<SymbolicLinkAttributes>) {
    super(attributes);
    this.content = content;
  }

  protected override async _getContent(): Promise<string> {
    return this.content;
  }
}
