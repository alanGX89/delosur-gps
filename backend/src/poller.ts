import cron from "node-cron";
import { pool } from "./db/pool";
import { fetchDevices, TrackingDevice } from "./trackingClient";

function parseDeviceTime(device: TrackingDevice): Date | null {
  // API returns "14-08-2026 19:09:31" (DD-MM-YYYY HH:mm:ss)
  const [datePart, timePart] = (device.time || "").split(" ");
  const [day, month, year] = (datePart || "").split("-").map(Number);
  if (!day || !month || !year || !timePart) return null;
  const date = new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${timePart}Z`
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

// Distancia entre dos coordenadas en metros (fórmula de Haversine).
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Simplificación por distancia + tiempo: solo se guarda un punto nuevo si el
// vehículo se movió una distancia mínima, o si pasó demasiado tiempo desde el
// último punto guardado (para no dejar "huecos" eternos en un vehículo
// parado). Evita escribir una fila idéntica cada 30s para el ~80% de la
// flota que está detenida u offline en un momento dado.
const MIN_DISTANCE_METERS = 30;
const MAX_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

interface LastStored {
  lat: number;
  lng: number;
  at: number; // epoch ms
}

const lastStoredByDevice = new Map<number, LastStored>();

function shouldStore(deviceId: number, lat: number, lng: number, recordedAtMs: number): boolean {
  const last = lastStoredByDevice.get(deviceId);
  if (!last) return true;

  const elapsed = recordedAtMs - last.at;
  if (elapsed >= MAX_INTERVAL_MS) return true;

  const moved = distanceMeters(last.lat, last.lng, lat, lng);
  return moved >= MIN_DISTANCE_METERS;
}

async function pollOnce(): Promise<void> {
  const devices = await fetchDevices();

  for (const device of devices) {
    try {
      const recordedAt = parseDeviceTime(device);
      if (!recordedAt) continue;

      await pool.query(
        `INSERT INTO devices (id, name, plate_number, imei, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name,
               plate_number = EXCLUDED.plate_number,
               imei = EXCLUDED.imei,
               updated_at = now()`,
        [
          device.id,
          device.name,
          device.device_data?.plate_number || null,
          device.device_data?.imei || null,
        ]
      );

      if (!shouldStore(device.id, device.lat, device.lng, recordedAt.getTime())) {
        continue;
      }

      await pool.query(
        `INSERT INTO device_positions (device_id, lat, lng, speed, course, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (device_id, recorded_at) DO NOTHING`,
        [device.id, device.lat, device.lng, device.speed, device.course, recordedAt]
      );

      lastStoredByDevice.set(device.id, {
        lat: device.lat,
        lng: device.lng,
        at: recordedAt.getTime(),
      });
    } catch (err) {
      console.error(`Error guardando posición del dispositivo ${device.id}:`, (err as Error).message);
    }
  }
}

export function startPoller(): void {
  const seconds = Number(process.env.POLL_INTERVAL_SECONDS || 30);

  pollOnce().catch((err) => console.error("Error en el primer sondeo:", err.message));

  cron.schedule(`*/${seconds} * * * * *`, () => {
    pollOnce().catch((err) => console.error("Error en el sondeo:", err.message));
  });

  console.log(`Poller de historial activo cada ${seconds}s.`);
}
