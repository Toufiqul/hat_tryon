/**
 * Hat Renderer using Three.js
 * Handles 3D hat model loading, positioning, and rendering
 */

class HatRenderer {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.hat = null;
    this.hatLoaded = false;

    // Smoothed values for jitter reduction
    this.smoothedPosition = null;
    this.smoothedRotation = null;
    this.smoothedScale = 1;

    // User adjustments
    this.settings = {
      scale: 1.0,
      yOffset: 0,
      zOffset: 0,
      smoothing: 0.5,
    };

    // Video texture for background (not used - video element shown directly)
    this.videoTexture = null;
    this.backgroundMesh = null;
  }

  /**
   * Initialize Three.js scene
   */
  init() {
    // Create scene
    this.scene = new THREE.Scene();

    // Create orthographic camera for 2D overlay effect
    const aspect = this.canvas.width / this.canvas.height || 16 / 9;
    const frustumSize = 2;
    this.camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );
    this.camera.position.z = 5;

    // Create renderer with transparent background
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 1, 2);
    this.scene.add(directionalLight);

    // Add subtle rim light for depth
    const rimLight = new THREE.DirectionalLight(0x00ffd5, 0.3);
    rimLight.position.set(-1, 0, -1);
    this.scene.add(rimLight);

    return this;
  }

  /**
   * Update canvas and camera on resize
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;

    const aspect = width / height;
    const frustumSize = 2;

    this.camera.left = (-frustumSize * aspect) / 2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  /**
   * Load a hat model from GLB/GLTF file
   * @param {string} url - URL to the model file
   * @returns {Promise<boolean>} Success status
   */
  async loadHat(url) {
    return new Promise((resolve, reject) => {
      console.log("HatRenderer: Starting to load model from:", url);

      const loader = new GLTFLoader();

      loader.load(
        url,
        (gltf) => {
          console.log("HatRenderer: GLTF loaded successfully", gltf);

          // Remove old hat if exists
          if (this.hat) {
            this.scene.remove(this.hat);
          }

          this.hat = gltf.scene;
          console.log("HatRenderer: Hat scene:", this.hat);
          console.log("HatRenderer: Hat children:", this.hat.children);

          // Center the hat model
          const box = new THREE.Box3().setFromObject(this.hat);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          console.log("HatRenderer: Hat bounding box center:", center);
          console.log("HatRenderer: Hat bounding box size:", size);

          this.hat.position.sub(center);

          // Create a group to handle positioning
          const hatGroup = new THREE.Group();
          hatGroup.add(this.hat);
          this.hat = hatGroup;

          // Initial scale
          this.hat.scale.set(0.3, 0.3, 0.3);

          // Hide until face is detected
          this.hat.visible = false;

          this.scene.add(this.hat);
          this.hatLoaded = true;

          console.log("HatRenderer: Hat model added to scene successfully");
          resolve(true);
        },
        (progress) => {
          const percent =
            progress.total > 0
              ? ((progress.loaded / progress.total) * 100).toFixed(1)
              : "unknown";
          console.log("HatRenderer: Loading progress:", percent + "%");
        },
        (error) => {
          console.error("HatRenderer: Error loading hat model:", error);
          reject(error);
        }
      );
    });
  }

  /**
   * Create a fallback hat geometry if no model is available
   */
  createFallbackHat() {
    if (this.hat) {
      this.scene.remove(this.hat);
    }

    const hatGroup = new THREE.Group();

    // Create a simple top hat using cylinders
    // Brim
    const brimGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32);
    const hatMaterial = new THREE.MeshPhongMaterial({
      color: 0x1a1a2e,
      shininess: 80,
    });
    const brim = new THREE.Mesh(brimGeometry, hatMaterial);
    brim.position.y = 0;
    hatGroup.add(brim);

    // Crown
    const crownGeometry = new THREE.CylinderGeometry(0.3, 0.35, 0.5, 32);
    const crown = new THREE.Mesh(crownGeometry, hatMaterial);
    crown.position.y = 0.275;
    hatGroup.add(crown);

    // Ribbon
    const ribbonGeometry = new THREE.CylinderGeometry(0.352, 0.352, 0.08, 32);
    const ribbonMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ffd5,
      shininess: 100,
    });
    const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
    ribbon.position.y = 0.08;
    hatGroup.add(ribbon);

    this.hat = hatGroup;
    this.hat.visible = false;
    this.scene.add(this.hat);
    this.hatLoaded = true;

    console.log("Fallback hat created");
  }

  /**
   * Update hat position based on face data
   * @param {Object} faceData - Face detection data
   */
  updateHatPosition(faceData) {
    if (!this.hat || !this.hatLoaded) return;

    if (!faceData.detected) {
      this.hat.visible = false;
      return;
    }

    this.hat.visible = true;

    const smoothing = this.settings.smoothing;

    // Convert normalized coordinates to scene coordinates
    // MediaPipe gives 0-1 coordinates, we need to map to our orthographic camera space
    const sceneX = -(faceData.forehead.x - 0.5) * 2; // Flip X for mirror effect
    const sceneY = -(faceData.forehead.y - 0.5) * 2; // Flip Y

    // Calculate position with offsets
    const targetPosition = {
      x: sceneX,
      y: sceneY + this.settings.yOffset / 100,
      z: faceData.forehead.z * 2 + this.settings.zOffset / 100,
    };

    // Smooth position
    this.smoothedPosition = Utils.smooth3D(
      targetPosition,
      this.smoothedPosition,
      smoothing
    );

    // Apply position
    this.hat.position.set(
      this.smoothedPosition.x,
      this.smoothedPosition.y,
      this.smoothedPosition.z
    );

    // Calculate rotation
    const targetRotation = {
      x: faceData.rotation.pitch * 0.5, // Reduce sensitivity
      y: -faceData.rotation.yaw * 0.8,
      z: faceData.rotation.roll,
    };

    // Smooth rotation
    this.smoothedRotation = Utils.smooth3D(
      targetRotation,
      this.smoothedRotation,
      smoothing
    );

    // Apply rotation
    this.hat.rotation.set(
      this.smoothedRotation.x,
      this.smoothedRotation.y,
      this.smoothedRotation.z
    );

    // Calculate and apply scale based on face width
    const baseScale = faceData.faceWidth * 3 * this.settings.scale;
    this.smoothedScale = Utils.smooth(baseScale, this.smoothedScale, smoothing);
    this.hat.scale.setScalar(this.smoothedScale);
  }

  /**
   * Update settings
   * @param {Object} newSettings - New settings to apply
   */
  updateSettings(newSettings) {
    Object.assign(this.settings, newSettings);
  }

  /**
   * Render the scene
   */
  render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.hat) {
      this.scene.remove(this.hat);
      this.hat = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }
}

// Export for module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = HatRenderer;
}
