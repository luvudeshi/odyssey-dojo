// The look picked with ?look=<key>, read once at load and set as data-look on <html>. With no ?look the game is as it is.
import "./set/set.css";

const key = new URLSearchParams(window.location.search).get("look") ?? "";
if (key) document.documentElement.dataset.look = key;

/** True when the page was opened with ?look=<name>. */
export const lookIs = (name: string): boolean => key === name;
