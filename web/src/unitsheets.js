// DIBUAT OTOMATIS oleh tools/sprites/build_units.py, jangan diedit tangan.
// Ukuran frame, titik jangkar (kaki), dan animasi sprite knight/hog/snake.
export const UNIT_SHEETS = {
  "knight": {
    "fw": 212,
    "fh": 104,
    "anchor": [
      81,
      100
    ],
    "anims": {
      "walkDown": {
        "file": "ts/units/knight-walkDown.png",
        "frames": 7,
        "fps": 10,
        "repeat": -1
      },
      "walkUp": {
        "file": "ts/units/knight-walkUp.png",
        "frames": 7,
        "fps": 10,
        "repeat": -1
      },
      "throwShield": {
        "file": "ts/units/knight-throwShield.png",
        "frames": 4,
        "fps": 14,
        "repeat": 0
      },
      "noShield": {
        "file": "ts/units/knight-noShield.png",
        "frames": 2,
        "fps": 4,
        "repeat": -1
      },
      "throwSword": {
        "file": "ts/units/knight-throwSword.png",
        "frames": 4,
        "fps": 14,
        "repeat": 0
      },
      "noSword": {
        "file": "ts/units/knight-noSword.png",
        "frames": 2,
        "fps": 4,
        "repeat": -1
      },
      "fire": {
        "file": "ts/units/knight-fire.png",
        "frames": 3,
        "fps": 9,
        "repeat": 0
      }
    },
    "extra": {
      "shieldSpin": {
        "file": "ts/units/knight-shieldSpin.png",
        "w": 94,
        "h": 77
      },
      "swordFly": {
        "file": "ts/units/knight-swordFly.png",
        "w": 76,
        "h": 46
      }
    }
  },
  "hog": {
    "fw": 180,
    "fh": 136,
    "anchor": [
      103,
      134
    ],
    "anims": {
      "idle": {
        "file": "ts/units/hog-idle.png",
        "frames": 7,
        "fps": 8,
        "repeat": -1
      },
      "run": {
        "file": "ts/units/hog-run.png",
        "frames": 6,
        "fps": 12,
        "repeat": -1
      },
      "swipe": {
        "file": "ts/units/hog-swipe.png",
        "frames": 6,
        "fps": 12,
        "repeat": 0
      },
      "charge": {
        "file": "ts/units/hog-charge.png",
        "frames": 6,
        "fps": 12,
        "repeat": 0
      },
      "spin": {
        "file": "ts/units/hog-spin.png",
        "frames": 6,
        "fps": 12,
        "repeat": 0
      }
    },
    "extra": {}
  },
  "snake": {
    "fw": 168,
    "fh": 122,
    "anchor": [
      75,
      112
    ],
    "anims": {
      "idle": {
        "file": "ts/units/snake-idle.png",
        "frames": 7,
        "fps": 8,
        "repeat": -1
      },
      "move": {
        "file": "ts/units/snake-move.png",
        "frames": 6,
        "fps": 10,
        "repeat": -1
      },
      "spit": {
        "file": "ts/units/snake-spit.png",
        "frames": 6,
        "fps": 10,
        "repeat": 0
      },
      "bite": {
        "file": "ts/units/snake-bite.png",
        "frames": 6,
        "fps": 12,
        "repeat": 0
      },
      "vanish": {
        "file": "ts/units/snake-vanish.png",
        "frames": 3,
        "fps": 10,
        "repeat": 0
      }
    },
    "extra": {
      "poison": {
        "file": "ts/units/snake-poison.png",
        "w": 63,
        "h": 40
      }
    }
  }
};
