// The two dialogs of a signed-in player: change the sign-in name, change the password. Built like the sign-in dialog.
// Each is mounted only while open, so what was typed (a password above all) is gone from state the moment it closes.
import { useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/pebble";
import { ACCOUNT_NAME_MAX, PASSWORD_MAX } from "../contracts";
import type { ChangeResult } from "../session";
import "./signin.css";

export const NAME_NOTE = "This is the name you sign in with. Your hero name in fights does not change.";

interface Props {
  /** Called with the success line when the change worked; the dialog is closed by the caller. */
  onDone: (text: string) => void;
  onClose: () => void;
}

/** The part both dialogs share: the error line, Save and Cancel, and the one request at a time. */
function ChangeForm(props: Props & { title: string; send: () => Promise<ChangeResult>; note: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = (): void => {
    if (busy) return;
    setBusy(true);
    setError("");
    void props.send().then((result) => {
      if (result.ok) props.onDone(result.text);
      else { setBusy(false); setError(result.text); }
    });
  };
  return createPortal(
    <Dialog title={props.title} onEscape={props.onClose}>
      <form className="acc-signin__form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        {props.children}
        <p className="acc-signin__say" role="status" aria-live="polite">{props.note}</p>
        {error !== "" && <p className="acc-signin__say is-error" role="alert">{error}</p>}
        <div className="acc-signin__buttons">
          <Button primary type="submit" disabled={busy}>Save</Button>
          <Button disabled={busy} onClick={props.onClose}>Cancel</Button>
        </div>
      </form>
    </Dialog>,
    document.body,
  );
}

export function ChangeNameDialog(props: Props & { current: string; rename: (name: string) => Promise<ChangeResult> }) {
  const [name, setName] = useState(props.current);
  return (
    <ChangeForm {...props} title="Change name" note={NAME_NOTE} send={() => props.rename(name)}>
      <label>
        <span>Sign-in name</span>
        <input type="text" name="username" value={name} maxLength={ACCOUNT_NAME_MAX} autoComplete="username" autoCapitalize="off" spellCheck={false} onChange={(event) => { setName(event.target.value); }} />
      </label>
    </ChangeForm>
  );
}

export function ChangePasswordDialog(props: Props & { change: (current: string, next: string, again: string) => Promise<ChangeResult> }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const field = (label: string, name: string, value: string, auto: string, set: (value: string) => void) => (
    <label>
      <span>{label}</span>
      <input type="password" name={name} value={value} maxLength={PASSWORD_MAX} autoComplete={auto} onChange={(event) => { set(event.target.value); }} />
    </label>
  );
  return (
    <ChangeForm {...props} title="Change password" note="Your other devices will be signed out." send={() => props.change(current, next, again)}>
      {field("Current password", "current-password", current, "current-password", setCurrent)}
      {field("New password", "new-password", next, "new-password", setNext)}
      {field("New password again", "new-password-again", again, "new-password", setAgain)}
    </ChangeForm>
  );
}
