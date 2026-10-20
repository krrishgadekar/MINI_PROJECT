import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Apply persisted theme before first paint to avoid FOUC
const storedTheme = (localStorage.getItem("creditflow_theme") as "dark" | "light") || "dark";
document.documentElement.setAttribute("data-theme", storedTheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
