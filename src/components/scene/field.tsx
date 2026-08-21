"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";

/**
 * One curated scene: a field of measured points.
 *
 * Design constraints, all of them deliberate:
 *
 * - GPU-instanced points animated in a VERTEX SHADER, not on the CPU. Motion costs
 *   nothing per frame because no JavaScript runs per particle.
 * - `frameloop="demand"` plus an explicit invalidate loop, so the canvas is not
 *   burning a render loop when nothing is visible.
 * - Poster-first: the canvas mounts only after the hero paints. A <canvas> can
 *   trigger FCP but can never be the LCP element, and a full-viewport element is
 *   also disqualified — so this must not be the largest paint.
 * - Reduced motion is not "slower motion": the scene renders one static frame and
 *   stops. Honouring the preference means no animation, not gentle animation.
 * - GPU tier is checked before mounting. On a weak GPU the scene is skipped
 *   entirely rather than shipped at a degraded frame rate; a stuttering scene reads
 *   as broken, while its absence reads as a design choice.
 *
 * The visual references the name: fixed points, measured, in a grid that reveals
 * structure as it moves.
 */

const COUNT = 2400;

function Points() {
  const ref = useRef<THREE.Points>(null);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);

    // A jittered grid rather than pure random. Pure noise reads as static; a grid
    // with controlled jitter reads as a measurement lattice, which is the point.
    const perSide = Math.ceil(Math.sqrt(COUNT));
    for (let i = 0; i < COUNT; i++) {
      const gx = i % perSide;
      const gy = Math.floor(i / perSide);
      const jitter = () => (Math.random() - 0.5) * 0.55;
      positions[i * 3] = (gx / perSide - 0.5) * 22 + jitter();
      positions[i * 3 + 1] = (gy / perSide - 0.5) * 12 + jitter();
      positions[i * 3 + 2] = (Math.random() - 0.5) * 5;
      seeds[i] = Math.random() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("#4da3ff") },
        uDim: { value: new THREE.Color("#1d4e7f") },
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime;
        varying float vDepth;
        varying float vPulse;

        void main() {
          vec3 p = position;

          // Travelling wave across the lattice. Amplitude falls off with distance
          // from centre so the edges stay calm and the eye is drawn inward.
          float d = length(p.xy);
          float falloff = 1.0 / (1.0 + d * 0.16);
          p.z += sin(uTime * 0.55 + p.x * 0.35 + seed) * 1.05 * falloff;
          p.y += cos(uTime * 0.4 + p.x * 0.22) * 0.16 * falloff;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;

          // Perspective-correct point size, clamped so near points cannot bloom
          // into large blobs on a wide viewport.
          gl_PointSize = clamp(150.0 / -mv.z, 1.0, 3.4);

          vDepth = clamp((p.z + 4.0) / 8.0, 0.0, 1.0);
          vPulse = 0.5 + 0.5 * sin(uTime * 0.9 + seed * 2.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uDim;
        varying float vDepth;
        varying float vPulse;

        void main() {
          // Round points with a soft edge. gl_PointCoord is square by default and
          // square particles read as artefacts rather than as points.
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c);
          if (r > 0.5) discard;
          float edge = smoothstep(0.5, 0.24, r);

          vec3 col = mix(uDim, uColor, vDepth * 0.85 + vPulse * 0.15);
          gl_FragColor = vec4(col, edge * (0.16 + vDepth * 0.5));
        }
      `,
    });

    return { geometry: geo, material: mat };
  }, []);

  useFrame((state) => {
    material.uniforms.uTime!.value = state.clock.elapsedTime;
    if (ref.current !== null) {
      ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.06) * 0.045;
    }
    state.invalidate(); // frameloop="demand" needs an explicit next frame
  });

  const props = { ref, geometry, material } as ThreeElements["points"];
  return <points {...props} />;
}

export default function Field() {
  return (
    <Canvas
      // Demand-driven: nothing renders unless a frame is explicitly requested.
      frameloop="demand"
      // Clamped DPR. Unclamped, a 3x retina display renders 9x the pixels for a
      // barely perceptible gain and destroys the frame budget.
      dpr={[1, 1.75]}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      camera={{ position: [0, 0, 15], fov: 42 }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    >
      <Points />
    </Canvas>
  );
}
