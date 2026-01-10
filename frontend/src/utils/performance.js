/**
 * Frontend performance monitoring utilities
 * Measures render times, API calls, and user interactions
 */

class PerformanceMonitor {
  static measurements = {};

  /**
   * Start measuring a performance metric
   */
  static start(label) {
    this.measurements[label] = performance.now();
  }

  /**
   * End measurement and log result
   */
  static end(label) {
    if (!this.measurements[label]) {
      console.warn(`No start time found for: ${label}`);
      return;
    }
    
    const duration = performance.now() - this.measurements[label];
    delete this.measurements[label];
    
    const formatted = `[PERF] ${label}: ${duration.toFixed(2)}ms`;
    
    if (duration > 1000) {
      console.warn(`⚠️ SLOW: ${formatted}`);
    } else if (duration > 500) {
      console.log(`⚡ ${formatted}`);
    } else {
      console.log(formatted);
    }
    
    return duration;
  }

  /**
   * Measure API call performance
   */
  static async measureAPI(label, apiCall) {
    const startTime = performance.now();
    try {
      const response = await apiCall();
      const duration = performance.now() - startTime;
      
      // Estimate payload size
      const payloadSize = JSON.stringify(response.data).length;
      const sizeKB = (payloadSize / 1024).toFixed(2);
      
      console.log(`[API] ${label}: ${duration.toFixed(2)}ms | ${sizeKB}KB payload`);
      
      if (duration > 2000) {
        console.warn(`⚠️ VERY SLOW API: ${label}`);
      }
      
      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[API ERROR] ${label}: ${duration.toFixed(2)}ms`, error);
      throw error;
    }
  }

  /**
   * Measure component render time
   */
  static measureRender(componentName, renderFn) {
    const startTime = performance.now();
    const result = renderFn();
    const duration = performance.now() - startTime;
    
    if (duration > 16.67) { // Slower than 60fps
      console.warn(`⚠️ SLOW RENDER: ${componentName}: ${duration.toFixed(2)}ms (target: <16.67ms for 60fps)`);
    }
    
    return result;
  }

  /**
   * Get performance summary
   */
  static getSummary() {
    const entries = performance.getEntriesByType('measure');
    return entries.map(entry => ({
      name: entry.name,
      duration: entry.duration.toFixed(2) + 'ms'
    }));
  }
}

export default PerformanceMonitor;
