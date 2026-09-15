/**
 * cursor-creature-three.js
 * ---------------------------------------------------------------------------
 * Three.js version of the organic cursor-following creature for the KIN
 * portfolio. Supersedes the 2D canvas version (cursor-creature.js).
 *
 * Rendering model (no accumulation -> no comet-style white residue):
 *   - A WebGL renderer that clears the framebuffer every frame. Nothing is
 *     ever persisted on screen, so fast movement can only ever leave the
 *     short, fading trail produced by the particle pool — never a smear.
 *   - The body is an additively-blended ribbon (BufferGeometry updated per
 *     frame) + a thin glowing core line.
 *   - Side legs radiate from the body segments like a crawling arthropod.
 *     Each leg has its own phase, damping, reach, stride, and step budget so
 *     the gait reads as crawling instead of synchronized flailing.
 *
 * Motion model:
 *   - The head is a spring-damper chasing the pointer (inertia + delay).
 *   - Each body segment follows the segment in front of it with its own lag,
 *     distance clamped into a band so fast flicks stretch the body without
 *     unspooling it.
 *   - Layered-sine noise drives idle wiggling; the head lens rotates with a
 *     damped, velocity-based angle.
 *
 * Requires the global THREE build (three.min.js) loaded beforehand. Uses one
 * canvas with the same overlay CSS class as the 2D version.
 *
 * Usage
 *   const creature = window.CursorCreature3D.init({ segmentCount: 30 })
 *   creature.setOptions({ legs: { count: 10 } })
 *   creature.destroy()
 *
 * Container scoped:
 *   window.CursorCreature3D.init({ container: document.querySelector(".hero") })
 *
 * Auto-initialises on DOMContentLoaded unless disabled with
 * data-cursor-creature="off" on <body>/<html>, skipped under
 * prefers-reduced-motion, and no-ops if WebGL is unavailable.
 * ---------------------------------------------------------------------------
 */
