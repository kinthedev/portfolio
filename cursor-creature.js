/**
 * cursor-creature.js
 * ---------------------------------------------------------------------------
 * Organic cursor-following entity for the KIN portfolio.
 *
 * A damped-spring head chases the pointer with inertia, while a chain of body
 * segments chases the segment in front of it (snake / centipede / tentacle
 * behaviour). The body is drawn on a transparent 2D canvas with additive
 * ("lighter") blending, bloom accumulation and a fading particle trail.
 *
 * Usage
 *   const creature = window.CursorCreature.init({ segmentCount: 30 })
 *   creature.setOptions({ spacing: 13 })
 *   creature.destroy()
 *
 * Container scoped (coordinates stay local to that element):
 *   window.CursorCreature.init({ container: document.querySelector(".hero") })
 *
 * The module auto-initialises against the document when loaded as a plain
 * script tag. Disable it with data-cursor-creature="off" on <body>, or call
 * window.CursorCreature.destroy() to tear the auto instance down.
 *
 * Notes
 *   - requestAnimationFrame loop, paused when the tab is hidden or blurred.
 *   - prefers-reduced-motion: never auto-starts, and a running instance is
 *     destroyed if the user enables reduced motion while browsing.
 *   - touch devices: the creature appears where you touch and settles away
 *     after a short idle period.
 *   - one canvas for the whole effect, no DOM nodes per segment.
 * ---------------------------------------------------------------------------
 */
