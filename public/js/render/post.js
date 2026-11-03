// Post-processing for capable devices: ambient occlusion (contact shadows in
// corners and under eaves), soft bloom on lanterns and flames, and a gentle
// colour grade with vignette. Phones skip this and use a CSS vignette instead.
import * as THREE from '../../vendor/three/build/three.module.min.js';
import { EffectComposer } from '../../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from '../../vendor/three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../../vendor/three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from '../../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from '../../vendor/three/addons/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.3 },
    warmth: { value: 0.035 },
    saturation: { value: 1.04 },
    contrast: { value: 1.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float warmth;
    uniform float saturation;
    uniform float contrast;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * vec3(1.0 + warmth, 1.0, 1.0 - warmth * 1.2);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = max((col - 0.18) * contrast + 0.18, 0.0);
      vec2 d = (vUv - 0.5) * vec2(1.15, 1.0);
      col *= mix(1.0 - vignette, 1.0, smoothstep(0.82, 0.18, length(d)));
      gl_FragColor = vec4(col, c.a);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, size.x, size.y);
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.6, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 12 });
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.25, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.level = 2;
  }

  setSize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  setNight(night) {
    this.bloom.strength = night ? 0.85 : 0.22;
    this.bloom.threshold = night ? 0.6 : 0.95;
    this.grade.uniforms.warmth.value = night ? 0.01 : 0.035;
    this.grade.uniforms.vignette.value = night ? 0.38 : 0.3;
  }

  // Step down when the device struggles: first drop AO, then bloom.
  degrade() {
    if (this.level === 2) {
      this.ao.enabled = false;
      this.level = 1;
      return true;
    }
    if (this.level === 1) {
      this.bloom.enabled = false;
      this.level = 0;
      return true;
    }
    return false;
  }

  render() {
    this.composer.render();
  }
}
