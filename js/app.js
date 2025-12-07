/**
 * Virtual Hat Try-On Application
 * Main orchestration module
 */

class HatTryOnApp {
  constructor() {
    // DOM Elements
    this.video = document.getElementById("video");
    this.canvas = document.getElementById("canvas");
    this.startBtn = document.getElementById("startBtn");
    this.loadingOverlay = document.getElementById("loadingOverlay");
    this.statusDot = document.getElementById("statusDot");
    this.statusText = document.getElementById("statusText");
    this.fpsValue = document.getElementById("fpsValue");

    // Sliders
    this.scaleSlider = document.getElementById("scaleSlider");
    this.yOffsetSlider = document.getElementById("yOffsetSlider");
    this.zOffsetSlider = document.getElementById("zOffsetSlider");
    this.smoothingSlider = document.getElementById("smoothingSlider");

    // Value displays
    this.scaleValue = document.getElementById("scaleValue");
    this.yOffsetValue = document.getElementById("yOffsetValue");
    this.zOffsetValue = document.getElementById("zOffsetValue");
    this.smoothingValue = document.getElementById("smoothingValue");

    // Modules
    this.mediaPipe = null;
    this.hatRenderer = null;
    this.fpsCounter = new Utils.FPSCounter();

    // State
    this.isRunning = false;
    this.currentFaceData = null;

    // Bind methods
    this.onFaceResults = this.onFaceResults.bind(this);
    this.renderLoop = this.renderLoop.bind(this);

    this.init();
  }

  /**
   * Initialize the application
   */
  async init() {
    this.updateStatus("Initializing...", false);

    // Initialize MediaPipe
    this.mediaPipe = new MediaPipeHandler({
      onResults: this.onFaceResults,
      onReady: () => console.log("MediaPipe ready"),
      onError: (err) => this.updateStatus("Error: " + err, false),
    });

    const mpReady = await this.mediaPipe.init();
    if (!mpReady) {
      this.updateStatus("MediaPipe failed to load", false);
      return;
    }

    // Initialize Three.js renderer
    this.hatRenderer = new HatRenderer(this.canvas, this.video);
    this.hatRenderer.init();

    // Try to load hat model, fall back to procedural hat
    console.log("Attempting to load hat model from models/hat.glb...");

    const loadResult = await this.hatRenderer
      .loadHat("models/hat.glb")
      .catch((e) => {
        console.error("Hat loading failed with error:", e);
        return false;
      });

    if (!loadResult) {
      console.log("Using fallback procedural hat");
      this.hatRenderer.createFallbackHat();
    } else {
      console.log("Custom hat model loaded successfully!");
    }

    // Setup event listeners
    this.setupEventListeners();

    // Hide loading overlay
    this.loadingOverlay.classList.add("hidden");
    this.updateStatus("Ready", false);

    console.log("App initialized");
  }

