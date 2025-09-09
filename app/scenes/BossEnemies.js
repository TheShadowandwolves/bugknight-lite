// scenes/BossEnemies.js
import Phaser from "phaser";

/**
 * Boss registry per level.
 * - If you have art, put it under /public/sprites/bosses/ and set sheetUrl/frame sizes.
 * - If you don't, we auto-generate a procedural texture so you can play right away.
 */
const LEVELS = {
  1: {
    order: ["sentinel", "mantis", "warden"], // 1st, 2nd, 3rd boss gates for level 1
    bosses: {
      sentinel: {
        key: "boss_sentinel",
        // spritesheet is optional; fallback is procedural
        sheetUrl: "/sprites/bosses/sentinel.png", // (optional) 64x64 per frame
        frameWidth: 64, frameHeight: 64,
        hp: 30, speed: 60, ai: "sentinel",
        anims: { idle: { key: "sentinel_idle", start: 0, end: 3, rate: 6 } }
      },
      mantis: {
        key: "boss_mantis",
        sheetUrl: "/sprites/bosses/mantis.png",
        frameWidth: 64, frameHeight: 64,
        hp: 24, speed: 220, ai: "mantis",
        anims: { idle: { key: "mantis_idle", start: 0, end: 5, rate: 10 } }
      },
      warden: {
        key: "boss_warden",
        sheetUrl: "/sprites/bosses/warden.png",
        frameWidth: 72, frameHeight: 72,
        hp: 40, speed: 90, ai: "warden",
        anims: { idle: { key: "warden_idle", start: 0, end: 3, rate: 6 } }
      }
    }
  }
};

// ---------- helpers ----------
function ensureProceduralTexture(scene, key, w = 64, h = 64, tint = 0x7a5cff) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  g.fillStyle((tint & 0xffffff), 1).fillRoundedRect(0, 0, w, h, 10)
   .lineStyle(2, 0xffffff, 0.7).strokeRoundedRect(0, 0, w, h, 10)
   .fillStyle(0x000000, 0.8).fillCircle(w * 0.33, h * 0.45, 5)
   .fillCircle(w * 0.66, h * 0.45, 5);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Load all art for a level (if a spritesheet is missing, we’ll draw a fallback box). */
function preload(scene, levelId = 1) {
  const L = LEVELS[levelId];
  if (!L) return;
  for (const b of Object.values(L.bosses)) {
    if (b.sheetUrl && !scene.textures.exists(b.key)) {
      scene.load.spritesheet(b.key, b.sheetUrl, {
        frameWidth: b.frameWidth, frameHeight: b.frameHeight
      });
    }
  }
}

/** Create animations that exist in the registry and are not created yet. */
function createAnims(scene, levelId = 1) {
  const L = LEVELS[levelId];
  if (!L) return;
  for (const b of Object.values(L.bosses)) {
    // if we didn’t load a sheet, make a box so the key exists
    ensureProceduralTexture(scene, b.key, b.frameWidth || 64, b.frameHeight || 64);

    const idle = b.anims?.idle;
    if (idle && !scene.anims.exists(idle.key) && scene.textures.exists(b.key)) {
      const total = scene.textures.get(b.key).frameTotal || (idle.end + 1);
      const end = Math.min(idle.end, total - 1);
      scene.anims.create({
        key: idle.key,
        frames: scene.anims.generateFrameNumbers(b.key, { start: idle.start, end }),
        frameRate: idle.rate, repeat: -1
      });
    }
  }
}

/** Choose a boss based on the ordinal of the gate (0,1,2…) */
function pickBossForGate(levelId = 1, ordinal = 0) {
  const L = LEVELS[levelId]; if (!L) return null;
  const list = L.order?.length ? L.order : Object.keys(L.bosses);
  return list[ordinal % list.length];
}

