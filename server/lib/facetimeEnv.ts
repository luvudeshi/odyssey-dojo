// The six settings the FaceTime call needs, read from the environment by name. Values are never logged or sent to
// the page; when one is missing the routes say which name, never anything else.

export const FACETIME_ENV = ["CHERT_API_KEY", "CHERT_PROJECT_ID", "CHERT_LINE_ID", "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;
export type FaceTimeEnvName = (typeof FACETIME_ENV)[number];

export interface FaceTimeConfig {
  readonly chertKey: string;
  readonly chertProject: string;
  readonly chertLine: string;
  readonly livekitUrl: string;
  readonly livekitKey: string;
  readonly livekitSecret: string;
}

export type FaceTimeSetup =
  | { readonly ready: true; readonly config: FaceTimeConfig }
  | { readonly ready: false; readonly missing: readonly FaceTimeEnvName[] };

export const NOT_SET_UP = "FaceTime is not set up on this server.";

export function readFaceTimeEnv(env: Readonly<Record<string, string | undefined>>): FaceTimeSetup {
  const value = (name: FaceTimeEnvName): string => env[name]?.trim() ?? "";
  const missing = FACETIME_ENV.filter((name) => value(name) === "");
  if (missing.length > 0) return { ready: false, missing };
  return {
    ready: true,
    config: {
      chertKey: value("CHERT_API_KEY"),
      chertProject: value("CHERT_PROJECT_ID"),
      chertLine: value("CHERT_LINE_ID"),
      livekitUrl: value("LIVEKIT_URL"),
      livekitKey: value("LIVEKIT_API_KEY"),
      livekitSecret: value("LIVEKIT_API_SECRET"),
    },
  };
}
