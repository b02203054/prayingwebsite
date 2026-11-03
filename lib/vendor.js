// Three.js add-ons are written against the bare specifier 'three'. Browsers
// need an import map for that; instead we rewrite the specifier to a relative
// path when serving or copying them, which keeps the strict CSP (no inline script).
export const ADDON_FILES = [
  'postprocessing/EffectComposer.js',
  'postprocessing/MaskPass.js',
  'postprocessing/Pass.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/OutputPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/GTAOPass.js',
  'shaders/CopyShader.js',
  'shaders/OutputShader.js',
  'shaders/LuminosityHighPassShader.js',
  'shaders/GTAOShader.js',
  'shaders/PoissonDenoiseShader.js',
  'math/SimplexNoise.js',
];

// Every listed add-on sits one folder below addons/, so the build is two levels up.
export function rewriteAddon(source) {
  return source.replace(/from\s+(['"])three\1/g, "from '../../build/three.module.min.js'");
}
