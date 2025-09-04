"use client";
import { throwIfDisallowedDynamic } from "next/dist/server/app-render/dynamic-rendering";
import { useEffect, useRef } from "react";

export default function PhaserGame() {
  const containerRef = useRef(null);

  useEffect(() => {
    let game;
    let destroyed = false;

    (async () => {
      const Phaser = await import("phaser");

      // --------------------------- Menu Scene ---------------------------
      class MenuScene extends Phaser.Scene {
        constructor() { super("Menu"); }
        init(data) {
          // pull lastScore if coming from game over
          this.lastScore = typeof data?.lastScore === "number"
            ? data.lastScore
            : parseInt(localStorage.getItem("bk_lastScore") || "0", 10);

          this.bestScore = parseInt(localStorage.getItem("bk_bestScore") || "0", 10);
          const savedDiff = localStorage.getItem("bk_difficulty");
          this.difficulty = (data?.difficulty || savedDiff || "easy");
          this.options = ["Play", "Score", "Settings"];
          this.selectedIndex = 0;
          this.scorePanelVisible = false;
        }
        create() {
          const w = this.scale.width;
          const h = this.scale.height;

          // background
          this.add.rectangle(0, 0, w * 2, h * 2, 0x0b0d12).setOrigin(0);
          const title = this.add.text(w/2, 90, "BUG KNIGHT LITE", { fontSize: 42, color: "#eaeaea" }).setOrigin(0.5);

          // menu items
          this.menuTexts = this.options.map((label, i) => {
            const txt = this.add.text(w/2, 200 + i * 48, label, { fontSize: 28, color: "#bdbdbd" })
              .setOrigin(0.5)
              .setInteractive({ useHandCursor: true })
              .on("pointerover", () => { this.selectedIndex = i; this.refreshMenu(); })
              .on("pointerdown", () => this.activateSelection());
            return txt;
          });

          // Sub-info lines (difficulty + score)
          this.diffText = this.add.text(w/2, 200 + 2 * 48 + 34, "", { fontSize: 18, color: "#9ecfff" }).setOrigin(0.5);
          this.footer = this.add.text(w/2, h - 40, "↑/↓ select • Enter confirm • ←/→ change in Settings", { fontSize: 14, color: "#7e8a9a" }).setOrigin(0.5);

          // Score panel (hidden until "Score")
          this.scorePanel = this.add.container(w/2, 200 + 1 * 48 + 90);
          const panelBg = this.add.rectangle(0, 0, 380, 120, 0x121723, 0.95).setStrokeStyle(1, 0x2b3a55);
          this.lastText = this.add.text(0, -20, `Last: ${this.lastScore}`, { fontSize: 20, color: "#eaeaea" }).setOrigin(0.5);
          this.bestText = this.add.text(0, 16, `Best: ${this.bestScore}`, { fontSize: 20, color: "#ffd54f" }).setOrigin(0.5);
          this.scorePanel.add([panelBg, this.lastText, this.bestText]).setVisible(false);

          // Keyboard
          this.cursors = this.input.keyboard.createCursorKeys();
          this.keys = this.input.keyboard.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            S: Phaser.Input.Keyboard.KeyCodes.S,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            D: Phaser.Input.Keyboard.KeyCodes.D,
            ENTER: Phaser.Input.Keyboard.KeyCodes.ENTER,
            SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
            LEFT: Phaser.Input.Keyboard.KeyCodes.LEFT,
            RIGHT: Phaser.Input.Keyboard.KeyCodes.RIGHT,
          });

          this.refreshMenu();
        }

        justDown(k) { return !!(k && Phaser.Input.Keyboard.JustDown(k)); }

        refreshMenu() {
          this.menuTexts.forEach((t, i) => {
            const active = i === this.selectedIndex;
            t.setColor(active ? "#eaeaea" : "#bdbdbd");
            t.setScale(active ? 1.08 : 1.0);
          });
          this.diffText.setText(`Difficulty: ${this.difficulty.toUpperCase()}`);
        }

        toggleScorePanel(show) {
          this.scorePanelVisible = (show ?? !this.scorePanelVisible);
          this.scorePanel.setVisible(this.scorePanelVisible);
          // refresh score numbers from storage on open
          if (this.scorePanelVisible) {
            const last = parseInt(localStorage.getItem("bk_lastScore") || String(this.lastScore || 0), 10);
            const best = parseInt(localStorage.getItem("bk_bestScore") || String(this.bestScore || 0), 10);
            this.lastText.setText(`Last: ${last}`);
            this.bestText.setText(`Best: ${best}`);
          }
        }

        activateSelection() {
          const label = this.options[this.selectedIndex];
          if (label === "Play") {
            localStorage.setItem("bk_difficulty", this.difficulty);
            this.scene.start("MainScene", { difficulty: this.difficulty });
          } else if (label === "Score") {
            this.toggleScorePanel(true);
          } else if (label === "Settings") {
            // cycle difficulty
            this.difficulty = (this.difficulty === "easy") ? "normal"
                              : (this.difficulty === "normal") ? "hard" : "easy";
            localStorage.setItem("bk_difficulty", this.difficulty);
            this.refreshMenu();
          }
        }

        update() {
          // nav
          if (this.justDown(this.cursors?.up) || this.justDown(this.keys?.W)) {
            this.selectedIndex = (this.selectedIndex + this.options.length - 1) % this.options.length;
            this.refreshMenu(); this.toggleScorePanel(false);
          }
          if (this.justDown(this.cursors?.down) || this.justDown(this.keys?.S)) {
            this.selectedIndex = (this.selectedIndex + 1) % this.options.length;
            this.refreshMenu(); this.toggleScorePanel(false);
          }
          // activate
          if (this.justDown(this.keys?.ENTER) || this.justDown(this.keys?.SPACE)) {
            this.activateSelection();
          }
          // left/right change difficulty when "Settings" active
          if (this.selectedIndex === 2) {
            if (this.justDown(this.cursors?.left) || this.justDown(this.keys?.A)) {
              this.difficulty = (this.difficulty === "hard") ? "normal"
                                : (this.difficulty === "normal") ? "easy" : "hard";
              localStorage.setItem("bk_difficulty", this.difficulty);
              this.refreshMenu();
            }
            if (this.justDown(this.cursors?.right) || this.justDown(this.keys?.D)) {
              this.difficulty = (this.difficulty === "easy") ? "normal"
                                : (this.difficulty === "normal") ? "hard" : "easy";
              localStorage.setItem("bk_difficulty", this.difficulty);
              this.refreshMenu();
            }
          }
        }
      }

      // --------------------------- Main Game Scene ---------------------------
      class MainScene extends Phaser.Scene {
        constructor() { super("MainScene"); }

        init(data) {
          // ----- WORLD SIZE -----
          this.levelWidth  = 6200;
          this.levelHeight = 4000;
          this.TILE = 40;
          this.cols = Math.floor(this.levelWidth / this.TILE);
          this.rows = Math.floor(this.levelHeight / this.TILE);
          this.levelWidth  = this.cols * this.TILE;
          this.levelHeight = this.rows * this.TILE;

          // state
          this.playerMaxHP = 5;
          this.playerHP = this.playerMaxHP;
          this.facing = 1;
          this.jumpCount = 0; this.maxJumps = 2;
          this.dashTimer = 0; this.dashCooldown = 0;
          this.invulnTimer = 0;

          // score & difficulty
          this.coins = 0;
          const saved = typeof window !== "undefined" ? localStorage.getItem("bk_difficulty") : null;
          this.difficulty = data?.difficulty || saved || "easy";
          this.maxAlive = 0;

          // map
          this.groundFloorY = this.levelHeight - this.TILE * 2;
          this.mapSolids = null;
          this.allSpawnPoints = [];
          this.startPos = { x: this.TILE * 2 + 20, y: this.TILE * 2 };

          // colliders refs
          this.playerMapCollider = null;
          this.enemyMapCollider  = null;

          // spawn event
          this.spawnEvent = null;

          // timers
          this.passageRevealedTimer = 0;
          this.hiddenBlockHitTimer = 0;
          this.hasRevealedPassage = false;
          this.hasHitHiddenBlock = false;
          this.hasKey = false;
          this.hasCollectedKey = false;
          this.doorOpen = false;
          this.doorOpening = false;
          this.doorCloseTimer = 0;
          this.gameOverTimer = 0;
          this.gameOverDelay = 1800;
          this.isGameOver = false;
          this.lastScore = 0;
          this.bestScore = 0;
        
          // refs to important game objects
          this.player = null;
          this.attack = null;
          this.enemies = null;
          this.treasures = null;
          this.keysDoors = null;
          this.doors = null;
          this.hiddenPassages = null;
          this.hiddenBlocks = null;
          this.hud = null;
          this.toast = null;

        }

        preload() {
          const g = this.add.graphics();
          //g.fillStyle(0x90caf9, 1).fillRect(0, 0, 24, 36).generateTexture("playerTex", 24, 36).clear();
          this.load.image("player", "/sprites/player.png"); // file in public/sprites/player.png
          g.fillStyle(0xff6b6b, 1).fillRect(0, 0, 24, 24).generateTexture("enemyTex", 24, 24).clear();
          g.fillStyle(0x3a3d46, 1).fillRect(0, 0, this.TILE, this.TILE).generateTexture("blockTex", this.TILE, this.TILE).clear();
          g.fillStyle(0xffd54f, 1).fillCircle(6, 6, 6).generateTexture("coinTex", 12, 12).clear();
          // g.fillStyle(0x11131a, 1).fillRect(0, 0, 64, 64).generateTexture("bgDark", 64, 64).clear();
          // g.fillStyle(0x171a24, 1).fillRect(0, 0, 64, 64).generateTexture("bgMid", 64, 64).destroy();
          this.load.image("background", "/sprites/background4b.png");
          this.load.text("map_level1",   "/maps/level1.txt");

          // tiles
          this.load.image("top right corner", "/sprites/tiles/righttop.png");
          this.load.image("leftop left corner", "/sprites/tiles/lefttop.png");
          this.load.image("bottom right corner", "/sprites/tiles/rightbottom.png");
          this.load.image("bottom left corner", "/sprites/tiles/leftbottom.png");
          this.load.image("bottom edge", "/sprites/tiles/bottom.png");
          this.load.image("top edge", "/sprites/tiles/top.png");
          this.load.image("bottom dark edge", "/sprites/tiles/bottomdark.png");

          this.load.image("doorTex", "/sprites/tiles/door.png");
          this.load.image("door closed", "/sprites/tiles/doorclosed.png");

          this.load.image('key0', '/sprites/tiles/keyGif/key_0.png');
          this.load.image('key1', '/sprites/tiles/keyGif/key_1.png');
          this.load.image('key2', '/sprites/tiles/keyGif/key_2.png');
          this.load.image('key3', '/sprites/tiles/keyGif/key_3.png');

        }

        create() {
          // World & camera
          this.physics.world.setBounds(0, 0, this.levelWidth, this.levelHeight);
          this.cameras.main.setBounds(0, 0, this.levelWidth, this.levelHeight);
          // this.bg1 = this.add.tileSprite(0, 0, this.levelWidth, this.scale.height, "bgDark").setOrigin(0,0);
          // this.bg2 = this.add.tileSprite(0, 0, this.levelWidth, this.scale.height, "bgMid").setOrigin(0,0);
          // set custom background image (background)
          this.bg3 = this.add.tileSprite(0, 0, this.levelWidth, this.levelHeight, "background").setOrigin(0,0).setScrollFactor(0);


          // Player
            this.player = this.physics.add.sprite(120, 120, "player").setCollideWorldBounds(true);

            // Option A: force the same on-screen size as before (24×36) and match physics body to display size
            this.player.setDisplaySize(40, 40);
            this.player.setScale(1.1);
            this.player.body.setSize(this.player.displayWidth * 0.6, this.player.displayHeight * 0.9, true); // true => recenter body

            // (Optional) Slightly narrower body for nicer platforming feel:
            // this.player.body.setSize(this.player.displayWidth * 0.7, this.player.displayHeight, true);

            this.player.setMaxVelocity(450, 1200);
            this.player.setDragX(1800);


          // Attack hitbox
          this.attack = this.add.rectangle(0, 0, 48, 22, 0xffffff, 0.001);
          this.physics.add.existing(this.attack);
          this.attack.body.setAllowGravity(false);
          this.attack.body.setEnable(false);
          this.attack.setVisible(true);

          // Enemies group
          this.enemies = this.physics.add.group();

          // Treasure group 
          this.treasures = this.physics.add.group();

          // Key group
          this.keysDoors = this.physics.add.group();
          this.hasKey = false;
          this.hasCollectedKey = false;

          // Door group
          this.doors = this.physics.add.group();
          this.doorOpen = false;
          this.doorOpening = false;
          this.doorCloseTimer = 0;

          // hidden blocks / gates group
          this.hiddenPassages = this.physics.add.group();
          this.hiddenBlocks = this.physics.add.group();
          this.hasRevealedPassage = false;
          this.hasHitHiddenBlock = false;
          this.passageRevealedTimer = 0;
          this.hiddenBlockHitTimer = 0;
          // In create(): make a group and one overlap
          this.hiddenPassages = this.physics.add.group({ allowGravity: false, immovable: true });
          this.teleportLockMs = 0;

          this.physics.add.overlap(
            this.player,
            this.hiddenPassages,
            this.handleHiddenPassageOverlap,
            null,
            this
          );

          // Camera follow
          this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

          // Inputs
          this.cursors = this.input.keyboard.createCursorKeys();
          this.keys = this.input.keyboard.addKeys({
            A: Phaser.Input.Keyboard.KeyCodes.A,
            D: Phaser.Input.Keyboard.KeyCodes.D,
            W: Phaser.Input.Keyboard.KeyCodes.W,
            F: Phaser.Input.Keyboard.KeyCodes.F,
            SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE, // attack
            X: Phaser.Input.Keyboard.KeyCodes.X, // dash
            ONE:   Phaser.Input.Keyboard.KeyCodes.ONE, // switch weapon, primary
            TWO:   Phaser.Input.Keyboard.KeyCodes.TWO, // switch weapon, secondary
            THREE: Phaser.Input.Keyboard.KeyCodes.THREE, // switch weapon, tertiary
            // delete button, remove item from inventory
            DELETE: Phaser.Input.Keyboard.KeyCodes.DELETE,
            I:    Phaser.Input.Keyboard.KeyCodes.I, // inventory
            ENTER: Phaser.Input.Keyboard.KeyCodes.ENTER, // choose / confirm
            E:   Phaser.Input.Keyboard.KeyCodes.E, // interact / use
            // pause / menu
            ESC:   Phaser.Input.Keyboard.KeyCodes.ESC
          });

          // HUD
          this.hud = this.add.text(12, 12, "", { fontSize: 16, color: "#eaeaea" }).setScrollFactor(0);
          this.toast = this.add.text(12, 36, "", { fontSize: 14, color: "#a8e6cf" }).setScrollFactor(0);

          // Build map & colliders
          this.buildMapForDifficulty(this.difficulty);
          this.attachColliders();

          // Combat overlaps
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
              const coin = this.add.image(enemy.x, enemy.y - 10, "coinTex");
              this.tweens.add({ targets: coin, y: coin.y - 24, alpha: 0, duration: 450, onComplete: () => coin.destroy() });
              enemy.destroy();
            }
          });

          // Damage to player
          this.physics.add.overlap(this.player, this.enemies, () => {
            if (this.invulnTimer > 0) return;
            this.playerHP = Math.max(0, this.playerHP - 1);
            this.invulnTimer = 800;
            this.player.setTint(0xffe082);
            this.player.setVelocity(-this.facing * 240, -200);
            if (this.playerHP <= 0) this.gameOver();
          });

          // Start spawner
          this.setupSpawner();

          // ESC -> back to menu (keeps last score)
          this.input.keyboard.on("keydown-ESC", () => this.gameOver());
        }

        // ---------- Colliders mgmt ----------
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

        // ---------- Map building ----------
        
        buildMapForDifficulty(mode = "easy") {
          this.detachColliders();
          if (this.mapSolids) this.mapSolids.destroy(true);
          this.mapSolids = this.physics.add.staticGroup();
          this.allSpawnPoints = [];

          let ascii = this.cache.text.get("map_level1");
          if (!ascii) ascii = this.makeDefaultAscii(this.cols, this.rows, mode);
          ascii = this.fixAsciiToBounds(ascii, this.cols, this.rows);

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
                // testing purpose: use one texture sheet part for all blocks
                blk.setVisible(false);
                // this.add.image(x, y, 'sheet').setCrop(512 + 120, 96, 40, 40).setScale(1).setPosition(x-130, y+400);
                const offsetY = 0; // adjust based on your sheet layout
                const offsetX = 0; // adjust based on your sheet layout
                const scale = 0.5;    // adjust based on your sheet layout
                const scale2 = (0.7,0.6);
                
                // use texture sheet parts for blocks
                const left = (c === 0) || (line[c-1] !== "x");
                const right = (c === this.cols - 1) || (line[c+1] !== "x");
                const top = (r === 0) || (lines[r-1][c] !== "x");
                const bottom = (r === this.rows - 1) || (lines[r+1][c] !== "x");
                if (top && left)   this.add.image(x, y, "leftop left corner").setScale(scale2).setPosition(offsetX + x, offsetY + y);
                else if (top && right)  this.add.image(x, y, "top right corner").setScale(scale2).setPosition(offsetX + x, offsetY + y);
                else if (bottom && left) this.add.image(x, y, "bottom left corner").setScale(scale).setPosition(offsetX + x, offsetY + y);
                else if (bottom && right) this.add.image(x, y, "bottom right corner").setScale(scale).setPosition(offsetX + x, offsetY + y);
                else if (top) this.add.image(x, y, "top edge").setScale(scale2).setPosition(offsetX + x, offsetY + y);
                else if (bottom) this.add.image(x, y, "bottom dark edge").setScale(0.3).setPosition(offsetX + x, offsetY + y).setTint(0x777777);
                else {this.add.image(x, y, "bottom dark edge").setScale(0.3).setPosition(offsetX + x, offsetY + y).setTint(0x777777);};
              
                

                blk.refreshBody();
              } else if (ch === "S") {
                this.startPos = { x, y: y - 20 };
                foundS = true;
              } else if (ch === "E") {
                this.allSpawnPoints.push({ x, y: y - this.TILE * 2 });
              } else if (ch == "T") { // optional: treasure 
                this.trySpawnTreasure(x, y - 20);
              } else if (ch == "_") { // no ground, if collided with, spawn back to start and take 1 damage
                const killZone = this.mapSolids.create(x, y +30, null).setSize(this.TILE, this.TILE).setVisible(false);
                killZone.refreshBody();
                this.physics.add.overlap(this.player, killZone, () => this.respawnPlayer(), null, this);
                this.physics.add.overlap(this.enemies, killZone, (e) => e.destroy, null, this);
              } else if (ch == "K") { // key 
                this.trySpawnKey(x, y - 20);
              } else if (ch == "D") { //door
                this.trySpawnDoor(x, y);
              } else if (ch == "H") { // hidden block
                this.trySpawnHiddenPassage(x, y - 20);
            } else if (ch === "Q") { // hidden block
                this.trySpawnHiddenBlock(x, y - 20);
              }
            }
          }
          if (!foundS) this.startPos = { x: this.TILE * 2 + 20, y: this.TILE * 2 };
          if (this.allSpawnPoints.length === 0) this.allSpawnPoints.push({ x: this.levelWidth * 0.6, y: this.TILE * 3 });

          this.player.setPosition(this.startPos.x, this.startPos.y);
          this.player.setVelocity(0, 0);
        }

        fixAsciiToBounds(ascii, cols, rows) {
          const clean = ascii.replace(/\r/g, "");
          let raw = clean.split("\n").filter((_, i, arr) => !(i === arr.length - 1 && _ === ""));
          if (raw.length > rows) raw = raw.slice(raw.length - rows);
          else if (raw.length < rows) raw = new Array(rows - raw.length).fill(".".repeat(cols)).concat(raw);
          const fixed = raw.map(l => {
            const m = l.replace(/\t/g, " ");
            if (m.length > cols) return m.slice(0, cols);
            if (m.length < cols) return m + ".".repeat(cols - m.length);
            return m;
          });
          return fixed.join("\n");
        }

        makeDefaultAscii(cols, rows, mode) {
          const grid = Array.from({ length: rows }, () => Array(cols).fill("."));
          const H = (r, c1, c2) => { for (let c = Math.max(0,c1); c <= Math.min(cols-1,c2); c++) grid[r][c] = "x"; };
          H(rows-1, 0, cols-1); H(rows-2, 0, cols-1);
          H(rows-6, 10, Math.min(25, cols-1));
          H(rows-9, 35, Math.min(55, cols-1));
          H(rows-12, 60, Math.min(75, cols-1));
          H(rows-10, 2, 6);
          grid[rows-4][3] = "S";
          const addE = (c, r) => { if (r>=0 && r<rows && c>=0 && c<cols) grid[r][c] = "E"; };
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
          return grid.map(r => r.join("")).join("\n");
        }

        // ---------- Spawner ----------
        setupSpawner() {
          if (this.spawnEvent) { this.spawnEvent.remove(false); this.spawnEvent = null; }
          this.buildMapForDifficulty(this.difficulty);
          this.attachColliders();

          let spawnEvery = 1500;
          let numSpawnPoints = 1;
          this.maxAlive = 6;

          if (this.difficulty === "easy") { spawnEvery = 1800; numSpawnPoints = 1; this.maxAlive = 4; }
          else if (this.difficulty === "normal") { spawnEvery = 1200; numSpawnPoints = Math.min(2, this.allSpawnPoints.length); this.maxAlive = 8; }
          else { spawnEvery = 800; numSpawnPoints = Math.min(5, this.allSpawnPoints.length); this.maxAlive = 16; }

          this.activeSpawns = Phaser.Utils.Array.Shuffle([...this.allSpawnPoints]).slice(0, numSpawnPoints);
          this.toast.setText(`Mode: ${this.difficulty} — spawns: ${numSpawnPoints}`);
          this.time.delayedCall(1200, () => this.toast.setText(""));

          this.spawnEvent = this.time.addEvent({ delay: spawnEvery, loop: true, callback: this.trySpawnEnemy, callbackScope: this });
        }

        trySpawnEnemy() {
          if (this.enemies.countActive(true) >= this.maxAlive) return;
          const near = [...this.activeSpawns].sort((a,b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x));
          const choice = Phaser.Math.RND.pick(near.slice(0, Math.min(3, near.length)));
          const e = this.enemies.create(choice.x, choice.y, "enemyTex");
          e.setCollideWorldBounds(true).setBounce(0.1);
          e.body.setSize(24, 24);
          e.setVelocityX(Phaser.Math.Between(-100, 100));
          e.setData("hp", 2);
          e.setData("coin", 1);
        }
        
        // ---------- Treasure ----------
        trySpawnTreasure(x, y) {
          const t = this.treasures.create(x, y, "coinTex");
          t.body.setAllowGravity(false);
          this.physics.add.overlap(this.player, t, (p, treasure) => {
            // random amount between 1-5
            this.coins += Phaser.Math.Between(1, 5);
            const coin = this.add.image(treasure.x, treasure.y - 10, "coinTex");
            this.tweens.add({ targets: coin, y: coin.y - 24, alpha: 0, duration: 450, onComplete: () => coin.destroy() });
            treasure.destroy();
          }, null, this);
        }
        // ---------- Key ----------
        trySpawnKey(x, y) {
          const k = this.keysDoors.create(x, y, "keyTex").setVisible(false);
         
            // Make a looping animation that cycles through the 4 textures
          this.anims.create({
            key: 'key_spin',
            frames: [{ key: 'key0' }, { key: 'key1' }, { key: 'key2' }, { key: 'key3' }],
            frameRate: 10,   // adjust speed
            repeat: -1       // loop forever
          });

          // Physics group that can animate, but doesn’t fall
          this.keysGroup = this.physics.add.group({ allowGravity: false, immovable: true });

          // Spawn one (add as many as you need)
          const key1 = this.keysGroup.create(x, y, 'key0'); // use first frame as base
          key1.play('key_spin');
          key1.setScale(1.25);             // make bigger if you like

          // Player overlap → collect
          this.physics.add.overlap(this.player, this.keysGroup, (_player, key) => {
            this.keysCollected = (this.keysCollected || 0) + 1;
            key.disableBody(true, true);   // hide + remove from physics

            // tiny pop effect (optional)
            const pop = this.add.image(key.x, key.y, 'key0').setScale(1.4);
            this.tweens.add({ targets: pop, alpha: 0, y: pop.y - 10, duration: 200, onComplete: () => pop.destroy() });

            // update HUD if you track it
            this.hud?.setText?.(`Keys: ${this.keysCollected}`);
          });



          k.body.setAllowGravity(false);
          this.physics.add.overlap(this.player, k, (p, keyi) => {
            this.hasKey = true;
            this.hasCollectedKey = true;
            this.toast.setText("You got the key! Find the door.");
            this.time.delayedCall(2000, () => this.toast.setText(""));
            // const keyImages = this.children.getAll().filter(child =>
            //   child.texture && child.texture.key === "keyFlyAnim" && child.x === x && child.y === y
            // );
            // keyImages.forEach(img => img.setVisible(false));
            
            keyi.destroy();
          }, null, this);
        }
        // ---------- Door ----------
        trySpawnDoor(x, y) {
          const d = this.doors.create(x, y, "doorTex").setSize(this.TILE, this.TILE * 2);
          this.add.image(x, y - 10, "doorTex").setScale(1);
          const g = this.mapSolids.create(x, y, null).setSize(this.TILE, this.TILE * 2).setVisible(false);
          this.add.image(x, y - 10, "door closed").setScale(1);
          d.body.setAllowGravity(false);
          this.physics.add.overlap(this.player, d, (p, door) => {
            if (this.hasKey) {
              
              this.doorOpening = true;
              this.toast.setText("The door is opening...");
              this.mapSolids.remove(g, true, true);
              // hide image of closed door, show open door image
                const doorImages = this.children.getAll().filter(child =>
                child.texture && child.texture.key === "door closed" && child.x === x && child.y === y - 10
                );
                doorImages.forEach(img => img.setVisible(false));
              this.time.delayedCall(2000, () => {
                this.doorOpen = true;
                this.doorOpening = false;
                // this.add.image(x,y -10, "door closed").setScale(1);
                this.time.delayedCall(2000, () => this.toast.setText(""), this);
                door.destroy();
                this.hasKey = false;
              }, this);
            } else if (!this.hasKey) {
              // no key - block player and show message
              this.player.setVelocity(0, 0);
              this.player.body.blocked.right = false;
              this.player.body.blocked.left = false;
              this.physics.world.collide(this.player, door);
              door.body.immovable = true;
              door.body.moves = false;
              this.toast.setText("The door is locked. Find the key.");
              this.time.delayedCall(2000, () => this.toast.setText(""), this);
              
            } 
          }, null, this);
        }
        // Overlap handler (single place)
        handleHiddenPassageOverlap(player, passage) {
          if (this.teleportLockMs > 0) return;               // prevent instant re-trigger

          // All other active portals
          const exits = this.hiddenPassages
            .getChildren()
            .filter(obj => obj.active && obj !== passage);

          if (exits.length === 0) return;

          const dest = Phaser.Utils.Array.GetRandom(exits);

          // Move the player to the destination portal.
          // Nudge up a bit so you don't overlap its collider on the next frame.
          const offsetY = (player.body?.height ?? 0) * 0.6 + 2;
          player.setPosition(dest.x, dest.y - offsetY);

          // brief lock and toast
          this.teleportLockMs = 350;                         // ms
          this.toast?.setText?.("You found a hidden passage!");
          this.time.delayedCall(1200, () => this.toast?.setText?.(""));

          // If portals are one-time use, remove the entry:
          passage.destroy(true);
        }

        // hidden blocks / gates can be added similarly
        trySpawnHiddenPassage(x, y) {
          // when player hits hidden passage, portal him to a new random exit point (H) that is not the same as entry
          
          const p = this.hiddenPassages.create(x, y, "hiddenPassageTex");
          p.setImmovable(true);
          p.body.setAllowGravity(false);
          p.refreshBody();
          this.hasRevealedPassage = true;
          this.passageRevealedTimer = 3000;
          this.physics.add.collider(this.player, p);
          this.physics.add.overlap(this.player, p, this.handleHiddenPassageOverlap, null, this);

        }
        trySpawnHiddenBlock(x, y) {
          // when player hits hidden block from below, reveal a coin or treasure
          if (this.hasHitHiddenBlock) return;
          const b = this.hiddenBlocks.create(x, y, "hiddenBlockTex");
          b.body.setAllowGravity(false);
          this.hasHitHiddenBlock = true;
          this.hiddenBlockHitTimer = 3000;
          this.physics.add.collider(this.player, b, (pl, block) => {
            if (pl.body.blocked.up || pl.body.touching.up) {
              this.trySpawnTreasure(block.x, block.y - 30);
              this.toast.setText("You found a hidden treasure!");
              this.time.delayedCall(2000, () => this.toast.setText(""));
              block.destroy();
            }
          }, null, this);
        }
        // ---------- Destroy enemy safely ----------
        destroyEnemy(enemy) {
          // If enemy falls into a kill zone, remove it from physics and display immediately
          if (enemy && enemy.active) {
            enemy.disableBody(true, true);
            enemy.destroy();
          }
        }
        // ---------- Respawn / Game Over ----------
        respawnPlayer() {
          this.playerHP = Math.max(1, this.playerHP - 1);
          this.player.setPosition(this.startPos.x, this.startPos.y);
          this.player.setVelocity(0, 0);
          this.invulnTimer = 1500;
          this.player.setTint(0xffe082);
        }

        // ---------- Game Over ----------
        gameOver() {
          try {
            const last = this.coins | 0;
            const best = parseInt(localStorage.getItem("bk_bestScore") || "0", 10);
            localStorage.setItem("bk_lastScore", String(last));
            if (last > best) localStorage.setItem("bk_bestScore", String(last));
            localStorage.setItem("bk_difficulty", this.difficulty);
          } catch (e) {}

          if (this.spawnEvent) { this.spawnEvent.remove(false); this.spawnEvent = null; }
          this.detachColliders?.();
          this.enemies?.clear(true, true);
          this.scene.start("Menu", { lastScore: this.coins, difficulty: this.difficulty, fromGameOver: true });
        }

        // ---------- Helpers ----------
        justDown(key) { return !!(key && Phaser.Input.Keyboard.JustDown(key)); }
        isDown(key)   { return !!(key && key.isDown); }

        update(_time, delta) {
          const dt = delta;
          // this.bg1.tilePositionX = this.cameras.main.scrollX * 0.3;
          // this.bg2.tilePositionX = this.cameras.main.scrollX * 0.6;
          this.bg3.tilePositionX = this.cameras.main.scrollX * 0.2;
          this.bg3.scaleY = 1.2 + (this.cameras.main.scrollY / this.levelHeight) * 0.3;

          this.dashCooldown = Math.max(0, this.dashCooldown - dt);
          this.dashTimer = Math.max(0, this.dashTimer - dt);
          this.invulnTimer = Math.max(0, this.invulnTimer - dt);
          if (this.invulnTimer === 0) this.player.clearTint();

          const left = this.isDown(this.cursors?.left)  || this.isDown(this.keys?.A);
          const right= this.isDown(this.cursors?.right) || this.isDown(this.keys?.D);
          const onGround = this.player.body.blocked?.down || this.player.body.touching?.down;

          // In update(time, delta): count down the cooldown
          if (this.teleportLockMs > 0) this.teleportLockMs = Math.max(0, this.teleportLockMs - delta);


          // Move
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

          // Jump / double jump
          const jumpPressed = this.justDown(this.cursors?.up) || this.justDown(this.keys?.W);
          if (jumpPressed) {
            if (onGround) { this.jumpCount = 1; this.player.setVelocityY(-470); }
            else if (this.jumpCount < this.maxJumps) { this.jumpCount++; this.player.setVelocityY(-450); }
          }

          // Dash
          if (this.justDown(this.keys?.X) && this.dashCooldown === 0) {
            const dashV = 680 * this.facing;
            this.player.setVelocityX(dashV);
            this.dashTimer = 140;
            this.dashCooldown = 500;
          }

          // Attack (use your active key here; you fixed earlier)
          if (this.justDown(this.keys?.SPACE)) {
            if (this.dashTimer > 0) return; // no attacking while dashing
            // show hitbox briefly
            const px = this.player.x + this.facing * 30;
            const py = this.player.y + 2;
            this.attack.setPosition(px, py);
            this.attack.body.setEnable(true);
            this.attack.setVisible(true);
            this.time.delayedCall(120, () => { this.attack.body.setEnable(false); this.attack.setVisible(true); });
          }

          // F key, TODO
          if (this.justDown(this.keys?.F)) {
            // future: switch weapon
            
          }
          // Inventory key, TODO
          if (this.justDown(this.keys?.I)) {
            // future: open inventory
          }
          // Delete key, TODO
          if (this.justDown(this.keys?.DELETE)) {
            // future: remove item from inventory
          }
          // Enter key, TODO
          if (this.justDown(this.keys?.ENTER)) {
            // future: choose / confirm
          }
          if (this.justDown(this.keys?.E)){
            // future: interact / use
          }
          if (this.justDown(this.keys?.ONE || this.keys?.TWO || this.keys?.THREE)){
            // future: switch weapon
          }
          if (this.justDown(this.keys?.ESC)){
            // future: pause / menu
          }

          // check if enemys touches groundFloor (falling off map)
          this.enemies.getChildren().forEach(e => {
            if (e.y >= this.groundFloorY + 60) this.destroyEnemy(e);
          });
          // HUD
          const hearts = "❤".repeat(this.playerHP) + "·".repeat(this.playerMaxHP - this.playerHP);
          this.hud.setText(
            `HP ${hearts}   Coins: ${this.coins}   Mode: ${this.difficulty.toUpperCase()}   ` +
            `Map: ${this.cols}×${this.rows} @ ${this.TILE}px`
          );
        }
      }

      // --------------------------- Game Config ---------------------------
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
        pixelArt: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, expandParent: false },
        // Important: Menu is first → boots into Menu by default
        scene: [MenuScene, MainScene]
      };

      if (containerRef.current && !destroyed) game = new Phaser.Game(config);
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
        boxShadow: "0 12px 30px rgba(0,0,0,.35)"
      }}
    />
  );
}
