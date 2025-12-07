/**
 * Utility functions for the hat try-on application
 */

const Utils = {
    /**
     * Exponential smoothing filter for reducing jitter
     * @param {number} current - Current value
     * @param {number} previous - Previous smoothed value
     * @param {number} factor - Smoothing factor (0-1, higher = more smoothing)
     * @returns {number} Smoothed value
     */
    smooth(current, previous, factor = 0.5) {
        if (previous === null || previous === undefined) return current;
        return previous * factor + current * (1 - factor);
    },

    /**
     * Smooth a 3D vector
     * @param {Object} current - Current {x, y, z}
     * @param {Object} previous - Previous {x, y, z}
     * @param {number} factor - Smoothing factor
     * @returns {Object} Smoothed {x, y, z}
     */
    smooth3D(current, previous, factor = 0.5) {
        if (!previous) return current;
        return {
            x: this.smooth(current.x, previous.x, factor),
            y: this.smooth(current.y, previous.y, factor),
            z: this.smooth(current.z, previous.z, factor)
        };
    },

    /**
     * Calculate distance between two 3D points
     * @param {Object} p1 - Point 1 {x, y, z}
     * @param {Object} p2 - Point 2 {x, y, z}
     * @returns {number} Distance
     */
    distance3D(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = (p2.z || 0) - (p1.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },

    /**
     * Clamp a value between min and max
     * @param {number} value - Value to clamp
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Clamped value
     */
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    /**
     * Linear interpolation
     * @param {number} a - Start value
     * @param {number} b - End value
     * @param {number} t - Interpolation factor (0-1)
     * @returns {number} Interpolated value
     */
    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    /**
     * FPS Counter class
     */
    FPSCounter: class {
        constructor(updateInterval = 500) {
            this.frames = 0;
            this.lastTime = performance.now();
            this.fps = 0;
            this.updateInterval = updateInterval;
        }

        tick() {
            this.frames++;
            const now = performance.now();
            const delta = now - this.lastTime;
            
            if (delta >= this.updateInterval) {
                this.fps = Math.round((this.frames * 1000) / delta);
                this.frames = 0;
                this.lastTime = now;
                return true; // FPS was updated
            }
            return false;
        }

        getFPS() {
            return this.fps;
        }
    },

    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}
