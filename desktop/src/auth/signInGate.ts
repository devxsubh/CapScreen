import { shell } from "electron";
import { showPage, showWindow } from "../window/mainWindow";
import { signInHtml, type SignInView } from "../window/shellPages";
import { beginSignIn } from "./session";

/**
 * The sign-in page shown until the user is signed in. Its buttons arrive here
 * over IPC (see handleShellAction in main.ts).
 */

let gateResolve: (() => void) | null = null;
let pendingSignIn: Awaited<ReturnType<typeof beginSignIn>> | null = null;

function showGate(view: SignInView): void {
  void showPage(signInHtml(view));
}

/** Show the sign-in gate and resolve once the user is signed in. */
export function requireSignIn(): Promise<void> {
  showGate({ state: "idle" });
  return new Promise<void>((resolve) => (gateResolve = resolve));
}

export async function handleGateAction(action: string): Promise<void> {
  if (action === "reopen" && pendingSignIn) {
    await shell.openExternal(pendingSignIn.handle.authorizeUrl);
    return;
  }
  if (action === "cancel") {
    pendingSignIn?.handle.cancel();
    return;
  }
  // signin / signup: start a fresh browser round-trip.
  pendingSignIn?.handle.cancel();
  try {
    const flow = await beginSignIn();
    pendingSignIn = flow;
    await shell.openExternal(flow.handle.authorizeUrl + (action === "signup" ? "#signup" : ""));
    showGate({ state: "waiting" });
    await flow.done;
    pendingSignIn = null;
    showWindow();
    gateResolve?.();
    gateResolve = null;
  } catch (err) {
    pendingSignIn = null;
    const message = err instanceof Error ? err.message : String(err);
    showGate(message === "Sign-in cancelled" ? { state: "idle" } : { state: "error", message });
  }
}
