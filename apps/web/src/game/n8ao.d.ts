declare module 'n8ao' {
  import type * as THREE from 'three';
  import type { Pass } from 'postprocessing';

  /** The screen-space ambient occlusion pass for the `postprocessing` composer (it has to come after a RenderPass). */
  export class N8AOPostPass extends Pass {
    constructor(scene: THREE.Scene, camera: THREE.Camera, width?: number, height?: number);
    configuration: {
      aoSamples: number;
      aoRadius: number;
      denoiseSamples: number;
      denoiseRadius: number;
      denoiseIterations: number;
      distanceFalloff: number;
      intensity: number;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      transparencyAware: boolean;
      gammaCorrection: boolean;
      screenSpaceRadius: boolean;
      color: THREE.Color;
      renderMode: number;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
