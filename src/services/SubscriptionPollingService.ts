// src/services/SubscriptionPollingService.ts
/**
 * SubscriptionPollingService
 *
 * Manages background polling for device subscription status.
 * Polls unsubscribed devices periodically and updates UI when subscriptions are detected.
 * Runs in background without blocking the main thread.
 */

export interface Device {
  imei: string;
  phoneNumber: string;
}

export interface SubscriptionPollingConfig {
  /**
   * Polling interval in milliseconds (default: 10000 = 10 seconds)
   */
  pollInterval?: number;

  /**
   * Maximum number of polling attempts before giving up (default: unlimited)
   */
  maxAttempts?: number;

  /**
   * Callback when subscription is detected for a device
   */
  onSubscriptionDetected?: (device: Device) => void;

  /**
   * Callback when polling error occurs
   */
  onError?: (device: Device, error: Error) => void;

  /**
   * Function to check subscription status (should return Promise<boolean>)
   */
  checkSubscription: (imei: string, phoneNumber: string) => Promise<boolean>;
}

export class SubscriptionPollingService {
  private devices: Map<string, Device> = new Map();
  private pollingIntervalId: ReturnType<typeof setInterval> | null = null;
  private pollingTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isPolling = false;
  private isPaused = false;
  private visibilityHandler: (() => void) | null = null;

  private config: Required<Omit<SubscriptionPollingConfig, "onSubscriptionDetected" | "onError">> & {
    onSubscriptionDetected?: (device: Device) => void;
    onError?: (device: Device, error: Error) => void;
    checkSubscription: (imei: string, phoneNumber: string) => Promise<boolean>;
  };

  constructor(config: SubscriptionPollingConfig) {
    this.config = {
      pollInterval: config.pollInterval ?? 10000,
      maxAttempts: config.maxAttempts ?? Infinity,
      checkSubscription: config.checkSubscription,
      onSubscriptionDetected: config.onSubscriptionDetected,
      onError: config.onError
    };

    // Setup Page Visibility API to pause/resume polling
    this.setupVisibilityHandling();
  }

  /**
   * Start polling for unsubscribed devices
   */
  startPolling(devices: Device[]): void {
    if (this.isPolling) {
      console.log("[SubscriptionPolling] Already polling, adding devices to existing poll");
      devices.forEach((device) => this.addDevice(device));
      return;
    }

    console.log("[SubscriptionPolling] Starting polling for", devices.length, "devices");

    // Add all devices to polling list
    devices.forEach((device) => {
      const normalizedImei = this.normalizeImei(device.imei);
      this.devices.set(normalizedImei, {
        imei: normalizedImei,
        phoneNumber: device.phoneNumber
      });
    });

    this.isPolling = true;
    this.isPaused = false;

    // Start polling immediately, then schedule next poll
    this.checkDevices();
    this.scheduleNextPoll();
  }

  /**
   * Stop polling completely
   */
  stopPolling(): void {
    console.log("[SubscriptionPolling] Stopping polling");

    if (this.pollingIntervalId !== null) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }

    if (this.pollingTimeoutId !== null) {
      clearTimeout(this.pollingTimeoutId);
      this.pollingTimeoutId = null;
    }

