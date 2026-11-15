// The account part of the Account screen's Hero card: where the progress is kept, and the way to sign in or out.
// Signed out it is one line and one button; the name and password are asked in a dialog, like the settings.
// With no account server the line says so and the page is otherwise as it was.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/pebble";
import { ACCOUNT_NAME_MAX, PASSWORD_MAX } from "../contracts";
import { accountName } from "../session";
import { useProfile } from "../store";
import { accountStatus, getAccount, signIn, signOut, signUp, useAccount } from "../sync";
import type { SaveState } from "../sync";
import "./signin.css";

const SAVE_TEXT: Readonly<Record<SaveState, string>> = {
  saved: "Saved to your account.",
  saving: "Saving...",
  // Sent again on the next change, on the next visit to this page and when the game next starts.
  later: "Not sent yet. Kept in this browser.",
};

function SignInDialog(props: { firstName: string; onClose: () => void }) {
  const account = useAccount();
  const [name, setName] = useState(props.firstName);
  const [password, setPassword] = useState("");
  // An error from an earlier visit to this dialog is not shown again: only what this try said.
  const [tried, setTried] = useState(false);
  const busy = account.status === "busy";
  const error = tried && account.status === "signedOut" ? account.error : "";
  const send = (enter: typeof signIn): void => {
    if (busy) return;
    setTried(true);
    // Signed in: the dialog has done its work. Anything else stays here with what went wrong.
    void enter(name, password).then(() => { if (getAccount().status === "signedIn") props.onClose(); });
  };
  return createPortal(
    <Dialog title="Your account" onEscape={props.onClose}>
      <form className="acc-signin__form" onSubmit={(event) => { event.preventDefault(); send(signIn); }}>
        <label>
          <span>Hero name</span>
          <input type="text" name="username" value={name} maxLength={ACCOUNT_NAME_MAX} autoComplete="username" autoCapitalize="off" spellCheck={false} readOnly={busy} onChange={(event) => { setName(event.target.value); }} />
        </label>
        <label>
          <span>Password</span>
          <input type="password" name="password" value={password} maxLength={PASSWORD_MAX} autoComplete="current-password" readOnly={busy} onChange={(event) => { setPassword(event.target.value); }} />
        </label>
        <p className={`acc-signin__say ${error ? "is-error" : ""}`} role="status" aria-live="polite">{busy ? "One moment..." : error || "No email needed. A password is at least 8 characters."}</p>
        <div className="acc-signin__buttons">
          <Button primary type="submit" disabled={busy}>Sign in</Button>
          <Button disabled={busy} onClick={() => { send(signUp); }}>Create account</Button>
        </div>
      </form>
      <Button onClick={props.onClose}>Back</Button>
    </Dialog>,
    document.body,
  );
}

export function AccountSignIn() {
  const account = useAccount();
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  // Opening the Account page is the one moment a signed-out browser asks the server anything.
  useEffect(() => { void accountStatus(); }, []);

  if (account.status === "signedIn") {
    return (
      <div className="acc-signin">
        <p>Signed in as <b>{account.name}</b>.</p>
        <p role="status" aria-live="polite">{SAVE_TEXT[account.save]}</p>
        <Button onClick={() => { void signOut(); }}>Sign out</Button>
      </div>
    );
  }
  if (account.status === "off") {
    return <div className="acc-signin is-quiet"><p>Saved in this browser only. Accounts are not available here.</p></div>;
  }
  return (
    <div className="acc-signin">
      <p>Saved in this browser only.</p>
      {account.status !== "unknown" && <Button onClick={() => { setOpen(true); }}>Sign in or create account</Button>}
      {open && <SignInDialog firstName={accountName(profile.name)} onClose={() => { setOpen(false); }} />}
    </div>
  );
}
