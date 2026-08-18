import { divIcon } from "leaflet";
import { Marker, Popup } from "react-leaflet";
import type { TrackingDevice } from "../api/client";
import { statusColor, statusLabel } from "../status";

const BASE_SIZE = 36;
const BOX = 52; // caja fija del marker (no cambia con la selección, así el
// deslizamiento GPS del marker no interfiere con el "crecer" al seleccionar)

function truckIconHtml(color: string, course: number, selected: boolean): string {
  const scale = selected ? 1.28 : 1;
  return `
    <div style="width:${BOX}px;height:${BOX}px;display:flex;align-items:center;justify-content:center;">
      <div style="
        width:${BASE_SIZE}px;
        height:${BASE_SIZE}px;
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius:50%;
        background:${color};
        border:3px solid #fff;
        box-shadow:0 0 0 1px rgba(2,28,89,.35), 0 4px 10px rgba(0,0,0,.4)${
          selected ? ", 0 0 0 5px rgba(2,28,89,.25)" : ""
        };
        transform: scale(${scale});
        transition: transform .22s ease, box-shadow .22s ease;
      ">
        <svg width="${BASE_SIZE * 0.62}" height="${BASE_SIZE * 0.62}" viewBox="0 0 24 24"
          style="transform: rotate(${course || 0}deg); transition: transform 2s ease;">
          <g fill="#ffffff">
            <rect x="8" y="13" width="8" ry="1.4" rx="1.4" height="9" />
            <path d="M8 5.5 C8 4.7 8.7 4 9.5 4 H14.5 C15.3 4 16 4.7 16 5.5 V13 H8 Z" />
            <rect x="9.6" y="6" width="4.8" height="3.4" rx="0.6" fill="${color}" opacity="0.85" />
          </g>
          <g fill="#021c59">
            <circle cx="8" cy="9" r="1.5" />
            <circle cx="16" cy="9" r="1.5" />
            <circle cx="8" cy="20" r="1.5" />
            <circle cx="16" cy="20" r="1.5" />
          </g>
        </svg>
      </div>
    </div>`;
}

export default function VehicleMarker({
  device,
  selected,
  onSelect,
}: {
  device: TrackingDevice;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  const color = statusColor(device.online);

  const icon = divIcon({
    className: "",
    html: truckIconHtml(color, device.course, selected),
    iconSize: [BOX, BOX],
    iconAnchor: [BOX / 2, BOX / 2],
  });

  return (
    <Marker
      position={[device.lat, device.lng]}
      icon={icon}
      eventHandlers={{ click: () => onSelect(device.id) }}
    >
      <Popup>
        <strong>{device.name}</strong>
        <br />
        Estado: {statusLabel(device.online)}
        <br />
        Velocidad: {device.speed} km/h
        <br />
        {device.address || "Sin dirección"}
      </Popup>
    </Marker>
  );
}
