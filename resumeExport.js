'use strict';
/** Generates a clean, ATS-friendly single-column DOCX from structured resume data. */
const { HttpError } = require('./http');

async function buildDocx(r) {
  let docx;
  try { docx = require('docx'); } catch {
    throw new HttpError(501, 'DOCX export is not installed on the server. Run "npm install" in the project folder.');
  }
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopType, LevelFormat } = docx;

  const FONT = 'Calibri';
  const INK = '1F2937'; const ACCENT = '2F4FBF'; const MUTED = '5B6577';
  const WIDTH = 9600; // A4 (11906) minus 0.8" margins, in DXA

  const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 21, color: INK, ...o });
  const p = [];

  p.push(new Paragraph({ spacing: { after: 40 }, children: [run(r.name || 'Your Name', { size: 44, bold: true, color: ACCENT })] }));
  if (r.headline) p.push(new Paragraph({ spacing: { after: 60 }, children: [run(r.headline, { size: 24, color: MUTED })] }));
  const contact = [r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links].filter(Boolean);
  if (contact.length) p.push(new Paragraph({ spacing: { after: 120 }, children: [run(contact.join('  |  '), { size: 19, color: MUTED })] }));

  const heading = (t) => new Paragraph({
    spacing: { before: 220, after: 90 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C7D0E0', space: 2 } },
    keepNext: true,
    children: [run(t.toUpperCase(), { bold: true, size: 21, color: ACCENT, characterSpacing: 20 })],
  });
  const bullet = (t) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 30 }, children: [run(t)] });
  const entry = (left, sub, right) => [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: WIDTH }], spacing: { before: 90, after: 10 }, keepNext: true,
      children: [run(left, { bold: true }), ...(right ? [run('\t' + right, { color: MUTED, size: 19 })] : [])],
    }),
    ...(sub ? [new Paragraph({ spacing: { after: 30 }, keepNext: true, children: [run(sub, { italics: true, color: MUTED })] })] : []),
  ];
  const dates = (a, b) => [a, b].filter(Boolean).join(' – ');

  if (r.summary) { p.push(heading('Summary')); p.push(new Paragraph({ spacing: { after: 40 }, children: [run(r.summary)] })); }
  if (r.skills.length) { p.push(heading('Skills')); p.push(new Paragraph({ spacing: { after: 40 }, children: [run(r.skills.join('  •  '))] })); }
  if (r.experience.length) {
    p.push(heading('Experience'));
    for (const e of r.experience) {
      p.push(...entry(e.title || e.company, [e.title ? e.company : '', e.location].filter(Boolean).join(', '), dates(e.start, e.end)));
      e.bullets.forEach((b) => p.push(bullet(b)));
    }
  }
  if (r.projects.length) {
    p.push(heading('Projects'));
    for (const pr of r.projects) {
      p.push(...entry(pr.name, pr.technologies.length ? pr.technologies.join(', ') : '', ''));
      if (pr.description) p.push(new Paragraph({ spacing: { after: 30 }, children: [run(pr.description)] }));
      pr.bullets.forEach((b) => p.push(bullet(b)));
    }
  }
  if (r.education.length) {
    p.push(heading('Education'));
    for (const e of r.education) {
      p.push(...entry(e.degree || e.institution, [e.degree ? e.institution : '', e.location].filter(Boolean).join(', '), dates(e.start, e.end)));
      e.details.forEach((b) => p.push(bullet(b)));
    }
  }
  for (const [title, items] of [['Certifications', r.certifications], ['Achievements', r.achievements]]) {
    if (items.length) { p.push(heading(title)); items.forEach((b) => p.push(bullet(b))); }
  }
  if (r.languages.length) { p.push(heading('Languages')); p.push(new Paragraph({ children: [run(r.languages.join('  •  '))] })); }

  const doc = new Document({
    creator: 'SkillBridge AI', title: `${r.name || 'Resume'} – Resume`,
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1152, right: 1152 } } }, children: p }],
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildDocx };
