// app/page.jsx
"use client";
import dynamic from "next/dynamic";

// Avoid SSR for Phaser-based component
const PhaserGame = dynamic(() => import("./components/PhaserGame"), { ssr: false });

export default function Page() {
  return (
    <main style={{ height: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ width: 960, maxWidth: "95vw" }}>
        <h1 style={{ margin: "8px 0", fontWeight: 700 }}>Bugknight Lite — Prototype</h1>
        <p style={{ margin: "4px 0 12px", opacity: .85 }}>Arrows/WASD to move & jump. Z to attack. X to dash. Double-jump unlocked.</p>
        <PhaserGame />
      </div>
    </main>
  );
}