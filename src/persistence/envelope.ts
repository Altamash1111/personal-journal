import type { AppData } from "../domain/appData";

/** The on-disk shape: schema-versioned wrapper around AppData. */
export interface PersistedEnvelope {
  readonly schemaVersion: number;
  readonly savedAt: string; // ISO instant when written
  readonly data: AppData;
}

/**
 * Result of trying to load raw stored bytes. Never throws away data:
 *  - \"empty\":  nothing stored yet.
 *  - \"loaded\": usable data; `issues` lists any recovered field problems,
 *              `migratedFrom` is the old version if a migration ran.
 *  - \"error\":  could not safely load; `rawBackup` holds the original bytes so
 *              the caller can preserve them before deciding what to do.
 */
export type LoadOutcome =
  | { readonly status: "empty" }
  | {
      readonly status: "loaded";
      readonly data: AppData;
      readonly migratedFrom: number | null;
      readonly issues: readonly string[];
    }
  | {
      readonly status: "error";
      readonly error: string;
      readonly rawBackup: string;
    };
