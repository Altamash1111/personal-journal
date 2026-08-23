/**
 * Minimal ambient type shim for Node’s built-in test runner + assert.
 *
 * WHY THIS EXISTS: this environment has no @types/node installed. At runtime the
 * real `node:test` / `node:assert/strict` modules are used (via tsx). This shim
 * only exists so `tsc --noEmit` can typecheck the *.test.ts files strictly.
 * It intentionally declares only the surface this project uses.
 *
 * On a normal machine with @types/node installed you can delete this file.
 */
declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
}
declare module "node:assert/strict" {
  interface AssertStrict {
    (value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    throws(fn: () => unknown, message?: string | RegExp): void;
  }
  const assert: AssertStrict;
  export default assert;
}
