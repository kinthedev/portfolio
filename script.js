document.addEventListener("DOMContentLoaded", () => {
	const reduceMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches
	const navLinks = document.querySelectorAll(".top-nav a")
	const sections = document.querySelectorAll("main section[id]")
	const intro = document.querySelector(".intro")
	const introLetters = document.querySelectorAll(".intro-word span")

	if (window.gsap && intro && introLetters.length) {
		const introTl = gsap.timeline({
			defaults: { ease: "power3.out" },
			onComplete: () => intro.classList.add("hidden-intro"),
		})

		introTl
			.to(introLetters, {
				opacity: 1,
				y: 0,
				scale: 1,
				filter: "blur(0px)",
				duration: 0.9,
				stagger: 0.12,
			})
			.to(".intro-meta", { opacity: 1, y: 0, duration: 0.8, delay: 0.2 }, "-=0.2")
			.to(intro, {
				opacity: 0,
				filter: "blur(16px)",
				scale: 1.02,
				duration: 1.1,
				delay: 1.1,
			})
	} else if (intro) {
		intro.classList.add("hidden-intro")
	}

	const setActiveNav = () => {
		const offset = window.scrollY + 140
		let currentId = "home"
		sections.forEach((section) => {
			if (offset >= section.offsetTop) {
				currentId = section.id
			}
		})
		navLinks.forEach((link) => {
			const isCurrent = link.getAttribute("href") === `#${currentId}`
			link.classList.toggle("active", isCurrent)
		})
	}

	setActiveNav()
	window.addEventListener("scroll", setActiveNav, { passive: true })

	if (window.gsap && window.ScrollTrigger) {
		gsap.registerPlugin(ScrollTrigger)
		gsap.utils.toArray(".reveal-block").forEach((element) => {
			if (reduceMotion) {
				element.style.opacity = "1"
				element.style.transform = "none"
				return
			}
			gsap.fromTo(
				element,
				{ opacity: 0, y: 30 },
				{
					opacity: 1,
					y: 0,
					duration: 1,
					ease: "power3.out",
					scrollTrigger: { trigger: element, start: "top 82%" },
				},
			)
		})
	} else {
		document.querySelectorAll(".reveal-block").forEach((element) => {
			element.style.opacity = "1"
			element.style.transform = "none"
		})
	}

	const customCursor = document.querySelector(".custom-cursor")
	if (customCursor && !window.matchMedia("(pointer: coarse)").matches) {
		customCursor.style.opacity = "1"
		window.addEventListener("pointermove", (event) => {
			customCursor.style.left = `${event.clientX}px`
			customCursor.style.top = `${event.clientY}px`
		})
		document
			.querySelectorAll(
				"a, button, .project-visual, .music-player, .music-toggle, .music-step",
			)
			.forEach((element) => {
				element.addEventListener("mouseenter", () =>
					customCursor.classList.add("hover"),
				)
				element.addEventListener("mouseleave", () =>
					customCursor.classList.remove("hover"),
				)
			})
	}

	const techCanvas = document.getElementById("tech-orbit-canvas")
	const techInfo = document.getElementById("tech-info")
	const techName = document.getElementById("tech-name")
	const techCategory = document.getElementById("tech-category")
	const techDescription = document.getElementById("tech-description")
	const techRelated = document.getElementById("tech-related")
	const techIcon = document.getElementById("tech-icon")

	const techLogos = {
		React: "icons/React.png",
		Tailwind: "icons/Tailwind CSS.png",
		Bootstrap: "icons/Bootstrap.png",
		Git: "icons/Git.png",
		GitHub: "icons/GitHub.png",
		Docker: "icons/Docker.png",
		MySQL: "icons/MySQL.png",
		PostgresSQL: "icons/PostgresSQL.png",
		Kubernetes: "icons/Kubernetes.png",
		ArchLinux: "icons/Arch Linux.png",
		Nodejs: "icons/Nodejs.png",
	}

	const techEntries = [
		{
			name: "React",
			category: "Frontend",
			description:
				"Component-driven UI architecture for rich, responsive product experiences.",
			related: ["Tailwind CSS", "Bootstrap", "GitHub"],
			color: 0x61dafb,
			logo: techLogos.React,
		},
		{
			name: "Tailwind CSS",
			category: "Frontend",
			description:
				"Utility-first styling for clean, expressive, and scalable interfaces.",
			related: ["React", "Bootstrap", "Git"],
			color: 0x38bdf8,
			logo: techLogos.Tailwind,
		},
		{
			name: "Bootstrap",
			category: "Frontend",
			description:
				"Rapid UI structuring and consistent design patterns for high-speed delivery.",
			related: ["React", "Tailwind CSS", "GitHub"],
			color: 0x7d54f2,
			logo: techLogos.Bootstrap,
		},
		{
			name: "Git",
			category: "Workflow",
			description:
				"Version control and disciplined product iteration across the full lifecycle.",
			related: ["GitHub", "Docker", "React"],
			color: 0xf26b39,
			logo: techLogos.Git,
		},
		{
			name: "GitHub",
			category: "Workflow",
			description:
				"Collaboration, review, and code delivery across shipping and maintenance.",
			related: ["Git", "React", "Docker"],
			color: 0xf5f5f5,
			logo: techLogos.GitHub,
		},
		{
			name: "Docker",
			category: "Infrastructure",
			description:
				"Containerized deployment for consistent environments and faster delivery.",
			related: ["GitHub", "Kubernetes", "Arch Linux"],
			color: 0x1da5d9,
			logo: techLogos.Docker,
		},
		{
			name: "MySQL",
			category: "Database",
			description:
				"Relational data storage for structured product systems and operations.",
			related: ["PostgresSQL", "Docker", "React"],
			color: 0x1f7ae0,
			logo: techLogos.MySQL,
		},
		{
			name: "PostgresSQL",
			category: "Database",
			description:
				"Robust relational infrastructure for data-heavy and production-grade systems.",
			related: ["MySQL", "Docker", "Kubernetes"],
			color: 0x3366ff,
			logo: techLogos.PostgresSQL,
		},
		{
			name: "Kubernetes",
			category: "Infrastructure",
			description:
				"Scaling and orchestration for resilient, production-worthy deployments.",
			related: ["Docker", "Arch Linux", "GitHub"],
			color: 0x4a8af4,
			logo: techLogos.Kubernetes,
		},
		{
			name: "Arch Linux",
			category: "Environment",
			description:
				"A lightweight, performance-minded runtime environment for development flow.",
			related: ["Kubernetes", "Docker", "Git"],
			color: 0x20c997,
			logo: techLogos.ArchLinux,
		},
		{
			name: "Nodejs",
			category: "Environment",
			description:
				"A lightweight, performance-minded runtime environment for development flow.",
			related: ["Kubernetes", "Docker", "Git"],
			color: 0x20c997,
			logo: techLogos.Nodejs,
		},
	]

	if (techCanvas && window.THREE && !reduceMotion) {
		const scene = new THREE.Scene()
		const camera = new THREE.PerspectiveCamera(
			30,
			techCanvas.clientWidth / techCanvas.clientHeight,
			0.1,
			1000,
		)
		camera.position.set(0, 0.3, 8.8)
		const renderer = new THREE.WebGLRenderer({
			canvas: techCanvas,
			alpha: true,
			antialias: true,
			powerPreference: "high-performance",
		})
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8))
		renderer.setClearAlpha(0)

		const orbitGroup = new THREE.Group()
		const techMeshes = []
		const cageGeometry = new THREE.IcosahedronGeometry(1.7, 1)
		const cageWireframe = new THREE.LineSegments(
			new THREE.EdgesGeometry(cageGeometry),
			new THREE.LineBasicMaterial({
				color: 0xf4744a,
				transparent: true,
				opacity: 0.32,
				depthWrite: false,
			}),
		)
		cageWireframe.rotation.set(0.6, 0.8, 0.2)
		orbitGroup.add(cageWireframe)
		scene.add(orbitGroup)

		const ambient = new THREE.AmbientLight(0xffffff, 0.8)
		const keyLight = new THREE.PointLight(0xf4744a, 1.8, 30)
		keyLight.position.set(4, 3, 7)
		const fillLight = new THREE.PointLight(0xb98ef7, 1.2, 25)
		fillLight.position.set(-5, -4, 5)
		scene.add(ambient, keyLight, fillLight)

		const loader = new THREE.TextureLoader()
		for (let index = 0; index < techEntries.length; index += 1) {
			const item = techEntries[index]
			const texture = loader.load(item.logo)
			texture.colorSpace = THREE.SRGBColorSpace
			const sprite = new THREE.Sprite(
				new THREE.SpriteMaterial({
					map: texture,
					transparent: true,
					opacity: 0.95,
					depthWrite: false,
				}),
			)
			const y = 1 - (index / Math.max(techEntries.length - 1, 1)) * 2
			const radius = Math.sqrt(Math.max(0, 1 - y * y))
			const theta = index * (Math.PI * (3 - Math.sqrt(5)))
			const x = Math.cos(theta) * radius * 1.8
			const z = Math.sin(theta) * radius * 1.8
			sprite.scale.set(0.56, 0.56, 1)
			sprite.position.set(x, y * 1.2, z)
			sprite.userData = { item }
			orbitGroup.add(sprite)
			techMeshes.push(sprite)
		}

		const particles = []
		const particleCount = 80
		for (let i = 0; i < particleCount; i += 1) {
			const particle = new THREE.Mesh(
				new THREE.SphereGeometry(0.014, 8, 8),
				new THREE.MeshBasicMaterial({
					color: 0xf4d7b1,
					transparent: true,
					opacity: 0.62,
				}),
			)
			const t = i / particleCount
			const theta = t * Math.PI * 2
			const phi = Math.acos(1 - (2 * (i + 0.5)) / particleCount)
			const radius = 2.2 + (i % 5) * 0.12
			particle.position.set(
				radius * Math.sin(phi) * Math.cos(theta),
				radius * Math.cos(phi) * 0.66,
				radius * Math.sin(phi) * Math.sin(theta),
			)
			particles.push(particle)
			scene.add(particle)
		}

		const pointer = new THREE.Vector2()
		const raycaster = new THREE.Raycaster()
		let targetRotationX = 0.5
		let targetRotationY = 0.8
		let rotationX = 0.5
		let rotationY = 0.8
		let dragVelocityY = 0
		let dragVelocityX = 0
		let isDragging = false
		let lastX = 0
		let lastY = 0
		let hoverItem = null
		let selectedItem = techEntries[0]

		const updateTechInfo = (item) => {
			if (!item) return
			techName.textContent = item.name
			techCategory.textContent = item.category
			techDescription.textContent = item.description
			techRelated.innerHTML = ""
			item.related.forEach((entry) => {
				const chip = document.createElement("span")
				chip.textContent = entry
				techRelated.appendChild(chip)
			})
			if (item.logo) {
				techIcon.innerHTML = `<img src="${item.logo}" alt="${item.name} logo" />`
			} else {
				techIcon.textContent = item.name.slice(0, 2).toUpperCase()
			}
		}
		updateTechInfo(selectedItem)

		const setHoverState = (item) => {
			hoverItem = item
			if (techInfo) {
				const shouldShow = Boolean(item)
				techInfo.classList.toggle("is-visible", shouldShow)
				techInfo.style.opacity = shouldShow ? "1" : "0.96"
			}
		}

		techCanvas.addEventListener("mouseenter", () => {
			if (techInfo && hoverItem) {
				techInfo.classList.add("is-visible")
			}
		})
		techCanvas.addEventListener("mouseleave", () => {
			if (techInfo) {
				techInfo.classList.remove("is-visible")
			}
		})

		const resizeCanvas = () => {
			const rect = techCanvas.getBoundingClientRect()
			const width = Math.max(rect.width, 1)
			const height = Math.max(rect.height, 1)
			camera.aspect = width / height
			camera.updateProjectionMatrix()
			renderer.setSize(width, height, false)
		}

		const updatePointer = (event) => {
			const rect = techCanvas.getBoundingClientRect()
			pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
			pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
			raycaster.setFromCamera(pointer, camera)
			const hits = raycaster.intersectObjects(techMeshes, false)
			if (hits.length) {
				const hit = hits[0].object
				const item = hit.userData.item
				selectedItem = item
				updateTechInfo(item)
				setHoverState(item)
				if (item !== selectedItem) {
					hit.scale.setScalar(1.16)
				}
				techMeshes.forEach((mesh) => {
					if (mesh !== hit) {
						mesh.scale.lerp(new THREE.Vector3(0.7, 0.7, 1), 0.08)
					}
				})
			} else {
				setHoverState(null)
				techMeshes.forEach((mesh) => {
					mesh.scale.lerp(new THREE.Vector3(0.7, 0.7, 1), 0.08)
				})
			}
		}

		const pointerDown = (event) => {
			isDragging = true
			lastX = event.clientX
			lastY = event.clientY
			dragVelocityX = 0
			dragVelocityY = 0
			updatePointer(event)
		}

		const pointerMove = (event) => {
			if (!isDragging) {
				updatePointer(event)
				return
			}
			const dx = event.clientX - lastX
			const dy = event.clientY - lastY
			lastX = event.clientX
			lastY = event.clientY
			targetRotationY += dx * 0.01
			targetRotationX += dy * 0.008
			targetRotationX = THREE.MathUtils.clamp(targetRotationX, -1.2, 1.2)
			dragVelocityX = dx * 0.005
			dragVelocityY = dy * 0.004
			updatePointer(event)
		}

		const pointerUp = () => {
			isDragging = false
		}

		techCanvas.addEventListener("pointerdown", pointerDown)
		techCanvas.addEventListener("pointermove", pointerMove)
		window.addEventListener("pointerup", pointerUp)
		window.addEventListener("resize", resizeCanvas)
		techCanvas.addEventListener("click", (event) => {
			const rect = techCanvas.getBoundingClientRect()
			pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
			pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
			raycaster.setFromCamera(pointer, camera)
			const hits = raycaster.intersectObjects(techMeshes, false)
			if (hits.length) {
				selectedItem = hits[0].object.userData.item
				updateTechInfo(selectedItem)
			}
		})

		resizeCanvas()

		const animate = () => {
			if (!isDragging) {
				targetRotationY += 0.0028
			} else {
				targetRotationY += dragVelocityX
				targetRotationX += dragVelocityY
				dragVelocityX *= 0.92
				dragVelocityY *= 0.92
			}
			rotationX += (targetRotationX - rotationX) * 0.08
			rotationY += (targetRotationY - rotationY) * 0.08
			orbitGroup.rotation.x = rotationX
			orbitGroup.rotation.y = rotationY

			techMeshes.forEach((mesh, index) => {
				const item = mesh.userData.item
				const focusBoost = item.name === selectedItem.name ? 1.2 : 1
				const hoverBoost = hoverItem && hoverItem.name === item.name ? 1.1 : 1
				const pulse = Math.sin(performance.now() * 0.0015 + index) * 0.05
				mesh.scale.setScalar(0.7 * focusBoost * hoverBoost + pulse)
			})

			particles.forEach((particle, index) => {
				particle.position.x += Math.sin(performance.now() * 0.0007 + index) * 0.0008
				particle.position.y += Math.cos(performance.now() * 0.0008 + index) * 0.0006
			})

			renderer.render(scene, camera)
			requestAnimationFrame(animate)
		}
		animate()
	}

	const heroCanvas = document.getElementById("hero-canvas")
	if (heroCanvas && window.THREE && !reduceMotion) {
		const scene = new THREE.Scene()
		const camera = new THREE.PerspectiveCamera(
			40,
			heroCanvas.clientWidth / heroCanvas.clientHeight,
			0.1,
			1000,
		)
		camera.position.z = 9.4
		const renderer = new THREE.WebGLRenderer({
			canvas: heroCanvas,
			alpha: true,
			antialias: true,
		})
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7))
		renderer.setClearAlpha(0)

		const ambient = new THREE.AmbientLight(0xffffff, 1.6)
		const pointLight = new THREE.PointLight(0xf4744a, 2.3, 30)
		pointLight.position.set(3, 4, 5)
		const fillLight = new THREE.PointLight(0xb98ef7, 1.2, 30)
		fillLight.position.set(-4, -2, 5)
		scene.add(ambient, pointLight, fillLight)

		const root = new THREE.Group()
		root.scale.set(0.8, 0.8, 0.8)
		scene.add(root)

		const coreMaterial = new THREE.MeshStandardMaterial({
			color: 0xf3efe6,
			emissive: 0xf4744a,
			emissiveIntensity: 0.55,
			metalness: 0.25,
			roughness: 0.58,
			transparent: true,
			opacity: 0.9,
			wireframe: true,
		})
		const coreMesh = new THREE.Mesh(
			new THREE.IcosahedronGeometry(1.2, 1),
			coreMaterial,
		)
		root.add(coreMesh)

		const orbitMesh = new THREE.Mesh(
			new THREE.TorusKnotGeometry(1.5, 0.2, 180, 24),
			new THREE.MeshStandardMaterial({
				color: 0xe9e3d3,
				emissive: 0x7b76be,
				emissiveIntensity: 0.4,
				metalness: 0.7,
				roughness: 0.26,
				wireframe: true,
				transparent: true,
				opacity: 0.8,
			}),
		)
		orbitMesh.scale.set(0.9, 0.9, 0.9)
		root.add(orbitMesh)

		const particleCount = 700
		const positions = new Float32Array(particleCount * 3)
		for (let i = 0; i < particleCount; i += 1) {
			const spread = 12
			positions[i * 3] = (Math.random() - 0.5) * spread
			positions[i * 3 + 1] = (Math.random() - 0.5) * spread
			positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 1.7
		}
		const particleGeometry = new THREE.BufferGeometry()
		particleGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(positions, 3),
		)
		const particles = new THREE.Points(
			particleGeometry,
			new THREE.PointsMaterial({
				color: 0xf5f0e8,
				size: 0.028,
				transparent: true,
				opacity: 0.9,
				depthWrite: false,
			}),
		)
		scene.add(particles)

		const pointerTarget = { x: 0, y: 0 }
		window.addEventListener(
			"pointermove",
			(event) => {
				const x = (event.clientX / window.innerWidth) * 2 - 1
				const y = (event.clientY / window.innerHeight) * 2 - 1
				pointerTarget.x = x * 1.3
				pointerTarget.y = -y * 1.2
			},
			{ passive: true },
		)

		const resizeCanvas = () => {
			const bounds = heroCanvas.getBoundingClientRect()
			const width = Math.max(bounds.width, 1)
			const height = Math.max(bounds.height, 1)
			camera.aspect = width / height
			camera.updateProjectionMatrix()
			renderer.setSize(width, height, false)
		}
		resizeCanvas()
		window.addEventListener("resize", resizeCanvas)

		const animate = () => {
			const t = performance.now() * 0.001
			camera.position.x += (pointerTarget.x - camera.position.x) * 0.04
			camera.position.y += (pointerTarget.y - camera.position.y) * 0.04
			const scrollFactor = window.scrollY / Math.max(window.innerHeight * 1.5, 1)
			root.rotation.y = t * 0.45 + scrollFactor * 2
			root.rotation.x = Math.sin(t * 0.8) * 0.5
			coreMesh.rotation.x += 0.006
			coreMesh.rotation.y += 0.008
			orbitMesh.rotation.x -= 0.004
			orbitMesh.rotation.y += 0.006
			particles.rotation.y = t * 0.1
			particles.rotation.x = t * 0.05
			camera.lookAt(0, 0, 0)
			renderer.render(scene, camera)
			requestAnimationFrame(animate)
		}
		animate()
	}

	const githubStats = document.getElementById("github-stats")
	const repoGrid = document.getElementById("repo-grid")
	const githubNote = document.getElementById("github-note")
	const activityNodes = document.querySelectorAll(".activity-node")
	const fallbackRepos = [
		{
			name: "portfolio-experiments",
			description:
				"Interface systems, motion studies, and product storytelling work.",
			language: "JavaScript",
			stargazers_count: 18,
			html_url: "https://github.com/kinthedev",
		},
		{
			name: "product-systems",
			description:
				"Design systems and frontend patterns built for clarity and scale.",
			language: "TypeScript",
			stargazers_count: 12,
			html_url: "https://github.com/kinthedev",
		},
		{
			name: "build-notes",
			description:
				"Code snippets, prototypes, and notes from active product builds.",
			language: "CSS",
			stargazers_count: 9,
			html_url: "https://github.com/kinthedev",
		},
		{
			name: "creative-web",
			description: "Three.js, interaction design work, and digital experiences.",
			language: "JavaScript",
			stargazers_count: 15,
			html_url: "https://github.com/kinthedev",
		},
	]

	const formatCompactNumber = (value) =>
		new Intl.NumberFormat("en-US", {
			notation: "compact",
			maximumFractionDigits: 1,
		}).format(value ?? 0)

	const renderStatValues = (profile) => {
		if (!githubStats) return
		const values = githubStats.querySelectorAll("strong")
		values[0].textContent = profile.public_repos
			? String(profile.public_repos)
			: "—"
		values[1].textContent = formatCompactNumber(profile.followers)
		values[2].textContent = formatCompactNumber(profile.following)
	}

	const renderActivityLabels = (repos) => {
		if (!activityNodes.length) return
		const labels = repos.slice(0, activityNodes.length).map((repo) => {
			const base = repo.name.replace(/[-_]/g, " ").trim()
			return base.split(" ").slice(0, 2).join(" ").slice(0, 7)
		})
		activityNodes.forEach((node, index) => {
			const label = labels[index] || (index % 2 === 0 ? "ship" : "build")
			node.querySelector("span").textContent = label.toLowerCase()
		})
	}

	const renderRepoCards = (repos) => {
		if (!repoGrid) return
		const list = Array.isArray(repos) ? repos : fallbackRepos
		repoGrid.innerHTML = ""
		list.slice(0, 4).forEach((repo) => {
			const card = document.createElement("article")
			card.className = "repo-card"
			card.innerHTML = `
				<div class="repo-meta">
					<h4 class="repo-title">${repo.name}</h4>
					<a class="repo-link" href="${repo.html_url}" target="_blank" rel="noreferrer">Repo</a>
				</div>
				<p class="repo-description">${repo.description || "Public code and product experiments."}</p>
				<div class="repo-details">
					<span class="repo-language">${repo.language || "Code"}</span>
					<span>★ ${formatCompactNumber(repo.stargazers_count || 0)}</span>
				</div>
			`
			repoGrid.appendChild(card)
		})
	}

	const renderFallbackGithub = () => {
		if (githubNote) {
			githubNote.textContent =
				"Live GitHub data unavailable — showing a local fallback preview."
		}
		renderStatValues({
			public_repos: 12,
			followers: 0,
			following: 0,
		})
		renderActivityLabels(fallbackRepos)
		renderRepoCards(fallbackRepos)
	}

	const loadGithubData = async () => {
		if (!repoGrid || !githubStats) return
		if (githubNote) {
			githubNote.textContent = "Loading public repositories…"
		}
		try {
			const [profileResponse, repoResponse] = await Promise.all([
				fetch("https://api.github.com/users/kinthedev", {
					headers: { Accept: "application/vnd.github+json" },
				}),
				fetch(
					"https://api.github.com/users/kinthedev/repos?per_page=6&sort=updated",
					{
						headers: { Accept: "application/vnd.github+json" },
					},
				),
			])
			if (!profileResponse.ok || !repoResponse.ok) {
				throw new Error("GitHub API request failed")
			}
			const profile = await profileResponse.json()
			const repos = await repoResponse.json()
			if (profile && repos) {
				renderStatValues(profile)
				renderActivityLabels(repos)
				renderRepoCards(repos)
				if (githubNote) {
					githubNote.textContent = `Public repositories • updated ${new Date(
						profile.updated_at || Date.now(),
					).toLocaleDateString(undefined, {
						month: "short",
						day: "numeric",
						year: "numeric",
					})}`
				}
			}
		} catch (error) {
			renderFallbackGithub()
		}
	}

	loadGithubData()

	const miniGameCanvas = document.getElementById("mini-game-canvas")
	if (miniGameCanvas) {
		const ctx = miniGameCanvas.getContext("2d")
		const scoreEl = document.getElementById("mini-score")
		const bestEl = document.getElementById("mini-best")
		const statusEl = document.getElementById("mini-status")
		const playBtn = document.getElementById("mini-play-btn")
		const soundBtn = document.getElementById("mini-sound-btn")
		const miniGameSection = document.getElementById("play")
		const brand = document.querySelector(".brand")
		let bestScore = Number(localStorage.getItem("kin-mini-best") || 0)
		let soundOn = true
		let isPlaying = false
		let gameOver = false
		let animationFrame = null
		let score = 0
		let lastTime = 0
		let spawnTimer = 0
		let secretClicks = 0
		const pointer = {
			x: miniGameCanvas.width * 0.5,
			y: miniGameCanvas.height - 32,
		}
		const player = {
			x: miniGameCanvas.width * 0.5,
			y: miniGameCanvas.height - 30,
			radius: 12,
			speed: 330,
		}
		const obstacles = []
		const stars = Array.from({ length: 28 }, () => ({
			x: Math.random() * miniGameCanvas.width,
			y: Math.random() * miniGameCanvas.height,
			r: Math.random() * 2 + 1,
			o: Math.random() * 0.7 + 0.3,
		}))

		const setBestScore = () => {
			if (bestEl) bestEl.textContent = String(bestScore)
		}
		setBestScore()

		const setStatus = (message) => {
			if (statusEl) statusEl.textContent = message
		}

		const playBeep = () => {
			if (!soundOn || !window.AudioContext) return
			const audioContext = new (window.AudioContext || window.webkitAudioContext)()
			const oscillator = audioContext.createOscillator()
			const gain = audioContext.createGain()
			oscillator.type = "triangle"
			oscillator.frequency.value = 180
			gain.gain.value = 0.02
			oscillator.connect(gain)
			gain.connect(audioContext.destination)
			oscillator.start()
			oscillator.stop(audioContext.currentTime + 0.06)
		}

		const spawnObstacle = () => {
			const size = 12 + Math.random() * 12
			const x = 30 + Math.random() * (miniGameCanvas.width - 60)
			const y = -30
			obstacles.push({
				x,
				y,
				size,
				speed: 120 + Math.random() * 130,
				drift: (Math.random() - 0.5) * 120,
				rotation: Math.random() * Math.PI * 2,
			})
		}

		const resetGame = () => {
			score = 0
			if (scoreEl) scoreEl.textContent = "0"
			obstacles.length = 0
			spawnTimer = 0
			gameOver = false
			isPlaying = true
			lastTime = 0
			player.x = miniGameCanvas.width * 0.5
			player.y = miniGameCanvas.height - 30
			pointer.x = player.x
			pointer.y = player.y
			setStatus("Survive the signal.")
			if (playBtn) playBtn.textContent = "Restart"
		}

		const endGame = () => {
			if (gameOver) return
			gameOver = true
			isPlaying = false
			bestScore = Math.max(bestScore, Math.floor(score))
			localStorage.setItem("kin-mini-best", String(bestScore))
			setBestScore()
			const messages = [
				"Not bad.",
				"Okay, you got me.",
				"One more try?",
				"Your debugging skills are improving.",
			]
			setStatus(
				`${messages[Math.floor(Math.random() * messages.length)]} Final score ${Math.floor(score)}.`,
			)
			if (playBtn) playBtn.textContent = "Play again"
			playBeep()
		}

		const drawBackground = () => {
			ctx.clearRect(0, 0, miniGameCanvas.width, miniGameCanvas.height)
			const gradient = ctx.createRadialGradient(
				miniGameCanvas.width * 0.5,
				miniGameCanvas.height * 0.4,
				30,
				miniGameCanvas.width * 0.5,
				miniGameCanvas.height * 0.5,
				340,
			)
			gradient.addColorStop(0, "rgba(73, 71, 129, 0.26)")
			gradient.addColorStop(1, "rgba(9, 12, 18, 0.96)")
			ctx.fillStyle = gradient
			ctx.fillRect(0, 0, miniGameCanvas.width, miniGameCanvas.height)

			stars.forEach((star) => {
				ctx.fillStyle = `rgba(255,255,255,${star.o})`
				ctx.beginPath()
				ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
				ctx.fill()
			})
		}

		const drawPlayer = () => {
			ctx.beginPath()
			ctx.arc(player.x, player.y, player.radius + 8, 0, Math.PI * 2)
			ctx.fillStyle = "rgba(244, 116, 74, 0.2)"
			ctx.fill()

			ctx.beginPath()
			ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2)
			ctx.fillStyle = "#f4c6ad"
			ctx.shadowColor = "rgba(244, 116, 74, 0.85)"
			ctx.shadowBlur = 20
			ctx.fill()
			ctx.shadowBlur = 0

			ctx.beginPath()
			ctx.moveTo(player.x - 6, player.y + 10)
			ctx.lineTo(player.x, player.y - 12)
			ctx.lineTo(player.x + 6, player.y + 10)
			ctx.closePath()
			ctx.strokeStyle = "rgba(18, 20, 26, 0.7)"
			ctx.lineWidth = 2
			ctx.stroke()
		}

		const drawObstacles = () => {
			obstacles.forEach((obstacle) => {
				const x = obstacle.x
				const y = obstacle.y
				ctx.save()
				ctx.translate(x, y)
				ctx.rotate(obstacle.rotation)
				ctx.strokeStyle = "rgba(185, 142, 247, 0.8)"
				ctx.lineWidth = 1.5
				ctx.beginPath()
				ctx.moveTo(-obstacle.size, 0)
				ctx.lineTo(obstacle.size, 0)
				ctx.moveTo(0, -obstacle.size)
				ctx.lineTo(0, obstacle.size)
				ctx.stroke()
				ctx.fillStyle = "rgba(255,255,255,0.5)"
				ctx.font = "12px monospace"
				ctx.textAlign = "center"
				ctx.fillText("</>", 0, 4)
				ctx.restore()
			})
		}

		const render = () => {
			drawBackground()
			drawObstacles()
			drawPlayer()
		}

		const update = (dt) => {
			if (!isPlaying) return
			score += dt * 18
			if (scoreEl) scoreEl.textContent = String(Math.floor(score))
			spawnTimer += dt
			if (spawnTimer > 0.75) {
				spawnObstacle()
				spawnTimer = 0
			}

			const dx = pointer.x - player.x
			const dy = pointer.y - player.y
			const distance = Math.hypot(dx, dy) || 1
			const step = Math.min(player.speed * dt, distance)
			player.x += (dx / distance) * step
			player.y += (dy / distance) * step
			player.x = Math.min(
				Math.max(player.x, player.radius + 10),
				miniGameCanvas.width - player.radius - 10,
			)
			player.y = Math.min(
				Math.max(player.y, player.radius + 12),
				miniGameCanvas.height - player.radius - 10,
			)

			for (let i = obstacles.length - 1; i >= 0; i -= 1) {
				const obstacle = obstacles[i]
				obstacle.y += obstacle.speed * dt
				obstacle.x += obstacle.drift * dt
				obstacle.rotation += dt * 3
				const hit =
					Math.hypot(obstacle.x - player.x, obstacle.y - player.y) <
					obstacle.size + player.radius
				if (hit) {
					endGame()
					break
				}
				if (obstacle.y > miniGameCanvas.height + 30) {
					obstacles.splice(i, 1)
				}
			}
		}

		const tick = (timestamp) => {
			if (!lastTime) lastTime = timestamp
			const dt = Math.min((timestamp - lastTime) / 1000, 0.033)
			lastTime = timestamp
			update(dt)
			render()
			animationFrame = requestAnimationFrame(tick)
		}

		if (playBtn) {
			playBtn.addEventListener("click", () => {
				resetGame()
			})
		}

		if (soundBtn) {
			soundBtn.addEventListener("click", () => {
				soundOn = !soundOn
				soundBtn.textContent = soundOn ? "Sound on" : "Sound off"
			})
		}

		miniGameCanvas.addEventListener("pointermove", (event) => {
			const rect = miniGameCanvas.getBoundingClientRect()
			pointer.x = ((event.clientX - rect.left) / rect.width) * miniGameCanvas.width
			pointer.y =
				((event.clientY - rect.top) / rect.height) * miniGameCanvas.height
		})

		miniGameCanvas.addEventListener("pointerdown", () => {
			if (!isPlaying) resetGame()
		})

		if (miniGameSection) {
			const observer = new IntersectionObserver(
				(entries) => {
					const entry = entries[0]
					if (!entry.isIntersecting && isPlaying) {
						setStatus("Paused — back in view to keep playing.")
						isPlaying = false
					}
					if (entry.isIntersecting && !isPlaying && !gameOver) {
						setStatus("Ready when you are.")
					}
				},
				{ threshold: 0.35 },
			)
			observer.observe(miniGameSection)
		}

		if (brand) {
			brand.addEventListener("click", (event) => {
				event.preventDefault()
				secretClicks += 1
				if (secretClicks >= 3) {
					setStatus("Developer mode unlocked — KIN is in stealth.")
					secretClicks = 0
				}
			})
		}

		render()
		animationFrame = requestAnimationFrame(tick)
	}

	const musicPlayer = document.querySelector(".music-player")
	const musicToggle = document.querySelector(".music-toggle")
	const musicPanelToggle = document.querySelector(".music-panel-toggle")
	const prevTrackButton = document.querySelector(".music-step.prev")
	const nextTrackButton = document.querySelector(".music-step.next")
	const trackTitle = document.querySelector(".track-title")
	const trackArtist = document.querySelector(".track-artist")
	const timeCurrent = document.querySelector(".time-current")
	const timeTotal = document.querySelector(".time-total")
	const progressSlider = document.querySelector('input[type="range"]')
	const volumeSlider = document.querySelector(".volume-slider")
	const visualizerBars = document.querySelectorAll(".bar")

	const trackList = [{ title: "Boy", artist: "KIN", duration: 0 }]

	const audioState = {
		context: null,
		masterGain: null,
		oscillators: [],
		isPlaying: false,
		currentTrack: 0,
		currentTime: 0,
		lastTimestamp: 0,
		animationFrame: null,
		audio: null,
	}

	const formatTime = (totalSeconds) => {
		const minutes = Math.floor(totalSeconds / 60)
		const seconds = Math.floor(totalSeconds % 60)
		return `${minutes}:${String(seconds).padStart(2, "0")}`
	}

	const setMusicPanelState = (isCollapsed) => {
		if (!musicPlayer) return
		musicPlayer.classList.toggle("is-collapsed", isCollapsed)
		if (musicPanelToggle) {
			musicPanelToggle.textContent = isCollapsed ? "Open" : "Hide"
		}
	}

	const updateTrackUI = () => {
		const track = trackList[audioState.currentTrack]
		trackTitle.textContent = track.title
		trackArtist.textContent = track.artist
		timeTotal.textContent = formatTime(track.duration || 0)
		progressSlider.max = String(track.duration || 0)
	}

	const startVisualizer = () => {
		const animateBars = () => {
			visualizerBars.forEach((bar, index) => {
				const base =
					18 + (Math.sin(performance.now() / 240 + index * 0.72) + 1) * 20
				const accent = audioState.isPlaying ? base : 10
				bar.style.height = `${Math.max(12, accent)}%`
				bar.style.opacity = audioState.isPlaying ? "1" : "0.45"
			})
			audioState.animationFrame = requestAnimationFrame(animateBars)
		}
		cancelAnimationFrame(audioState.animationFrame)
		animateBars()
	}

	const updateProgress = () => {
		const audio = audioState.audio
		if (!audio) return
		audioState.currentTime = audio.currentTime
		timeCurrent.textContent = formatTime(audio.currentTime)
		progressSlider.value = String(audio.currentTime)
		if (audio.duration && audio.currentTime >= audio.duration) {
			audio.currentTime = 0
			audio.play().catch(() => {})
		}
	}

	const resumeAudio = async () => {
		const audio = audioState.audio
		if (!audio) return

		try {
			await audio.play()
			audioState.isPlaying = true
			musicToggle.textContent = "Pause"
			startVisualizer()
		} catch (error) {
			audioState.isPlaying = false
			musicToggle.textContent = "Play"
			cancelAnimationFrame(audioState.animationFrame)
		}
	}

	const togglePlayback = async () => {
		const audio = audioState.audio
		if (!audio) return

		audioState.isPlaying = !audio.paused
		if (audio.paused) {
			await resumeAudio()
		} else {
			audio.pause()
			audioState.isPlaying = false
			musicToggle.textContent = "Play"
			cancelAnimationFrame(audioState.animationFrame)
			visualizerBars.forEach((bar) => {
				bar.style.height = "10%"
				bar.style.opacity = "0.45"
			})
		}
	}

	const changeTrack = () => {
		audioState.currentTrack = 0
		audioState.currentTime = 0
		if (audioState.audio) {
			audioState.audio.currentTime = 0
			if (audioState.isPlaying) {
				audioState.audio.play().catch(() => {})
			}
		}
		updateTrackUI()
	}

	const audioElement = new Audio("audio/Boy.mp3")
	audioElement.preload = "auto"
	audioElement.loop = true
	audioElement.autoplay = true
	audioElement.volume = Number(volumeSlider.value) / 100
	audioState.audio = audioElement

	const attemptAutoPlay = () => {
		resumeAudio().catch(() => {})
	}

	musicToggle.addEventListener("click", togglePlayback)
	musicPanelToggle?.addEventListener("click", () => {
		const isCollapsed = !musicPlayer.classList.contains("is-collapsed")
		setMusicPanelState(isCollapsed)
	})
	prevTrackButton.addEventListener("click", () => changeTrack())
	nextTrackButton.addEventListener("click", () => changeTrack())
	progressSlider.addEventListener("input", (event) => {
		if (!audioState.audio) return
		audioState.audio.currentTime = Number(event.target.value)
		updateProgress()
	})
	volumeSlider.addEventListener("input", (event) => {
		const value = Number(event.target.value) / 100
		audioState.audio.volume = value
	})

	audioElement.addEventListener("loadedmetadata", () => {
		trackList[0].duration = Math.ceil(audioElement.duration || 0)
		updateTrackUI()
		progressSlider.max = String(trackList[0].duration)
	})
	audioElement.addEventListener("timeupdate", updateProgress)
	audioElement.addEventListener("play", () => {
		audioState.isPlaying = true
		musicToggle.textContent = "Pause"
		startVisualizer()
	})
	audioElement.addEventListener("pause", () => {
		audioState.isPlaying = false
		musicToggle.textContent = "Play"
		cancelAnimationFrame(audioState.animationFrame)
		visualizerBars.forEach((bar) => {
			bar.style.height = "10%"
			bar.style.opacity = "0.45"
		})
	})

	setMusicPanelState(false)
	updateTrackUI()
	timeCurrent.textContent = formatTime(audioState.currentTime)
	visualizerBars.forEach((bar) => {
		bar.style.height = "12%"
		bar.style.opacity = "0.45"
	})
	attemptAutoPlay()
	window.addEventListener("pointerdown", attemptAutoPlay, { once: true })
	window.addEventListener("keydown", attemptAutoPlay, { once: true })
	if (musicPlayer) {
		musicPlayer.addEventListener(
			"pointerdown",
			() => {
				if (!audioState.audio || audioState.audio.paused) {
					musicToggle.textContent = "Play"
				}
			},
			{ passive: true },
		)
	}
})
