/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require("sharp");
const path = require("path");

const BLUE = "#1e4fa8";
const YELLOW = "#f4c430";

const outDir = path.join(__dirname, "..", "public");

const standardSvg = () => `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="96" fill="${BLUE}"/>
  <circle cx="404" cy="404" r="52" fill="${YELLOW}"/>
  <text x="230" y="330" font-family="Arial, Helvetica, sans-serif" font-size="300" font-weight="700" fill="#ffffff" text-anchor="middle">U</text>
</svg>`;

const maskableSvg = () => `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="${BLUE}"/>
  <text x="256" y="300" font-family="Arial, Helvetica, sans-serif" font-size="220" font-weight="700" fill="#ffffff" text-anchor="middle">U</text>
  <circle cx="256" cy="380" r="26" fill="${YELLOW}"/>
</svg>`;

const faviconSvg = () => `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="${BLUE}"/>
  <text x="256" y="356" font-family="Arial, Helvetica, sans-serif" font-size="330" font-weight="700" fill="#ffffff" text-anchor="middle">U</text>
</svg>`;

async function run() {
  await sharp(Buffer.from(standardSvg())).resize(192, 192).png().toFile(path.join(outDir, "icon-192.png"));
  await sharp(Buffer.from(standardSvg())).resize(512, 512).png().toFile(path.join(outDir, "icon-512.png"));
  await sharp(Buffer.from(maskableSvg())).resize(512, 512).png().toFile(path.join(outDir, "icon-512-maskable.png"));
  await sharp(Buffer.from(standardSvg())).resize(180, 180).png().toFile(path.join(outDir, "apple-touch-icon.png"));
  await sharp(Buffer.from(faviconSvg())).resize(32, 32).png().toFile(path.join(outDir, "favicon-32.png"));
  console.log("icons written to", outDir);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
