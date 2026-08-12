import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  GitBranch,
  ShieldAlert,
  LogOut,
  Settings,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/debts", icon: Receipt, label: "Debts" },
  { to: "/settlement", icon: GitBranch, label: "Settlement" },
  { to: "/risk", icon: ShieldAlert, label: "Risk Analysis" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

/**
 * Sidebar — Navigation sidebar with brand header and user footer.
 */
export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("creditflow_token");
    navigate("/login");
  };

  return (
    <nav className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">C</div>
        <div className="sidebar-brand-text">
          <h1>CreditFlow</h1>
          <p>Debt Settlement Engine</p>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `sidebar-link${isActive ? " active" : ""}`
            }
          >
            <item.icon className="sidebar-icon" size={20} />
            {item.label}
          </NavLink>
        ))}

        <div style={{ flex: 1 }} />

        <button
          className="sidebar-link"
          onClick={handleLogout}
          style={{ border: "none", background: "none", width: "100%", textAlign: "left" }}
        >
          <LogOut className="sidebar-icon" size={20} />
          Logout
        </button>
      </div>

      {/* User Footer */}
      <div className="sidebar-footer">
        <div 
          className="sidebar-user sidebar-user-link" 
          onClick={() => navigate("/profile")}
        >
          <div className="sidebar-avatar">PG</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">Parth Goggi</div>
            <div className="sidebar-user-role">Software Developer</div>
            <div className="sidebar-user-view">View Profile</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
