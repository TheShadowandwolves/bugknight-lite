// scenes/PauseMenuScene.js
import Phaser from "phaser";

export default class PauseMenuScene extends Phaser.Scene {
  constructor() { super("PauseMenu"); }

  init(data) {
    this.from = data?.from || "MainScene";           // which scene paused us
    this.score = (data?.score | 0) ?? 0;             // current score/coins
    this.difficulty = data?.difficulty || "easy";
    this.options = ["Resume", "Restart", "Main Menu"];
    this.selected = 0;
  }

  create() {
    const w = this.scale.width, h = this.scale.height;

    // Dark overlay
    this.add.rectangle(0, 0, w * 2, h * 2, 0x000000, 0.55).setOrigin(0);

    // Panel
    this.add.text(w/2, h/2 - 110, "PAUSED", { fontSize: 38, color: "#eaeaea" }).setOrigin(0.5);
    this.add.text(w/2, h/2 - 70, `Score: ${this.score} • Difficulty: ${this.difficulty.toUpperCase()}`, { fontSize: 18, color: "#9ecfff" }).setOrigin(0.5);

    // Menu entries
    this.items = this.options.map((label, i) => {
      const t = this.add.text(w/2, h/2 - 5 + i * 40, label, { fontSize: 26, color: "#bdbdbd" })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => { this.selected = i; this.refresh(); })
        .on("pointerdown", () => this.activate());
      return t;
    });
    this.refresh();

    // Hint
    this.add.text(w/2, h - 36, "ESC: Resume • Enter: Select • ↑/↓: Navigate", { fontSize: 14, color: "#7e8a9a" }).setOrigin(0.5);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      ENTER: Phaser.Input.Keyboard.KeyCodes.ENTER,
      SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
      ESC: Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    // Bring this scene above others just in case
    this.scene.bringToTop();
  }

  justDown(k) { return !!(k && Phaser.Input.Keyboard.JustDown(k)); }
  safeGetInt(key, fb = 0) { try { const v = localStorage.getItem(key); const n = parseInt(v, 10); return Number.isFinite(n) ? n : fb; } catch { return fb; } }
  safeSet(key, v) { try { localStorage.setItem(key, v); } catch {} }

  refresh() {
    this.items.forEach((t, i) => {
      const active = i === this.selected;
      t.setColor(active ? "#eaeaea" : "#bdbdbd").setScale(active ? 1.08 : 1.0);
    });
  }

  activate() {
    const choice = this.options[this.selected];
    if (choice === "Resume") {
      this.scene.resume(this.from);
      this.scene.stop(); // close Pause
    } else if (choice === "Restart") {
      // stop paused scene -> start fresh
      this.scene.stop(this.from);
      this.scene.stop(); // close Pause
      this.scene.start(this.from, { difficulty: this.difficulty });
    } else if (choice === "Main Menu") {
      // store last/best score (optional but nice)
      const best = this.safeGetInt("bk_bestScore", 0);
      this.safeSet("bk_lastScore", String(this.score));
      if (this.score > best) this.safeSet("bk_bestScore", String(this.score));
      this.safeSet("bk_difficulty", this.difficulty);

      this.scene.stop(this.from);
      this.scene.stop(); // close Pause
      this.scene.start("Menu", { lastScore: this.score, difficulty: this.difficulty });
    }
  }

  update() {
    if (this.justDown(this.keys?.ESC)) this.activate(); // Resume on ESC
    if (this.justDown(this.cursors?.up) || this.justDown(this.keys?.W)) {
      this.selected = (this.selected + this.options.length - 1) % this.options.length; this.refresh();
    }
    if (this.justDown(this.cursors?.down) || this.justDown(this.keys?.S)) {
      this.selected = (this.selected + 1) % this.options.length; this.refresh();
    }
    if (this.justDown(this.keys?.ENTER) || this.justDown(this.keys?.SPACE)) this.activate();
  }
}
