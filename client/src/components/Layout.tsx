import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

/**
 * Layout — App shell with sidebar + content area.
 *
 * All authenticated pages are rendered inside this layout via
 * React Router's <Outlet />.
 */
export default function Layout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