    this.isPolling = false;
    this.isPaused = false;
    this.devices.clear();
  }

  /**
   * Add a device to the polling list
   */
  addDevice(device: Device): void {
    const normalizedImei = this.normalizeImei(device.imei);

    if (this.devices.has(normalizedImei)) {
      console.log("[SubscriptionPolling] Device already in polling list:", normalizedImei);
      return;
    }

    console.log("[SubscriptionPolling] Adding device to polling list:", normalizedImei);
    this.devices.set(normalizedImei, {
      imei: normalizedImei,
      phoneNumber: device.phoneNumber
    });

    // If polling is active and not paused, check this device immediately
    if (this.isPolling && !this.isPaused) {
      this.checkDeviceSubscription(device);
    }
  }

  /**
   * Remove a device from the polling list
   */
  removeDevice(imei: string): void {
    const normalizedImei = this.normalizeImei(imei);

    if (this.devices.delete(normalizedImei)) {
      console.log("[SubscriptionPolling] Removed device from polling list:", normalizedImei);
    }

    // If no devices left, stop polling
    if (this.devices.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * Pause polling (e.g., when tab is hidden)
   */
  pausePolling(): void {
    if (this.isPaused) return;

    console.log("[SubscriptionPolling] Pausing polling");
    this.isPaused = true;

    if (this.pollingTimeoutId !== null) {
      clearTimeout(this.pollingTimeoutId);
      this.pollingTimeoutId = null;
    }
  }

  /**
   * Resume polling (e.g., when tab becomes visible)
   */
  resumePolling(): void {
    if (!this.isPaused || !this.isPolling) return;

    console.log("[SubscriptionPolling] Resuming polling");
    this.isPaused = false;

    // Immediately check devices when resuming
    this.checkDevices();
    this.scheduleNextPoll();
  }

  /**
   * Get list of devices currently being polled
   */
  getPollingDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  /**
   * Check if polling is active
   */
  isActive(): boolean {
    return this.isPolling && !this.isPaused;
  }

  /**
   * Main polling function - checks all devices
   */
  private async checkDevices(): Promise<void> {
    if (!this.isPolling || this.isPaused || this.devices.size === 0) {
      return;
    }

    const devicesToCheck = Array.from(this.devices.values());
    console.log("[SubscriptionPolling] Checking", devicesToCheck.length, "devices");

    // Use requestIdleCallback if available for non-blocking execution
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(
        () => {
          this.checkDevicesInParallel(devicesToCheck);
        },
        { timeout: 5000 }
      );
    } else {
      // Fallback to setTimeout for immediate execution
      setTimeout(() => {
        this.checkDevicesInParallel(devicesToCheck);
      }, 0);
    }
  }

  /**
   * Check multiple devices in parallel
   */
  private async checkDevicesInParallel(devices: Device[]): Promise<void> {
    // Check all devices in parallel (non-blocking)
    const checkPromises = devices.map((device) =>
      this.checkDeviceSubscription(device).catch((error) => {
        console.error("[SubscriptionPolling] Error checking device:", device.imei, error);
        if (this.config.onError) {
          this.config.onError(device, error);
        }
        return false;
      })
    );

    await Promise.all(checkPromises);
  }

  /**
   * Check subscription status for a single device
   */
  private async checkDeviceSubscription(device: Device): Promise<boolean> {
    try {
      console.log("[SubscriptionPolling] Checking subscription for device:", device.imei);

      const isSubscribed = await this.config.checkSubscription(device.imei, device.phoneNumber);

      if (isSubscribed) {
        console.log("[SubscriptionPolling] ✅ Subscription detected for device:", device.imei);

        // Remove from polling list
        this.removeDevice(device.imei);

        // Notify callback
        if (this.config.onSubscriptionDetected) {
          this.config.onSubscriptionDetected(device);
        }

        // Dispatch Alpine event for UI updates
        this.dispatchSubscriptionDetectedEvent(device);

        return true;
      }

      return false;
    } catch (error) {
      console.error("[SubscriptionPolling] Error checking subscription for device:", device.imei, error);
      if (this.config.onError) {
        this.config.onError(device, error instanceof Error ? error : new Error(String(error)));
      }
      return false;
    }
  }

  /**
   * Schedule the next polling check
   */
  private scheduleNextPoll(): void {
    if (!this.isPolling || this.isPaused) {
      return;
    }

    // Clear any existing timeout
    if (this.pollingTimeoutId !== null) {
      clearTimeout(this.pollingTimeoutId);
    }

    // Schedule next poll
    this.pollingTimeoutId = setTimeout(() => {
      this.checkDevices();
      this.scheduleNextPoll();
    }, this.config.pollInterval);
  }

  /**
   * Setup Page Visibility API handlers
   */
  private setupVisibilityHandling(): void {
    if (typeof document === "undefined") return;

    this.visibilityHandler = () => {
      if (document.hidden) {
        this.pausePolling();
      } else {
        this.resumePolling();
      }
    };

    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  /**
   * Cleanup visibility handlers
   */
  private cleanupVisibilityHandling(): void {
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  /**
   * Dispatch Alpine event when subscription is detected
   */
  private dispatchSubscriptionDetectedEvent(device: Device): void {
    if (typeof window === "undefined") return;

    // Dispatch custom event that Alpine components can listen to
    const event = new CustomEvent("subscription-detected", {
      detail: {
        imei: device.imei,
        phoneNumber: device.phoneNumber
      },
      bubbles: true
    });

    window.dispatchEvent(event);
  }

  /**
   * Normalize IMEI format (remove non-digits, pad to 15 characters)
   */
  private normalizeImei(imei: string): string {
    return imei.replace(/[^0-9]/g, "").padEnd(15, "0");
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    this.stopPolling();
    this.cleanupVisibilityHandling();
  }
}
