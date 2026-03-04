/**
 * Component lifecycle hooks.
 * Different from kernel lifecycle (shutdown only).
 * This is for business components with full lifecycle.
 */

export type LifecyclePhase = "starting" | "started" | "stopping" | "stopped";

export interface ComponentLifecycle {
  /**
   * Called when component is being initialized
   */
  onStarting?(): void | Promise<void>;

  /**
   * Called when component has fully started
   */
  onStarted?(): void | Promise<void>;

  /**
   * Called when component is being stopped (graceful shutdown)
   */
  onStopping?(): void | Promise<void>;

  /**
   * Called when component has fully stopped
   */
  onStopped?(): void | Promise<void>;

  /**
   * Health check for component
   */
  checkHealth?(): Promise<{ healthy: boolean; message?: string }>;
}

/**
 * Lifecycle manager for components
 */
export class LifecycleManager {
  private components: ComponentLifecycle[] = [];
  private phase: LifecyclePhase = "stopped";

  register(component: ComponentLifecycle): void {
    this.components.push(component);
  }

  async start(): Promise<void> {
    this.phase = "starting";

    for (const component of this.components) {
      await component.onStarting?.();
    }

    this.phase = "started";

    for (const component of this.components) {
      await component.onStarted?.();
    }
  }

  async stop(): Promise<void> {
    this.phase = "stopping";

    // Stop in reverse order
    for (const component of this.components.reverse()) {
      await component.onStopping?.();
    }

    this.phase = "stopped";

    for (const component of this.components) {
      await component.onStopped?.();
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; checks: Record<string, boolean> }> {
    const checks: Record<string, boolean> = {};
    let allHealthy = true;

    for (let idx = 0; idx < this.components.length; idx++) {
      const component = this.components[idx];
      const result = await component.checkHealth?.();
      const name = `component-${idx}`;
      checks[name] = result?.healthy ?? true;
      if (!checks[name]) allHealthy = false;
    }

    return { healthy: allHealthy, checks };
  }

  getPhase(): LifecyclePhase {
    return this.phase;
  }
}