  /**
   * Setup UI event listeners
   */
  setupEventListeners() {
    // Start button
    this.startBtn.addEventListener("click", () => this.toggleCamera());

    // Sliders
    this.scaleSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.scaleValue.textContent = value.toFixed(1);
      this.hatRenderer.updateSettings({ scale: value });
    });

    this.yOffsetSlider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      this.yOffsetValue.textContent = value;
      this.hatRenderer.updateSettings({ yOffset: value });
    });

    this.zOffsetSlider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      this.zOffsetValue.textContent = value;
      this.hatRenderer.updateSettings({ zOffset: value });
    });

    this.smoothingSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.smoothingValue.textContent = value.toFixed(1);
      this.hatRenderer.updateSettings({ smoothing: value });
    });

    // Handle window resize
    window.addEventListener(
      "resize",
      Utils.debounce(() => {
        if (this.isRunning) {
          this.resizeCanvas();
        }
      }, 100)
    );

    // Setup drag handle for controls panel
    this.setupDragHandle();
  }

  /**
   * Setup drag handle for collapsible controls panel
   */
  setupDragHandle() {
    const panel = document.getElementById("controlsPanel");
    const handle = document.getElementById("dragHandle");
    const hint = handle.querySelector(".drag-hint");

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const updateHint = () => {
      hint.textContent = panel.classList.contains("collapsed")
        ? "Drag to show"
        : "Drag to hide";
    };

    const onStart = (e) => {
      isDragging = true;
      startY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
      panel.style.transition = "none";
    };

    const onMove = (e) => {
      if (!isDragging) return;
      currentY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
      const deltaY = currentY - startY;

      // Only allow dragging down when expanded, up when collapsed
      const isCollapsed = panel.classList.contains("collapsed");
      if ((!isCollapsed && deltaY > 0) || (isCollapsed && deltaY < 0)) {
        panel.style.transform = `translateY(${
          isCollapsed ? `calc(100% - 60px + ${deltaY}px)` : `${deltaY}px`
        })`;
      }
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      panel.style.transition = "transform 0.3s ease";
      panel.style.transform = "";

      const deltaY = currentY - startY;
      const threshold = 50;

      if (Math.abs(deltaY) > threshold) {
        if (deltaY > 0 && !panel.classList.contains("collapsed")) {
          panel.classList.add("collapsed");
        } else if (deltaY < 0 && panel.classList.contains("collapsed")) {
          panel.classList.remove("collapsed");
        }
      }

      updateHint();
    };

    // Touch events
    handle.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);

    // Mouse events
    handle.addEventListener("mousedown", onStart);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);

    // Click to toggle
    handle.addEventListener("click", () => {
      if (Math.abs(currentY - startY) < 5) {
        panel.classList.toggle("collapsed");
        updateHint();
      }
    });
  }

  /**
   * Toggle camera on/off
   */
  async toggleCamera() {
    if (this.isRunning) {
      this.stopCamera();
    } else {
      await this.startCamera();
    }
  }

  /**
   * Start webcam capture
   */
  async startCamera() {
    try {
      this.startBtn.disabled = true;
      this.updateStatus("Starting camera...", false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });

      this.video.srcObject = stream;

      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });

      // Resize canvas to match video
      this.resizeCanvas();

      this.isRunning = true;
      this.startBtn.textContent = "Stop Camera";
      this.startBtn.disabled = false;
      this.updateStatus("Running", true);

      // Start render loop
      this.renderLoop();
    } catch (error) {
      console.error("Camera error:", error);
      this.updateStatus("Camera access denied", false);
      this.startBtn.disabled = false;
    }
  }

  /**
   * Stop webcam capture
   */
  stopCamera() {
    this.isRunning = false;

    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach((track) => track.stop());
      this.video.srcObject = null;
    }

    this.startBtn.textContent = "Start Camera";
    this.updateStatus("Stopped", false);
  }

  /**
   * Resize canvas to match video dimensions
   */
  resizeCanvas() {
    if (this.video.videoWidth && this.video.videoHeight) {
      const container = this.canvas.parentElement;
      const width = container.clientWidth;
      const height = container.clientHeight;

      this.hatRenderer.resize(width, height);
    }
  }

  /**
   * Handle face detection results from MediaPipe
   * @param {Object} faceData - Face detection data
   */
  onFaceResults(faceData) {
    this.currentFaceData = faceData;
  }

  /**
   * Main render loop
   */
  async renderLoop() {
    if (!this.isRunning) return;

    // Process frame with MediaPipe
    await this.mediaPipe.processFrame(this.video);

    // Update hat position
    if (this.currentFaceData) {
      this.hatRenderer.updateHatPosition(this.currentFaceData);
    }

    // Render scene
    this.hatRenderer.render();

    // Update FPS counter
    if (this.fpsCounter.tick()) {
      this.fpsValue.textContent = this.fpsCounter.getFPS();
    }

    // Continue loop
    requestAnimationFrame(this.renderLoop);
  }

  /**
   * Update status display
   * @param {string} text - Status text
   * @param {boolean} active - Is active/running
   */
  updateStatus(text, active) {
    this.statusText.textContent = text;
    this.statusDot.classList.toggle("active", active);
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopCamera();

    if (this.mediaPipe) {
      this.mediaPipe.destroy();
    }

    if (this.hatRenderer) {
      this.hatRenderer.destroy();
    }
  }
}

// Initialize app when DOM is ready AND Three.js is loaded
document.addEventListener("DOMContentLoaded", () => {
  const startApp = () => {
    window.app = new HatTryOnApp();
  };

  if (window.threeReady) {
    startApp();
  } else {
    window.addEventListener("threeReady", startApp);
  }
});