;(function (root, factory) {
	const api = factory()
	if (typeof module === "object" && module.exports) module.exports = api
	if (!root) return
	root.CursorCreature3D = api
	if (root.document) {
		if (root.document.readyState === "loading") {
			root.document.addEventListener("DOMContentLoaded", api.autoInit, { once: true })
		} else {
			api.autoInit()
		}
	}
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
	"use strict"

	/* =====================================================================
	   Math helpers. Decay is expressed per second: 1 - exp(-lambda * dt),
	   so motion feels identical at any refresh rate.
	   ===================================================================== */
	const TWO_PI = Math.PI * 2

	/* lerpRange([min, max], t) — pick a value inside a 2-entry range. */
	function lerpRange(range, t) {
		if (!Array.isArray(range)) return range
		return lerp(range[0], range[1], t)
	}

	const clamp = (value, min, max) => (value < min ? min : value > max ? max : value)
	const lerp = (start, end, amount) => start + (end - start) * amount
	const damp = (current, target, lambda, delta) =>
		lerp(current, target, 1 - Math.exp(-lambda * delta))
	const dampAngle = (current, target, lambda, delta) => {
		let difference = (target - current + Math.PI) % TWO_PI
		if (difference < 0) difference += TWO_PI
		difference -= Math.PI
		return current + difference * (1 - Math.exp(-lambda * delta))
	}
	/* Layered sine "noise": smooth, deterministic and allocation-free. */
	const wave = (time, phase) =>
		Math.sin(time) * 0.68 + Math.sin(time * 1.73 + phase * 1.9) * 0.32

	const isPlainObject = (value) =>
		Boolean(value) && typeof value === "object" && !Array.isArray(value)

	const merge = (base, override) => {
		const output = {}
		Object.keys(base).forEach((key) => {
			output[key] = isPlainObject(base[key]) ? Object.assign({}, base[key]) : base[key]
		})
		if (!override) return output
		Object.keys(override).forEach((key) => {
			const value = override[key]
			if (value === undefined) return
			output[key] =
				isPlainObject(value) && isPlainObject(output[key])
					? Object.assign({}, output[key], value)
					: value
		})
		return output
	}

	const readCssColor = (name, fallback) => {
		if (typeof document === "undefined" || !document.documentElement) return fallback
		const value = window.getComputedStyle(document.documentElement).getPropertyValue(name)
		return value && value.trim() ? value.trim() : fallback
	}

	const hexToRgb = (hex) => {
		const clean = String(hex).trim().replace("#", "")
		const expanded =
			clean.length === 3
				? clean
						.split("")
						.map((character) => character + character)
						.join("")
				: clean
		const parsed = Number.parseInt(expanded.slice(0, 6), 16)
		if (Number.isNaN(parsed)) return { r: 255, g: 255, b: 255 }
		return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 }
	}

	/* =====================================================================
	   Defaults — tuned for the dark cinematic palette of the site.
	   ===================================================================== */
	const DEFAULTS = {
		container: null,
		segmentCount: 26,
		spacing: 10.5,
		follow: 130,
		followFalloff: 0.985,
		headStiffness: 30,
		headDamping: 8.2,
		maxHeadSpeed: 2200,
		maxStepPerFrame: 120,
		band: { min: 0.9, max: 1.5 },
		stretch: { min: 0.96, max: 1.35, speedRef: 1150 },
		angleFollow: 10,
		wiggle: {
			base: 1.3,
			settle: 0.5,
			rate: 1.15,
			wander: 2,
			motionThreshold: 40,
			settleTime: 1.2,
		},
		body: { width: 7.5, coreWidth: 1, taper: 0.62, alpha: 0.5 },
		legs: {
			count: 10,
			anchorIndices: [2, 4, 6, 8, 10],
			angleOffsetBase: 0.62,
			angleOffsetGain: 0.3,
			reach: 60,
			stride: 20,
			upperRatio: 0.5,
			lowerRatio: 0.6,
			stepDuration: 0.16,
			cooldown: 0.22,
			overshoot: 0.35,
			idleWiggle: 2,
			maxSwinging: 2,
			sampleCount: 20,
			tipGlow: 13,
			list: null,
		},
		colors: { core: "#fff6ef", accent: "#f4744a", accentAlt: "#b98ef7", trail: "#f6d5bf" },
		head: { glow: 96, lens: { x: 16, y: 3.4 }, core: 3.6 },
		particles: {
			max: 160,
			maxCoarse: 80,
			life: [0.4, 1.1],
			size: [1.4, 3.6],
			drag: 1.0,
			spawnRate: 30,
			spread: 26,
			burst: 16,
		},
		interactiveSelector:
			"a, button, .project-visual, .music-player, .music-toggle, .music-step",
		touchIdleHide: 1400,
		pixelRatioCap: 1.7,
		opacityDefault: 1,
		autoStart: true,
	}

	/* =====================================================================
	   BodyChain — the main body: a spring-damper head plus a follow-the-
	   leader segment chain. Pure math (floats), so it is unit-testable in
	   Node without THREE.

	   1. Head: damped spring toward the pointer -> inertia + slight delay.
	   2. Each segment damps toward the point `spacing` behind the segment
	      in front of it; perpendicular layered-sine noise bends the body.
	   3. Bone length is clamped into a band, so fast motion stretches the
	      body up to `band.max` but can never unspool it. The leftover delay
	      lives in the joint angles, which is what makes it curve and whip.
	   ===================================================================== */
	class BodyChain {
		constructor(options) {
			const config = merge(DEFAULTS, options)
			this.config = config
			this.segmentCount = Math.max(4, Math.round(config.segmentCount))
			this.spacing = config.spacing
			this.segments = []
			this.time = 0
			this.speed = 0
			this.stretch = 1
			this.idleTime = 0
			this.headAngle = 0
			this.reset(0, 0, 0)
		}

		get head() {
			return this.segments[0]
		}

		get tail() {
			return this.segments[this.segments.length - 1]
		}

		reset(x, y, angle = 0) {
			const directionX = Math.cos(angle)
			const directionY = Math.sin(angle)
			this.segments.length = 0
			for (let index = 0; index < this.segmentCount; index++) {
				this.segments.push({
					x: x - directionX * this.spacing * index,
					y: y - directionY * this.spacing * index,
					vx: 0,
					vy: 0,
					angle,
					radius: 1,
				})
			}
			this.time = 0
			this.speed = 0
			this.stretch = 1
			this.idleTime = 0
			return this
		}

		update(delta, targetX, targetY) {
			const config = this.config
			const step = clamp(delta, 0.0005, 1 / 30)

			this.time += step
			const head = this.segments[0]
			const count = this.segments.length

			/* ---- idle book-keeping: settle, then keep a slow wiggle alive ---- */
			const wasMoving = this.speed > config.wiggle.motionThreshold
			this.idleTime = wasMoving ? Math.max(0, this.idleTime - step * 3) : this.idleTime + step
			const settle = clamp(this.idleTime / config.wiggle.settleTime, 0, 1)
			const wiggleAmplitude = lerp(config.wiggle.base, config.wiggle.settle, settle)
			const wiggleRate = config.wiggle.rate * (0.8 + settle * 0.55)

			/* ---- 1. head: damped spring toward the pointer + idle wander ---- */
			const wander = config.wiggle.wander * settle
			const driftX = wave(this.time * 0.62, 0.7) * wander
			const driftY = wave(this.time * 0.55, 2.1) * wander

			head.vx +=
				((targetX + driftX - head.x) * config.headStiffness -
					head.vx * config.headDamping) *
				step
			head.vy +=
				((targetY + driftY - head.y) * config.headStiffness -
					head.vy * config.headDamping) *
				step

			let velocityX = head.vx
			let velocityY = head.vy
			let speed = Math.hypot(velocityX, velocityY)
			if (speed > config.maxHeadSpeed) {
				const scale = config.maxHeadSpeed / speed
				head.vx = velocityX * scale
				head.vy = velocityY * scale
				velocityX = head.vx
				velocityY = head.vy
				speed = config.maxHeadSpeed
			}

			let moveX = velocityX * step
			let moveY = velocityY * step
			const moveDistance = Math.hypot(moveX, moveY)
			if (moveDistance > config.maxStepPerFrame) {
				const scale = config.maxStepPerFrame / moveDistance
				moveX *= scale
				moveY *= scale
			}
			head.x += moveX
			head.y += moveY
			this.speed = speed

			/* ---- 2. speed envelope: running stretches, settling crouches ---- */
			const speedRatio = clamp(speed / config.stretch.speedRef, 0, 1)
			this.stretch = damp(
				this.stretch,
				lerp(config.stretch.min, config.stretch.max, speedRatio),
				4.5,
				step,
			)

			/* ---- 3. body: each segment chases the segment in front of it ---- */
			const spacing = this.spacing * this.stretch
			const minBone = spacing * config.band.min
			const maxBone = spacing * config.band.max

			for (let index = 1; index < count; index++) {
				const segment = this.segments[index]
				const previous = this.segments[index - 1]

				let deltaX = previous.x - segment.x
				let deltaY = previous.y - segment.y
				let distance = Math.hypot(deltaX, deltaY)
				if (distance < 0.001) {
					deltaX = Math.cos(previous.angle)
					deltaY = Math.sin(previous.angle)
					distance = 0.001
				} else {
					deltaX /= distance
					deltaY /= distance
				}

				const phase = index * 0.52
				const taper = 1 - (index / (count - 1)) * 0.45
				const offset =
					wave(this.time * wiggleRate + phase, phase) * wiggleAmplitude * taper
				const pointX = previous.x - deltaX * spacing - deltaY * offset
				const pointY = previous.y - deltaY * spacing + deltaX * offset

				const lambda = config.follow * Math.pow(config.followFalloff, index)
				segment.x = damp(segment.x, pointX, lambda, step)
				segment.y = damp(segment.y, pointY, lambda, step)

				/* Distance clamp: stretch on flicks, never unspool. */
				const boneX = segment.x - previous.x
				const boneY = segment.y - previous.y
				const boneLength = Math.hypot(boneX, boneY)
				if (boneLength > 0.001) {
					const clamped = clamp(boneLength, minBone, maxBone)
					if (clamped !== boneLength) {
						const ratio = clamped / boneLength
						segment.x = previous.x + boneX * ratio
						segment.y = previous.y + boneY * ratio
					}
				}
			}

			/* ---- 4. joint angles ease toward the local direction ---- */
			for (let index = count - 1; index >= 1; index--) {
				const segment = this.segments[index]
				const previous = this.segments[index - 1]
				segment.angle = dampAngle(
					segment.angle,
					Math.atan2(previous.y - segment.y, previous.x - segment.x),
					config.angleFollow,
					step,
				)
			}
			/* ---- velocity-based head rotation ---- */
			const second = this.segments[1]
			const bodyAngle = Math.atan2(head.y - second.y, head.x - second.x)
			const headAngle =
				speed > config.wiggle.motionThreshold ? Math.atan2(velocityY, velocityX) : bodyAngle
			this.headAngle = dampAngle(this.headAngle, headAngle, config.angleFollow * 0.85, step)

			/* ---- 5. radius: breathing pulse (width is applied at render) ---- */
			for (let index = 0; index < count; index++) {
				this.segments[index].radius =
					1 + Math.sin(this.time * 2.6 - index * 0.45) * 0.09
			}
			return this
		}

		measureBounds() {
			const segments = this.segments
			let minX = Infinity
			let minY = Infinity
			let maxX = -Infinity
			let maxY = -Infinity
			for (let index = 0; index < segments.length; index++) {
				if (segments[index].x < minX) minX = segments[index].x
				if (segments[index].y < minY) minY = segments[index].y
				if (segments[index].x > maxX) maxX = segments[index].x
				if (segments[index].y > maxY) maxY = segments[index].y
			}
			return { minX, minY, maxX, maxY }
		}

		/* World half-width for a segment, tapered down the body. */
		widthFor(index, bodyWidth) {
			const count = this.segments.length
			const taper = Math.pow(1 - index / (count - 1), 0.5)
			return bodyWidth * clamp(0.2 + taper * 0.8, 0.2, 1) * this.segments[index].radius
		}
	}

	/* =====================================================================
	   Leg — a walking spider leg. The foot sticks to a spot in screen
	   space while the body drags away; once the foot drifts further than
	   its stride it lifts and swings to a new spot ahead of the body (with
	   a little overshoot). The limb is solved with 2-bone IK so the knee
	   always bends, and a Catmull-Rom ribbon rounds the joint. Steps are
	   budgeted (only a couple of legs may swing at once) and staggered so
	   the gait reads as crawling, never as synchronized flailing.
	   ===================================================================== */
class Leg {
		constructor(three, chain, options) {
			this.three = three
			this.chain = chain
			this.config = options

			/* Anatomy: which body segment the hip is glued to, which side of
			   the body it sits on, and how far it may reach. */
			this.anchorIndex = Math.round(options.anchorIndex)
			this.side = options.side
			this.angleOffset = options.angleOffset
			this.reach = options.reach
			this.stride = options.stride
			this.upper = this.reach * options.upperRatio
			this.lower = this.reach * options.lowerRatio
			this.bendSign = options.side
			this.phase = options.phase

			/* Foot state: planted, swinging, or about to plant. */
			this.root = { x: 0, y: 0 }
			this.foot = { x: 0, y: 0 }
			this.stepFrom = { x: 0, y: 0 }
			this.stepTo = { x: 0, y: 0 }
			this.planted = false
			this.stepping = false
			this.stepT = 0
			this.stepDuration = options.stepDuration
			this.lift = 0
			this.cooldown = options.cooldown + options.stagger * 0.06

			/* Render resources: one polyline through (hip, elbow, knee,
			   elbow, foot) plus the glowing foot sprite. */
			const controlCount = 5
			const sampleCount = Math.max(10, Math.round(options.sampleCount || 18))
			this.curvePoints = []
			for (let index = 0; index < controlCount; index++) {
				this.curvePoints.push(new three.Vector3())
			}
			this.curve = new three.CatmullRomCurve3(this.curvePoints)
			this.curve.curveType = "catmullrom"
			this.samples = []
			for (let index = 0; index < sampleCount; index++) {
				this.samples.push(new three.Vector3())
			}

			const positions = new Float32Array(sampleCount * 3)
			const colors = new Float32Array(sampleCount * 3)
			this.positionAttr = new three.BufferAttribute(positions, 3)
			this.positionAttr.setUsage(three.DynamicDrawUsage)
			this.colorAttr = new three.BufferAttribute(colors, 3)
			this.colorAttr.setUsage(three.DynamicDrawUsage)
			this.geometry = new three.BufferGeometry()
			this.geometry.setAttribute("position", this.positionAttr)
			this.geometry.setAttribute("color", this.colorAttr)
			this.material = new three.LineBasicMaterial({
				vertexColors: true,
				transparent: true,
				opacity: 0.85,
				blending: three.AdditiveBlending,
				depthWrite: false,
				depthTest: false,
			})
			this.mesh = new three.Line(this.geometry, this.material)
			this.mesh.frustumCulled = false
			this.mesh.renderOrder = 4

			this.tip = new three.Sprite(
				new three.SpriteMaterial({
					map: options.glowMap,
					color: new three.Color(options.tipColor),
					transparent: true,
					opacity: 0.9,
					blending: three.AdditiveBlending,
					depthWrite: false,
					depthTest: false,
				}),
			)
			this.tip.renderOrder = 5

			this.colorTop = options.topColor
			this.colorTip = options.tipLineColor
			this.knee = { x: 0, y: 0 }
		}

		update(delta, time, headAngle, speedNorm, budget) {
			const config = this.config
			const chain = this.chain
			const segments = chain.segments

			/* Hip follows its body segment every frame. */
			const seg = segments[Math.min(this.anchorIndex, segments.length - 1)]
			this.root.x = seg.x
			this.root.y = seg.y

			/* Outward direction in the body frame; a whisper of noise keeps
			   the stance from looking pinned to a protractor. */
			const sway = wave(time * 0.7 + this.phase, this.phase) * 0.06
			const angle = headAngle + this.side * (this.angleOffset + sway)
			const dirX = Math.cos(angle)
			const dirY = Math.sin(angle)
			const idealX = this.root.x + dirX * this.reach
			const idealY = this.root.y + dirY * this.reach

			if (!this.planted) {
				this.foot.x = idealX
				this.foot.y = idealY
				this.planted = true
			}

			if (!this.stepping) {
				this.cooldown -= delta
				const driftX = this.foot.x - idealX
				const driftY = this.foot.y - idealY
				const drift = Math.hypot(driftX, driftY)

				/* Too far from its stance: ask for a step. The budget may
				   refuse while other legs are mid-swing. */
				if (drift > this.stride && this.cooldown <= 0 && budget.tryClaim()) {
					this.stepping = true
					this.stepT = 0
					this.stepFrom.x = this.foot.x
					this.stepFrom.y = this.foot.y
					/* Land slightly ahead of the ideal spot in the direction
					   of travel so the leg buys the body some distance. */
					const overshoot = this.stride * config.overshoot
					this.stepTo.x = idealX + dirX * this.reach * 0.05 + Math.cos(headAngle) * overshoot
					this.stepTo.y = idealY + dirY * this.reach * 0.05 + Math.sin(headAngle) * overshoot
					this.stepDuration = config.stepDuration / (0.65 + speedNorm * 0.9)
					this.cooldown = config.cooldown + this.phase * 0.03
				} else {
					/* Planted: only a faint idle shuffle, the foot stays put. */
					const idle = config.idleWiggle * delta
					this.foot.x += wave(time * 1.7 + this.phase, this.phase) * idle
					this.foot.y += wave(time * 1.4 + this.phase * 1.6, this.phase) * idle
				}
			}

			if (this.stepping) {
				this.stepT += delta / this.stepDuration
				if (this.stepT >= 1) {
					this.stepT = 1
					this.stepping = false
					this.lift = 0
					this.foot.x = this.stepTo.x
					this.foot.y = this.stepTo.y
				} else {
					const p = this.stepT
					const eased = p * p * (3 - 2 * p)
					this.foot.x = lerp(this.stepFrom.x, this.stepTo.x, eased)
					this.foot.y = lerp(this.stepFrom.y, this.stepTo.y, eased)
					this.lift = Math.sin(p * Math.PI)
				}
			}

			/* ---- 2-bone IK: knee bows outwards from the body ---- */
			this.knee = this.knee || { x: 0, y: 0 }
			const kneeX0 = { x: 0, y: 0 }
			solveIK(
				this.root.x, this.root.y,
				this.foot.x, this.foot.y,
				this.upper, this.lower, this.bendSign,
				kneeX0,
			)
			const kneeX = kneeX0.x
			const kneeY = kneeX0.y
			const rootX = this.root.x
			const rootY = this.root.y
			/* Render foot clamped to the limb's reach; the true foot stays
			   unclamped so the stride logic still sees the real drift. */
			let footX = this.foot.x
			let footY = this.foot.y
			{
				const fdx = footX - rootX
				const fdy = footY - rootY
				const fd = Math.hypot(fdx, fdy) || 1e-4
				const maxLen = this.upper + this.lower
				if (fd > maxLen) {
					footX = rootX + (fdx / fd) * maxLen
					footY = rootY + (fdy / fd) * maxLen
				}
			}

			this.renderFoot = { x: footX, y: footY }

			/* ---- curve through hip -> knee -> foot ---- */
			const curvePoints = this.curvePoints
			const bow = this.bendSign * 0.14
			curvePoints[0].set(rootX, rootY, 0)
			curvePoints[1].set(
				lerp(rootX, kneeX, 0.55) - (kneeY - rootY) * bow,
				lerp(rootY, kneeY, 0.55) + (kneeX - rootX) * bow,
				0,
			)
			curvePoints[2].set(kneeX, kneeY, 0)
			curvePoints[3].set(
				lerp(kneeX, footX, 0.45) - (footY - kneeY) * bow,
				lerp(kneeY, footY, 0.45) + (footX - kneeX) * bow,
				0,
			)
			curvePoints[4].set(footX, footY, 0)

			const sampleCount = this.samples.length
			for (let index = 0; index < sampleCount; index++) {
				this.curve.getPoint(index / (sampleCount - 1), this.samples[index])
			}

			/* ---- positions + brightness (the limb glows while swinging) ---- */
			const positions = this.positionAttr.array
			const colors = this.colorAttr.array
			const swingBoost = 1 + this.lift * 0.5
			for (let index = 0; index < sampleCount; index++) {
				const progress = index / (sampleCount - 1)
				positions[index * 3] = this.samples[index].x
				positions[index * 3 + 1] = this.samples[index].y
				positions[index * 3 + 2] = 0
				/* bright at the hip, dim through the knee, warm at the foot */
				const profile = 0.7 - Math.sin(progress * Math.PI) * 0.42
				const mixed = this.lerpColor(this.colorTop, this.colorTip, progress)
				const level = (0.1 + profile * 0.85) * swingBoost
				colors[index * 3] = (mixed.r / 255) * level
				colors[index * 3 + 1] = (mixed.g / 255) * level
				colors[index * 3 + 2] = (mixed.b / 255) * level
			}
			this.positionAttr.needsUpdate = true
			this.colorAttr.needsUpdate = true

			/* ---- foot sprite: swells while the foot is in the air ---- */
			this.tip.position.set(footX, footY, 0)
			const glow = this.config.tipGlow * (0.9 + this.lift * 1.1)
			this.tip.scale.set(glow, glow, 1)
			return this
		}

		lerpColor(a, b, t) {
			return {
				r: lerp(a.r, b.r, t),
				g: lerp(a.g, b.g, t),
				b: lerp(a.b, b.b, t),
			}
		}
	}

	/* Two-bone IK: place the knee so both bone lengths are honoured and the
	   joint bows to one side (bendSign picks the side). Clamps when the foot
	   is out of reach so the limb stretches straight instead of exploding. */
	function solveIK(rootX, rootY, footX, footY, upper, lower, bendSign, out) {
		let deltaX = footX - rootX
		let deltaY = footY - rootY
		let distance = Math.hypot(deltaX, deltaY) || 1e-4
		const maxDistance = upper + lower - 1e-3
		if (distance > maxDistance) {
			deltaX *= maxDistance / distance
			deltaY *= maxDistance / distance
			distance = maxDistance
		}
		const along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
		const height = Math.sqrt(Math.max(0, upper * upper - along * along))
		const unitX = deltaX / distance
		const unitY = deltaY / distance
		out.x = rootX + unitX * along - unitY * height * bendSign
		out.y = rootY + unitY * along + unitX * height * bendSign
	}

	/* =====================================================================
	   ParticlePool — pooled, allocation-free trail points rendered with a
	   tiny additive shader. Life fades alpha; size is in device pixels.
	   ===================================================================== */
	class ParticlePool {
		constructor(three, options) {
			const config = merge(
				{ max: 160, life: [0.4, 1.1], size: [1.4, 3.6], drag: 1.0, color: "#f6d5bf" },
				options,
			)
			this.three = three
			this.config = config
			const max = Math.max(8, Math.round(config.max))
			this.cursor = 0
			this.alive = 0
			this.items = new Array(max)
			for (let index = 0; index < max; index++) {
				this.items[index] = {
					active: false,
					x: 0,
					y: 0,
					vx: 0,
					vy: 0,
					life: 0,
					maxLife: 1,
					size: 1,
				}
			}

			this.positionAttr = new three.BufferAttribute(new Float32Array(max * 3), 3)
			this.positionAttr.setUsage(three.DynamicDrawUsage)
			this.sizeAttr = new three.BufferAttribute(new Float32Array(max), 1)
			this.sizeAttr.setUsage(three.DynamicDrawUsage)
			this.alphaAttr = new three.BufferAttribute(new Float32Array(max), 1)
			this.alphaAttr.setUsage(three.DynamicDrawUsage)
			this.geometry = new three.BufferGeometry()
			this.geometry.setAttribute("position", this.positionAttr)
			this.geometry.setAttribute("aSize", this.sizeAttr)
			this.geometry.setAttribute("aAlpha", this.alphaAttr)

			this.material = new three.ShaderMaterial({
				uniforms: { uColor: { value: new three.Color(config.color) } },
				transparent: true,
				depthWrite: false,
				depthTest: false,
				blending: three.AdditiveBlending,
				vertexShader: [
					"attribute float aSize;",
					"attribute float aAlpha;",
					"varying float vAlpha;",
					"void main() {",
					"  vAlpha = aAlpha;",
					"  gl_PointSize = aSize;",
					"  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
					"}",
				].join("\n"),
				fragmentShader: [
					"precision mediump float;",
					"uniform vec3 uColor;",
					"varying float vAlpha;",
					"void main() {",
					"  vec2 uv = gl_PointCoord - vec2(0.5);",
					"  float d = length(uv) * 2.0;",
					"  float glow = smoothstep(1.0, 0.0, d);",
					"  glow *= glow;",
					"  gl_FragColor = vec4(uColor, glow * vAlpha);",
					"}",
				].join("\n"),
			})
			this.mesh = new three.Points(this.geometry, this.material)
			this.mesh.frustumCulled = false
			this.mesh.renderOrder = 7
		}

		spawn(x, y, options) {
			const config = this.config
			const item = this.items[this.cursor]
			this.cursor = (this.cursor + 1) % this.items.length
			const life = (options && options.life) || config.life
			const size = (options && options.size) || config.size
			const spread = (options && options.spread) || 0
			const baseVx = (options && options.vx) || 0
			const baseVy = (options && options.vy) || 0

			item.active = true
			item.x = x
			item.y = y
			item.vx = baseVx + (Math.random() - 0.5) * spread
			item.vy = baseVy + (Math.random() - 0.5) * spread
			item.maxLife = lerp(life[0], life[1], Math.random())
			item.life = item.maxLife
			item.size = lerp(size[0], size[1], Math.random())
			return item
		}

		update(delta) {
			const drag = Math.exp(-this.config.drag * delta)
			let alive = 0
			const positions = this.positionAttr.array
			const sizes = this.sizeAttr.array
			const alphas = this.alphaAttr.array
			for (let index = 0; index < this.items.length; index++) {
				const item = this.items[index]
				if (!item.active) continue
				item.life -= delta
				if (item.life <= 0) {
					item.active = false
					continue
				}
				item.vx *= drag
				item.vy *= drag
				item.x += item.vx * delta
				item.y += item.vy * delta
				const progress = clamp(item.life / item.maxLife, 0, 1)
				positions[alive * 3] = item.x
				positions[alive * 3 + 1] = item.y
				positions[alive * 3 + 2] = 0
				sizes[alive] = item.size * (0.4 + progress * 0.6)
				alphas[alive] = progress * progress
				alive++
			}
			this.alive = alive
			this.geometry.setDrawRange(0, alive)
			this.positionAttr.needsUpdate = true
			this.sizeAttr.needsUpdate = true
			this.alphaAttr.needsUpdate = true
			return alive
		}

		clear() {
			for (let index = 0; index < this.items.length; index++) {
				this.items[index].active = false
			}
			this.alive = 0
			this.geometry.setDrawRange(0, 0)
		}
	}

	/* =====================================================================
	   CursorCreature3D — the reusable component.
	   Owns the WebGL renderer, the pointer tracking, the animation loop.
	   The renderer clears every frame → no residual white trails.
	   ===================================================================== */
	class CursorCreature3D {
		constructor(options) {
			const config = merge(DEFAULTS, options)
			config.colors = Object.assign({}, config.colors, {
				core: readCssColor("--text", config.colors.core),
				accent: readCssColor("--accent", config.colors.accent),
				accentAlt: readCssColor("--accent-2", config.colors.accentAlt),
				trail: readCssColor("--accent-3", config.colors.trail),
			})

			this.config = config
			this.container = config.container || null
			this.isLocal = Boolean(this.container)
			this.three = typeof THREE !== "undefined" ? THREE : null
			this.canvas = null
			this.renderer = null
			this.scene = null
			this.camera = null
			this.rect = { left: 0, top: 0, width: 0, height: 0 }
			this.width = 1
			this.height = 1
			this.dpr = 1
			this.frame = 0
			this.frameCount = 0
			this.lastTime = 0
			this.running = false
			this.destroyed = false
			this.visible = false
			this.handlers = null
			this.observer = null
			this.loop = this.loop.bind(this)

			this.rgb = {
				core: hexToRgb(config.colors.core),
				accent: hexToRgb(config.colors.accent),
				accentAlt: hexToRgb(config.colors.accentAlt),
				trail: hexToRgb(config.colors.trail),
			}

			this.chain = new BodyChain(config)
			this.legs = []
			this.particles = null
			this.bodyRibbon = null
			this.bodyLine = null
			this.joints = null
			this.headGlow = null
			this.headLens = null
			this.headCore = null
			this.glowMap = null

			const coarse =
				typeof window !== "undefined" && typeof window.matchMedia === "function"
					? window.matchMedia("(pointer: coarse)").matches
					: false
			this.isCoarse = coarse
			this.pointer = {
				x: 0,
				y: 0,
				lastMove: 0,
				speed: 0,
				active: false,
				hovering: false,
				type: "mouse",
			}
			this.point = { x: 0, y: 0 }
			this.emitter = { budget: 0 }
		}

		init() {
			if (this.destroyed || this.canvas || typeof document === "undefined") return this
			if (!this.three) return this
			const parent = this.container || document.body
			if (!parent) return this

			const canvas = document.createElement("canvas")
			canvas.className = this.isLocal
				? "cursor-creature-canvas cursor-creature-canvas--local"
				: "cursor-creature-canvas"
			canvas.setAttribute("aria-hidden", "true")
			canvas.setAttribute("role", "presentation")
			parent.appendChild(canvas)

			let renderer
			try {
				renderer = new this.three.WebGLRenderer({
					canvas,
					alpha: true,
					antialias: true,
					powerPreference: "high-performance",
				})
			} catch (error) {
				canvas.remove()
				return this
			}
			renderer.setClearColor(0x000000, 0)
			renderer.autoClear = true
			renderer.setPixelRatio(1)

			if (this.isLocal) {
				const parentStyle = window.getComputedStyle(parent)
				if (parentStyle.position === "static") parent.style.position = "relative"
			}

			this.canvas = canvas
			this.renderer = renderer
			this.scene = new this.three.Scene()
			this.camera = new this.three.OrthographicCamera(0, 1, 0, 1, -100, 100)
			this.camera.position.z = 50
			this.glowMap = this.makeGlowTexture(this.config.colors.core)

			this.buildBodyObjects()
			this.buildHeadObjects()
			const particlesMax = this.isCoarse
				? this.config.particles.maxCoarse
				: this.config.particles.max
			this.particles = new ParticlePool(this.three, {
				max: particlesMax,
				life: this.config.particles.life,
				size: this.config.particles.size,
				drag: this.config.particles.drag,
				color: this.config.colors.trail,
			})
			/** __CURSOR_CREATURE_3D_SCENE_CREATED__ */
			this.resize()
			this.bindEvents()
			this.start()
			return this
		}

		/* Create a soft radial glow used by the head sprite + lens. White map so
		   the material color tints it: keeps the palette token-driven. */
		makeGlowTexture() {
			const three = this.three
			const size = 128
			const canvas = document.createElement("canvas")
			canvas.width = size
			canvas.height = size
			const context = canvas.getContext("2d")
			const gradient = context.createRadialGradient(
				size / 2,
				size / 2,
				0,
				size / 2,
				size / 2,
				size / 2,
			)
			gradient.addColorStop(0, "rgba(255, 255, 255, 1)")
			gradient.addColorStop(0.25, "rgba(255, 255, 255, 0.5)")
			gradient.addColorStop(1, "rgba(255, 255, 255, 0)")
			context.fillStyle = gradient
			context.fillRect(0, 0, size, size)
			const texture = new three.CanvasTexture(canvas)
			texture.needsUpdate = true
			return texture
		}

		/* Body ribbon (additive triangle list), thin core line, joint dots
		   Buffers are reused every frame. */
		buildBodyObjects() {
			const three = this.three
			const config = this.config
			const count = this.chain.segmentCount
			const quads = Math.max(1, count - 1)
			const vertices = quads * 6

			this.ribbonPositions = new Float32Array(vertices * 3)
			this.ribbonColors = new Float32Array(vertices * 3)
			const ribbonPositions = new three.BufferAttribute(this.ribbonPositions, 3)
			ribbonPositions.setUsage(three.DynamicDrawUsage)
			const ribbonColors = new three.BufferAttribute(this.ribbonColors, 3)
			ribbonColors.setUsage(three.DynamicDrawUsage)
			const ribbonGeometry = new three.BufferGeometry()
			ribbonGeometry.setAttribute("position", ribbonPositions)
			ribbonGeometry.setAttribute("color", ribbonColors)
			this.bodyRibbon = new three.Mesh(
				ribbonGeometry,
				new three.MeshBasicMaterial({
					vertexColors: true,
					transparent: true,
					opacity: 0.9,
					blending: three.AdditiveBlending,
					depthWrite: false,
					depthTest: false,
					side: three.DoubleSide,
				}),
			)
			this.bodyRibbon.frustumCulled = false
			this.bodyRibbon.renderOrder = 1

			this.bodyPositions = new Float32Array(count * 3)
			this.bodyLineColors = new Float32Array(count * 3)
			const linePositions = new three.BufferAttribute(this.bodyPositions, 3)
			linePositions.setUsage(three.DynamicDrawUsage)
			const lineColors = new three.BufferAttribute(this.bodyLineColors, 3)
			lineColors.setUsage(three.DynamicDrawUsage)
			const lineGeometry = new three.BufferGeometry()
			lineGeometry.setAttribute("position", linePositions)
			lineGeometry.setAttribute("color", lineColors)
			this.bodyLine = new three.Line(
				lineGeometry,
				new three.LineBasicMaterial({
					vertexColors: true,
					transparent: true,
					opacity: 0.9,
					blending: three.AdditiveBlending,
					depthWrite: false,
					depthTest: false,
				}),
			)
			this.bodyLine.frustumCulled = false
			this.bodyLine.renderOrder = 2

			this.jointPositions = new Float32Array(count * 3)
			this.jointColors = new Float32Array(count * 3)
			const jointPositions = new three.BufferAttribute(this.jointPositions, 3)
			jointPositions.setUsage(three.DynamicDrawUsage)
			const jointColors = new three.BufferAttribute(this.jointColors, 3)
			jointColors.setUsage(three.DynamicDrawUsage)
			const jointGeometry = new three.BufferGeometry()
			jointGeometry.setAttribute("position", jointPositions)
			jointGeometry.setAttribute("color", jointColors)
			this.joints = new three.Points(
				jointGeometry,
				new three.PointsMaterial({
					vertexColors: true,
					transparent: true,
					size: 1,
					sizeAttenuation: false,
					blending: three.AdditiveBlending,
					depthWrite: false,
					depthTest: false,
					opacity: 0.9,
				}),
			)
			this.joints.frustumCulled = false
			this.joints.renderOrder = 3


			/* Spider legs: three per side, hips glued to body segments. Each
			   leg keeps its own phase (staggered) and reaches outward at an
			   angle that fans from front to back, so the creature reads as a
			   walking arthropod rather than a symmetric starburst. */
			const legConfig = config.legs
			const legCount = Math.max(2, Math.round(legConfig.count))
			const perSide = Math.max(1, Math.round(legCount / 2))
			const anchors = legConfig.anchorIndices || [2, 4, 6]
			for (let index = 0; index < legCount; index++) {
				const side = index % 2 === 0 ? 1 : -1
				const pairIndex = Math.floor(index / 2)
				const jitter = (index * 0.618033988749895) % 1
				const listEntry =
					legConfig.list && legConfig.list[index] ? legConfig.list[index] : null
				this.legs.push(
					new Leg(three, this.chain, {
						anchorIndex: listEntry
							? listEntry.anchorIndex
							: anchors[Math.min(pairIndex, anchors.length - 1)],
						side,
						angleOffset:
							legConfig.angleOffsetBase +
							pairIndex * legConfig.angleOffsetGain +
							(jitter - 0.5) * 0.16,
						reach: listEntry ? listEntry.reach : legConfig.reach * (0.9 + jitter * 0.2),
						stride: legConfig.stride * (0.85 + jitter * 0.35),
						upperRatio: legConfig.upperRatio,
						lowerRatio: legConfig.lowerRatio,
						phase: index * 0.85 + jitter * 1.7,
						stepDuration: legConfig.stepDuration,
						cooldown: legConfig.cooldown,
						overshoot: legConfig.overshoot,
						idleWiggle: legConfig.idleWiggle,
						stagger: pairIndex * 0.5,
						sampleCount: legConfig.sampleCount,
						tipGlow: legConfig.tipGlow * (0.8 + jitter * 0.5),
						glowMap: this.glowMap,
						tipColor: config.colors.accentAlt,
						topColor: this.rgb.trail,
						tipLineColor: this.rgb.accent,
					}),
				)
			}

			this.scene.add(this.bodyRibbon)
			this.scene.add(this.bodyLine)
			this.scene.add(this.joints)
			this.legs.forEach((leg) => {
				this.scene.add(leg.mesh)
				this.scene.add(leg.tip)
			})
		}

		/* Head glow sprite + oriented lens + bright nucleus. */
		buildHeadObjects() {
			const three = this.three
			const config = this.config
			this.headGlow = new three.Sprite(
				new three.SpriteMaterial({
					map: this.glowMap,
					color: new three.Color(config.colors.accent),
					transparent: true,
					opacity: 0.85,
					blending: three.AdditiveBlending,
					depthWrite: false,
					depthTest: false,
				}),
			)
			this.headGlow.scale.set(config.head.glow, config.head.glow, 1)
			this.headGlow.renderOrder = 8

			this.headLens = new three.Mesh(
				new three.PlaneGeometry(config.head.lens.x, config.head.lens.y),
				new three.MeshBasicMaterial({
					map: this.glowMap,
					color: new three.Color(config.colors.core),
					transparent: true,
					opacity: 0.65,
					blending: three.AdditiveBlending,
					depthWrite: false,
					depthTest: false,
				}),
			)
			this.headLens.renderOrder = 6

			this.headCore = new three.Mesh(
				new three.CircleGeometry(config.head.core, 24),
				new three.MeshBasicMaterial({
					color: new three.Color(config.colors.core),
					transparent: true,
					opacity: 0.95,
					blending: three.AdditiveBlending,
					depthWrite: false,
					depthTest: false,
				}),
			)
			this.headCore.renderOrder = 7

			this.scene.add(this.headGlow)
			this.scene.add(this.headLens)
			this.scene.add(this.headCore)
		}

		start() {
			if (this.running || this.destroyed || !this.canvas) return this
			this.running = true
			this.lastTime = typeof performance !== "undefined" ? performance.now() : Date.now()
			this.frame = requestAnimationFrame(this.loop)
			return this
		}

		stop() {
			if (!this.running) return this
			this.running = false
			if (this.frame) cancelAnimationFrame(this.frame)
			this.frame = 0
			return this
		}

		resize() {
			if (!this.canvas || !this.renderer) return this
			const dpr = Math.min(
				typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
				this.config.pixelRatioCap,
			)
			let width
			let height
			if (this.isLocal && this.container) {
				this.rect = this.container.getBoundingClientRect()
				width = Math.max(1, this.rect.width)
				height = Math.max(1, this.rect.height)
			} else {
				width = Math.max(1, window.innerWidth)
				height = Math.max(1, window.innerHeight)
			}

			this.width = width
			this.height = height
			this.dpr = dpr
			const bufferWidth = Math.round(width * dpr)
			const bufferHeight = Math.round(height * dpr)
			this.renderer.setSize(bufferWidth, bufferHeight, false)
			this.renderer.setViewport(0, 0, bufferWidth, bufferHeight)
			this.camera.left = 0
			this.camera.right = width
			this.camera.top = 0
			this.camera.bottom = height
			this.camera.updateProjectionMatrix()
			if (this.joints) this.joints.material.size = 2 * dpr

			if (this.pointer.active) {
				const head = this.chain.head
				head.x = clamp(head.x, 0, width)
				head.y = clamp(head.y, 0, height)
				this.pointer.x = clamp(this.pointer.x, 0, width)
				this.pointer.y = clamp(this.pointer.y, 0, height)
			}
			return this
		}

		/* Local mode: keep the cached container rect fresh while scrolling. */
		syncOrigin() {
			if (!this.isLocal || !this.container) return this
			this.rect = this.container.getBoundingClientRect()
			return this
		}

		/* Global pointer tracking (canvas is pointer-events: none). */
		bindEvents() {
			const handlers = {
				pointermove: (event) => this.onPointerMove(event),
				pointerdown: (event) => this.onPointerDown(event),
				pointerout: (event) => this.onPointerOut(event),
				resize: () => this.resize(),
				scroll: () => this.syncOrigin(),
				visibility: () => {
					if (document.hidden) this.stop()
					else if (this.config.autoStart) this.start()
				},
				blur: () => {
					this.hide()
					this.pointer.active = false
				},
			}
			this.handlers = handlers

			window.addEventListener("pointermove", handlers.pointermove, { passive: true })
			window.addEventListener("pointerdown", handlers.pointerdown, { passive: true })
			document.addEventListener("pointerout", handlers.pointerout, { passive: true })
			window.addEventListener("resize", handlers.resize, { passive: true })
			window.addEventListener("blur", handlers.blur)
			document.addEventListener("visibilitychange", handlers.visibility)

			if (this.isLocal) {
				window.addEventListener("scroll", handlers.scroll, { passive: true })
				if (typeof ResizeObserver !== "undefined") {
					this.observer = new ResizeObserver(() => this.resize())
					this.observer.observe(this.container)
				}
			}
			return this
		}

		isInteractiveTarget(target) {
			if (!this.config.interactiveSelector) return false
			if (!target || typeof target.closest !== "function") return false
			return Boolean(target.closest(this.config.interactiveSelector))
		}

		/* Client coords -> creature space. Reuses a scratch object so the hot
		   pointermove path never allocates. */
		eventToLocal(event) {
			const scratch = this.point
			if (!this.isLocal) {
				scratch.x = event.clientX
				scratch.y = event.clientY
				return scratch
			}
			if (!this.rect.width) this.syncOrigin()
			scratch.x = clamp(event.clientX - this.rect.left, 0, this.rect.width)
			scratch.y = clamp(event.clientY - this.rect.top, 0, this.rect.height)
			return scratch
		}

		onPointerMove(event) {
			const now =
				typeof performance !== "undefined" ? performance.now() : Date.now()
			const point = this.eventToLocal(event)
			const pointer = this.pointer

			if (pointer.active) {
				const elapsed = Math.max(8, now - pointer.lastMove)
				const travelled = Math.hypot(point.x - pointer.x, point.y - pointer.y)
				pointer.speed = (travelled / elapsed) * 1000
			} else {
				pointer.speed = 0
			}
			pointer.x = point.x
			pointer.y = point.y
			pointer.lastMove = now
			pointer.type = event.pointerType || "mouse"
			pointer.hovering = this.isInteractiveTarget(event.target)

			if (!pointer.active) {
				pointer.active = true
				this.chain.reset(point.x, point.y, 0)
				if (this.particles) this.particles.clear()
			}
			this.show()
		}

		onPointerDown(event) {
			const now =
				typeof performance !== "undefined" ? performance.now() : Date.now()
			const point = this.eventToLocal(event)
			this.pointer.type = event.pointerType || this.pointer.type
			this.pointer.lastMove = now

			if (!this.pointer.active) {
				this.pointer.active = true
				this.pointer.x = point.x
				this.pointer.y = point.y
				this.chain.reset(point.x, point.y, 0)
				if (this.particles) this.particles.clear()
			} else {
				this.pointer.x = point.x
				this.pointer.y = point.y
			}
			this.show()

			const origin = this.chain.head
			const burst = this.config.particles.burst
			for (let index = 0; index < burst; index++) {
				this.particles.spawn(origin.x, origin.y, {
					spread: 200,
					life: [0.3, 0.9],
					size: [1.0, 2.6],
				})
			}
		}

		/* Only react when the pointer actually leaves the window. */
		onPointerOut(event) {
			if (event.relatedTarget) return
			this.hide()
			this.pointer.active = false
			this.pointer.speed = 0
		}

		show() {
			if (!this.canvas || this.visible) return this
			this.visible = true
			this.canvas.style.opacity = String(this.config.opacityDefault || 1)
			return this
		}

		hide() {
			if (this.visible) this.canvas.style.opacity = "0"
			this.visible = false
			return this
		}

		setOptions(patch) {
			this.config = merge(this.config, patch)
			this.chain.config = this.config
			this.chain.spacing = this.config.spacing
			this.chain.segmentCount = Math.max(4, Math.round(this.config.segmentCount))
			if (this.chain.segments.length !== this.chain.segmentCount) {
				this.chain.reset(this.chain.head.x, this.chain.head.y, 0)
			}
			this.particles.config.life = this.config.particles.life
			this.particles.config.size = this.config.particles.size
			this.particles.config.drag = this.config.particles.drag
			return this
		}

		destroy() {
			this.destroyed = true
			this.stop()
			if (this.observer) {
				this.observer.disconnect()
				this.observer = null
			}
			const handlers = this.handlers
			if (handlers) {
				window.removeEventListener("pointermove", handlers.pointermove)
				window.removeEventListener("pointerdown", handlers.pointerdown)
				document.removeEventListener("pointerout", handlers.pointerout)
				window.removeEventListener("resize", handlers.resize)
				window.removeEventListener("blur", handlers.blur)
				document.removeEventListener("visibilitychange", handlers.visibility)
				window.removeEventListener("scroll", handlers.scroll)
			}
			this.handlers = null
			if (this.renderer) {
				this.renderer.dispose()
				this.renderer = null
			}
			if (this.scene) {
				this.scene.traverse((object) => {
					if (object.geometry) object.geometry.dispose()
					if (object.material) object.material.dispose()
				})
				this.scene = null
			}
			if (this.canvas) {
				this.canvas.remove()
				this.canvas = null
			}
			return this
		}

		/* The loop: measure delta time, run the physics, then render. The WebGL
		   renderer clears its buffer every frame — the only fading "trail" is
		   the bounded particle pool, so nothing can ever smear the screen. */
		loop(time) {
			if (this.destroyed) return
			this.frame = requestAnimationFrame(this.loop)
			const now = typeof time === "number" ? time : performance.now()
			const delta = clamp((now - this.lastTime) / 1000, 0.0005, 0.05)
			this.lastTime = now
			this.frameCount += 1

			if (this.isLocal && this.frameCount % 30 === 0) this.syncOrigin()

			const pointer = this.pointer
			if (pointer.active && pointer.type !== "mouse") {
				if (now - pointer.lastMove > this.config.touchIdleHide) {
					this.hide()
					pointer.active = false
				}
			}

			if (pointer.active) {
				this.chain.update(delta, pointer.x, pointer.y)
				this.emitParticles(delta)
			} else {
				/* Nothing to chase: settle in place, keep breathing. */
				const head = this.chain.head
				this.chain.update(delta, head.x, head.y)
			}

			/* Gait bob: the whole body bounces subtly in step with the crawl,
			   breathes slowly when idle and sways a touch sideways - a rigid
			   gliding body reads as fake no matter how good the legs are. */
			const speedNorm = Math.min(1, this.chain.speed / this.config.maxHeadSpeed)
			this.gaitTime = (this.gaitTime || 0) + delta
			const bounce = 1.1 + 2.6 * speedNorm * speedNorm
			const bobY =
				wave(this.gaitTime * 18, 0.6) * bounce + wave(this.gaitTime * 0.9, 0) * 0.8
			const bobX = wave(this.gaitTime * 9, 1.4) * 1.8 * speedNorm
			this.scene.position.set(bobX, bobY, 0)

			for (let index = 0; index < this.legs.length; index++) {
				/* Legs share a small step budget each frame so at most a couple
				   of feet are airborne at once - that is what makes the gait
				   read as crawling instead of synchronized flailing. */
				const budget = {
					claimed: 0,
					max: this.config.legs.maxSwinging,
					tryClaim() {
						if (this.claimed >= this.max) return false
						this.claimed += 1
						return true
					},
				}
				this.legs[index].update(delta, this.chain.time, this.chain.headAngle, speedNorm, budget)
			}
			this.particles.update(delta)

			if (!this.visible && this.particles.alive === 0) return
			this.writeBodyGeometry()
			this.writeHeadTransform()
			this.renderer.render(this.scene, this.camera)
		}

		/* Trail points peel off the tail; the body sheds sparks when it is
		   travelling fast. Budgeted per second so the pool never floods. */
		emitParticles(delta) {
			const config = this.config
			const chain = this.chain
			const rate = config.particles.spawnRate * clamp(chain.speed / 520, 0.15, 1.6)
			const spread = config.particles.spread

			this.emitter.budget += rate * delta
			while (this.emitter.budget >= 1) {
				this.emitter.budget -= 1
				const tail = chain.tail
				this.particles.spawn(tail.x, tail.y, {
					vx: -chain.head.vx * 0.08,
					vy: -chain.head.vy * 0.08,
					spread,
				})
			}

			if (chain.speed > 900) {
				const joint = chain.segments[Math.floor(chain.segments.length * 0.4)]
				this.particles.spawn(joint.x, joint.y, {
					spread: spread * 0.6,
					life: [0.25, 0.6],
					size: [1.0, 2.2],
				})
			}
		}

		/* Fill the body buffers (ribbon strip, centre line, joint dots) and mark
		   them dirty. All arrays are pre-allocated and only rewritten here. */
		writeBodyGeometry() {
			const segments = this.chain.segments
			const count = segments.length
			const config = this.config
			const hover = this.pointer.hovering ? 1.2 : 1
			const bodyWidth = config.body.width
			const last = count - 1

			if (!this._normals || this._normals.length !== count * 2) {
				this._normals = new Float32Array(count * 2)
				this._hws = new Float32Array(count)
			}
			const normals = this._normals
			const hws = this._hws

			for (let index = 0; index < count; index++) {
				const before = segments[Math.max(0, index - 1)]
				const after = segments[Math.min(last, index + 1)]
				const tangentX = after.x - before.x
				const tangentY = after.y - before.y
				const length = Math.hypot(tangentX, tangentY) || 1
				normals[index * 2] = -tangentY / length
				normals[index * 2 + 1] = tangentX / length
				hws[index] = this.chain.widthFor(index, bodyWidth)
			}

			/* ---- tapered additive ribbon (triangle list) ---- */
			const positions = this.ribbonPositions
			const colors = this.ribbonColors
			let vertexIndex = 0
			for (let index = 0; index < last; index++) {
				const p0 = segments[index]
				const p1 = segments[index + 1]
				const nx0 = normals[index * 2]
				const ny0 = normals[index * 2 + 1]
				const nx1 = normals[(index + 1) * 2]
				const ny1 = normals[(index + 1) * 2 + 1]
				const hw0 = hws[index]
				const hw1 = hws[index + 1]
				const color0 = this.bodyColorFor(index / last, hover, config.body.alpha)
				const color1 = this.bodyColorFor((index + 1) / last, hover, config.body.alpha)

				const l0x = p0.x + nx0 * hw0
				const l0y = p0.y + ny0 * hw0
				const r0x = p0.x - nx0 * hw0
				const r0y = p0.y - ny0 * hw0
				const l1x = p1.x + nx1 * hw1
				const l1y = p1.y + ny1 * hw1
				const r1x = p1.x - nx1 * hw1
				const r1y = p1.y - ny1 * hw1

				positions[vertexIndex * 3] = l0x
				positions[vertexIndex * 3 + 1] = l0y
				positions[vertexIndex * 3 + 2] = 0
				colors[vertexIndex * 3] = color0.r
				colors[vertexIndex * 3 + 1] = color0.g
				colors[vertexIndex * 3 + 2] = color0.b
				vertexIndex += 1

				positions[vertexIndex * 3] = r0x
				positions[vertexIndex * 3 + 1] = r0y
				positions[vertexIndex * 3 + 2] = 0
				colors[vertexIndex * 3] = color0.r
				colors[vertexIndex * 3 + 1] = color0.g
				colors[vertexIndex * 3 + 2] = color0.b
				vertexIndex += 1

				positions[vertexIndex * 3] = l1x
				positions[vertexIndex * 3 + 1] = l1y
				positions[vertexIndex * 3 + 2] = 0
				colors[vertexIndex * 3] = color1.r
				colors[vertexIndex * 3 + 1] = color1.g
				colors[vertexIndex * 3 + 2] = color1.b
				vertexIndex += 1

				positions[vertexIndex * 3] = r0x
				positions[vertexIndex * 3 + 1] = r0y
				positions[vertexIndex * 3 + 2] = 0
				colors[vertexIndex * 3] = color0.r
				colors[vertexIndex * 3 + 1] = color0.g
				colors[vertexIndex * 3 + 2] = color0.b
				vertexIndex += 1

				positions[vertexIndex * 3] = l1x
				positions[vertexIndex * 3 + 1] = l1y
				positions[vertexIndex * 3 + 2] = 0
				colors[vertexIndex * 3] = color1.r
				colors[vertexIndex * 3 + 1] = color1.g
				colors[vertexIndex * 3 + 2] = color1.b
				vertexIndex += 1

				positions[vertexIndex * 3] = r1x
				positions[vertexIndex * 3 + 1] = r1y
				positions[vertexIndex * 3 + 2] = 0
				colors[vertexIndex * 3] = color1.r
				colors[vertexIndex * 3 + 1] = color1.g
				colors[vertexIndex * 3 + 2] = color1.b
				vertexIndex += 1
			}
			this.bodyRibbon.geometry.getAttribute("position").needsUpdate = true
			this.bodyRibbon.geometry.getAttribute("color").needsUpdate = true

			/* ---- thin glowing core line ---- */
			const linePositions = this.bodyPositions
			const lineColors = this.bodyLineColors
			for (let index = 0; index < count; index++) {
				const segment = segments[index]
				const progress = index / last
				const color = this.bodyColorFor(progress, hover, config.body.alpha * 1.6)
				linePositions[index * 3] = segment.x
				linePositions[index * 3 + 1] = segment.y
				linePositions[index * 3 + 2] = 0
				lineColors[index * 3] = color.r
				lineColors[index * 3 + 1] = color.g
				lineColors[index * 3 + 2] = color.b
			}
			this.bodyLine.geometry.getAttribute("position").needsUpdate = true
			this.bodyLine.geometry.getAttribute("color").needsUpdate = true

			/* ---- small trailing points at every joint ---- */
			const jointPositions = this.jointPositions
			const jointColors = this.jointColors
			const core = this.rgb.core
			for (let index = 0; index < count; index++) {
				const segment = segments[index]
				const progress = 1 - index / last
				const alpha = (0.05 + progress * 0.4) * hover
				jointPositions[index * 3] = segment.x
				jointPositions[index * 3 + 1] = segment.y
				jointPositions[index * 3 + 2] = 0
				jointColors[index * 3] = (core.r / 255) * alpha
				jointColors[index * 3 + 1] = (core.g / 255) * alpha
				jointColors[index * 3 + 2] = (core.b / 255) * alpha
			}
			this.joints.geometry.getAttribute("position").needsUpdate = true
			this.joints.geometry.getAttribute("color").needsUpdate = true
		}

		/* Body gradient colour at progress u: core -> accent -> accentAlt,
		   brightness fading toward the tail so additive stays soft. */
		bodyColorFor(progress, hover, alpha) {
			const rgb = this.rgb
			const color = this._color || (this._color = { r: 0, g: 0, b: 0 })
			if (progress < 0.5) {
				const t = clamp(progress * 2, 0, 1)
				color.r = lerp(rgb.core.r, rgb.accent.r, t)
				color.g = lerp(rgb.core.g, rgb.accent.g, t)
				color.b = lerp(rgb.core.b, rgb.accent.b, t)
			} else {
				const t = clamp((progress - 0.5) * 2, 0, 1)
				color.r = lerp(rgb.accent.r, rgb.accentAlt.r, t)
				color.g = lerp(rgb.accent.g, rgb.accentAlt.g, t)
				color.b = lerp(rgb.accent.b, rgb.accentAlt.b, t)
			}
			const fade = Math.pow(1 - progress, 0.8) * alpha * hover
			const strength = 0.06 + 0.94 * fade
			color.r = (color.r / 255) * strength
			color.g = (color.g / 255) * strength
			color.b = (color.b / 255) * strength
			return color
		}

		/* Head glow, lens (velocity-rotated) and nucleus follow the head. */
		writeHeadTransform() {
			const head = this.chain.head
			const config = this.config
			const pulse = 1 + Math.sin(this.chain.time * 3.1) * 0.06
			const hover = this.pointer.hovering ? 1.25 : 1

			this.headGlow.position.set(head.x, head.y, 0)
			const glow = config.head.glow * pulse * hover
			this.headGlow.scale.set(glow, glow, 1)

			this.headLens.position.set(head.x, head.y, 0)
			this.headLens.rotation.z = this.chain.headAngle

			this.headCore.position.set(head.x, head.y, 0)
		}

		}

	/* =====================================================================
	   Public API
	   ===================================================================== */
	const instances = []
	let motionWatched = false

	const prefersReducedMotion = () =>
		typeof window !== "undefined" && typeof window.matchMedia === "function"
			? window.matchMedia("(prefers-reduced-motion: reduce)").matches
			: false

	const watchMotionPreference = () => {
		if (motionWatched || typeof window === "undefined" || typeof window.matchMedia !== "function")
			return
		motionWatched = true
		const query = window.matchMedia("(prefers-reduced-motion: reduce)")
		const onChange = () => {
			if (query.matches) {
				if (api.auto) {
					api.auto.destroy()
					api.auto = null
				}
				return
			}
			if (!api.auto && !api.disabled) api.auto = api.startPreferred()
		}
		if (typeof query.addEventListener === "function") query.addEventListener("change", onChange)
		else if (typeof query.addListener === "function") query.addListener(onChange)
	}

	const api = {
		DEFAULTS,
		BodyChain,
		ParticlePool,
		CursorCreature3D,
		instances,
		auto: null,
		disabled: false,

		init(options) {
			const creature = new CursorCreature3D(options)
			creature.init()
			instances.push(creature)
			return creature
		},

		destroyAll() {
			while (instances.length) instances.pop().destroy()
		},

		/* Start the best available renderer: the Three.js/WebGL creature when
		   possible, otherwise the 2D canvas fallback (missing THREE or WebGL
		   creation failure). Only one creature is ever active. */
		startPreferred() {
			if (typeof THREE !== "undefined") {
				const creature = api.init()
				if (creature.canvas) return creature
				/* WebGL unavailable (blocked GPU, context limit…): dispose the
				   inert instance and hand over to the 2D module. */
				creature.destroy()
				const at = instances.indexOf(creature)
				if (at !== -1) instances.splice(at, 1)
			}
			const fallback =
				typeof window !== "undefined" ? window.CursorCreature : null
			if (fallback && typeof fallback.init === "function") {
				api.auto = fallback.init()
				return api.auto
			}
			return null
		},

		/* Runs on DOMContentLoaded. Disable with data-cursor-creature="off".
		   Never auto-starts under reduced motion; falls back to the 2D canvas
		   module when THREE is missing or WebGL cannot be created. */
		autoInit() {
			if (typeof document === "undefined") return null
			if (api.auto) return api.auto
			const body = document.body
			const html = document.documentElement
			if (!body || !html) return null
			api.disabled =
				(body.dataset && body.dataset.cursorCreature === "off") ||
				(html.dataset && html.dataset.cursorCreature === "off")
			if (api.disabled) return null
			watchMotionPreference()
			if (prefersReducedMotion()) return null
			api.auto = api.startPreferred()
			return api.auto
		},
	}

	return api
})
