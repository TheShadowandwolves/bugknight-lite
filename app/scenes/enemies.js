// scenes/enemies.js
import Phaser from "phaser";

// --- Register your enemy types here ---
export const ENEMY_TYPES = {
  slug: {
    key: "slug",                                 // spritesheet key
    sheetUrl: "/sprites/enemies/slug_sheet.png", // file in public/
    frameWidth: 32, frameHeight: 24,
    anims: { idle: { start: 0, end: 3, rate: 8, key: "slug_walk" } },
    hp: 1, level: 1, coin: 1, speed: 70,
    gravityY: 1100, allowGravity: true, collideWorldBounds: true,
    ai: "patrol",                                // simple bounce patrol
  },
  beetle: {
    key: "beetle",
    sheetUrl: "/sprites/enemies/beetle_sheet.png",
    frameWidth: 48, frameHeight: 32,
    anims: { idle: { start: 0, end: 5, rate: 10, key: "beetle_walk" } },
    hp: 3, level: 2, coin: 2, speed: 110,
    gravityY: 1200, allowGravity: true, collideWorldBounds: true,
    ai: "patrol",
  },
  wisp: {
    key: "wisp",
    sheetUrl: "/sprites/enemies/wisp_sheet.png",
    frameWidth: 32, frameHeight: 32,
    anims: { idle: { start: 0, end: 7, rate: 12, key: "wisp_fly" } },
    hp: 2, level: 3, coin: 3, speed: 80,
    gravityY: 0, allowGravity: false, collideWorldBounds: false,
    ai: "hoverChase",                             // slow hover towards player
  },
  // Add more types here…
};

// Map difficulty → allowed types (weights optional)
const DIFF_POOLS = {
  easy:   ["slug", "slug", "slug", "beetle"],                // slug mostly
  normal: ["slug", "beetle", "beetle", "wisp"],              // mixed
  hard:   ["slug", "beetle", "wisp", "wisp", "beetle"],      // harder types more often
};

// ---------- API you call from MainScene ----------

export const Enemies = {
  preload(scene) {
    for (const t of Object.values(ENEMY_TYPES)) {
      scene.load.spritesheet(t.key, t.sheetUrl, {
        frameWidth: t.frameWidth,
        frameHeight: t.frameHeight,
      });
    }
  },

  createAnims(scene) {
    for (const t of Object.values(ENEMY_TYPES)) {
      const { key, anims } = t;
      if (!anims?.idle) continue;
      const a = anims.idle;
      if (!scene.anims.exists(a.key)) {
        scene.anims.create({
          key: a.key,
          frames: scene.anims.generateFrameNumbers(key, { start: a.start, end: a.end }),
          frameRate: a.rate,
          repeat: -1,
        });
      }
    }
  },

  /** Pick a random enemy type for a given difficulty */
  pickType(difficulty = "normal") {
    const pool = DIFF_POOLS[difficulty] || DIFF_POOLS.normal;
    return Phaser.Utils.Array.GetRandom(pool);
  },

  /** Spawn and configure an enemy sprite; returns the sprite */
  spawn(scene, typeKey, x, y) {
    const cfg = ENEMY_TYPES[typeKey];
    if (!cfg) throw new Error(`Unknown enemy type: ${typeKey}`);

    const e = scene.physics.add.sprite(x, y, cfg.key, 0);

    // Physics & movement
    e.setCollideWorldBounds(!!cfg.collideWorldBounds);
    e.body.setAllowGravity(!!cfg.allowGravity);
    if (cfg.allowGravity && cfg.gravityY) e.body.setGravityY(cfg.gravityY);
    e.setBounce(0, 0);
    if (cfg.ai === "patrol") {
        const dir = Phaser.Math.Between(0, 1) ? -1 : 1;
        e.setData("dir", dir);
        e.setVelocityX(dir * cfg.speed);
        e.setBounceX(1);                     // bounce when hitting walls/solids
        e.setCollideWorldBounds(true);       // optional: bounce on world edges
    } else if (cfg.ai === "hoverChase") {
      // gentle hover; we'll update vx in a per-frame hook
      e.setVelocity(0, 0);
    }

    // Data payload
    e.setDataEnabled();
    e.setData("type", typeKey);
    e.setData("hp", cfg.hp);
    e.setData("maxHP", cfg.hp);
    e.setData("level", cfg.level);
    e.setData("coin", cfg.coin);
    e.setData("speed", cfg.speed);
    e.setData("ai", cfg.ai);

    // Anim
    const idleKey = cfg.anims?.idle?.key;
    if (idleKey) e.anims.play(idleKey, true);

    // Body size (optional: tighter hitbox than full frame)
    const bw = Math.floor(e.width * 0.8);
    const bh = Math.floor(e.height * 0.85);
    e.body.setSize(bw, bh, true);

    // AI update hook (optional)
    e.updateAI = (player) => {
  const ai = e.getData("ai");
  if (ai === "hoverChase" && player?.active) {
    const spd = e.getData("speed");
    const dir = Math.sign(player.x - e.x) || 1;
    e.setVelocityX(dir * spd);
    const bob = Math.sin(scene.time.now / 400 + e.x * 0.01) * 25;
    e.setVelocityY(bob);
    e.flipX = dir < 0;
    return;
  }

  if (ai === "patrol") {
    const spd = e.getData("speed");
    const dirStored = e.getData("dir") || 1;

    // If stuck at 0, push again in stored direction
    if (Math.abs(e.body.velocity.x) < 5 && e.body.blocked.down) {
      const dir = dirStored || (Phaser.Math.Between(0, 1) ? 1 : -1);
      e.setVelocityX(dir * spd);
      e.setData("dir", dir);
    }

    // On hitting walls, flip direction
    if (e.body.blocked.left)  { e.setVelocityX(+spd); e.setData("dir", +1); }
    if (e.body.blocked.right) { e.setVelocityX(-spd); e.setData("dir", -1); }

    // Face travel direction
    e.flipX = e.body.velocity.x < 0;
  }
};


    return e;
  }
};
