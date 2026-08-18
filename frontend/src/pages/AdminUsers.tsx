import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  createUser,
  deleteUser,
  getDevices,
  getUserLogs,
  getUsers,
  suspendUser,
  unblockUser,
  unsuspendUser,
  updateUser,
  uploadUserLogo,
} from "../api/client";
import type {
  AdminUser,
  AuditLogEntry,
  EffectiveStatus,
  TrackingDevice,
  UserPayload,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { statusColor } from "../status";

const emptyForm: UserPayload = {
  username: "",
  password: "",
  fullName: "",
  role: "user",
  deviceIds: [],
};

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <path
        d="M13.5 3.5 16.5 6.5 7 16H4V13L13.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <path
        d="M4.5 6h11M8 6V4.5h4V6M6 6l.6 10a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1L14 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const STEPS = ["Cuenta", "Rol y flota", "Vigencia", "Marca"] as const;

const STATUS_META: Record<EffectiveStatus, { label: string; className: string }> = {
  active: { label: "Activo", className: "badge-active" },
  blocked: { label: "Bloqueado", className: "badge-blocked" },
  suspended: { label: "Suspendido", className: "badge-suspended" },
  scheduled: { label: "Programado", className: "badge-scheduled" },
  expired: { label: "Expirado", className: "badge-expired" },
};

const ACTION_LABELS: Record<string, string> = {
  created: "Usuario creado",
  updated: "Datos actualizados",
  blocked: "Bloqueado",
  unblocked: "Desbloqueado",
  suspended: "Suspendido",
  unsuspended: "Reanudado",
  logo_updated: "Logo actualizado",
};

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [devices, setDevices] = useState<TrackingDevice[]>([]);
  const [form, setForm] = useState<UserPayload>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [fleetQuery, setFleetQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unlimited, setUnlimited] = useState(true);
  const [validFromInput, setValidFromInput] = useState("");
  const [validUntilInput, setValidUntilInput] = useState("");

  const [historyUser, setHistoryUser] = useState<AdminUser | null>(null);
  const [historyLogs, setHistoryLogs] = useState<AuditLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadAll() {
    const [u, d] = await Promise.all([getUsers(), getDevices()]);
    setUsers(u);
    setDevices(d);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err.message));
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setLogoFile(null);
    setFleetQuery("");
    setError(null);
    setStep(0);
    setShowPassword(false);
    setUnlimited(true);
    setValidFromInput("");
    setValidUntilInput("");
    setDrawerOpen(true);
  }

  function startEdit(user: AdminUser) {
    setEditingId(user.id);
    setLogoFile(null);
    setFleetQuery("");
    setError(null);
    setStep(0);
    setShowPassword(false);
    setUnlimited(!user.validFrom && !user.validUntil);
    setValidFromInput(toLocalInputValue(user.validFrom));
    setValidUntilInput(toLocalInputValue(user.validUntil));
    setForm({
      username: user.username,
      password: "",
      fullName: user.fullName ?? "",
      role: user.role,
      deviceIds: user.deviceIds,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  const step0Valid =
    form.username.trim().length > 0 && (Boolean(editingId) || (form.password?.length ?? 0) > 0);

  function goNext() {
    setError(null);
    if (step === 0 && !step0Valid) {
      setError("Completa usuario y contraseña para continuar");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function toggleDevice(id: number) {
    setForm((f) => {
      const current = f.deviceIds ?? [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return { ...f, deviceIds: next };
    });
  }

  const visibleDevices = useMemo(
    () =>
      devices
        .filter((d) => d.name.toLowerCase().includes(fleetQuery.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [devices, fleetQuery]
  );

  const selectedCount = form.deviceIds?.length ?? 0;

  function selectAllVisible() {
    setForm((f) => {
      const ids = new Set(f.deviceIds ?? []);
      visibleDevices.forEach((d) => ids.add(d.id));
      return { ...f, deviceIds: [...ids] };
    });
  }

  function clearAllVisible() {
    setForm((f) => {
      const visibleIds = new Set(visibleDevices.map((d) => d.id));
      return { ...f, deviceIds: (f.deviceIds ?? []).filter((id) => !visibleIds.has(id)) };
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: UserPayload = { ...form };
      if (!payload.password) delete payload.password;

      if (unlimited) {
        payload.clearSchedule = true;
        payload.validFrom = null;
        payload.validUntil = null;
      } else {
        payload.validFrom = validFromInput ? new Date(validFromInput).toISOString() : null;
        payload.validUntil = validUntilInput ? new Date(validUntilInput).toISOString() : null;
      }

      let userId = editingId;
      if (editingId) {
        await updateUser(editingId, payload);
      } else {
        const created = await createUser(payload);
        userId = created.id;
      }

      if (logoFile && userId) {
        await uploadUserLogo(userId, logoFile);
      }

      setDrawerOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el usuario");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setDeleting(false);
    }
  }

  async function runAction(action: (id: number) => Promise<unknown>, id: number) {
    try {
      await action(id);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aplicar la acción");
    }
  }

  async function openHistory(user: AdminUser) {
    setHistoryUser(user);
    setHistoryLoading(true);
    try {
      const logs = await getUserLogs(user.id);
      setHistoryLogs(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el historial");
    } finally {
      setHistoryLoading(false);
    }
  }

  const adminCount = users.filter((u) => u.role === "admin").length;
  const fleetAssignedCount = users.filter((u) => u.role === "user" && u.deviceIds.length > 0)
    .length;
  const totalAssignments = users.reduce((sum, u) => sum + u.deviceIds.length, 0);

  return (
    <div className="admin-screen">
      <main className="admin-main">
        <div className="page-head">
          <div>
            <h1>Usuarios y asignación de flota</h1>
            <p>Crea accesos por cliente o chofer y define exactamente qué vehículos puede ver cada uno.</p>
          </div>
          <button className="btn-primary" onClick={openCreate}>
            + Nuevo usuario
          </button>
        </div>

        <div className="stat-row">
          <div className="stat-card">
            <span className="stat-value">{users.length}</span>
            <span className="stat-label">Usuarios totales</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{adminCount}</span>
            <span className="stat-label">Administradores</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{fleetAssignedCount}</span>
            <span className="stat-label">Con flota asignada</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{totalAssignments}</span>
            <span className="stat-label">Asignaciones activas</span>
          </div>
        </div>

        <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Flota</th>
                  <th>Estado</th>
                  <th>Creado por</th>
                  <th className="col-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const meta = STATUS_META[u.effectiveStatus];
                  return (
                    <tr key={u.id}>
                      <td>
                        {u.logoPath ? (
                          <img src={u.logoPath} alt="" className="row-logo" />
                        ) : (
                          <span className="row-avatar">{u.username.slice(0, 2).toUpperCase()}</span>
                        )}
                      </td>
                      <td>
                        <div className="row-username">{u.username}</div>
                        {u.fullName && <div className="row-fullname">{u.fullName}</div>}
                      </td>
                      <td>
                        <span className={u.role === "admin" ? "badge badge-admin" : "badge badge-user"}>
                          {u.role === "admin" ? "Administrador" : "Usuario"}
                        </span>
                      </td>
                      <td className="fleet-cell">
                        {u.role === "admin"
                          ? "Toda la flota"
                          : `${u.deviceIds.length} vehículo${u.deviceIds.length === 1 ? "" : "s"}`}
                      </td>
                      <td>
                        <span className={`badge ${meta.className}`}>{meta.label}</span>
                        {(u.validFrom || u.validUntil) && (
                          <div className="row-schedule">
                            {u.validFrom ? new Date(u.validFrom).toLocaleDateString() : "—"}
                            {" → "}
                            {u.validUntil ? new Date(u.validUntil).toLocaleDateString() : "sin fin"}
                          </div>
                        )}
                      </td>
                      <td className="row-fullname">{u.createdByUsername ?? "—"}</td>
                      <td className="row-actions">
                        <button className="icon-btn" title="Historial" onClick={() => openHistory(u)}>
                          <ClockIcon />
                        </button>
                        <button className="icon-btn" title="Editar" onClick={() => startEdit(u)}>
                          <EditIcon />
                        </button>
                        {u.id !== me?.id &&
                          (u.status === "active" ? (
                            <button
                              className="text-btn warn"
                              onClick={() => runAction(suspendUser, u.id)}
                            >
                              Suspender
                            </button>
                          ) : (
                            <button
                              className="text-btn"
                              onClick={() =>
                                runAction(
                                  u.status === "blocked" ? unblockUser : unsuspendUser,
                                  u.id
                                )
                              }
                            >
                              Reactivar
                            </button>
                          ))}
                        <button
                          className="icon-btn danger"
                          title="Eliminar"
                          onClick={() => setDeleteTarget(u)}
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-row">
                      Todavía no creaste ningún usuario.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>
      </main>

      {historyUser && (
        <div className="drawer-overlay" onClick={() => setHistoryUser(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <h2>Historial · {historyUser.username}</h2>
              <button
                className="drawer-close"
                onClick={() => setHistoryUser(null)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="drawer-form">
              {historyLoading && <p className="step-intro">Cargando...</p>}
              {!historyLoading && historyLogs.length === 0 && (
                <p className="step-intro">Sin eventos registrados.</p>
              )}
              <ul className="feed-list">
                {historyLogs.map((entry) => (
                  <li key={entry.id}>
                    <span className="feed-dot" />
                    <div>
                      <p className="feed-line">
                        <strong>{ACTION_LABELS[entry.action] ?? entry.action}</strong>
                      </p>
                      <p className="feed-time">
                        {formatDateTime(entry.created_at)} · por {entry.actor_username ?? "sistema"}
                      </p>
                      {entry.details && <p className="feed-details">{entry.details}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">Eliminar usuario</p>
            <p className="confirm-body">
              ¿Seguro que quieres eliminar a <strong>{deleteTarget.username}</strong>? Esta acción
              no se puede deshacer y perderá acceso inmediatamente.
            </p>
            <div className="confirm-actions">
              <button
                className="secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button className="danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {drawerOpen && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <h2>{editingId ? "Editar usuario" : "Nuevo usuario"}</h2>
              <button className="drawer-close" onClick={closeDrawer} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <ol className="stepper">
              {STEPS.map((label, i) => (
                <li
                  key={label}
                  className={i === step ? "step current" : i < step ? "step done" : "step"}
                >
                  <button
                    type="button"
                    className="step-dot"
                    onClick={() => (i < step || (i === 1 && step0Valid) ? setStep(i) : null)}
                  >
                    {i < step ? "✓" : i + 1}
                  </button>
                  <span className="step-label">{label}</span>
                  {i < STEPS.length - 1 && <span className="step-line" />}
                </li>
              ))}
            </ol>

            <form
              className="drawer-form"
              onSubmit={(e) => {
                if (step < STEPS.length - 1) {
                  e.preventDefault();
                  goNext();
                } else {
                  handleSubmit(e);
                }
              }}
            >
              {step === 0 && (
                <div className="form-section first">
                  <p className="step-intro">Credenciales con las que este usuario va a entrar a la plataforma.</p>

                  <label>
                    <span>Usuario</span>
                    <input
                      value={form.username}
                      onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                      disabled={Boolean(editingId)}
                      placeholder="ej. transportista1"
                      autoFocus
                      required
                    />
                  </label>

                  <label>
                    <span>{editingId ? "Nueva contraseña (opcional)" : "Contraseña"}</span>
                    <div className="password-field">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder={editingId ? "Dejar en blanco para no cambiarla" : "Mínimo 6 caracteres"}
                        required={!editingId}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword((s) => !s)}
                      >
                        {showPassword ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </label>

                  <label>
                    <span>Nombre completo <em>(opcional)</em></span>
                    <input
                      value={form.fullName}
                      onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                      placeholder="ej. Transportes del Sur S.A."
                    />
                  </label>
                </div>
              )}

              {step === 1 && (
                <div className="form-section first">
                  <p className="step-intro">Define qué puede ver este usuario al iniciar sesión.</p>

                  <div className="role-picker">
                    <button
                      type="button"
                      className={form.role === "user" ? "role-card active" : "role-card"}
                      onClick={() => setForm((f) => ({ ...f, role: "user" }))}
                    >
                      <span className="role-title">Usuario</span>
                      <span className="role-desc">Ve solo la flota que le asignes abajo</span>
                    </button>
                    <button
                      type="button"
                      className={form.role === "admin" ? "role-card active" : "role-card"}
                      onClick={() => setForm((f) => ({ ...f, role: "admin" }))}
                    >
                      <span className="role-title">Administrador</span>
                      <span className="role-desc">Ve toda la flota y gestiona usuarios</span>
                    </button>
                  </div>

                  {form.role === "user" && (
                    <div className="fleet-block">
                      <div className="fleet-header">
                        <p className="section-label">Vehículos asignados</p>
                        <span className="fleet-count">{selectedCount} seleccionados</span>
                      </div>

                      {selectedCount > 0 && (
                        <div className="fleet-chips">
                          {devices
                            .filter((d) => form.deviceIds?.includes(d.id))
                            .map((d) => (
                              <span key={d.id} className="fleet-chip">
                                {d.name}
                                <button type="button" onClick={() => toggleDevice(d.id)}>
                                  ✕
                                </button>
                              </span>
                            ))}
                        </div>
                      )}

                      <input
                        className="fleet-search"
                        placeholder="Buscar vehículo por nombre..."
                        value={fleetQuery}
                        onChange={(e) => setFleetQuery(e.target.value)}
                      />

                      <div className="fleet-actions">
                        <button type="button" onClick={selectAllVisible}>
                          Seleccionar {fleetQuery ? "resultados" : "todos"}
                        </button>
                        <button type="button" onClick={clearAllVisible}>
                          Quitar {fleetQuery ? "resultados" : "todos"}
                        </button>
                      </div>

                      <div className="fleet-grid">
                        {visibleDevices.map((d) => {
                          const checked = form.deviceIds?.includes(d.id) ?? false;
                          return (
                            <label
                              key={d.id}
                              className={checked ? "fleet-card checked" : "fleet-card"}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDevice(d.id)}
                              />
                              <span
                                className="fleet-card-dot"
                                style={{ background: statusColor(d.online) }}
                              />
                              <span className="fleet-card-name">{d.name}</span>
                              <span className="fleet-card-check" aria-hidden="true">✓</span>
                            </label>
                          );
                        })}
                        {visibleDevices.length === 0 && (
                          <p className="no-devices">Sin vehículos que coincidan</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="form-section first">
                  <p className="step-intro">
                    Define si este usuario tiene acceso indefinido o solo durante un rango de fechas.
                  </p>

                  <div className="role-picker">
                    <button
                      type="button"
                      className={unlimited ? "role-card active" : "role-card"}
                      onClick={() => setUnlimited(true)}
                    >
                      <span className="role-title">Sin límite de tiempo</span>
                      <span className="role-desc">El usuario queda activo hasta que lo bloquees a mano</span>
                    </button>
                    <button
                      type="button"
                      className={!unlimited ? "role-card active" : "role-card"}
                      onClick={() => setUnlimited(false)}
                    >
                      <span className="role-title">Programado</span>
                      <span className="role-desc">Se habilita y/o se desactiva solo, según fechas</span>
                    </button>
                  </div>

                  {!unlimited && (
                    <div className="schedule-fields">
                      <label>
                        <span>Desde <em>(opcional)</em></span>
                        <input
                          type="datetime-local"
                          value={validFromInput}
                          onChange={(e) => setValidFromInput(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Hasta <em>(opcional)</em></span>
                        <input
                          type="datetime-local"
                          value={validUntilInput}
                          onChange={(e) => setValidUntilInput(e.target.value)}
                        />
                      </label>
                      <p className="step-intro">
                        Si dejas "Desde" vacío, queda activo ya mismo. Si dejas "Hasta" vacío, no expira solo.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="form-section first">
                  <p className="step-intro">
                    Si este usuario representa a otra empresa o cliente, puedes mostrarle su propio logo en vez del de DELOSUR.
                  </p>

                  <label className="logo-drop">
                    <span>Logo del usuario <em>(opcional)</em></span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                    />
                    {logoFile && <span className="logo-filename">{logoFile.name}</span>}
                  </label>

                  <div className="review-box">
                    <p className="review-title">Resumen</p>
                    <dl>
                      <dt>Usuario</dt>
                      <dd>{form.username || "—"}</dd>
                      <dt>Rol</dt>
                      <dd>{form.role === "admin" ? "Administrador" : "Usuario"}</dd>
                      {form.role === "user" && (
                        <>
                          <dt>Flota</dt>
                          <dd>{selectedCount} vehículo{selectedCount === 1 ? "" : "s"}</dd>
                        </>
                      )}
                      <dt>Vigencia</dt>
                      <dd>
                        {unlimited
                          ? "Sin límite"
                          : `${validFromInput || "ahora"} → ${validUntilInput || "sin fin"}`}
                      </dd>
                    </dl>
                  </div>
                </div>
              )}

              {error && <p className="admin-error">{error}</p>}

              <div className="form-actions">
                {step > 0 ? (
                  <button type="button" className="secondary" onClick={goBack}>
                    Atrás
                  </button>
                ) : (
                  <button type="button" className="secondary" onClick={closeDrawer}>
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={saving}>
                  {step < STEPS.length - 1
                    ? "Siguiente"
                    : saving
                    ? "Guardando..."
                    : editingId
                    ? "Guardar cambios"
                    : "Crear usuario"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      <style>{`
        .admin-screen { background: var(--bg); }

        .admin-main {
          max-width: 1320px;
          margin: 0 auto;
          padding: 32px 24px 60px;
        }

        .page-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 24px;
        }
        .page-head h1 {
          margin: 0 0 6px;
          font-size: 22px;
          font-weight: 800;
          color: var(--ink);
          letter-spacing: -0.01em;
        }
        .page-head p {
          margin: 0;
          font-size: 13.5px;
          color: var(--muted);
          max-width: 52ch;
        }
        .btn-primary {
          background: var(--navy);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 11px 18px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .btn-primary:hover { background: var(--navy-deep); }

        .stat-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 24px;
        }
        .stat-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          box-shadow: 0 1px 2px rgba(2, 12, 40, 0.04);
        }
        .stat-value {
          font-size: 24px;
          font-weight: 800;
          color: var(--ink);
          font-variant-numeric: tabular-nums;
        }
        .stat-label {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .table-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 10px;
          box-shadow: 0 1px 2px rgba(2, 12, 40, 0.04);
          overflow-x: auto;
        }
        table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--line); }
        thead th {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: var(--muted);
          font-weight: 700;
          background: var(--surface-2);
          white-space: nowrap;
        }
        tbody tr:last-child td { border-bottom: none; }
        tbody tr:hover { background: var(--surface-2); }
        .col-actions { text-align: right; }

        .row-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: var(--navy);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10.5px;
          font-weight: 700;
        }
        .row-logo { width: 30px; height: 30px; object-fit: contain; border-radius: 6px; }
        .row-username { font-weight: 700; color: var(--ink); }
        .row-fullname { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
        .row-schedule { font-size: 10.5px; color: var(--muted); margin-top: 3px; font-family: var(--mono); }
        .fleet-cell { font-variant-numeric: tabular-nums; color: var(--ink-soft); }

        .badge {
          display: inline-flex;
          align-items: center;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .02em;
          white-space: nowrap;
        }
        .badge-admin { background: #E7ECF7; color: var(--navy); }
        .badge-user { background: var(--surface-2); color: var(--ink-soft); border: 1px solid var(--line); }
        .badge-active { background: #E4F5EA; color: #1F9D55; }
        .badge-blocked { background: #FBEAEC; color: var(--danger); }
        .badge-suspended { background: #FFF3DC; color: #B37600; }
        .badge-scheduled { background: #E4F0FA; color: var(--blue); }
        .badge-expired { background: var(--surface-2); color: var(--muted); border: 1px solid var(--line); }

        .row-actions { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
        .icon-btn {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--line);
          background: var(--surface);
          border-radius: 7px;
          color: var(--ink-soft);
          cursor: pointer;
          flex: none;
        }
        .icon-btn:hover { background: var(--surface-2); color: var(--ink); }
        .icon-btn.danger:hover { background: #FBEAEC; color: var(--danger); border-color: var(--danger); }
        .text-btn {
          border: 1px solid var(--line);
          background: var(--surface);
          border-radius: 7px;
          padding: 0 10px;
          font-size: 11.5px;
          font-weight: 700;
          color: var(--ink-soft);
          cursor: pointer;
          white-space: nowrap;
        }
        .text-btn:hover { background: var(--surface-2); }
        .text-btn.warn { color: #B37600; border-color: #F0D9A8; }
        .text-btn.warn:hover { background: #FFF3DC; }
        .empty-row { text-align: center; color: var(--muted); padding: 32px; }

        .feed-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
        .feed-list li { display: flex; gap: 8px; }
        .feed-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--blue); margin-top: 5px; flex: none; }
        .feed-line { margin: 0; font-size: 12.5px; color: var(--ink); line-height: 1.4; }
        .feed-time { margin: 2px 0 0; font-size: 10.5px; color: var(--muted); font-family: var(--mono); }
        .feed-details { margin: 2px 0 0; font-size: 11px; color: var(--ink-soft); }

        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 12, 40, 0.45);
          display: flex;
          justify-content: flex-end;
          z-index: 50;
        }
        .drawer {
          width: min(560px, 100vw);
          height: 100%;
          background: var(--surface);
          box-shadow: -12px 0 32px rgba(2, 12, 40, 0.25);
          display: flex;
          flex-direction: column;
          animation: slide-in .18s ease-out;
        }
        @keyframes slide-in {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .drawer-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 20px;
          border-bottom: 1px solid var(--line);
        }
        .drawer-head h2 { margin: 0; font-size: 16px; color: var(--ink); }
        .drawer-close {
          background: none;
          border: none;
          font-size: 14px;
          color: var(--muted);
          cursor: pointer;
          padding: 4px;
        }
        .drawer-close:hover { color: var(--ink); }

        .stepper {
          display: flex;
          align-items: center;
          list-style: none;
          margin: 0;
          padding: 16px 20px 0;
        }
        .step {
          display: flex;
          align-items: center;
          flex: 1;
          gap: 8px;
        }
        .step:last-child { flex: 0; }
        .step-dot {
          width: 24px;
          height: 24px;
          flex: none;
          border-radius: 50%;
          border: 1.5px solid var(--line);
          background: var(--surface);
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: default;
          padding: 0;
        }
        .step.current .step-dot {
          border-color: var(--navy);
          background: var(--navy);
          color: #fff;
        }
        .step.done .step-dot {
          border-color: var(--blue);
          background: var(--blue);
          color: #fff;
          cursor: pointer;
        }
        .step-label {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--muted);
          white-space: nowrap;
        }
        .step.current .step-label { color: var(--ink); }
        .step-line {
          height: 1.5px;
          flex: 1;
          background: var(--line);
          margin: 0 4px;
        }
        .step.done .step-line { background: var(--blue); }

        .drawer-form {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .step-intro {
          margin: 0;
          font-size: 12.5px;
          color: var(--muted);
          line-height: 1.5;
        }
        .form-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-top: 16px;
          border-top: 1px solid var(--line);
        }
        .form-section.first, .form-section:first-of-type { padding-top: 0; border-top: none; }
        .section-label {
          margin: 0;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--muted);
        }
        .drawer-form label em { font-style: normal; font-weight: 400; color: var(--muted); }

        .password-field { display: flex; gap: 6px; }
        .password-field input { flex: 1; }
        .password-toggle {
          border: 1px solid var(--line);
          background: var(--surface-2);
          border-radius: 8px;
          padding: 0 12px;
          font-size: 11.5px;
          font-weight: 600;
          color: var(--ink-soft);
          cursor: pointer;
          white-space: nowrap;
        }
        .password-toggle:hover { background: var(--sky); }

        .role-picker {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .role-card {
          text-align: left;
          border: 1.5px solid var(--line);
          background: var(--surface);
          border-radius: 10px;
          padding: 14px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .role-card:hover { border-color: var(--blue); }
        .role-card.active { border-color: var(--navy); background: var(--sky); }
        .role-title { font-size: 13px; font-weight: 700; color: var(--ink); }
        .role-desc { font-size: 11.5px; color: var(--muted); line-height: 1.4; }

        .schedule-fields { display: flex; flex-direction: column; gap: 12px; }

        .fleet-block { display: flex; flex-direction: column; gap: 10px; }
        .fleet-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .fleet-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--sky);
          color: var(--navy);
          border-radius: 999px;
          padding: 4px 6px 4px 10px;
          font-size: 11.5px;
          font-weight: 600;
        }
        .fleet-chip button {
          border: none;
          background: rgba(2,28,89,.12);
          color: var(--navy);
          border-radius: 50%;
          width: 16px;
          height: 16px;
          font-size: 9px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .logo-drop {
          border: 1.5px dashed var(--line);
          border-radius: 10px;
          padding: 16px;
          display: flex !important;
          flex-direction: column;
          gap: 8px;
          background: var(--surface-2);
        }
        .logo-filename {
          font-size: 11.5px;
          color: var(--blue);
          font-family: var(--mono);
        }

        .review-box {
          background: var(--surface-2);
          border-radius: 10px;
          padding: 14px 16px;
        }
        .review-title {
          margin: 0 0 8px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: var(--muted);
        }
        .review-box dl {
          margin: 0;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 4px 12px;
          font-size: 12.5px;
        }
        .review-box dt { color: var(--muted); font-weight: 600; }
        .review-box dd { margin: 0; color: var(--ink); font-weight: 600; }
        .drawer-form label {
          display: flex;
          flex-direction: column;
          gap: 5px;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--ink-soft);
        }
        .drawer-form input,
        .drawer-form select {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 9px 10px;
          font-size: 13px;
          background: var(--bg);
          color: var(--ink);
        }
        .drawer-form input:focus,
        .drawer-form select:focus {
          outline: 2px solid var(--blue);
          outline-offset: 1px;
        }

        .fleet-header { display: flex; align-items: baseline; justify-content: space-between; }
        .fleet-count { font-size: 11.5px; font-family: var(--mono); color: var(--blue); font-weight: 700; }
        .fleet-search {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 12.5px;
          background: var(--bg);
          color: var(--ink);
        }
        .fleet-actions { display: flex; gap: 8px; }
        .fleet-actions button {
          flex: 1;
          background: var(--surface-2);
          border: 1px solid var(--line);
          border-radius: 7px;
          padding: 6px 8px;
          font-size: 11.5px;
          font-weight: 600;
          color: var(--ink-soft);
          cursor: pointer;
        }
        .fleet-actions button:hover { background: var(--sky); }

        .fleet-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          max-height: 340px;
          overflow-y: auto;
          padding: 4px 2px 4px 0;
        }
        .fleet-card {
          position: relative;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px 30px 12px 12px;
          border: 1.5px solid var(--line);
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
          cursor: pointer;
          background: var(--surface);
        }
        .fleet-card input { position: absolute; opacity: 0; pointer-events: none; }
        .fleet-card:hover { border-color: var(--blue); background: var(--surface-2); }
        .fleet-card.checked { border-color: var(--navy); background: var(--sky); }
        .fleet-card-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
        .fleet-card-name { flex: 1; line-height: 1.3; }
        .fleet-card-check {
          position: absolute;
          top: 50%;
          right: 10px;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--navy);
          color: #fff;
          font-size: 9px;
          display: none;
          align-items: center;
          justify-content: center;
        }
        .fleet-card.checked .fleet-card-check { display: flex; }
        .no-devices { font-size: 12px; color: var(--muted); margin: 4px; grid-column: 1 / -1; }

        .admin-error { margin: 0; font-size: 12.5px; color: var(--danger); }

        .form-actions {
          display: flex;
          gap: 8px;
          padding-top: 16px;
          margin-top: auto;
          border-top: 1px solid var(--line);
          position: sticky;
          bottom: -20px;
          background: var(--surface);
          padding-bottom: 4px;
        }
        .form-actions button {
          flex: 1;
          background: var(--navy);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 11px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .form-actions button:hover:not(:disabled) { background: var(--navy-deep); }
        .form-actions button.secondary {
          background: transparent;
          color: var(--ink-soft);
          border: 1px solid var(--line);
        }
        .form-actions button.secondary:hover { background: var(--surface-2); }
        .form-actions button:disabled { opacity: .6; cursor: default; }

        @media (max-width: 1020px) {
        }
        @media (max-width: 720px) {
          .stat-row { grid-template-columns: repeat(2, 1fr); }
          .admin-main { padding: 20px 14px 40px; }
          .page-head { flex-direction: column; }
          .btn-primary { width: 100%; }
          .role-picker { grid-template-columns: 1fr; }
          .fleet-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          .stat-row { grid-template-columns: 1fr 1fr; gap: 8px; }
          .stat-card { padding: 12px 14px; }
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 12, 40, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 80;
          padding: 20px;
        }
        .confirm-modal {
          width: 100%;
          max-width: 360px;
          background: var(--surface);
          border-radius: 12px;
          padding: 22px;
          box-shadow: 0 20px 50px rgba(2, 12, 40, 0.35);
          animation: slide-in .15s ease-out;
        }
        .confirm-title {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 800;
          color: var(--ink);
        }
        .confirm-body {
          margin: 0 0 20px;
          font-size: 13px;
          color: var(--ink-soft);
          line-height: 1.55;
        }
        .confirm-actions { display: flex; gap: 8px; }
        .confirm-actions button {
          flex: 1;
          border: none;
          border-radius: 8px;
          padding: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .confirm-actions .secondary {
          background: var(--surface-2);
          color: var(--ink-soft);
          border: 1px solid var(--line);
        }
        .confirm-actions .secondary:hover { background: var(--line); }
        .confirm-actions .danger { background: var(--danger); color: #fff; }
        .confirm-actions .danger:hover { background: #b81b30; }
        .confirm-actions button:disabled { opacity: .6; cursor: default; }
      `}</style>
    </div>
  );
}
