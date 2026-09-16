import { degreesToRadians } from '../core/astro-math'

/** Cache surface normals and texture samples; playback only evaluates lighting. */
export function createPhaseDisc(textureUrl: string, onTextureReady?: () => void): {
  readonly element: HTMLElement
  readonly canvas: HTMLCanvasElement
  readonly revision: number
  update(angle: number, name: string, illumination: number): void
  dispose(): void
} {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.setAttribute('aria-label', '地球觀察者所見的月面亮暗，北向上示意')
  const context = canvas.getContext('2d', { alpha: true })
  const element = document.createElement('div')
  element.className = 'scene-inset'
  element.innerHTML = '<p>地面所見月面</p><strong></strong><span class="phase-illumination"></span><br><span class="phase-convention">北向上示意・非視直徑</span>'
  element.prepend(canvas)
  const name = element.querySelector('strong')!
  const illumination = element.querySelector('.phase-illumination')!
  const pixels = context?.createImageData(size, size)
  const normalX = new Float32Array(size * size)
  const normalZ = new Float32Array(size * size)
  const albedo = new Float32Array(size * size)
  const offsets = new Uint32Array(size * size)
  const textureOffsets = new Uint32Array(size * size)
  let samples = 0
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - size / 2) / 112
      const ny = (size / 2 - y) / 112
      if (nx * nx + ny * ny > 1) continue
      const nz = Math.sqrt(1 - nx * nx - ny * ny)
      normalX[samples] = nx
      normalZ[samples] = nz
      albedo[samples] = .8
      offsets[samples] = (y * size + x) * 4
      const u = Math.floor((.5 + Math.atan2(nx, nz) / (Math.PI * 2)) * 512) % 512
      const v = Math.max(0, Math.min(255, Math.floor((.5 - Math.asin(ny) / Math.PI) * 256)))
      textureOffsets[samples] = (v * 512 + u) * 4
      samples += 1
    }
  }
  let lastAngle = Number.NaN
  let currentAngle = 0
  let disposed = false
  let revision = 0
  function paint(force = false): void {
    if (!context || !pixels || disposed || (!force && Math.abs(currentAngle - lastAngle) < .5)) return
    lastAngle = currentAngle
    const lightX = Math.sin(degreesToRadians(currentAngle))
    const lightZ = -Math.cos(degreesToRadians(currentAngle))
    for (let sample = 0; sample < samples; sample += 1) {
      const diffuse = Math.max(0, normalX[sample]! * lightX + normalZ[sample]! * lightZ)
      const value = Math.round(14 + diffuse * 255 * albedo[sample]!)
      const offset = offsets[sample]!
      pixels.data[offset] = pixels.data[offset + 1] = value
      pixels.data[offset + 2] = Math.min(255, value + 7)
      pixels.data[offset + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    revision += 1
  }
  const materialImage = new Image()
  materialImage.onload = () => {
    if (disposed) return
    const map = document.createElement('canvas')
    map.width = 512
    map.height = 256
    const mapContext = map.getContext('2d')
    if (!mapContext) return
    mapContext.drawImage(materialImage, 0, 0, 512, 256)
    const texture = mapContext.getImageData(0, 0, 512, 256)
    for (let sample = 0; sample < samples; sample += 1) albedo[sample] = texture.data[textureOffsets[sample]!]! / 255
    paint(true)
    onTextureReady?.()
  }
  materialImage.onerror = () => {
    if (!disposed) element.querySelector('.phase-convention')!.textContent = '材質未載入・亮暗示意'
  }
  materialImage.src = textureUrl
  return {
    element,
    canvas,
    get revision() { return revision },
    update(angle, phaseName, fraction) {
      currentAngle = angle
      name.textContent = phaseName
      illumination.textContent = `照亮 ${Math.round(fraction * 100)}%`
      paint()
    },
    dispose() {
      disposed = true
      materialImage.onload = materialImage.onerror = null
    }
  }
}
