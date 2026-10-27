// --- CYBERPUNK VIGNETTE SHADER ---
export const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 1.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      
      float dist = distance(vUv, vec2(0.5));
      float vignette = smoothstep(0.8, 0.2, dist);
      color.rgb *= mix(1.0, vignette, intensity * 0.35);

      color.rgb *= vec3(1.04, 1.0, 0.94);

      gl_FragColor = color;
    }
  `
}
