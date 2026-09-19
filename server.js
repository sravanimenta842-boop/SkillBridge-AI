'use strict';
// Entry point – keeps the original "npm start" / "node server.js" workflow.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  let hasFallback = true;
  try { require.resolve('better-sqlite3'); } catch { hasFallback = false; }
  if (!hasFallback) {
    console.error(`\n[SkillBridge AI] Node.js ${process.versions.node} is too old.\n` +
      '  Install Node.js 22 LTS or newer from https://nodejs.org and run "npm install" again.\n');
    process.exit(1);
  }
}
require('./server/index').start();
