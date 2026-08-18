import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import defaultLogo from "../assets/LOGO_DELOSUR.png";
import { useAuth } from "../context/AuthContext";

const COLLAPSE_KEY = "delosur_sidebar_collapsed";

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 18s6-5.2 6-9.6A6 6 0 0 0 4 8.4C4 12.8 10 18 10 18Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="8.2" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="7.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 16c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14.5" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.8 11.3c2.2.4 3.7 2.2 3.7 4.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path
        d="M8 3H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3M13 14l4-4-4-4M17 10H7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      style={{ transform: collapsed ? "rotate(180deg)" : "none" }}
    >
      <path d="M12.5 4 7 10l5.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: JSX.Element;
  adminOnly: boolean;
  children?: { to: string; label: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Mapa en vivo", icon: <MapIcon />, adminOnly: false },
  {
    to: "/admin",
    label: "Usuarios",
    icon: <UsersIcon />,
    adminOnly: true,
    children: [
      { to: "/admin", label: "Lista de usuarios" },
      { to: "/admin/actividad", label: "Actividad" },
    ],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === "admin");
  // En el drawer mobile (open) siempre se ve expandido, sin importar la
  // preferencia de colapso guardada para desktop.
  const effectiveCollapsed = collapsed && !open;

  const activeItem = navItems.find((item) =>
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)
  );
  const subItems = effectiveCollapsed ? undefined : activeItem?.children;

  return (
    <div className="app-layout">
      <header className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <MenuIcon />
        </button>
        <img src={user?.logoPath || defaultLogo} alt="Logo" className="mobile-logo" />
      </header>

      {open && <div className="nav-overlay" onClick={() => setOpen(false)} />}

      <aside className={open ? "app-sidebar open" : effectiveCollapsed ? "app-sidebar collapsed" : "app-sidebar"}>
        <div className="sidebar-top">
          {!effectiveCollapsed && (
            <img src={user?.logoPath || defaultLogo} alt="Logo" className="sidebar-logo" />
          )}
          <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Cerrar menú">
            ✕
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
              onClick={() => setOpen(false)}
              title={effectiveCollapsed ? item.label : undefined}
            >
              {item.icon}
              {!effectiveCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <button
          className="collapse-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir menú" : "Ocultar menú"}
          title={collapsed ? "Expandir menú" : "Ocultar menú"}
        >
          <CollapseIcon collapsed={effectiveCollapsed} />
          {!effectiveCollapsed && <span>Ocultar menú</span>}
        </button>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <span className="sidebar-avatar">{user?.username.slice(0, 2).toUpperCase()}</span>
            {!effectiveCollapsed && (
              <div className="sidebar-user-text">
                <p className="sidebar-username">{user?.username}</p>
                <p className="sidebar-role">{user?.role === "admin" ? "Administrador" : "Usuario"}</p>
              </div>
            )}
          </div>
          <button
            className="sidebar-logout"
            onClick={logout}
            title={effectiveCollapsed ? "Cerrar sesión" : undefined}
          >
            <LogoutIcon />
            {!effectiveCollapsed && "Cerrar sesión"}
          </button>
        </div>
      </aside>

      {subItems && subItems.length > 0 && (
        <aside className="sub-sidebar">
          <p className="sub-sidebar-title">{activeItem?.label}</p>
          <nav className="sub-sidebar-nav">
            {subItems.map((sub) => (
              <NavLink
                key={sub.to}
                to={sub.to}
                end
                className={({ isActive }) => (isActive ? "sub-nav-item active" : "sub-nav-item")}
              >
                {sub.label}
              </NavLink>
            ))}
          </nav>
        </aside>
      )}

      <main className="app-content">{children}</main>

      <style>{`
        .app-layout {
          display: flex;
          height: 100vh;
          background: var(--bg);
        }

        .mobile-topbar {
          display: none;
          align-items: center;
          gap: 12px;
          height: 48px;
          padding: 0 12px;
          background: var(--surface);
          border-bottom: 1px solid var(--line);
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 45;
        }
        .mobile-menu-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 6px;
          color: var(--ink-soft);
          cursor: pointer;
        }
        .mobile-logo { height: 22px; }

        .nav-overlay {
          display: none;
        }

        .app-sidebar {
          width: 216px;
          flex: none;
          background: var(--surface);
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          padding: 18px 14px;
          transition: width .18s ease;
        }
        .app-sidebar.collapsed {
          width: 64px;
          padding: 18px 10px;
          align-items: center;
        }
        .sidebar-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          padding: 0 4px;
          width: 100%;
        }
        .app-sidebar.collapsed .sidebar-top { justify-content: center; margin-bottom: 18px; }
        .sidebar-logo { height: 30px; max-width: 160px; object-fit: contain; }
        .sidebar-close { display: none; }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          width: 100%;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          color: var(--ink-soft);
          text-decoration: none;
          font-size: 13.5px;
          font-weight: 600;
          white-space: nowrap;
        }
        .app-sidebar.collapsed .nav-item { justify-content: center; padding: 10px; }
        .nav-item:hover { background: var(--surface-2); color: var(--ink); }
        .nav-item.active { background: var(--sky); color: var(--navy); }

        .collapse-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: var(--muted);
          font-size: 12px;
          font-weight: 600;
          padding: 8px 12px;
          margin: 6px 0;
          border-radius: 8px;
          cursor: pointer;
          width: 100%;
        }
        .app-sidebar.collapsed .collapse-toggle { justify-content: center; padding: 8px; }
        .collapse-toggle:hover { background: var(--surface-2); color: var(--ink); }

        .sidebar-bottom {
          border-top: 1px solid var(--line);
          padding-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }
        .sidebar-user { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
        .app-sidebar.collapsed .sidebar-user { justify-content: center; padding: 0; }
        .sidebar-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--navy);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          flex: none;
        }
        .sidebar-user-text { min-width: 0; }
        .sidebar-username {
          margin: 0;
          font-size: 12.5px;
          font-weight: 700;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sidebar-role { margin: 1px 0 0; font-size: 11px; color: var(--muted); }
        .sidebar-logout {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--ink-soft);
          border-radius: 7px;
          padding: 8px 10px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .app-sidebar.collapsed .sidebar-logout { justify-content: center; padding: 8px; }
        .sidebar-logout:hover { background: var(--surface-2); color: var(--danger); border-color: var(--danger); }

        .sub-sidebar {
          width: 176px;
          flex: none;
          background: var(--surface-2);
          border-right: 1px solid var(--line);
          padding: 20px 14px;
        }
        .sub-sidebar-title {
          margin: 0 0 12px;
          padding: 0 8px;
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--muted);
        }
        .sub-sidebar-nav { display: flex; flex-direction: column; gap: 2px; }
        .sub-nav-item {
          padding: 8px 10px;
          border-radius: 7px;
          color: var(--ink-soft);
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
        }
        .sub-nav-item:hover { background: var(--surface); color: var(--ink); }
        .sub-nav-item.active { background: var(--surface); color: var(--navy); box-shadow: inset 2px 0 0 var(--navy); }

        .app-content {
          flex: 1;
          min-width: 0;
          height: 100vh;
          overflow-y: auto;
        }

        @media (max-width: 860px) {
          .mobile-topbar { display: flex; }
          .app-layout { padding-top: 48px; flex-wrap: wrap; }
          .app-content { height: calc(100vh - 48px); }

          .sub-sidebar {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid var(--line);
            padding: 10px 14px;
          }
          .sub-sidebar-nav { flex-direction: row; flex-wrap: wrap; gap: 6px; }
          .sub-sidebar-title { display: none; }

          .app-sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 78vw;
            max-width: 300px;
            padding: 18px 14px;
            align-items: stretch;
            z-index: 70;
            transform: translateX(-100%);
            transition: transform .25s ease;
            box-shadow: 10px 0 30px rgba(2,12,40,.3);
          }
          .app-sidebar.open { transform: translateX(0); }
          .collapse-toggle { display: none; }
          .sidebar-close {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            background: var(--surface-2);
            border: 1px solid var(--line);
            border-radius: 6px;
            color: var(--ink-soft);
            cursor: pointer;
          }
          .nav-overlay {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(2,12,40,.45);
            z-index: 65;
          }
        }
      `}</style>
    </div>
  );
}
