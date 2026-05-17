import { describe, expect, test } from "vitest";
import { formatGeneratedRust } from "../rust-format";

describe("Rust formatting helper", () => {
  test("formats generated Rust before writing", () => {
    const formatted = formatGeneratedRust(
      'fn main(){println!("x");}\n'
    );
    expect(formatted).toContain("fn main() {");
  });
});