;(function (root, factory) {
	const api = factory()
	if (typeof module === "object" && module.exports) module.exports = api
	if (!root) return
	root.CursorCreature = api
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
	   Math helpers.
	   Every smoothing value is frame-rate independent: decay is expressed
	   per second (lambda) and converted with 1 - exp(-lambda * dt), so the
	   motion feels identical at 60Hz, 90Hz or after a dropped frame.
	   ===================================================================== */
	const TWO_PI = Math.PI * 2

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
	/* Layered sine "noise": smooth, deterministic, never jitters (no random
	   per frame), and cheap enough to run for every body segment. */
	const wave = (time, phase) =>
		Math.sin(time) * 0.68 + Math.sin(time * 1.73 + phase * 1.9) * 0.32

	const isPlainObject = (value) =>
		Boolean(value) && typeof value === "object" && !Array.isArray(value)

	/* One level deep merge: enough for { colors, glow, wiggle, ... } groups. */
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

	const rgba = (rgb, alpha) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`

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
		band: { min: 0.7, max: 1.5 },
		stretch: { min: 0.86, max: 1.35, speedRef: 1150 },
		angleFollow: 14,
		wiggle: {
			base: 1.6,
			settle: 5.4,
			rate: 1.15,
			wander: 5,
			motionThreshold: 40,
			settleTime: 1.2,
		},
		radius: { head: 3.8, tail: 0.7 },
		bodyWidth: 1,
		colors: { core: "#fff6ef", accent: "#f4744a", accentAlt: "#b98ef7", trail: "#f6d5bf" },
		glow: { halo: 34, haloAlpha: 0.32, line: [7, 3, 1.2] },
		particles: {
			max: 150,
			maxCoarse: 80,
			life: [0.5, 1.5],
			size: [0.7, 2.4],
			drag: 1.1,
			spawnRate: 26,
			spread: 26,
			burst: 18,
		},
		joints: true,
		opacity: 1,
		interactiveSelector:
			"a, button, .project-visual, .music-player, .music-toggle, .music-step",
		touchIdleHide: 1400,
		pixelRatioCap: 1.7,
		autoStart: true,
	}

	/* =====================================================================
	   CreatureChain — the body simulation.
	   Pure math, no DOM, so it can be exercised headless in tests.

	   1. The head is a damped spring chasing the pointer -> inertia + delay.
	   2. Every following segment damps toward the point `spacing` behind the
	      segment in front of it. Perpendicular layered-sine noise bends the
	      body so it never reads as a straight line.
	   3. The distance is then clamped into a band, so a fast flick stretches
	      the body (up to `band.max`) without ever unspooling it, while the
	      delay that remains lives in the joint *angles* — that is what makes
	      the creature curve and whip instead of just dragging.
	   ===================================================================== */
	class CreatureChain {
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
			this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
			this.reset(0, 0, 0)
		}

		get head() {
			return this.segments[0]
		}

		get tail() {
			return this.segments[this.segments.length - 1]
		}

		/* Lay the body out in a straight line behind (x, y). Used on the first
		   pointer sighting so the creature never "crawls in" from a stale
		   position, and never snaps into view while it is visible. */
		reset(x, y, angle = 0) {
			const directionX = Math.cos(angle)
			const directionY = Math.sin(angle)
			this.segments.length = 0
			for (let index = 0; index < this.segmentCount; index++) {
				const pointX = x - directionX * this.spacing * index
				const pointY = y - directionY * this.spacing * index
				this.segments.push({ x: pointX, y: pointY, vx: 0, vy: 0, angle, radius: 1 })
			}
			this.time = 0
			this.speed = 0
			this.stretch = 1
			this.idleTime = 0
			this.measureBounds()
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

			/* ---- 1. head: damped spring toward the pointer ---- */
			/* A tiny wander keeps the creature breathing when the pointer rests. */
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
				velocityX *= scale
				velocityY *= scale
				head.vx = velocityX
				head.vy = velocityY
				speed = config.maxHeadSpeed
			}

			/* Never teleport: cap the distance covered in a single frame. */
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
			const minDistance = spacing * config.band.min
			const maxDistance = spacing * config.band.max

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

				/* Organic bend: push the follow target sideways with smooth
				   layered sine, strongest near the head, calmer at the tail. */
				const phase = index * 0.52
				const taper = 1 - (index / (count - 1)) * 0.45
				const offset =
					wave(this.time * wiggleRate + phase, phase) * wiggleAmplitude * taper
				const pointX = previous.x - deltaX * spacing - deltaY * offset
				const pointY = previous.y - deltaY * spacing + deltaX * offset

				/* Per-segment delay: the tail reacts later than the neck, which
				   is what produces the soft trailing whip. */
				const lambda = config.follow * Math.pow(config.followFalloff, index)
				segment.x = damp(segment.x, pointX, lambda, step)
				segment.y = damp(segment.y, pointY, lambda, step)

				/* Keep the bone length inside the band: stretch on flicks, never
				   unspool. Direction — and therefore the curvature — is kept. */
				const boneX = segment.x - previous.x
				const boneY = segment.y - previous.y
				const boneLength = Math.hypot(boneX, boneY)
				if (boneLength > 0.001) {
					const clamped = clamp(boneLength, minDistance, maxDistance)
					if (clamped !== boneLength) {
						const ratio = clamped / boneLength
						segment.x = previous.x + boneX * ratio
						segment.y = previous.y + boneY * ratio
					}
				}
			}

			/* ---- 4. orientation: joint angles ease toward the local direction ---- */
			for (let index = count - 1; index >= 1; index--) {
				const segment = this.segments[index]
				const previous = this.segments[index - 1]
				const targetAngle = Math.atan2(previous.y - segment.y, previous.x - segment.x)
				segment.angle = dampAngle(segment.angle, targetAngle, config.angleFollow, step)
			}
			const second = this.segments[1]
			const bodyAngle = Math.atan2(head.y - second.y, head.x - second.x)
			const headAngle =
				speed > config.wiggle.motionThreshold ? Math.atan2(velocityY, velocityX) : bodyAngle
			head.angle = dampAngle(head.angle, headAngle, config.angleFollow * 0.85, step)

			/* ---- 5. radius: taper down the body + slow breathing pulse ---- */
			for (let index = 0; index < count; index++) {
				const segment = this.segments[index]
				const taper = Math.pow(1 - index / (count - 1), 0.55)
				const pulse = 1 + Math.sin(this.time * 2.6 - index * 0.45) * 0.09
				segment.radius = lerp(config.radius.tail, config.radius.head, taper) * pulse
			}

			this.measureBounds()
			return this
		}

		measureBounds() {
			const segments = this.segments
			let minX = Infinity
			let minY = Infinity
			let maxX = -Infinity
			let maxY = -Infinity
			for (let index = 0; index < segments.length; index++) {
				const segment = segments[index]
				const radius = segment.radius + 1
				if (segment.x - radius < minX) minX = segment.x - radius
				if (segment.y - radius < minY) minY = segment.y - radius
				if (segment.x + radius > maxX) maxX = segment.x + radius
				if (segment.y + radius > maxY) maxY = segment.y + radius
			}
			this.bounds.minX = minX
			this.bounds.minY = minY
			this.bounds.maxX = maxX
			this.bounds.maxY = maxY
			return this.bounds
		}
	}

	/* =====================================================================
	   ParticleField — pooled trail points.
	   Fixed size, recycled in a ring buffer, zero allocations per frame.
	   ===================================================================== */
	class ParticleField {
		constructor(options) {
			const config = merge(
				{ max: 150, life: [0.5, 1.5], size: [0.7, 2.4], drag: 1.1, color: "#f6d5bf" },
				options,
			)
			this.config = config
			this.items = new Array(Math.max(1, Math.round(config.max)))
			for (let index = 0; index < this.items.length; index++) {
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
			this.cursor = 0
			this.alive = 0
		}

		spawn(x, y, options) {
			const config = this.config
			const item = this.items[this.cursor]
			this.cursor = (this.cursor + 1) % this.items.length
			const life = (options && options.life) || config.life
			const size = (options && options.size) || config.size
			const spread = (options && options.spread) || 0
			const baseX = options && options.vx ? options.vx : 0
			const baseY = options && options.vy ? options.vy : 0

			item.active = true
			item.x = x
			item.y = y
			item.vx = baseX + (Math.random() - 0.5) * spread
			item.vy = baseY + (Math.random() - 0.5) * spread
			item.maxLife = lerp(life[0], life[1], Math.random())
			item.life = item.maxLife
			item.size = lerp(size[0], size[1], Math.random())
			return item
		}

		update(delta) {
			const drag = Math.exp(-this.config.drag * delta)
			let alive = 0
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
				alive++
			}
			this.alive = alive
			return alive
		}

		clear() {
			for (let index = 0; index < this.items.length; index++) {
				this.items[index].active = false
			}
			this.alive = 0
		}
	}

	/* =====================================================================
	   Canvas path helpers.
	   Points are plain { x, y } objects reused between frames.
	   ===================================================================== */
	/* Catmull-Rom converted to cubic beziers: one silky path for the strokes.
	   `move` false keeps tracing in the current sub-path, which is how the two
	   sides of the body ribbon are stitched into a single closed outline. */
	const traceSmoothPath = (context, points, count, reverse, move = true) => {
		if (count < 2) return
		const at = (index) => points[reverse ? count - 1 - index : index]
		const first = at(0)
		if (move) context.moveTo(first.x, first.y)
		else context.lineTo(first.x, first.y)
		for (let index = 0; index < count - 1; index++) {
			const p0 = at(index === 0 ? 0 : index - 1)
			const p1 = at(index)
			const p2 = at(index + 1)
			const p3 = at(index + 2 > count - 1 ? count - 1 : index + 2)
			context.bezierCurveTo(
				p1.x + (p2.x - p0.x) / 6,
				p1.y + (p2.y - p0.y) / 6,
				p2.x - (p3.x - p1.x) / 6,
				p2.y - (p3.y - p1.y) / 6,
				p2.x,
				p2.y,
			)
		}
	}

	const ensurePoint = (buffer, index) => buffer[index] || (buffer[index] = { x: 0, y: 0 })

	/* =====================================================================
	   CursorCreature — the reusable component.
	   Owns the canvas, the pointer tracking (global by default), the
	   animation loop and the rendering.
	   ===================================================================== */
	class CursorCreature {
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
			this.canvas = null
			this.context = null
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
			this.hasContent = false
			this.handlers = null
			this.observer = null
			this.loop = this.loop.bind(this)

			this.chain = new CreatureChain(config)
			const coarse =
				typeof window !== "undefined" && typeof window.matchMedia === "function"
					? window.matchMedia("(pointer: coarse)").matches
					: false
			this.isCoarse = coarse
			this.particles = new ParticleField({
				max: coarse ? config.particles.maxCoarse : config.particles.max,
				life: config.particles.life,
				size: config.particles.size,
				drag: config.particles.drag,
			})
			this.rgb = {
				core: hexToRgb(config.colors.core),
				accent: hexToRgb(config.colors.accent),
				accentAlt: hexToRgb(config.colors.accentAlt),
				trail: hexToRgb(config.colors.trail),
			}
			/* Reused scratch buffers: no per-frame allocation for the ribbon. */
			this.buffers = { left: [], right: [] }
			this.pointer = {
				x: 0,
				y: 0,
				lastMove: 0,
				speed: 0,
				active: false,
				hovering: false,
				type: "mouse",
			}
			this.emitter = { budget: 0, distance: 0 }
			this.point = { x: 0, y: 0 }
			this.instance = this
		}

		init() {
			if (this.destroyed || this.canvas || typeof document === "undefined") return this
			const parent = this.container || document.body
			if (!parent) return this

			const canvas = document.createElement("canvas")
			canvas.className = this.isLocal
				? "cursor-creature-canvas cursor-creature-canvas--local"
				: "cursor-creature-canvas"
			canvas.setAttribute("aria-hidden", "true")
			canvas.setAttribute("role", "presentation")
			parent.appendChild(canvas)

			const context = canvas.getContext("2d", { alpha: true })
			if (!context) {
				canvas.remove()
				return this
			}

			this.canvas = canvas
			this.context = context
			/* Local mode needs a positioned parent so the overlay layers
			   exactly on top of the container. Only touch static parents. */
			if (this.isLocal) {
				const parentStyle = window.getComputedStyle(parent)
				if (parentStyle.position === "static") parent.style.position = "relative"
			}
			this.resize()
			this.bindEvents()
			this.start()
			return this
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

		/* Sizing: CSS pixels for the maths, capped device pixels for crisper
		   glow without paying for a 4K buffer on a retina phone. */
		resize() {
			if (!this.canvas || !this.context) return this
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
			this.canvas.width = Math.round(width * dpr)
			this.canvas.height = Math.round(height * dpr)
			this.context.setTransform(dpr, 0, 0, dpr, 0, 0)
			this.context.lineCap = "round"
			this.context.lineJoin = "round"
			this.hasContent = false

			const head = this.chain.head
			if (this.pointer.active) {
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

		/* =====================================================================
		   Global pointer tracking. The creature follows regardless of what
		   is under the pointer, and never blocks interaction (the canvas is
		   pointer-events: none).
		   ===================================================================== */
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

		/* Client coords -> creature space. Writes into a reused scratch object
		   so the hot pointermove path never allocates. */
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
				/* First sighting (or re-entry): lay the body down under the
				   pointer while the canvas is still invisible, so the creature
				   never snaps and never crawls in from a stale position. */
				this.chain.reset(point.x, point.y, 0)
				this.particles.clear()
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
				this.particles.clear()
			} else {
				this.pointer.x = point.x
				this.pointer.y = point.y
			}
			this.show()

			/* A soft burst keeps the interaction feeling physical. */
			const origin = this.chain.head
			const burst = this.config.particles.burst
			for (let index = 0; index < burst; index++) {
				this.particles.spawn(origin.x, origin.y, {
					spread: 210,
					life: [0.3, 0.9],
					size: [0.7, 2.1],
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
			this.canvas.style.opacity = String(this.config.opacity)
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
				this.chain.reset(this.chain.head.x, this.chain.head.y, this.chain.head.angle)
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
			if (this.canvas) {
				this.canvas.remove()
				this.canvas = null
				this.context = null
			}
			return this
		}

		/* =====================================================================
		   Animation loop. Delta time is measured (never assumed), so a
		   dropped frame or a 144Hz display cannot change the feel.
		   ===================================================================== */
		loop(time) {
			if (this.destroyed) return
			this.frame = requestAnimationFrame(this.loop)
			const now = typeof time === "number" ? time : performance.now()
			const delta = clamp((now - this.lastTime) / 1000, 0.0005, 0.05)
			this.lastTime = now
			this.frameCount += 1

			/* Local mode: the container may move while scrolling. */
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
			this.particles.update(delta)

			if (!this.visible && this.particles.alive === 0) {
				if (this.hasContent) {
					this.clear()
					this.hasContent = false
				}
				return
			}
			this.render()
			this.hasContent = true
		}

		/* Trail points peel off the tail; the body sheds sparks when it is
		   travelling fast. Budgeted per second so the pool never floods. */
		emitParticles(delta) {
			const config = this.config
			const head = this.chain.head
			const tail = this.chain.tail
			const rate = config.particles.spawnRate * clamp(this.chain.speed / 520, 0.15, 1.6)
			const spread = config.particles.spread

			this.emitter.budget += rate * delta
			while (this.emitter.budget >= 1) {
				this.emitter.budget -= 1
				this.particles.spawn(tail.x, tail.y, {
					vx: -head.vx * 0.08,
					vy: -head.vy * 0.08,
					spread,
				})
			}

			if (this.chain.speed > 900) {
				const segments = this.chain.segments
				const joint = segments[Math.floor(segments.length * 0.4)]
				this.particles.spawn(joint.x, joint.y, {
					spread: spread * 0.6,
					life: [0.25, 0.6],
					size: [0.6, 1.6],
				})
			}
		}

		clear() {
			if (!this.context || !this.canvas) return
			this.context.setTransform(1, 0, 0, 1, 0, 0)
			this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
			this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
		}

		/* Tapered body outline: per-segment normals, buffers reused. */
		buildRibbon(segments, count) {
			const left = this.buffers.left
			const right = this.buffers.right
			const width = this.config.bodyWidth
			for (let index = 0; index < count; index++) {
				const previous = segments[index === 0 ? 0 : index - 1]
				const next = segments[index === count - 1 ? count - 1 : index + 1]
				let tangentX = next.x - previous.x
				let tangentY = next.y - previous.y
				const length = Math.hypot(tangentX, tangentY) || 1
				tangentX /= length
				tangentY /= length

				const radius = segments[index].radius * width
				const leftPoint = ensurePoint(left, index)
				const rightPoint = ensurePoint(right, index)
				leftPoint.x = segments[index].x - tangentY * radius
				leftPoint.y = segments[index].y + tangentX * radius
				rightPoint.x = segments[index].x + tangentY * radius
				rightPoint.y = segments[index].y - tangentX * radius
			}
			return this.buffers
		}

		/* =====================================================================
		   Rendering.
		   The canvas is FULLY CLEARED every frame and everything is redrawn
		   from scratch. Earlier builds faded the previous frame with
		   destination-out + additive "lighter" blending, but that residue
		   never decays to exactly zero, so fast movement burned permanent
		   white streaks onto the page. Now nothing can accumulate: the
		   fading trail comes solely from the pooled particles, whose alpha
		   is derived from their remaining life, so trails still die softly.
		   ===================================================================== */
		render() {
			const context = this.context

			this.clear()

			context.globalCompositeOperation = "lighter"
			this.drawParticles(context)
			this.drawBody(context)
			this.drawHead(context)

			context.globalCompositeOperation = "source-over"
		}

		drawParticles(context) {
			const items = this.particles.items
			const trail = this.rgb.trail
			for (let index = 0; index < items.length; index++) {
				const item = items[index]
				if (!item.active) continue
				const progress = clamp(item.life / item.maxLife, 0, 1)
				/* Quadratic falloff: trails die softly, never with a pop. */
				const alpha = progress * progress * 0.55
				const size = item.size * (0.35 + progress * 0.65)
				context.fillStyle = rgba(trail, alpha)
				context.beginPath()
				context.arc(item.x, item.y, size, 0, TWO_PI)
				context.fill()
			}
		}

		drawBody(context) {
			const segments = this.chain.segments
			const count = segments.length
			const config = this.config
			const rgb = this.rgb
			const hover = this.pointer.hovering ? 1.3 : 1
			const lines = config.glow.line

			/* ---- soft tapered body mass ---- */
			const ribbon = this.buildRibbon(segments, count)
			const head = segments[0]
			const tail = segments[count - 1]
			const gradient = context.createLinearGradient(
				head.x,
				head.y,
				tail.x,
				tail.y,
			)
			gradient.addColorStop(0, rgba(rgb.accent, 0.28 * hover))
			gradient.addColorStop(0.45, rgba(rgb.accentAlt, 0.16))
			gradient.addColorStop(1, rgba(rgb.accentAlt, 0))
			context.beginPath()
			traceSmoothPath(context, ribbon.left, count, false, true)
			traceSmoothPath(context, ribbon.right, count, true, false)
			context.closePath()
			context.fillStyle = gradient
			context.fill()

			/* ---- thin glowing organic line through the body ---- */
			context.beginPath()
			traceSmoothPath(context, segments, count, false, true)
			context.strokeStyle = rgba(rgb.accent, 0.2 * hover)
			context.lineWidth = lines[0]
			context.stroke()
			context.strokeStyle = rgba(rgb.accentAlt, 0.3 * hover)
			context.lineWidth = lines[1]
			context.stroke()
			context.strokeStyle = rgba(rgb.core, 0.85)
			context.lineWidth = lines[2]
			context.stroke()

			/* ---- small trailing points at every joint ---- */
			if (config.joints) {
				for (let index = 1; index < count; index++) {
					const segment = segments[index]
					const progress = 1 - index / count
					context.fillStyle = rgba(rgb.core, 0.05 + progress * 0.25)
					context.beginPath()
					context.arc(segment.x, segment.y, segment.radius * 0.55, 0, TWO_PI)
					context.fill()
				}
			}
		}

		drawHead(context) {
			const head = this.chain.head
			const config = this.config
			const rgb = this.rgb
			const hover = this.pointer.hovering ? 1.35 : 1
			const pulse = 1 + Math.sin(this.chain.time * 3.1) * 0.07
			const radius = config.glow.halo * pulse * hover

			/* ---- halo ---- */
			const halo = context.createRadialGradient(head.x, head.y, 0, head.x, head.y, radius)
			halo.addColorStop(0, rgba(rgb.core, config.glow.haloAlpha * hover))
			halo.addColorStop(0.3, rgba(rgb.accent, config.glow.haloAlpha * 0.55 * hover))
			halo.addColorStop(1, rgba(rgb.accentAlt, 0))
			context.fillStyle = halo
			context.beginPath()
			context.arc(head.x, head.y, radius, 0, TWO_PI)
			context.fill()

			/* ---- oriented lens: the head visibly points where it travels ---- */
			context.save()
			context.translate(head.x, head.y)
			context.rotate(head.angle)
			const length = 7.5 + Math.min(4, this.chain.speed / 320)
			context.beginPath()
			context.ellipse(0, 0, length, 2.6 * pulse, 0, 0, TWO_PI)
			context.fillStyle = rgba(rgb.core, 0.3)
			context.fill()
			context.restore()

			/* ---- bright nucleus ---- */
			context.beginPath()
			context.arc(head.x, head.y, 1.8 * pulse, 0, TWO_PI)
			context.fillStyle = rgba(rgb.core, 0.95)
			context.fill()
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
			if (!api.auto && !api.disabled) api.auto = api.init()
		}
		if (typeof query.addEventListener === "function") query.addEventListener("change", onChange)
		else if (typeof query.addListener === "function") query.addListener(onChange)
	}

	const api = {
		DEFAULTS,
		CreatureChain,
		ParticleField,
		CursorCreature,
		instances,
		auto: null,
		disabled: false,

		/* Create a new instance. Returns the ready-to-use component. */
		init(options) {
			const creature = new CursorCreature(options)
			creature.init()
			instances.push(creature)
			return creature
		},

		destroyAll() {
			while (instances.length) instances.pop().destroy()
		},

		/* Runs on DOMContentLoaded. Disable with data-cursor-creature="off"
		   on <body> or <html>. Never auto-starts under reduced motion.
		   The Three.js build (CursorCreature3D) supersedes this 2D canvas
		   version: when its module is loaded it owns auto-init and the
		   reduced-motion watcher, and only falls back to this module when
		   WebGL is unavailable — so both must never run together. */
		autoInit() {
			if (typeof document === "undefined") return null
			if (api.auto) return api.auto
			if (typeof window !== "undefined" && window.CursorCreature3D) return null
			const body = document.body
			const html = document.documentElement
			if (!body || !html) return null
			api.disabled =
				(body.dataset && body.dataset.cursorCreature === "off") ||
				(html.dataset && html.dataset.cursorCreature === "off")
			if (api.disabled) return null
			watchMotionPreference()
			if (prefersReducedMotion()) return null
			api.auto = api.init()
			return api.auto
		},
	}

	return api
})
