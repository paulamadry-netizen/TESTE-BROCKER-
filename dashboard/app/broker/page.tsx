"use client";

import { useEffect } from "react";

export default function BrokerRedirect() {
  useEffect(() => {
    // Redirect to broker.html in public folder
    window.location.href = "/broker.html";
  }, []);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0e1a 0%, #0f1419 100%)",
      color: "#e8edf4"
    }}>
      <p>Redirecting to broker...</p>
    </div>
  );
}
