export type UserStatus = "active" | "blocked" | "suspended";
export type EffectiveStatus = UserStatus | "scheduled" | "expired";

export function computeEffectiveStatus(
  status: UserStatus,
  validFrom: Date | null,
  validUntil: Date | null,
  now: Date = new Date()
): EffectiveStatus {
  if (status !== "active") return status;
  if (validFrom && now < validFrom) return "scheduled";
  if (validUntil && now > validUntil) return "expired";
  return "active";
}

export function canLogin(
  status: UserStatus,
  validFrom: Date | null,
  validUntil: Date | null,
  now: Date = new Date()
): boolean {
  return computeEffectiveStatus(status, validFrom, validUntil, now) === "active";
}
