import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import { orientMoonNearSide } from '../../src/rendering/helpers'

describe('Moon texture orientation', () => {
  it('points the LRO map centre toward Earth or the ground observer at every orbital position', () => {
    const moon = new Object3D()
    const earth = new Vector3()
    for (const position of [[-3, 0, 0], [0, .2, 3], [3, 0, 0], [0, -.2, -3]]) {
      moon.position.set(...position as [number, number, number])
      orientMoonNearSide(moon, earth)
      const mapCentre = new Vector3(1, 0, 0).applyQuaternion(moon.quaternion)
      expect(mapCentre.angleTo(earth.clone().sub(moon.position))).toBeLessThan(1e-6)
    }
  })
})
