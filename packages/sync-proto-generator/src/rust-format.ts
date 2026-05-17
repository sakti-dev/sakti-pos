import { spawnSync } from "node:child_process";

export function formatGeneratedRust(source: string): string {
  const proc = spawnSync("rustfmt", ["--edition", "2021"], {
    input: source,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    throw new Error(proc.stderr.toString());
  }
  return proc.stdout.toString();
}
