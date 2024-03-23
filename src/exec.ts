import { SpawnOptionsWithoutStdio, spawn } from "child_process";
import { Writable } from "stream";

export class WritableBuffer extends Writable {
  #chunks: Buffer[] = [];
  promise: Promise<Buffer>;

  constructor() {
    super();
    this.promise = new Promise((resolve) => {
      this._final = resolve;
    }).then(() => {
      const result = Buffer.concat(this.#chunks);
      this.#chunks = [];
      return result;
    });
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void,
  ): void {
    this.#chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
    );
    callback();
  }
}

export class CommandFailed extends Error {
  constructor(
    public command: string[],
    public exitCode: number,
    public stdout: Buffer,
    public stderr: Buffer,
  ) {
    super(
      `Command failed: ${command.join(" ")}\n${
        stdout?.toString("utf8") ?? ""
      }\n${stderr?.toString("utf8") ?? ""}`,
    );
  }
}

export interface ExecOptions {
  logger?: Writable;
}

export const exec = async (
  command: string[],
  { logger }: ExecOptions = {},
  spawnOptions: Omit<SpawnOptionsWithoutStdio, "stdio"> = {},
) => {
  const proc = spawn(command[0], command.slice(1), {
    ...spawnOptions,
    stdio: "pipe",
  });
  logger?.write(`[${proc.pid}]$ ${command.join(" ")}\n`);
  if (logger) {
    proc.stdout.pipe(logger, { end: false });
    proc.stderr.pipe(logger, { end: false });
  }
  const bufferStdout = new WritableBuffer();
  proc.stdout.pipe(bufferStdout);
  const bufferStdErr = new WritableBuffer();
  proc.stderr.pipe(bufferStdErr);
  await new Promise((resolve) => proc.on("exit", resolve));
  logger?.write(`[${proc.pid}] Exit code: ${proc.exitCode}\n`);
  const stdout = await bufferStdout.promise;
  const stderr = await bufferStdErr.promise;
  if (proc.exitCode !== 0) {
    throw new CommandFailed(command, proc.exitCode!, stdout, stderr);
  }
  return { stdout, stderr };
};