/** Spawn a boss and attach its AI. */
function spawn(scene, levelId, bossKey, x, y) {
  const L = LEVELS[levelId];
  const cfg = L?.bosses?.[bossKey];
  if (!cfg) throw new Error(`Unknown boss ${bossKey} for level ${levelId}`);

  // ensure texture
  ensureProceduralTexture(scene, cfg.key, cfg.frameWidth || 64, cfg.frameHeight || 64);

  const boss = scene.physics.add.sprite(x, y, cfg.key).setCollideWorldBounds(true);
  boss.setDataEnabled();
  boss.setData("hp", cfg.hp);
  boss.setData("maxHP", cfg.hp);
  boss.setData("ai", cfg.ai);
  boss.setData("speed", cfg.speed);
  // body size (a bit tighter than frame)
  const bw = Math.floor((cfg.frameWidth || boss.width) * 0.85);
  const bh = Math.floor((cfg.frameHeight || boss.height) * 0.85);
  boss.body.setSize(bw, bh, true);

  // idle anim if available
  const idleKey = cfg.anims?.idle?.key;
  if (idleKey && scene.anims.exists(idleKey)) boss.play(idleKey);

  // Basic physics defaults
  boss.setBounce(0);
  scene.physics.add.collider(boss, scene.mapSolids);

  // Attach AI tick (dt in ms)
  boss.updateAI = (sceneRef, dt) => {
    const player = sceneRef.player;
    const ai = cfg.ai;
    if (!player || !boss.active) return;

    if (ai === "sentinel") {
      // drift + random charge (your previous behavior)
      boss._cd = Math.max(0, (boss._cd || 0) - dt);
      if (!boss._state) boss._state = "idle";
      if (boss._state === "idle") {
        const dir = Math.sign(player.x - boss.x) || 1;
        boss.setVelocityX(dir * cfg.speed);
        boss.flipX = dir < 0;
        if (boss._cd === 0 && Phaser.Math.Between(0, 1000) < 8) {
          boss._state = "telegraph"; boss.setVelocityX(0); boss.setTint(0x7a5cff);
          sceneRef.time.delayedCall(350, () => {
            boss.clearTint(); boss._state = "charge";
            const sp = (sceneRef.difficulty === "hard") ? 520 : (sceneRef.difficulty === "normal") ? 440 : 380;
            const d2 = Math.sign(player.x - boss.x) || 1;
            boss.setVelocityX(d2 * sp); boss._cd = 900;
            sceneRef.time.delayedCall(300, () => { if (boss.active) { boss.setVelocityX(d2 * 80); boss._state = "idle"; }});
          });
        }
      }
    } else if (ai === "mantis") {
      // hop towards player, then brief slashing pause
      boss._cd = Math.max(0, (boss._cd || 0) - dt);
      if (!boss._state) boss._state = "idle";
      if (boss._state === "idle") {
        const dir = Math.sign(player.x - boss.x) || 1;
        boss.flipX = dir < 0;
        if (boss.body.blocked.down && boss._cd === 0) {
          boss._state = "hop";
          boss.setVelocity(dir * (cfg.speed + 100), -420);
        }
      } else if (boss._state === "hop") {
        if (boss.body.blocked.down) {
          boss._state = "slash";
          boss.setVelocityX(0); boss.setTintFill(0xffe082);
          sceneRef.time.delayedCall(220, () => { boss.clearTint(); boss._state = "idle"; boss._cd = 500; });
        }
      }
    } else if (ai === "warden") {
      // slow approach; when close, heavy dash (ground slam variant)
      boss._cd = Math.max(0, (boss._cd || 0) - dt);
      const dist = Math.abs(player.x - boss.x);
      const dir = Math.sign(player.x - boss.x) || 1;
      boss.flipX = dir < 0;

      if (boss._cd === 0 && dist < 200) {
        boss._cd = 800;
        boss.setTint(0xb0c4ff);
        sceneRef.time.delayedCall(250, () => {
          boss.clearTint();
          boss.setVelocityX(dir * (sceneRef.difficulty === "hard" ? 640 : 520));
          sceneRef.time.delayedCall(200, () => boss.setVelocityX(dir * 90));
        });
      } else {
        boss.setVelocityX(dir * cfg.speed);
      }
    }
  };

  return boss;
}

export const BossEnemies = {
  preload, createAnims, spawn, pickBossForGate,
  LEVELS
};
export default BossEnemies;
