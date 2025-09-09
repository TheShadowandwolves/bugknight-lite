// scenes/MapBuilder.js
import Phaser from "phaser";

/**
 * Level-based ASCII map builder, reusable across scenes.
 * - Loads /maps/level{N}.txt by default (key: "map_level{N}")
 * - Falls back to a procedural map if the text isn’t present
 * - Handles decorative tiles, start S, spawns E, boss gates B, keys/doors/etc via callbacks
 *
 * Usage:
 *   MapBuilder.preload(scene, { levels: [1] });
 *   MapBuilder.build(scene, { level: 1, tile: 40, cols: scene.cols, rows: scene.rows, on: { ...callbacks }});
 */
export const MapBuilder = {
  // ---------- Preload ----------
  preload(scene, { levels = [], extraTextKeys = [], withTiles = true } = {}) {
    // load level text files (if given)
    for (const L of levels) {
      scene.load.text(`map_level${L}`, `/maps/level${L}.txt`);
    }
    // allow arbitrary map text keys too (e.g., "boss_map")
    for (const key of extraTextKeys) {
      // caller must have scene.load.text(key, "/maps/whatever.txt") elsewhere if needed
      // This is a noop helper; kept for symmetry.
    }

    if (!withTiles) return;

    // Decorative tile images (dedupe-safe: Phaser ignores duplicates)
    scene.load.image("top right corner", "/sprites/tiles/righttop.png");
    scene.load.image("leftop left corner", "/sprites/tiles/lefttop.png");
    scene.load.image("bottom right corner", "/sprites/tiles/rightbottom.png");
    scene.load.image("bottom left corner", "/sprites/tiles/leftbottom.png");
    scene.load.image("bottom edge", "/sprites/tiles/bottom.png");
    scene.load.image("top edge", "/sprites/tiles/top.png");
    scene.load.image("bottom dark edge", "/sprites/tiles/bottomdark.png");

    // Basic block texture in case no atlas
    if (!scene.textures.exists("blockTex")) {
      const g = scene.add.graphics();
      const T = (scene.TILE || 40);
      g.fillStyle(0x3a3d46, 1).fillRect(0, 0, T, T).generateTexture("blockTex", T, T).destroy();
    }
  },

  // ---------- Build ----------
  build(scene, {
    level = 1,
    sourceKey = null,            // if provided, use this cache key instead of "map_level{level}"
    tile = 40,
    cols = null,
    rows = null,
    on = {}
  } = {}) {
    // Prepare groups/state
    scene.detachColliders?.();
    if (scene.mapSolids) scene.mapSolids.destroy(true);
    scene.mapSolids = scene.physics.add.staticGroup();
    scene.allSpawnPoints = scene.allSpawnPoints || [];
    scene.allSpawnPoints.length = 0;

    scene.TILE = tile || scene.TILE || 40;

    // Get ASCII
    const key = sourceKey || `map_level${level}`;
    scene.currentMapKey = key; // used by your boss-gate tracking

    let ascii = scene.cache.text.get(key);
    if (!ascii) {
      // fallback procedural
      const dims = this._guessDims(cols, rows, scene);
      ascii = this.makeDefaultAscii(dims.cols, dims.rows);
    }

    // Normalize size (if cols/rows provided, clamp; else derive them)
    let fixed;
    if (cols && rows) {
      fixed = this.fixAsciiToBounds(ascii, cols, rows);
      scene.cols = cols; scene.rows = rows;
    } else {
      const rawLines = ascii.replace(/\r/g, "").split("\n").filter(Boolean);
      scene.rows = rawLines.length;
      scene.cols = Math.max(...rawLines.map(l => l.length));
      fixed = this.fixAsciiToBounds(ascii, scene.cols, scene.rows);
    }

    const lines = fixed.split("\n");
    scene.levelWidth = scene.cols * scene.TILE;
    scene.levelHeight = scene.rows * scene.TILE;

    // Build
    let foundS = false;
    let gateCounter = 0;

    for (let r = 0; r < scene.rows; r++) {
      const y = r * scene.TILE + scene.TILE / 2;
      const line = lines[r] || "";
      for (let c = 0; c < scene.cols; c++) {
        const ch = line[c] || ".";
        const x = c * scene.TILE + scene.TILE / 2;

        if (ch === "x") {
          // Solid block + decorative edges
          const blk = scene.mapSolids.create(x, y, "blockTex");
          blk.setVisible(false);
          blk.refreshBody();
          // Edges
          const left   = (c === 0) || (line[c-1] !== "x");
          const right  = (c === scene.cols - 1) || (line[c+1] !== "x");
          const top    = (r === 0) || ((lines[r-1] || "")[c] !== "x");
          const bottom = (r === scene.rows - 1) || ((lines[r+1] || "")[c] !== "x");

          const scaleCorner = 0.6;
          const scaleTopEdge = 0.6;
          const scaleBottomEdge = 0.3;

          if (top && left)         scene.add.image(x, y, "leftop left corner").setScale(scaleCorner);
          else if (top && right)   scene.add.image(x, y, "top right corner").setScale(scaleCorner);
          else if (bottom && left) scene.add.image(x, y, "bottom left corner").setScale(scaleCorner * 0.9);
          else if (bottom && right)scene.add.image(x, y, "bottom right corner").setScale(scaleCorner * 0.9);
          else if (top)            scene.add.image(x, y, "top edge").setScale(scaleTopEdge);
          else if (bottom)         scene.add.image(x, y, "bottom dark edge").setScale(scaleBottomEdge).setTint(0x777777);
          else                     scene.add.image(x, y, "bottom dark edge").setScale(scaleBottomEdge).setTint(0x777777);
        }
        else if (ch === "S") {
          scene.startPos = { x, y: y - 20 };
          foundS = true;
          on.onStart?.(x, y - 20, c, r);
        }
        else if (ch === "E") {
          scene.allSpawnPoints.push({ x, y: y - scene.TILE * 2 });
          on.onSpawn?.(x, y - scene.TILE * 2, c, r);
        }
        else if (ch === "K") {
          if (on.onKey) on.onKey(x, y - 20, c, r);
          else if (scene.trySpawnKey) scene.trySpawnKey(x, y - 20);
        }
        else if (ch === "D") {
          if (on.onDoor) on.onDoor(x, y, c, r);
          else if (scene.trySpawnDoor) scene.trySpawnDoor(x, y);
        }
        else if (ch === "H") {
          if (on.onHiddenPassage) on.onHiddenPassage(x, y - 20, c, r);
          else if (scene.trySpawnHiddenPassage) scene.trySpawnHiddenPassage(x, y - 20);
        }
        else if (ch === "Q") {
          if (on.onHiddenBlock) on.onHiddenBlock(x, y - 20, c, r);
          else if (scene.trySpawnHiddenBlock) scene.trySpawnHiddenBlock(x, y - 20);
        }
        else if (ch === "_") {
          if (on.onKillZone) on.onKillZone(x, y + 30, c, r);
          else {
            const killZone = scene.mapSolids.create(x, y + 30, null).setSize(scene.TILE, scene.TILE).setVisible(false);
            killZone.refreshBody();
            if (scene.player) scene.physics.add.overlap(scene.player, killZone, () => scene.respawnPlayer?.(), null, scene);
            if (scene.enemies) scene.physics.add.overlap(scene.enemies, killZone, (e) => e.destroy?.(), null, scene);
          }
        }
        else if (ch === "B") {
          // Boss marker.
          if (on.onBossGate) {
            on.onBossGate(x, y, c, r, gateCounter++);
          } else if (on.onBossMarker) {
            on.onBossMarker(x, y, c, r);
          } else {
            // default: treat as boss spawn marker (for boss arenas)
            scene.bossSpawn = { x, y: y - 20 };
          }
        }
      }
    }

    if (!foundS) scene.startPos = { x: scene.TILE * 2 + 20, y: scene.TILE * 2 };
    if ((scene.allSpawnPoints?.length || 0) === 0) {
      scene.allSpawnPoints.push({ x: scene.levelWidth * 0.6, y: scene.TILE * 3 });
    }

    // Place player at start by default (caller can override after)
    if (scene.player) {
      scene.player.setPosition(scene.startPos.x, scene.startPos.y);
      scene.player.setVelocity(0, 0);
    }

    return { cols: scene.cols, rows: scene.rows, width: scene.levelWidth, height: scene.levelHeight, key };
  },

  // ---------- Utils ----------
  fixAsciiToBounds(ascii, cols, rows) {
    const clean = ascii.replace(/\r/g, "");
    let raw = clean.split("\n").filter(l => l.length > 0);
    if (raw.length > rows) raw = raw.slice(raw.length - rows);
    else if (raw.length < rows) raw = new Array(rows - raw.length).fill(".".repeat(cols)).concat(raw);
    const fixed = raw.map(l => {
      const m = l.replace(/\t/g, " ");
      if (m.length > cols) return m.slice(0, cols);
      if (m.length < cols) return m + ".".repeat(cols - m.length);
      return m;
    });
    return fixed.join("\n");
  },

  makeDefaultAscii(cols, rows) {
    // Simple neutral layout (independent of difficulty)
    const grid = Array.from({ length: rows }, () => Array(cols).fill("."));
    const H = (r, c1, c2) => { for (let c = Math.max(0,c1); c <= Math.min(cols-1,c2); c++) grid[r][c] = "x"; };
    // ground
    H(rows-1, 0, cols-1); H(rows-2, 0, cols-1);
    // ledges
    H(rows-6, 10, Math.min(25, cols-1));
    H(rows-9, 35, Math.min(55, cols-1));
    H(rows-12, 60, Math.min(75, cols-1));
    H(rows-10, 2, 6);
    // start + a couple spawns
    grid[rows-4][3] = "S";
    const addE = (c, r) => { if (r>=0 && r<rows && c>=0 && c<cols) grid[r][c] = "E"; };
    addE(Math.floor(cols * 0.45), rows - 7);
    addE(Math.floor(cols * 0.70), rows - 10);
    return grid.map(r => r.join("")).join("\n");
  },

  _guessDims(cols, rows, scene) {
    // Helper when caller didn't pass cols/rows
    const TILE = scene?.TILE || 40;
    const W = scene?.levelWidth  || 6400;
    const H = scene?.levelHeight || 3600;
    return { cols: cols ?? Math.max(20, Math.floor(W / TILE)), rows: rows ?? Math.max(12, Math.floor(H / TILE)) };
  }
};

export default MapBuilder;
