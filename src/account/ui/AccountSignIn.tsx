// The account part of the Account screen: where the progress is kept, and the way to sign in or out.
// It is one block in the middle of the screen, under the name and the coins: the words "Your account", where the
// progress is kept, and a row of buttons. Signed out the first button is "Sign in" (the bright one); the name and
// password are asked in a dialog, like the settings. What is put inside the element joins that row: the Account
// screen puts the Hall of heroes there, <AccountSignIn><HallOfHeroes /></AccountSignIn>.
// With no account server this draws nothing and the page is as it was.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/pebble";
import { ACCOUNT_NAME_MAX, PASSWORD_MAX } from "../contracts";
import { accountName } from "../session";
import { useProfile } from "../store";
import { accountStatus, changePassword, getAccount, rename, signIn, signOut, signUp, useAccount } from "../sync";
import type { SaveState } from "../sync";
import { ChangeNameDialog, ChangePasswordDialog } from "./ChangeDialogs";
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

export function AccountSignIn(props: { children?: ReactNode }) {
  const account = useAccount();
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const [change, setChange] = useState<"name" | "password" | null>(null);
  // The line after a change: shown where the save status is, until the save status leaves saved or the player signs out.
  const [note, setNote] = useState("");
  // Opening the Account page is the one moment a signed-out browser asks the server anything.
  useEffect(() => { void accountStatus(); }, []);
  const save = account.status === "signedIn" ? account.save : null;
  // The note is true only for the sign-in it was said about and while the save is fine: any other state clears it.
  useEffect(() => { if (save !== "saved") setNote(""); }, [save]);

  // Until the server has said it has accounts, and when it has none, nothing is drawn.
  if (account.status === "unknown" || account.status === "off") return null;
  const signedIn = account.status === "signedIn";
  return (
    <section className="acc-signin" aria-label="Your account">
      <h2 className="acc-signin__title">Your account</h2>
      {signedIn
        ? <p className="acc-signin__where"><span>Signed in as <b>{account.name}</b>.</span> <span role="status" aria-live="polite">{(save === "saved" && note) || SAVE_TEXT[account.save]}</span></p>
        : <p className="acc-signin__where"><span>Saved in this browser only.</span> <span>Sign in or create an account to keep it.</span></p>}
      <div className="acc-signin__row">
        {signedIn
          ? <Button onClick={() => { setOpen(false); setChange(null); setNote(""); void signOut(); }}>Sign out</Button>
          : <Button primary onClick={() => { setOpen(true); }}>Sign in</Button>}
        {props.children}
        {signedIn && <Button onClick={() => { setChange("name"); }}>Change name</Button>}
        {signedIn && <Button onClick={() => { setChange("password"); }}>Change password</Button>}
      </div>
      {open && !signedIn && <SignInDialog firstName={accountName(profile.name)} onClose={() => { setOpen(false); }} />}
      {signedIn && change === "name" && <ChangeNameDialog current={account.name} rename={rename} onClose={() => { setChange(null); }} onDone={(text) => { setNote(text); setChange(null); }} />}
      {signedIn && change === "password" && <ChangePasswordDialog change={changePassword} onClose={() => { setChange(null); }} onDone={(text) => { setNote(text); setChange(null); }} />}
    </section>
  );
}
