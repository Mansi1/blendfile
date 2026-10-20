// VERIFIED: defuss-ssg loads uWebSockets.js, which runs only on Node 22, 24 and 26: fail early with a clear message
// (its engines field still allows Node 20.19: kyr0/defuss#56). From the audio-tag website.
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`The website build needs Node 22 or newer (uWebSockets.js); this is Node ${process.versions.node}.`);
  process.exit(1);
}
