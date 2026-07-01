import React from "react";
import { createRoot } from "react-dom/client";
import { PatientApp } from "../../src/patient/PatientApp";
import "../../src/patient/styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PatientApp />
  </React.StrictMode>,
);
