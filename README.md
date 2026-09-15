# portfolio

## Cursor creature

An organic, cursor-following entity (snake / centipede style) rendered on a
single transparent overlay canvas (`pointer-events: none`). Two implementations
ship, and exactly one is ever active:

1. **`cursor-creature-three.js` — Three.js / WebGL (primary).** The head is a
   spring-damper chasing the pointer; each body segment follows the one in
   front with its own lag; the body is an additively-blended vertex-coloured
   ribbon with a glowing core line; ten spider legs (`legs.count`) walk with
   a real stepping gait — each hip is glued to a body segment (front to back:
   `legs.anchorIndices`), each foot is planted in world space until the body
   drifts too far, then the leg takes an eased swing step (`legs.stride`,
   `legs.stepDuration`, `legs.overshoot`), with a per-frame budget
   (`legs.maxSwinging`) so only a couple of feet leave the ground at once;
   knees are solved with two-bone IK (`legs.upperRatio`, `legs.lowerRatio`)
   and every foot ends in a glowing tip sprite that swells mid-step; the
   body bounces subtly with the gait (gait bob) and sways sideways only when
   moving; the head lens rotates with a damped, velocity-based angle;
   layered-sine noise drives idle wiggling.
2. **`cursor-creature.js` — 2D canvas (fallback).** Same physics, drawn with
   the 2D API. Used automatically when `THREE` is missing or a
   `WebGLRenderer` cannot be created (blocked GPU, exhausted contexts…).

The 3D module owns auto-init and the reduced-motion watcher and falls back to
the 2D module itself, so the two never run together. Both auto-initialise on
page load unless:

- the user prefers reduced motion, or
- `<body data-cursor-creature="off">` (or `<html>`) is set.

**No residue:** both renderers clear their framebuffer fully every frame.
Earlier builds faded the previous frame with `destination-out` + additive
blending, whose residue never reached zero — fast movement burned permanent
white streaks onto the page. Trails now come solely from pooled particles
whose alpha decays with their remaining life, so nothing can accumulate.

### API

```js
// Three.js creature (auto-created on load when WebGL is available)
const creature = window.CursorCreature3D.init({ segmentCount: 30 })
creature.setOptions({ legs: { count: 10, reach: 54, anchorIndices: [2, 4, 6, 8, 10] } })
creature.destroy()

// 2D fallback creature (auto-created only when WebGL is unavailable)
const legacy = window.CursorCreature.init({ segmentCount: 30 })
legacy.destroy()

// container-scoped instance (coordinates are local to the element)
window.CursorCreature3D.init({ container: document.querySelector(".hero") })
```

### Notable options (see `DEFAULTS` in each file)

| Option | Default | Meaning |
| --- | --- | --- |
| `segmentCount` | `26` | Body segments (the "joints") |
| `follow` / `followFalloff` | `130` / `0.985` | How tightly the tail chases the neck |
| `headStiffness` / `headDamping` | `30` / `8.2` | Spring + inertia of the head |
| `band.max` | `1.5` | Max bone stretch while moving fast |
| `stretch.max` / `stretch.speedRef` | `1.35` / `1150` | Velocity-driven body elongation (3D) |
| `legs.count` | `10` | Spider legs (5 per side), staggered phases (3D) |
| `legs.anchorIndices` | `[2, 4, 6, 8, 10]` | Body segments the hips are glued to, front to back (3D) |
| `legs.reach` / `legs.stride` | `54` / `18` | Leg reach and the drift that triggers a step (3D) |
| `legs.upperRatio` / `legs.lowerRatio` | `0.5` / `0.6` | Two-bone IK proportions (3D) |
| `legs.stepDuration` / `legs.maxSwinging` | `0.16` / `2` | Swing speed and concurrent-steps budget (3D) |
| `legs.idleWiggle` | `6` | Subtle foot shake while planted and idle (3D) |
| `legs.tipGlow` | `13` | Size of the glowing foot sprite, swells mid-step (3D) |
| `stretch.min` | `0.96` | Idle body compression floor — keeps the body from curling when still (3D) |
| `wiggle.settle` | `1.1` | Idle wiggle amplitude after the pointer rests — keeps the body from curling (3D) |
| `particles.max` | `160` / `150` | Desktop trail particle pool (fewer on touch) |
| `pixelRatioCap` | `1.7` | Max device-pixel ratio for the WebGL buffer (3D) |
| `touchIdleHide` | `1400` | Hide the creature this long after the last touch |

Motion is frame-rate independent (damping expressed per second), the RAF loop
pauses when the tab is hidden, and colors come from the site tokens
(`--accent`, `--accent-2`, `--accent-3`, `--text`) so the creature always
matches the theme.
