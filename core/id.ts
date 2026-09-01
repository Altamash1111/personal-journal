/** Injectable id generator. Defaults to Web Crypto (works in Node 20+ and browsers),
 *  but tests can pass a deterministic counter. */
export interface IdFactory {
  (): string;
}

export const uuidFactory: IdFactory = () => crypto.randomUUID();

/** Deterministic sequential ids for tests: seq(\"g\") -> \"g-1\", \"g-2\", ... */
export const sequentialFactory = (prefix = "id"): IdFactory => {
  let n = 0;
  return () => `${prefix}-${++n}`;
};
