// scenes/BossLevelScene.js
import Phaser from "phaser";

export default class BossLevelScene extends Phaser.Scene {
  constructor() { super("BossLevel"); }
safeGet(k, fallback = null) { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } }
    safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
    safeGetInt(key, fallback = 0) {
  try {
    if (typeof window === "undefined") return fallback;
    const v = localStorage.getItem(key);
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
  // ------------------ lifecycle ------------------
  init(data) {
    this.difficulty = data?.difficulty || "normal";
    this.coins = data?.coins | 0;
    this.checkpoint = data?.checkpoint || null;
    this.from = data?.from || "MainScene";


    // tile size for ASCII map
    this.TILE = 40;

    this.bossGatePos = data?.bossGatePos || null;  // main-level gate spot to convert later
    this.returnPortalPos = null;                    // where 'B' is in the boss map

    // state
    this.player = null;
    this.attack = null;
    this.mapSolids = null;
    this.startPos = { x: 100, y: 100 };
    this.bossSpawn = { x: 400, y: 200 };
    this.playerHP = (typeof data?.playerHP === "number") ? data.playerHP : 5;
    this.playerMaxHP = 5;
    this.facing = 1;
    this.invulnTimer = 0;
    this.jumpCount = 0; this.maxJumps = 2;
    this.dashTimer = 0; this.dashCooldown = 0;

    // boss
    this.boss = null;
    this.bossHP = 30;        // tune here
    this.bossMaxHP = 30;
    this.bossState = "idle";
    this.bossAttackCd = 0;
    this.bossGatePos = data?.bossGatePos || null;

    // helpers
    this.playerMapCollider = null;
    this.enemyMapCollider = null;
  }

  preload() {
    // Map text
    this.load.text("boss_map", "/maps/BossLevel.txt");

    // Player fallback art if not already cached
    if (!this.textures.exists("player")) {
      this.load.image("player", "/sprites/player.png");
    }

    // Basic block texture (TILE×TILE)
    if (!this.textures.exists("blockTex")) {
      const g = this.add.graphics();
      g.fillStyle(0x3a3d46, 1).fillRect(0, 0, this.TILE, this.TILE).generateTexture("blockTex", this.TILE, this.TILE).destroy();
    }

    if (!this.textures.exists("monumentTex")) {
        const g = this.add.graphics();
        g.fillStyle(0x4b6ea9, 1).fillRoundedRect(0, 0, this.TILE*0.8, this.TILE*1.2, 6)
        .lineStyle(2, 0xaad1ff, 1).strokeRoundedRect(0, 0, this.TILE*0.8, this.TILE*1.2, 6)
        .generateTexture("monumentTex", this.TILE*0.8, this.TILE*1.2)
        .destroy();
    }


    // Boss texture (procedural fallback). If you have a sheet, you can load it here instead.
    if (!this.textures.exists("bossTex")) {
      const g = this.add.graphics();
      g.fillStyle(0x2e1a5f, 1).fillRect(0, 0, 64, 64);
      g.lineStyle(2, 0x7a5cff, 1).strokeRect(1, 1, 62, 62);
      g.fillStyle(0x7a5cff, 1).fillCircle(20, 28, 6).fillCircle(44, 28, 6);
      g.generateTexture("bossTex", 64, 64).destroy();
    }
  }

  create() {
    // Build map
    this.buildMapFromAscii(this.cache.text.get("boss_map") || this.defaultBossAscii());

    // World & camera
    this.physics.world.setBounds(0, 0, this.levelWidth, this.levelHeight);
    this.cameras.main.setBounds(0, 0, this.levelWidth, this.levelHeight);

    // Player
    this.player = this.physics.add.sprite(this.startPos.x, this.startPos.y, "player").setCollideWorldBounds(true);
    this.player.setDisplaySize(40, 40);
    this.player.body.setSize(this.player.displayWidth * 0.6, this.player.displayHeight * 0.9, true);
    this.player.setMaxVelocity(450, 1200);
    this.player.setDragX(1800);

    // Attack hitbox (glued, lag-free)
    this.attack = this.add.rectangle(0, 0, 52, 24, 0xffffff, 0.1);
    this.physics.add.existing(this.attack);
    this.attack.body.setAllowGravity(false).setImmovable(true);
    this.attack.body.enable = false;
    this.attack.setVisible(true);

    const syncAttack = () => {
      if (!this.attack.body.enable) return;
      const reach = Math.max(28, this.player.displayWidth * 0.55);
      const dt = this.game.loop.delta / 1000;
      const lead = Phaser.Math.Clamp(this.player.body.velocity.x * dt, -24, 24);
      this.attack.body.reset(this.player.x + this.facing * reach + lead, this.player.y + 2);
    };
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, syncAttack, this);

    // Colliders
    this.playerMapCollider = this.physics.add.collider(this.player, this.mapSolids, () => {
      if (this.player.body.blocked.down || this.player.body.touching.down) this.jumpCount = 0;
    });

    // Boss
    this.boss = this.physics.add.sprite(this.bossSpawn.x, this.bossSpawn.y, "bossTex").setCollideWorldBounds(true);
    this.boss.body.setSize(56, 56, true);
    this.boss.setBounce(0);
    this.physics.add.collider(this.boss, this.mapSolids);

    // Overlaps: player attack vs boss
    this.physics.add.overlap(this.attack, this.boss, () => {
      if (!this.attack.body.enable || !this.boss.active) return;
      this.hurtBoss(1);
    });

    // Player damage on touch
    this.physics.add.overlap(this.player, this.boss, () => {
      if (this.invulnTimer > 0 || !this.boss.active) return;
      this.playerHP = this.playerHP - 1;
      this.invulnTimer = 800;
      this.player.setTint(0xffe082);
      this.player.setVelocity(-this.facing * 260, -220);
      if (this.playerHP <= 0) this.gameOver();
    });

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Inputs
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      A: Phaser.Input.Keyboard.KeyCodes.A,
      D: Phaser.Input.Keyboard.KeyCodes.D,
      W: Phaser.Input.Keyboard.KeyCodes.W,
      F: Phaser.Input.Keyboard.KeyCodes.F,
      SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
      X: Phaser.Input.Keyboard.KeyCodes.X,
      ONE: Phaser.Input.Keyboard.KeyCodes.ONE,
      TWO: Phaser.Input.Keyboard.KeyCodes.TWO,
      THREE: Phaser.Input.Keyboard.KeyCodes.THREE,
      DELETE: Phaser.Input.Keyboard.KeyCodes.DELETE,
      I: Phaser.Input.Keyboard.KeyCodes.I,
      ENTER: Phaser.Input.Keyboard.KeyCodes.ENTER,
      E: Phaser.Input.Keyboard.KeyCodes.E,
      ESC: Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    // HUD
    this.hud = this.add.text(12, 12, "", { fontSize: 16, color: "#eaeaea" }).setScrollFactor(0);
    this.toast = this.add.text(12, 36, "", { fontSize: 14, color: "#a8e6cf" }).setScrollFactor(0);

    // Boss HP bar
    this.hpBg = this.add.rectangle(this.scale.width/2, 24, 420, 12, 0x222633).setScrollFactor(0).setOrigin(0.5);
    this.hpFg = this.add.rectangle(this.scale.width/2 - 210, 24, 420, 10, 0x7a5cff).setScrollFactor(0).setOrigin(0, 0.5);

    // ESC → pause
    this.input.keyboard.on("keydown-ESC", () => {
        this.scene.launch("PauseMenu", { from: this.scene.key, score: this.coins | 0, difficulty: this.difficulty });
        this.scene.pause();
    });
  }

  // persisted flags
isBossCleared() { try { return localStorage.getItem("bk_boss_cleared") === "1"; } catch { return false; } }
    setBossCleared(pos) {
    try {
        localStorage.setItem("bk_boss_cleared", "1");
        if (pos) localStorage.setItem("bk_boss_gate_pos", JSON.stringify(pos));
    } catch {}
    }
    loadBossGatePos() {
    try { const s = localStorage.getItem("bk_boss_gate_pos"); return s ? JSON.parse(s) : null; } catch { return null; }
}


  // ------------------ map build ------------------
  buildMapFromAscii(asciiRaw) {
    const ascii = (asciiRaw || "").replace(/\r/g, "").trim();
    const rows = ascii.split("\n");
    const H = rows.length;
    const W = Math.max(...rows.map(r => r.length));
    this.levelWidth = W * this.TILE;
    this.levelHeight = H * this.TILE;

    this.mapSolids = this.physics.add.staticGroup();

    for (let r = 0; r < H; r++) {
      const y = r * this.TILE + this.TILE / 2;
      const line = rows[r];
      for (let c = 0; c < W; c++) {
        const ch = line[c] || ".";
        const x = c * this.TILE + this.TILE / 2;
        if (ch === "x") {
          const b = this.mapSolids.create(x, y, "blockTex");
          b.refreshBody();
        } else if (ch === "S") {
          this.startPos = { x, y: y - 20 };
        } else if (ch === "B") {
            this.bossSpawn = { x, y: y - 20 };
            this.returnPortalPos = { x, y: y - 20 };   
        }
      }
    }
  }

  defaultBossAscii() {
    // 56×18-ish arena; feel free to replace with your own BossLevel.txt
    return this.load.text.get("boss_map").trim();
  }

  // ------------------ boss logic ------------------
  hurtBoss(dmg) {
    this.bossHP = Math.max(0, this.bossHP - dmg);
    const ratio = Phaser.Math.Clamp(this.bossHP / this.bossMaxHP, 0, 1);
    this.hpFg.width = 420 * ratio;

    this.boss.setTintFill(0xbbaaff);
    this.time.delayedCall(80, () => this.boss.clearTint());

    if (this.bossHP <= 0) {
      this.bossDefeated();
    }
  }

  bossAI(dt) {
    if (!this.boss.active) return;

    // Cooldowns
    this.bossAttackCd = Math.max(0, this.bossAttackCd - dt);

    // Simple pattern: idle → telegraph → charge at player
    if (this.bossState === "idle") {
      // drift to center-ish
      const dir = Math.sign(this.player.x - this.boss.x) || 1;
      this.boss.setVelocityX(dir * 60);
      this.boss.flipX = dir < 0;

      if (this.bossAttackCd === 0 && Phaser.Math.Between(0, 1000) < 8) {
        this.bossState = "telegraph";
        this.boss.setVelocityX(0);
        this.boss.setTint(0x7a5cff);
        this.time.delayedCall(350, () => {
          this.boss.clearTint();
          this.bossState = "charge";
          const sp = (this.difficulty === "hard") ? 520 : (this.difficulty === "normal") ? 440 : 380;
          const dir2 = Math.sign(this.player.x - this.boss.x) || 1;
          this.boss.setVelocityX(dir2 * sp);
          this.bossAttackCd = 900;
          this.time.delayedCall(300, () => {
            // end charge
            if (this.boss && this.boss.active) {
              this.boss.setVelocityX(dir2 * 80);
              this.bossState = "idle";
            }
          });
        });
      }
    }
  }

bossDefeated() {
  if (!this.boss?.active) return;
  this.boss.disableBody(true, true);
  this.toast.setText("Boss defeated! A monument appears...");

  // spawn a return monument at the boss gate spot inside this level
  const p = this.returnPortalPos || { x: this.bossSpawn.x, y: this.bossSpawn.y };
  const portal = this.physics.add.staticImage(p.x, p.y - 10, "monumentTex").setOrigin(0.5, 0.9);
  portal.refreshBody();

  // overlap to return back to MainScene
  this.physics.add.overlap(this.player, portal, () => {
    this.scene.start(this.from, {
      returnFromBoss: true,
      bossCleared: true,            // tell Main to replace the B gate
      bossGatePos: this.bossGatePos,
      checkpoint: this.checkpoint,  // where to resume
      difficulty: this.difficulty,
      coins: this.coins,
      playerHP: this.playerHP
    });
  }, null, this);

  // small effect: stop boss AI & damage, keep playing arena
  this.bossState = "defeated";
}


  gameOver() {
    this.scene.start("Menu", { lastScore: this.coins, difficulty: this.difficulty });
  }

  // ------------------ helpers & update ------------------

  justDown(k) { return !!(k && Phaser.Input.Keyboard.JustDown(k)); }
  isDown(k)   { return !!(k && k.isDown); }

  update(_time, delta) {
    const dt = delta;

    // timers
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.invulnTimer === 0) this.player.clearTint();
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);

    // movement
    const left  = this.isDown(this.cursors?.left)  || this.isDown(this.keys?.A);
    const right = this.isDown(this.cursors?.right) || this.isDown(this.keys?.D);
    const onGround = this.player.body.blocked?.down || this.player.body.touching?.down;

    const runSpeed = 320;
    if (this.dashTimer > 0) {
      // keep momentum
    } else if (left && !right) {
      this.player.setVelocityX(-runSpeed); this.facing = -1;
    } else if (right && !left) {
      this.player.setVelocityX(runSpeed); this.facing = 1;
    } else {
      this.player.setVelocityX(0);
    }

    const jumpPressed = this.justDown(this.cursors?.up) || this.justDown(this.keys?.W);
    if (jumpPressed) {
      if (onGround) { this.jumpCount = 1; this.player.setVelocityY(-470); }
      else if (this.jumpCount < this.maxJumps) { this.jumpCount++; this.player.setVelocityY(-450); }
    }

    if (this.justDown(this.keys?.X) && this.dashCooldown === 0) {
      const dashV = 680 * this.facing;
      this.player.setVelocityX(dashV);
      this.dashTimer = 140;
      this.dashCooldown = 500;
    }

    if (this.justDown(this.keys?.SPACE)) {
      this.attack.body.enable = true;
      const reach = Math.max(28, this.player.displayWidth * 0.55);
      this.attack.body.reset(this.player.x + this.facing * reach, this.player.y + 2);
      this.invulnTimer = Math.max(this.invulnTimer, 100); // slight priority to attacker
      this.time.delayedCall(110, () => { this.attack.body.enable = false; });
    }

    // boss AI
    this.bossAI(dt);

    // HUD
    const hearts = "❤".repeat(this.playerHP) + "·".repeat(this.playerMaxHP - this.playerHP);
    this.hud.setText(`HP ${hearts}   Coins: ${this.coins}   Boss: ${this.bossHP}/${this.bossMaxHP}`);
  }
}
