// Catches a failed asset load or render below it and shows `fallback` instead, so one missing file never blanks the app.
import { Component } from "react";
import type { ReactNode } from "react";
import { log } from "../core/log";

interface Props {
  fallback: ReactNode;
  /** Names the part that failed, for the log. */
  label: string;
  children?: ReactNode;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    log("error", `render-failed:${this.props.label}`, error);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
