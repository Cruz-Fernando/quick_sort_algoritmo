/**
 * Cromo_jug1_p67.png → valor 67 (número tras `_p` antes de la extensión).
 * @param {string} filename
 * @returns {number}
 */
export function parseCardValueFromFilename(filename) {
  const base = filename.replace(/^.*[/\\]/, "");
  const m = base.match(/_p(\d+)/i);
  if (!m) return NaN;
  return Number(m[1]);
}

/**
 * @param {string} filename
 * @param {string} basePath - ej. "Media_cromo"
 */
export function cardFromMediaFile(filename, basePath = "Media_cromo") {
  const value = parseCardValueFromFilename(filename);
  return {
    id: `card_${filename}`,
    filename,
    value: Number.isFinite(value) ? value : 0,
    imageUrl: `${basePath}/${filename}`,
  };
}

/** Lista por defecto si falla manifest.json (mismo orden que jug 1…7). */
export const DEFAULT_MEDIA_CROMO_FILES = [
  "Cromo_jug1_p67.png",
  "Cromo_jug2_p84.png",
  "Cromo_jug3_p79.png",
  "Cromo_jug4_p90.png",
  "Cromo_jug5_p99.png",
  "Cromo_jug6_p77.png",
  "Cromo_jug7_p92.png",
];

export function sortFilenamesByJugNumber(a, b) {
  const ja = a.match(/jug(\d+)/i);
  const jb = b.match(/jug(\d+)/i);
  if (ja && jb) return Number(ja[1]) - Number(jb[1]);
  return a.localeCompare(b, undefined, { numeric: true });
}
