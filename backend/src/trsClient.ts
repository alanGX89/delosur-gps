import axios from "axios";
import type { TrackingDevice } from "./trackingClient";

// Fuente TRS Rastreo (trsrastreo.com.bo): API con login propio que devuelve los
// vehículos del usuario con su última posición. Se adapta al mismo formato que
// las fuentes GPSWox para que el resto del sistema no cambie.

interface TrsVehiculo {
  vehiculo: { id: number; veh_alias: string; veh_placa: string; veh_activo: boolean };
  estado_relacion: boolean;
  device: {
    d_modem: string;
    d_latitude: number;
    d_longitude: number;
    d_altitude: number;
    d_speed: number;
    d_timestamp: number;
    d_data: string;
    address: string;
  } | null;
}

// IDs sintéticos: las fuentes GPSWox usan índice * 1.000.000 + id (0..2.999.999).
const ID_BASE = 9_000_000;
// Sin reporte en este tiempo, el vehículo se muestra "sin conexión".
const OFFLINE_MS = 60 * 60 * 1000;
// Por debajo de esta velocidad (km/h) se considera detenido (deriva del GPS).
const MIN_MOVING_KMH = 3;

let token: string | null = null;
let userId: number | null = null;

function apiUrl(): string {
  return (process.env.TRS_API_URL || "https://trsrastreo.com.bo/api-sort/v1").replace(/\/$/, "");
}

async function login(): Promise<void> {
  const { data } = await axios.post(
    `${apiUrl()}/login/`,
    { username: process.env.TRS_USER, password: process.env.TRS_PASSWORD },
    { timeout: 15000 }
  );
  token = data.access_token;
  userId = data.data?.id;
}

async function getVehiculos(): Promise<TrsVehiculo[]> {
  if (!token) await login();
  try {
    const { data } = await axios.get(`${apiUrl()}/usuarios/${userId}/`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    return data.data?.vehiculos_relacionados ?? [];
  } catch (err) {
    // Token vencido: se vuelve a iniciar sesión una vez.
    if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
      token = null;
      await login();
      return getVehiculos();
    }
    throw err;
  }
}

// El poller espera "DD-MM-YYYY HH:mm:ss" en UTC. Se parte de d_timestamp (epoch real):
// d_date_satellite viene en hora de Bolivia aunque diga "+00:00".
function formatTime(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function toTrackingDevice(v: TrsVehiculo): TrackingDevice | null {
  const d = v.device;
  if (!d || !v.estado_relacion || !v.vehiculo.veh_activo) return null;

  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(d.d_data || "{}");
  } catch {
    // d_data mal formado: se usan solo los campos principales.
  }
  const ignition = extra["engine.ignition.status"] === true;
  const speed = Math.round(d.d_speed || 0);
  const stale = Date.now() - d.d_timestamp * 1000 > OFFLINE_MS;
  const online = stale ? "offline" : speed >= MIN_MOVING_KMH ? "moving" : ignition ? "engine" : "stopped";

  return {
    id: ID_BASE + v.vehiculo.id,
    name: v.vehiculo.veh_alias || v.vehiculo.veh_placa,
    online,
    time: formatTime(d.d_timestamp),
    timestamp: d.d_timestamp,
    lat: d.d_latitude,
    lng: d.d_longitude,
    course: Number(extra["position.direction"]) || 0,
    speed,
    altitude: d.d_altitude,
    icon_color: "",
    power: "",
    address: d.address || "",
    driver: "",
    sensors: [],
    tail: [],
    stop_duration: "",
    engine_status: ignition,
    total_distance: 0,
    unit_of_distance: "km",
    device_data: { plate_number: v.vehiculo.veh_placa, imei: d.d_modem },
  };
}

export async function fetchTrsDevices(): Promise<TrackingDevice[]> {
  if (!process.env.TRS_USER || !process.env.TRS_PASSWORD) return [];
  try {
    const vehiculos = await getVehiculos();
    return vehiculos.map(toTrackingDevice).filter((d): d is TrackingDevice => d !== null);
  } catch (err) {
    console.error("Error consultando fuente de tracking TRS:", (err as Error).message);
    return [];
  }
}
