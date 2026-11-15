import type { Look } from "../../ui/lookSwitch";
import { LookA } from "./LookA";
import { LookB } from "./LookB";
import { LookC } from "./LookC";
import type { LookProps } from "./shared";

export function LookScreen(props: LookProps & { look: Look }) {
  if (props.look === "a") return <LookA {...props} />;
  if (props.look === "b") return <LookB {...props} />;
  return <LookC {...props} />;
}
