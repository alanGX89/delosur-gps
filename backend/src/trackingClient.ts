import axios from "axios";
import { fetchTrsDevices } from "./trsClient";

export interface TrackingSensor {
  id: number;
  type: string;
  name: string;
  value: string;
  val: string | boolean | null;
}

export interface TrackingDevice {
  id: number;
  name: string;
  online: string;
  time: string;
  timestamp: number;
  lat: number;
  lng: number;
  course: number;
  speed: number;
  altitude: number;
  icon_color: string;
  power: string;
  address: string;
  driver: string;
  sensors: TrackingSensor[];
  tail: { lat: string; lng: string }[];
  stop_duration: string;
  engine_status: boolean;
  total_distance: number;
  unit_of_distance: string;
  device_data?: {
    plate_number?: string;
    imei?: string;
  };
}

interface TrackingGroup {
  id: number;
  title: string;
  items: TrackingDevice[];
}

function getSourceUrls(): string[] {
  const raw = process.env.TRACKING_API_URLS || process.env.TRACKING_API_URL || "";
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

async function fetchSource(url: string, sourceIndex: number): Promise<TrackingDevice[]> {
  try {
    const { data } = await axios.get<TrackingGroup[]>(url, { timeout: 15000 });
    const items = data.flatMap((group) => group.items ?? []);

    // Cada fuente puede reutilizar los mismos IDs numéricos (son cuentas/dominios
    // distintos), así que generamos un ID sintético único combinando fuente + ID original.
    return items.map((d) => ({ ...d, id: sourceIndex * 1_000_000 + d.id }));
  } catch (err) {
    console.error(`Error consultando fuente de tracking #${sourceIndex}:`, (err as Error).message);
    return [];
  }
}

export async function fetchDevices(): Promise<TrackingDevice[]> {
  const urls = getSourceUrls();
  const results = await Promise.all([...urls.map((url, i) => fetchSource(url, i)), fetchTrsDevices()]);
  const all = results.flat();

  // La plataforma oficial deduplica por nombre de vehículo (la misma unidad
  // puede aparecer en más de una cuenta).
  const seen = new Set<string>();
  const unique: TrackingDevice[] = [];
  for (const device of all) {
    if (seen.has(device.name)) continue;
    seen.add(device.name);
    unique.push(device);
  }

  return unique;
}
