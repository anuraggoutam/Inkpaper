// One-off helper: copies the licensed handwriting fonts from @fontsource dev packages
// into public/fonts together with their license files. The copied files are committed,
// so the app never needs these packages (or the network) at runtime.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "fonts");
mkdirSync(out, { recursive: true });

const fonts = [
  ["caveat", ["latin", "latin-ext"]],
  ["kalam", ["latin", "latin-ext", "devanagari"]],
  ["indie-flower", ["latin", "latin-ext"]],
  ["nanum-pen-script", ["latin"]],
  ["homemade-apple", ["latin"]],
  ["patrick-hand", ["latin", "latin-ext"]],
];

for (const [name, subsets] of fonts) {
  const pkg = join(root, "node_modules", "@fontsource", name);
  if (!existsSync(pkg)) {
    console.error(`Missing @fontsource/${name}; run npm install first.`);
    process.exit(1);
  }
  for (const subset of subsets) {
    const file = `${name}-${subset}-400-normal.woff2`;
    copyFileSync(join(pkg, "files", file), join(out, file));
  }
  copyFileSync(join(pkg, "LICENSE"), join(out, `${name}.LICENSE.txt`));
}
console.log(`Fonts copied to ${out}`);
