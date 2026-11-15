import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PhoneNotice } from "./ui/phone/PhoneNotice";
import "./index.css";
import "./ui/set/set.css";
import "./ui/set/screens.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <App />
    <PhoneNotice />
  </StrictMode>,
);
