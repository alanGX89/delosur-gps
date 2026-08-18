export type NormalizedStatus = "moving" | "engine" | "stopped" | "offline" | "blocked";

// Las 3 fuentes de tracking combinadas usan vocabularios distintos para el
// mismo concepto ("moving" vs "online", "stopped" vs "ack"), así que todo
// pasa primero por acá antes de decidir color/etiqueta/conteos.
export function normalizeStatus(online: string): NormalizedStatus {
  switch (online) {
    case "moving":
    case "online":
      return "moving";
    case "engine":
      return "engine";
    case "stopped":
    case "ack":
      return "stopped";
    case "blocked":
      return "blocked";
    default:
      return "offline";
  }
}

export function statusColor(online: string): string {
  switch (normalizeStatus(online)) {
    case "moving":
      return "#1f9d55";
    case "engine":
      return "#d9a300";
    case "stopped":
      return "#7c89a8";
    case "blocked":
      return "#021c59";
    default:
      return "#e1233a";
  }
}

export function statusLabel(online: string): string {
  switch (normalizeStatus(online)) {
    case "moving":
      return "En movimiento";
    case "engine":
      return "Motor encendido";
    case "stopped":
      return "Detenido";
    case "blocked":
      return "Bloqueado";
    default:
      return "Desconectado";
  }
}
