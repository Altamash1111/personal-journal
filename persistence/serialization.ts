import type { AppData } from "../domain/appData";
import type { Clock } from "../core/clock";
import type { PersistedEnvelope, LoadOutcome } from "./envelope";
import { CURRENT_SCHEMA_VERSION } from "../config";
import { validateEnvelopeShape, validateAndCoerce } from "./validation";
import { runMigrations } from "./migrations";

const isObject = (u: unknown): u is Record<string, unknown> =>
  typeof u === "object" && u !== null && !Array.isArray(u);

export const buildEnvelope = (
  data: AppData,
  clock: Clock,
): PersistedEnvelope => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  savedAt: clock.now().toISOString(),
  data,
});

/** Serialize to pretty JSON for storage / file export. */
export const exportJson = (data: AppData, clock: Clock): string =>
  JSON.stringify(buildEnvelope(data, clock), null, 2);

/**
 * The single load pipeline used by both Store.load and importJson:
 *   parse -> detect version (legacy blob => v0) -> refuse-if-newer -> migrate ->
 *   structurally validate/coerce -> outcome.
 * Never throws and never discards: on any hard failure it returns an \"error\"
 * outcome carrying the original bytes as rawBackup.
 */
export const loadFromRaw = (raw: string): LoadOutcome => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "error", error: "invalid JSON", rawBackup: raw };
  }

  let version: number;
  let dataBlob: unknown;
  if (isObject(parsed) && typeof parsed["schemaVersion"] === "number") {
    const shape = validateEnvelopeShape(parsed);
    if (!shape.ok) {
      return { status: "error", error: shape.error, rawBackup: raw };
    }
    version = shape.value.schemaVersion;
    dataBlob = shape.value.data;
  } else if (isObject(parsed)) {
    version = 0; // unversioned legacy blob
    dataBlob = parsed;
  } else {
    return { status: "error", error: "root is not an object", rawBackup: raw };
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      status: "error",
      error: `data schema v${version} is newer than supported v${CURRENT_SCHEMA_VERSION}`,
      rawBackup: raw,
    };
  }

  const migrated = runMigrations(dataBlob, version, CURRENT_SCHEMA_VERSION);
  if (!migrated.ok) {
    return { status: "error", error: migrated.error, rawBackup: raw };
  }

  const { data, issues } = validateAndCoerce(migrated.value);
  return {
    status: "loaded",
    data,
    migratedFrom: version < CURRENT_SCHEMA_VERSION ? version : null,
    issues,
  };
};

/** Import from a user-provided JSON string (same pipeline as load). */
export const importJson = (raw: string): LoadOutcome => loadFromRaw(raw);
