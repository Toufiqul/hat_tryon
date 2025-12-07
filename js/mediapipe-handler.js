/**
 * MediaPipe Face Mesh Handler
 * Wraps MediaPipe Face Mesh for face detection and landmark extraction
 */

class MediaPipeHandler {
    constructor(options = {}) {
        this.faceMesh = null;
        this.isReady = false;
        this.onResults = options.onResults || (() => {});
        this.onReady = options.onReady || (() => {});
        this.onError = options.onError || console.error;
        
        // Key landmark indices for head pose estimation
        this.landmarks = {
            noseTip: 1,
            foreheadTop: 10,
            chin: 152,
            leftEye: 33,
            rightEye: 263,
            leftEar: 234,
            rightEar: 454,
            leftTemple: 127,
            rightTemple: 356
        };
    }

    /**
     * Initialize MediaPipe Face Mesh
     */
    async init() {
        try {
            this.faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`;
                }
            });

            this.faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.faceMesh.onResults((results) => this.processResults(results));

            await this.faceMesh.initialize();
            this.isReady = true;
            this.onReady();
            
            return true;
        } catch (error) {
            this.onError('Failed to initialize MediaPipe: ' + error.message);
            return false;
        }
    }

    /**
     * Process a video frame
     * @param {HTMLVideoElement} video - Video element to process
     */
    async processFrame(video) {
        if (!this.isReady || !video.videoWidth) return;
        await this.faceMesh.send({ image: video });
    }

    /**
     * Process MediaPipe results and extract head pose data
     * @param {Object} results - MediaPipe results
     */
    processResults(results) {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            this.onResults({ detected: false });
            return;
        }

        const landmarks = results.multiFaceLandmarks[0];
        const faceData = this.extractFaceData(landmarks);
        
        this.onResults({
            detected: true,
            ...faceData,
            rawLandmarks: landmarks
        });
    }

    /**
     * Extract face position, rotation, and scale from landmarks
     * @param {Array} landmarks - Face mesh landmarks
     * @returns {Object} Face data with position, rotation, scale
     */
    extractFaceData(landmarks) {
        // Get key points
        const noseTip = landmarks[this.landmarks.noseTip];
        const forehead = landmarks[this.landmarks.foreheadTop];
        const chin = landmarks[this.landmarks.chin];
        const leftEye = landmarks[this.landmarks.leftEye];
        const rightEye = landmarks[this.landmarks.rightEye];
        const leftTemple = landmarks[this.landmarks.leftTemple];
        const rightTemple = landmarks[this.landmarks.rightTemple];

        // Calculate face center (between eyes, slightly above)
        const faceCenter = {
            x: (leftEye.x + rightEye.x) / 2,
            y: (leftEye.y + rightEye.y) / 2,
            z: (leftEye.z + rightEye.z) / 2
        };

        // Calculate head position (top of head estimate)
        const headTop = {
            x: forehead.x,
            y: forehead.y - (chin.y - forehead.y) * 0.3, // Estimate top of head
            z: forehead.z
        };

        // Calculate face width for scaling
        const faceWidth = Utils.distance3D(leftTemple, rightTemple);

        // Calculate rotations
        const rotation = this.calculateHeadRotation(landmarks);

        return {
            center: faceCenter,
            headTop: headTop,
            forehead: forehead,
            faceWidth: faceWidth,
            rotation: rotation
        };
    }

    /**
     * Calculate head rotation angles
     * @param {Array} landmarks - Face mesh landmarks
     * @returns {Object} Rotation {pitch, yaw, roll} in radians
     */
    calculateHeadRotation(landmarks) {
        const noseTip = landmarks[this.landmarks.noseTip];
        const forehead = landmarks[this.landmarks.foreheadTop];
        const chin = landmarks[this.landmarks.chin];
        const leftEye = landmarks[this.landmarks.leftEye];
        const rightEye = landmarks[this.landmarks.rightEye];

        // Yaw (left-right rotation)
        const eyeCenter = {
            x: (leftEye.x + rightEye.x) / 2,
            z: (leftEye.z + rightEye.z) / 2
        };
        const yaw = Math.atan2(noseTip.z - eyeCenter.z, noseTip.x - eyeCenter.x) - Math.PI / 2;

        // Pitch (up-down rotation)
        const faceVertical = chin.y - forehead.y;
        const faceDepth = noseTip.z - ((forehead.z + chin.z) / 2);
        const pitch = Math.atan2(faceDepth, faceVertical);

        // Roll (head tilt)
        const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

        return {
            pitch: pitch,
            yaw: yaw,
            roll: roll
        };
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.faceMesh) {
            this.faceMesh.close();
            this.faceMesh = null;
        }
        this.isReady = false;
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MediaPipeHandler;
}
