'use strict';
/** Skill-name normalisation and level thresholds (pure functions, no data). */

const ALIASES = {
  js: 'javascript', ecmascript: 'javascript', es6: 'javascript', vanillajs: 'javascript',
  node: 'nodejs', nodejs: 'nodejs', expressjs: 'nodejs',
  html5: 'html', css3: 'css', py: 'python', python3: 'python',
  frontend: 'frontenddevelopment', frontenddev: 'frontenddevelopment', frontenddevelopment: 'frontenddevelopment',
  backend: 'backenddevelopment', backenddev: 'backenddevelopment', backenddevelopment: 'backenddevelopment',
  databases: 'database', dbms: 'database', databasemanagement: 'database', rdbms: 'database',
  communications: 'communication', communicationskills: 'communication', verbalcommunication: 'communication', writtencommunication: 'communication',
  problemsolving: 'problemsolving', softwaretesting: 'softwaretesting', testing: 'softwaretesting', qa: 'softwaretesting',
  qualityassurance: 'softwaretesting', technicalwriting: 'technicalwriting',
};

function skillKey(name) {
  let k = String(name || '').toLowerCase().replace(/[^a-z0-9+#]/g, '');
  if (ALIASES[k]) k = ALIASES[k];
  return k;
}

function levelFor(percent) {
  if (percent >= 85) return 'Expert';
  if (percent >= 70) return 'Advanced';
  if (percent >= 40) return 'Intermediate';
  return 'Beginner';
}

/** A skill is "strong" from 70% upwards. */
const STRONG_THRESHOLD = 70;

const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

module.exports = { skillKey, levelFor, STRONG_THRESHOLD, clampPct };
