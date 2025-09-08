// components/PhaserGame.jsx
"use client";
import { useEffect, useRef } from "react";

export default function PhaserGame() {
  const containerRef = useRef(null);

  useEffect(() => {
    let game;
    let destroyed = false;

    (async () => {
    // Load Phaser and your scenes **on the client only**
    const Phaser = await import("phaser");
    const { default: MenuScene } = await import("../scenes/MenuScene");
    const { default: MainScene } = await import("../scenes/MainScene");
    const { default: PauseMenuScene } = await import("../scenes/PauseMenuScene"); 
    const { default: BossLevelScene } = await import("../scenes/BossLevelScene"); 
      const config = {
        type: Phaser.AUTO,
        width: 960,
        height: 540,
        parent: containerRef.current,
        backgroundColor: "#0b0d12",
        physics: {
          default: "arcade",
          arcade: { gravity: { y: 1200 }, debug: false },
        },
        pixelArt: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, expandParent: false },
        scene: [MenuScene, MainScene, PauseMenuScene, BossLevelScene],   // Menu first → boots into menu
      };

      if (!destroyed && containerRef.current) game = new Phaser.Game(config);
    })();

    return () => { destroyed = true; if (game) game.destroy(true); };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        aspectRatio: "16/9",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 12px 30px rgba(0,0,0,.35)",
      }}
    />
  );
}
