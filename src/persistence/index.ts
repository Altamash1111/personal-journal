export type { StorageAdapter } from "./adapter";
export { MemoryStorageAdapter, LocalStorageAdapter } from "./adapter";
export type { PersistedEnvelope, LoadOutcome } from "./envelope";
export type { Migration } from "./migrations";
export { MIGRATIONS, runMigrations } from "./migrations";
export {
  validateEnvelopeShape,
  validateAndCoerce,
} from "./validation";
export {
  buildEnvelope,
  exportJson,
  loadFromRaw,
  importJson,
} from "./serialization";
export type { StoreDeps } from "./store";
export { Store } from "./store";
