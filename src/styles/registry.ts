// Every file in ./defs that exports `style` is picked up here.
import type { FightingStyle } from "../core/types";

const modules = import.meta.glob<{ style: FightingStyle }>("./defs/*.ts", { eager: true });

export const STYLES: readonly FightingStyle[] = Object.values(modules).map((module) => module.style);
