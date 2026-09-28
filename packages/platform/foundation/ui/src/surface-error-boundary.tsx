"use client";
import { Component, type ReactNode } from "react";
type Props = { children: ReactNode; resetKey: string; message: string; retryLabel: string };
/** Contains a render failure without exposing exception text or remounting healthy
 * siblings. Async transport failures remain owned by their request handlers. */
export class SurfaceErrorBoundary extends Component<Props, { failed: boolean; resetKey: string }> {
  state = { failed: false, resetKey: this.props.resetKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props: Props, state: { resetKey: string }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }
  render() {
    return this.state.failed ? <section role="alert"><p>{this.props.message}</p><button type="button" onClick={() => this.setState({ failed: false })}>{this.props.retryLabel}</button></section> : this.props.children;
  }
}
