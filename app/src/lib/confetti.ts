// Lightweight, dependency-free confetti burst. Spawns a temporary full-screen
// canvas, animates colored particles under gravity, then removes itself.
// Used to celebrate when someone marks "going". Respects reduced-motion.

const COLORS = ['#7c3aed', '#a855f7', '#f59e0b', '#10b981', '#ef4444', '#3b82f6']

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rot: number
  vr: number
}

export function celebrate(count = 120) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const dpr = window.devicePixelRatio || 1
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)

  // Two bursts from the lower corners, arcing toward the center-top.
  const particles: Particle[] = []
  const origins = [
    { x: w * 0.5, y: h * 0.45 },
  ]
  for (const o of origins) {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * (0.5 + (Math.random() - 0.5) * 1.4) * -1 // upward fan
      const speed = 6 + Math.random() * 8
      particles.push({
        x: o.x,
        y: o.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
      })
    }
  }

  const GRAVITY = 0.22
  const DRAG = 0.992
  let frame = 0
  const MAX_FRAMES = 140

  const tick = () => {
    ctx.clearRect(0, 0, w, h)
    for (const p of particles) {
      p.vx *= DRAG
      p.vy = p.vy * DRAG + GRAVITY
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = Math.max(0, 1 - frame / MAX_FRAMES)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }
    frame++
    if (frame < MAX_FRAMES) {
      requestAnimationFrame(tick)
    } else {
      canvas.remove()
    }
  }
  requestAnimationFrame(tick)
}

// Sad counterpart of celebrate(): sad emojis fall from the top, drifting down.
// Used when someone marks "can't make it". Respects reduced-motion.
export function commiserate(count = 22) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const EMOJIS = ['😢', '😭', '💧', '😞', '😓']
  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden'
  document.body.appendChild(container)

  const w = window.innerWidth
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    el.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
    const left = Math.random() * w
    const size = 18 + Math.random() * 22
    const delay = Math.random() * 600
    const duration = 1600 + Math.random() * 1200
    const drift = (Math.random() - 0.5) * 80
    el.style.cssText = `position:absolute;top:-40px;left:${left}px;font-size:${size}px;opacity:0;will-change:transform,opacity`
    el.animate(
      [
        { transform: 'translate(0,0)', opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.1 },
        { opacity: 1, offset: 0.8 },
        { transform: `translate(${drift}px, ${window.innerHeight + 80}px)`, opacity: 0, offset: 1 },
      ],
      { duration, delay, easing: 'cubic-bezier(0.4,0,0.7,1)', fill: 'forwards' },
    )
    container.appendChild(el)
  }

  setTimeout(() => container.remove(), 3200)
}
