import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DJ420_STATE_PATH = path.join(DATA_DIR, "dj420-host.json");

export const DJ420_HOST_NAME = "DJ420" as const;
export const DJ420_HEARTBEAT_STALE_MS = 90_000;

export type Dj420HostState = {
  hostName: typeof DJ420_HOST_NAME;
  role: "station_host";
  type: "internal_host";
  status: "online" | "offline";
  lastHeartbeatAt: string;
  bootedAt: string;
  tickCount: number;
};

export async function getDj420State(): Promise<Dj420HostState | null> {
  try {
    return JSON.parse(await fs.readFile(DJ420_STATE_PATH, "utf8")) as Dj420HostState;
  } catch {
    return null;
  }
}

export async function saveDj420State(state: Dj420HostState) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DJ420_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export function resolveDj420Status(state: Dj420HostState | null): "online" | "offline" {
  if (!state?.lastHeartbeatAt) return "offline";
  const age = Date.now() - new Date(state.lastHeartbeatAt).getTime();
  return age <= DJ420_HEARTBEAT_STALE_MS ? "online" : "offline";
}