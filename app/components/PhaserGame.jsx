// components/PhaserGame.jsx
"use client";
import { useEffect, useRef } from "react";

export default function PhaserGame() {
  const containerRef = useRef(null);

  useEffect(() => {
    let game;
    let destroyed = false;

    (async () => {
      const Phaser = await import("phaser");

      class MainScene extends Phaser.Scene {
        constructor() { super("MainScene"); }

        init() {
          // ----- WORLD SIZE -----
          this.levelWidth  = 3200;   // change freely
          this.levelHeight = 720;    // change freely
          this.TILE = 40;            // must divide both dimensions
          this.cols = Math.floor(this.levelWidth / this.TILE);
          this.rows = Math.floor(this.levelHeight / this.TILE);

          this.playerMapCollider = null;
          this.enemyMapCollider  = null;


          // sanity: enforce exact fit
          this.levelWidth  = this.cols * this.TILE;
          this.levelHeight = this.rows * this.TILE;

          // player & game state
          this.playerMaxHP = 5;
          this.playerHP = this.playerMaxHP;
          this.facing = 1;
          this.jumpCount = 0; this.maxJumps = 2;
          this.dashTimer = 0; this.dashCooldown = 0;
          this.invulnTimer = 0;

          // coins & difficulty
          this.coins = 0;
          this.difficulty = "easy"; // "easy" | "normal" | "hard"
          this.maxAlive = 0;

          // map containers
          this.mapSolids = null;
          this.allSpawnPoints = [];
          this.startPos = { x: this.TILE * 2 + 20, y: this.TILE * 2 }; // fallback
        }

        preload() {
          // Simple textures (programmatic)
          const g = this.add.graphics();
          // player (24x36)
          g.fillStyle(0x90caf9, 1).fillRect(0, 0, 24, 36).generateTexture("playerTex", 24, 36).clear();
          // enemy (24x24)
          g.fillStyle(0xff6b6b, 1).fillRect(0, 0, 24, 24).generateTexture("enemyTex", 24, 24).clear();
          // solid block (TILE x TILE)
          g.fillStyle(0x3a3d46, 1).fillRect(0, 0, this.TILE, this.TILE).generateTexture("blockTex", this.TILE, this.TILE).clear();
          // parallax tiles
          g.fillStyle(0x11131a, 1).fillRect(0, 0, 64, 64).generateTexture("bgDark", 64, 64).clear();
          g.fillStyle(0x171a24, 1).fillRect(0, 0, 64, 64).generateTexture("bgMid", 64, 64).destroy();

          // Optional external ASCII maps (served from /public/maps/*.txt)
          this.load.text("map_easy",   "/maps/easy.txt");
          this.load.text("map_normal", "/maps/normal.txt");
          this.load.text("map_hard",   "/maps/hard.txt");
        }

        create() {
          // World & camera
          this.physics.world.setBounds(0, 0, this.levelWidth, this.levelHeight);
          this.cameras.main.setBounds(0, 0, this.levelWidth, this.levelHeight);

          // Parallax backgrounds
          this.bg1 = this.add.tileSprite(0, 0, this.levelWidth, this.scale.height, "bgDark").setOrigin(0,0);
          this.bg2 = this.add.tileSprite(0, 0, this.levelWidth, this.scale.height, "bgMid").setOrigin(0,0);

          // Player
          this.player = this.physics.add.sprite(120, 120, "playerTex").setCollideWorldBounds(true);
          this.player.body.setSize(24, 36);
          this.player.setMaxVelocity(450, 1200);
          this.player.setDragX(1800);

          // Attack hitbox
          this.attack = this.add.rectangle(0, 0, 48, 22, 0xffffff, 0.001);
          this.physics.add.existing(this.attack);
          this.attack.body.setAllowGravity(false);
          this.attack.body.setEnable(false);
          this.attack.setVisible(false);

          // Enemies group
          this.enemies = this.physics.add.group();

          // Camera follow
          this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

          // Inputs
          this.cursors = this.input.keyboard.createCursorKeys();
          this.keys = this.input.keyboard.addKeys({
            A: Phaser.Input.Keyboard.KeyCodes.A,
            D: Phaser.Input.Keyboard.KeyCodes.D,
            W: Phaser.Input.Keyboard.KeyCodes.W,
            F: Phaser.Input.Keyboard.KeyCodes.F, // attack
            X: Phaser.Input.Keyboard.KeyCodes.X, // dash
            ONE:   Phaser.Input.Keyboard.KeyCodes.ONE,
            TWO:   Phaser.Input.Keyboard.KeyCodes.TWO,
            THREE: Phaser.Input.Keyboard.KeyCodes.THREE,
          });

          // HUD
          this.hud = this.add.text(12, 12, "", { fontSize: 16, color: "#eaeaea" }).setScrollFactor(0);
          this.toast = this.add.text(12, 36, "", { fontSize: 14, color: "#a8e6cf" }).setScrollFactor(0);

          // Build map from ASCII (based on difficulty)
          this.buildMapForDifficulty(this.difficulty);
          this.attachColliders();
          // Collisions & overlaps after map exists
          this.attachColliders();

          // Attack overlap -> damage & coins
          this.physics.add.overlap(this.attack, this.enemies, (hitbox, enemy) => {
            if (!this.attack.body.enable || !enemy.active) return;
            const hp = (enemy.getData("hp") ?? 2) - 1;
            enemy.setData("hp", hp);
            enemy.setTint(0xffaaaa);
            this.time.delayedCall(100, () => enemy.clearTint());
            enemy.setVelocityY(-180);
            enemy.setVelocityX(this.facing * 100);
            if (hp <= 0) {
              this.coins += enemy.getData("coin") ?? 1;
              const coin = this.add.image(enemy.x, enemy.y - 10, "coinTex" /* optional if you add one */);
              if (coin) this.tweens.add({ targets: coin, y: coin.y - 24, alpha: 0, duration: 450, onComplete: () => coin.destroy() });
              enemy.destroy();
            }
          });

          // Player gets hit
          this.physics.add.overlap(this.player, this.enemies, () => {
            if (this.invulnTimer > 0) return;
            this.playerHP = Math.max(0, this.playerHP - 1);
            this.invulnTimer = 800;
            this.player.setTint(0xffe082);
            this.player.setVelocity(-this.facing * 240, -200);
            if (this.playerHP <= 0) this.scene.restart();
          });

          // Start spawner
          this.setupSpawner();
        }

        // -------------------- MAP BUILDING --------------------

        buildMapForDifficulty(mode) {
          // Destroy old solids
          this.detachColliders();
          if (this.mapSolids) this.mapSolids.destroy(true);
          this.mapSolids = this.physics.add.staticGroup();
          this.allSpawnPoints = [];

          // Get ASCII: prefer preloaded text files, else generate
          let ascii = this.cache.text.get(
            mode === "easy" ? "map_easy" : mode === "normal" ? "map_normal" : "map_hard"
          );

          if (!ascii) {
            ascii = this.makeDefaultAscii(this.cols, this.rows, mode);
          }

          // Ensure exact rows×cols to match level size
          ascii = this.fixAsciiToBounds(ascii, this.cols, this.rows);

          // Parse & build
          const lines = ascii.split("\n");
          let foundS = false;

          for (let r = 0; r < this.rows; r++) {
            const y = r * this.TILE + this.TILE / 2;
            const line = lines[r];
            for (let c = 0; c < this.cols; c++) {
              const ch = line[c] || ".";
              const x = c * this.TILE + this.TILE / 2;

              if (ch === "x") {
                const blk = this.mapSolids.create(x, y, "blockTex");
                blk.refreshBody();
              } else if (ch === "S") {
                this.startPos = { x, y: y - 20 };
                foundS = true;
              } else if (ch === "E") {
                this.allSpawnPoints.push({ x, y: y - this.TILE * 2 });
              }
            }
          }

          if (!foundS) {
            this.startPos = { x: this.TILE * 2 + 20, y: this.TILE * 2 };
          }
          if (this.allSpawnPoints.length === 0) {
            this.allSpawnPoints.push({ x: this.levelWidth * 0.6, y: this.TILE * 3 });
          }

          // Place / reset player
          this.player.setPosition(this.startPos.x, this.startPos.y);
          this.player.setVelocity(0, 0);
        }

        // Pad/crop to rows×cols; bottom-aligns content for natural ground feel
        fixAsciiToBounds(ascii, cols, rows) {
          const clean = ascii.replace(/\r/g, "");
          let rawLines = clean.split("\n").filter((_, i, arr) => !(i === arr.length - 1 && _ === "")); // drop trailing empty
          // crop or pad rows
          if (rawLines.length > rows) {
            // keep the last 'rows' lines => bottom align
            rawLines = rawLines.slice(rawLines.length - rows);
          } else if (rawLines.length < rows) {
            const pad = ".".repeat(cols);
            const needed = rows - rawLines.length;
            rawLines = new Array(needed).fill(pad).concat(rawLines);
          }
          // ensure each line is cols wide
          const fixed = rawLines.map(l => {
            const line = l.replace(/\t/g, " "); // tabs -> spaces
            if (line.length > cols) return line.slice(0, cols);
            if (line.length < cols) return line + ".".repeat(cols - line.length);
            return line;
          });
          return fixed.join("\n");
        }
        detachColliders() {
            if (this.playerMapCollider) { this.playerMapCollider.destroy(); this.playerMapCollider = null; }
            if (this.enemyMapCollider)  { this.enemyMapCollider.destroy();  this.enemyMapCollider  = null; }
        }
        attachColliders() {
            this.detachColliders();
            this.playerMapCollider = this.physics.add.collider(
                this.player,
                this.mapSolids,
                () => {
                    if (this.player.body.blocked.down || this.player.body.touching.down) this.jumpCount = 0;        
                }
            );
            this.enemyMapCollider = this.physics.add.collider(this.enemies, this.mapSolids);
        }


        // Procedural defaults sized to rows×cols
        makeDefaultAscii(cols, rows, mode) {
          const grid = Array.from({ length: rows }, () => Array(cols).fill("."));
          const putHLine = (r, c1, c2) => {
            for (let c = Math.max(0, c1); c <= Math.min(cols - 1, c2); c++) grid[r][c] = "x";
          };

          // ground (bottom two rows)
          putHLine(rows - 1, 0, cols - 1);
          putHLine(rows - 2, 0, cols - 1);

          // platforms
          putHLine(rows - 6, 10, Math.min(25, cols - 1));
          putHLine(rows - 9, 35, Math.min(55, cols - 1));
          putHLine(rows - 12, 60, Math.min(75, cols - 1));
          putHLine(rows - 10, 2, 6);

          // Start
          grid[rows - 4][3] = "S";

          // Spawns vary by mode
          const addE = (c, r) => { if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = "E"; };
          if (mode === "easy") {
            addE(Math.floor(cols * 0.45), rows - 7);
          } else if (mode === "normal") {
            addE(Math.floor(cols * 0.40), rows - 7);
            addE(Math.floor(cols * 0.70), rows - 10);
          } else {
            addE(Math.floor(cols * 0.25), rows - 7);
            addE(Math.floor(cols * 0.45), rows - 10);
            addE(Math.floor(cols * 0.60), rows - 9);
            addE(Math.floor(cols * 0.75), rows - 12);
            addE(Math.floor(cols * 0.85), rows - 7);
          }

          return grid.map(row => row.join("")).join("\n");
        }

        // -------------------- SPAWNER --------------------

        setupSpawner() {
          if (this.spawnEvent) this.spawnEvent.remove(false);

          // Also (re)build map for this difficulty so spawns come from the right ASCII file
          this.buildMapForDifficulty(this.difficulty);
          this.attachColliders();
    
            // Spawner settings
          let spawnEvery = 1500;
          let numSpawnPoints = 1;
          this.maxAlive = 6;

          if (this.difficulty === "easy") {
            spawnEvery = 1800; numSpawnPoints = 1; this.maxAlive = 4;
          } else if (this.difficulty === "normal") {
            spawnEvery = 1200; numSpawnPoints = Math.min(2, this.allSpawnPoints.length); this.maxAlive = 8;
          } else {
            spawnEvery = 800; numSpawnPoints = Math.min(5, this.allSpawnPoints.length); this.maxAlive = 16;
          }

          // Choose active spawn points
          this.activeSpawns = Phaser.Utils.Array.Shuffle([...this.allSpawnPoints]).slice(0, numSpawnPoints);

          this.toast.setText(`Mode: ${this.difficulty} — spawns: ${numSpawnPoints}`);
          this.time.delayedCall(1200, () => this.toast.setText(""));

          this.spawnEvent = this.time.addEvent({
            delay: spawnEvery,
            loop: true,
            callback: this.trySpawnEnemy,
            callbackScope: this
          });
        }

        trySpawnEnemy() {
          if (this.enemies.countActive(true) >= this.maxAlive) return;
          const near = [...this.activeSpawns].sort((a, b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x));
          const choice = Phaser.Math.RND.pick(near.slice(0, Math.min(3, near.length)));
          const e = this.enemies.create(choice.x, choice.y, "enemyTex");
          e.setCollideWorldBounds(true).setBounce(0.1);
          e.body.setSize(24, 24);
          e.setVelocityX(Phaser.Math.Between(-100, 100));
          e.setData("hp", 2);
          e.setData("coin", 1);
        }

        // -------------------- UPDATE --------------------

        update(time, delta) {
          const dt = delta;

          // Parallax
          this.bg1.tilePositionX = this.cameras.main.scrollX * 0.3;
          this.bg2.tilePositionX = this.cameras.main.scrollX * 0.6;

          // Timers
          this.dashCooldown = Math.max(0, this.dashCooldown - dt);
          this.dashTimer = Math.max(0, this.dashTimer - dt);
          this.invulnTimer = Math.max(0, this.invulnTimer - dt);
          if (this.invulnTimer === 0) this.player.clearTint();

          const left = this.cursors.left.isDown || this.keys.A.isDown;
          const right = this.cursors.right.isDown || this.keys.D.isDown;
          const onGround = this.player.body.blocked.down || this.player.body.touching.down;

          // Move
          const runSpeed = 320;
          if (this.dashTimer > 0) {
            // keep momentum
          } else if (left && !right) {
            this.player.setVelocityX(-runSpeed);
            this.facing = -1;
          } else if (right && !left) {
            this.player.setVelocityX(runSpeed);
            this.facing = 1;
          } else {
            this.player.setVelocityX(0);
          }

          // Jump / double jump
          const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.keys.W);
          if (jumpPressed) {
            if (onGround) {
              this.jumpCount = 1;
              this.player.setVelocityY(-470);
            } else if (this.jumpCount < this.maxJumps) {
              this.jumpCount++;
              this.player.setVelocityY(-450);
            }
          }

          // Dash
          if (Phaser.Input.Keyboard.JustDown(this.keys.X) && this.dashCooldown === 0) {
            const dashV = 680 * this.facing;
            this.player.setVelocityX(dashV);
            this.dashTimer = 140;
            this.dashCooldown = 500;
          }

          // Attack
          if (Phaser.Input.Keyboard.JustDown(this.keys.F)) {
            const px = this.player.x + this.facing * 30;
            const py = this.player.y + 2;
            this.attack.setPosition(px, py);
            this.attack.body.setEnable(true);
            this.attack.setVisible(true);
            this.attack.setFillStyle(0xffffff, 0.3);
            this.time.delayedCall(120, () => { this.attack.body.setEnable(false); this.attack.setVisible(true); });
          }

          // Difficulty hotkeys (also rebuild map for that mode)
          if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)   && this.difficulty !== "easy")   { this.difficulty = "easy";   this.setupSpawner(); }
          if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)   && this.difficulty !== "normal") { this.difficulty = "normal"; this.setupSpawner(); }
          if (Phaser.Input.Keyboard.JustDown(this.keys.THREE) && this.difficulty !== "hard")   { this.difficulty = "hard";   this.setupSpawner(); }

          // HUD
          const hearts = "❤".repeat(this.playerHP) + "·".repeat(this.playerMaxHP - this.playerHP);
          this.hud.setText(
            `HP ${hearts}   Coins: ${this.coins}   Mode: ${this.difficulty.toUpperCase()}   ` +
            `Map: ${this.cols}×${this.rows} @ ${this.TILE}px   x:${Math.floor(this.player.x)} y:${Math.floor(this.player.y)}`
          );
        }
      }

      const config = {
        type: Phaser.AUTO,
        width: 960,
        height: 540,
        parent: containerRef.current,
        backgroundColor: "#0b0d12",
        physics: {
          default: "arcade",
          arcade: { gravity: { y: 1200 }, debug: false }
        },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, expandParent: false },
        scene: [MainScene]
      };

      if (containerRef.current && !destroyed) game = new Phaser.Game(config);
    })();

    return () => { destroyed = true; if (game) game.destroy(true); };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", boxShadow: "0 12px 30px rgba(0,0,0,.35)" }} />;
}
