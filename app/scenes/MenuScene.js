// scenes/MenuScene.js
import Phaser from "phaser";

export default class MenuScene extends Phaser.Scene {
    constructor() { super("Menu"); }
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

  init(data) {
    this.lastScore = typeof data?.lastScore === "number"
      ? data.lastScore
      : parseInt(this.safeGet("bk_lastScore", "0"), 10);

    this.bestScore = parseInt(this.safeGet("bk_bestScore", "0"), 10);
    const savedDiff = this.safeGet("bk_difficulty");
    this.difficulty = (data?.difficulty || savedDiff || "easy");
    this.options = ["Play", "Score", "Settings"];
    this.selectedIndex = 0;
    this.scorePanelVisible = false;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(0, 0, w * 2, h * 2, 0x0b0d12).setOrigin(0);
    this.add.text(w/2, 90, "BUG KNIGHT LITE", { fontSize: 42, color: "#eaeaea" }).setOrigin(0.5);

    this.menuTexts = this.options.map((label, i) => {
      const txt = this.add.text(w/2, 200 + i * 48, label, { fontSize: 28, color: "#bdbdbd" })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => { this.selectedIndex = i; this.refreshMenu(); })
        .on("pointerdown", () => this.activateSelection());
      return txt;
    });

    this.diffText = this.add.text(w/2, 200 + 2 * 48 + 34, "", { fontSize: 18, color: "#9ecfff" }).setOrigin(0.5);
    this.add.text(w/2, h - 40, "↑/↓ select • Enter confirm • ←/→ change in Settings",
      { fontSize: 14, color: "#7e8a9a" }).setOrigin(0.5);

    this.scorePanel = this.add.container(w/2, 200 + 1 * 48 + 90);
    const panelBg = this.add.rectangle(0, 0, 380, 120, 0x121723, 0.95).setStrokeStyle(1, 0x2b3a55);
    this.lastText = this.add.text(0, -20, `Last: ${this.lastScore}`, { fontSize: 20, color: "#eaeaea" }).setOrigin(0.5);
    this.bestText = this.add.text(0, 16, `Best: ${this.bestScore}`, { fontSize: 20, color: "#ffd54f" }).setOrigin(0.5);
    this.scorePanel.add([panelBg, this.lastText, this.bestText]).setVisible(false);

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
    if (this.scorePanelVisible) {
    const last = this.safeGetInt("bk_lastScore", this.lastScore || 0);
    const best = this.safeGetInt("bk_bestScore", this.bestScore || 0);
      this.lastText.setText(`Last: ${last}`);
      this.bestText.setText(`Best: ${best}`);
    }
  }

  activateSelection() {
    const label = this.options[this.selectedIndex];
    if (label === "Play") {
      this.safeSet("bk_difficulty", this.difficulty);
      this.scene.start("MainScene", { difficulty: this.difficulty });
    } else if (label === "Score") {
      this.toggleScorePanel(true);
    } else if (label === "Settings") {
      this.difficulty = (this.difficulty === "easy") ? "normal"
                    : (this.difficulty === "normal") ? "hard" : "easy";
      this.safeSet("bk_difficulty", this.difficulty);
      this.refreshMenu();
    }
  }

  update() {
    if (this.justDown(this.cursors?.up) || this.justDown(this.keys?.W)) {
      this.selectedIndex = (this.selectedIndex + this.options.length - 1) % this.options.length;
      this.refreshMenu(); this.toggleScorePanel(false);
    }
    if (this.justDown(this.cursors?.down) || this.justDown(this.keys?.S)) {
      this.selectedIndex = (this.selectedIndex + 1) % this.options.length;
      this.refreshMenu(); this.toggleScorePanel(false);
    }
    if (this.justDown(this.keys?.ENTER) || this.justDown(this.keys?.SPACE)) {
      this.activateSelection();
    }
    if (this.selectedIndex === 2) { // Settings
      if (this.justDown(this.cursors?.left) || this.justDown(this.keys?.A)) {
        this.difficulty = (this.difficulty === "hard") ? "normal"
                      : (this.difficulty === "normal") ? "easy" : "hard";
        this.safeSet("bk_difficulty", this.difficulty);
        this.refreshMenu();
      }
      if (this.justDown(this.cursors?.right) || this.justDown(this.keys?.D)) {
        this.difficulty = (this.difficulty === "easy") ? "normal"
                      : (this.difficulty === "normal") ? "hard" : "easy";
        this.safeSet("bk_difficulty", this.difficulty);
        this.refreshMenu();
      }
    }
  }
}
