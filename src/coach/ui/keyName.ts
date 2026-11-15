const ARROWS: Readonly<Record<string, string>> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

/** What the Dojo shows for a move's key: Space, an arrow glyph, or a capital letter. */
export const keyName = (key: string): string => ARROWS[key] ?? (key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key);
