import { describe, expect, it } from 'vitest'
import { classifyAlignment, classifyLunarShadow, classifySolarShadow, computeShadowGeometry, discOverlapFraction, shadowRadius, sweptArea } from '../../src/core/geometry'
import { keplerPosition } from '../../src/core/astro-math'
import { createAstronomyProvider } from '../../src/services/astronomy-provider'

describe('physical geometry', () => {
  it('requires both conjunction/opposition and a node', () => {
    expect(classifyAlignment(90, 0)).toBe('none')
    expect(classifyAlignment(270, 0)).toBe('none')
    expect(classifyAlignment(0, 4)).toBe('miss')
    expect(classifyAlignment(180, 0)).toBe('lunar')
    expect(classifyAlignment(359.8, 0)).toBe('solar')
  })
  it('models converging umbra and diverging penumbra', () => {
    expect(shadowRadius(10, 1, 90, 10, false)).toBeCloseTo(0)
    expect(shadowRadius(10, 1, 90, 20, false)).toBeLessThan(0)
    expect(shadowRadius(10, 1, 90, 10, true)).toBeGreaterThan(1)
  })
  const shadow = (behind: number, offset: number, targetRadius = 1) => computeShadowGeometry({
    source: { x: -90, y: 0, z: 0 }, blocker: { x: 0, y: 0, z: 0 }, target: { x: behind, y: offset, z: 0 },
    sourceRadius: 10, blockerRadius: 1, targetRadius
  })
  it('uses physical vector projection and classifies global solar shadow intersection', () => {
    const total = shadow(5, .2)
    expect(total.axis).toEqual({ x: 1, y: 0, z: 0 })
    expect(total.axisOffsetKm).toBeCloseTo(.2)
    expect(total.apexDistanceKm).toBeCloseTo(10)
    expect(classifySolarShadow(total)).toBe('total')
    expect(classifySolarShadow(shadow(20, .2))).toBe('annular')
    expect(classifySolarShadow(shadow(5, 1.5))).toBe('partial')
    expect(classifySolarShadow(shadow(5, 3))).toBe('miss')
    expect(classifySolarShadow(shadow(-5, 0))).toBe('miss')
  })
  it('distinguishes lunar total, partial and penumbral overlap', () => {
    expect(classifyLunarShadow(shadow(5, 0, .1))).toBe('total')
    expect(classifyLunarShadow(shadow(5, .5, .1))).toBe('partial')
    expect(classifyLunarShadow(shadow(5, 1, .1))).toBe('penumbral')
    expect(classifyLunarShadow(shadow(5, 3, .1))).toBe('miss')
    expect(classifyLunarShadow(shadow(-5, 0, .1))).toBe('miss')
    expect(classifyLunarShadow(shadow(20, 0, .1))).toBe('penumbral')
  })
  it('calculates obscured disc area with containment and grazing limits', () => {
    expect(discOverlapFraction(1, 1, 0)).toBe(1)
    expect(discOverlapFraction(1, .5, 0)).toBeCloseTo(.25)
    expect(discOverlapFraction(1, 2, 0)).toBe(1)
    expect(discOverlapFraction(1, 1, 2)).toBe(0)
    expect(discOverlapFraction(1, 1, 1)).toBeCloseTo((2 * Math.PI / 3 - Math.sqrt(3) / 2) / Math.PI)
    expect(discOverlapFraction(0, 1, 0)).toBe(0)
    expect(discOverlapFraction(1, 0, 0)).toBe(0)
    expect(discOverlapFraction(1, 1, -1)).toBe(0)
    expect(discOverlapFraction(1, 1, Number.NaN)).toBe(0)
    expect(() => shadow(5, Number.NaN)).toThrow()
    expect(() => computeShadowGeometry({ source: { x: 0, y: 0, z: 0 }, blocker: { x: 0, y: 0, z: 0 }, target: { x: 1, y: 0, z: 0 }, sourceRadius: 10, blockerRadius: 1, targetRadius: 1 })).toThrow()
  })
  it('classifies known eclipses from actual kilometre ephemerides', () => {
    const provider = createAstronomyProvider()
    const origin = { x: 0, y: 0, z: 0 }
    const km = (vector: { x: number; y: number; z: number }) => ({ x: vector.x * 149_597_870.7, y: vector.y * 149_597_870.7, z: vector.z * 149_597_870.7 })
    const solar = (instant: Date) => classifySolarShadow(computeShadowGeometry({
      source: km(provider.geocentricVector('Sun', instant)), blocker: km(provider.geocentricVector('Moon', instant)), target: origin,
      sourceRadius: 695_700, blockerRadius: 1737.4, targetRadius: 6378.137
    }))
    expect(solar(new Date('2024-04-08T18:17:19Z'))).toBe('total')
    expect(solar(new Date('2023-10-14T17:59:32Z'))).toBe('annular')
    expect(solar(new Date('2025-03-29T10:47:27Z'))).toBe('partial')
    expect(solar(new Date('2024-04-16T00:00:00Z'))).toBe('miss')
    const instant = new Date('2025-03-14T06:59:00Z')
    const lunar = computeShadowGeometry({ source: km(provider.geocentricVector('Sun', instant)), blocker: origin, target: km(provider.geocentricVector('Moon', instant)), sourceRadius: 695_700, blockerRadius: 6378.137, targetRadius: 1737.4 })
    expect(classifyLunarShadow(lunar)).toBe('total')
  })
  it('handles an equal-sized source without a finite umbral apex', () => {
    const result = computeShadowGeometry({ source: { x: -10, y: 0, z: 0 }, blocker: { x: 0, y: 0, z: 0 }, target: { x: 5, y: 0, z: 0 }, sourceRadius: 1, blockerRadius: 1, targetRadius: .1 })
    expect(result.apexDistanceKm).toBe(Infinity)
    expect(result.umbraRadiusKm).toBe(1)
  })
  it('sweeps equal areas for equal mean-anomaly intervals', () => {
    const numericalArea = (start: number): number => {
      let area = 0
      for (let i = 0; i < 1000; i += 1) {
        const a = keplerPosition(start + i * .0003, .7, 3)
        const b = keplerPosition(start + (i + 1) * .0003, .7, 3)
        area += (a.x * b.y - a.y * b.x) / 2
      }
      return area
    }
    expect(numericalArea(0)).toBeCloseTo(sweptArea(3, .7, .3), 5)
    expect(numericalArea(Math.PI)).toBeCloseTo(numericalArea(0), 5)
    expect(sweptArea(3, .7, 2 * Math.PI)).toBeCloseTo(Math.PI * 9 * Math.sqrt(1 - .49))
  })
})
