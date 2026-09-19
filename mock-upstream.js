'use strict';
/**
 * DEVELOPMENT/TEST ONLY. A tiny local stand-in for the external AI service
 * provider so the automated test can exercise the whole
 * backend without network access or API keys. It is never used by the app in
 * normal operation – the real services are used whenever the .env keys are set.
 */
const http = require('http');

const calls = { ai: [] };

function aiReply(system, prompt) {
  const P = prompt || '';
  const S = system || '';
  // ---- assessment generation
  if (P.startsWith('Create a skill assessment of EXACTLY 10')) {
    const skills = JSON.parse(P.match(/for these skills: (\[.*?\])\./)[1]);
    const questions = [];
    for (let i = 0; i < 10; i++) {
      const skill = skills[i % skills.length];
      const short = i % 5 === 4 || i === 9;
      const q = {
        id: `q${i + 1}`, skill, category: ['conceptual', 'problem_solving', 'practical'][i % 3],
        difficulty: ['easy', 'medium', 'hard'][i % 3], format: short ? 'short' : 'mcq',
        question: `(${skill}) Question number ${i + 1}: explain or choose the best approach for scenario ${i + 1}.`,
        code: i % 4 === 0 ? 'console.log(1 + "1")' : null,
        model_answer: `Model answer for ${skill} question ${i + 1}.`,
      };
      if (short) { q.options = null; q.correct_index = null; q.rubric = '- covers the key idea\n- gives an example'; }
      else { q.options = [`Right ${i}`, `Wrong A ${i}`, `Wrong B ${i}`, `Wrong C ${i}`]; q.correct_index = 0; q.rubric = null; }
      questions.push(q);
    }
    return JSON.stringify({ questions });
  }
  // ---- assessment evaluation
  if (P.startsWith('Assess this candidate.')) {
    const payload = JSON.parse(P.match(/QUESTIONS AND ANSWERS \(JSON\):\n(\[.*\])\n/s)[1]);
    const skills = [...new Set(payload.map((q) => q.skill))];
    return JSON.stringify({
      questions: payload.map((q) => ({ id: q.id, score: q.format === 'short' ? 0.5 : undefined, feedback: `Feedback for ${q.id}.` })),
      skill_comments: Object.fromEntries(skills.map((s) => [s, `Observed level comment for ${s}.`])),
      summary: 'You showed a solid foundation with some gaps to close.',
      practice_areas: [{ skill: skills[0], focus: 'Deepen practical problem solving', suggestions: ['Build a small project', 'Solve 10 exercises'] }],
      next_steps: ['Run the skill gap analysis', 'Practise weak topics', 'Polish your resume'],
    });
  }
  // ---- role requirements
  if (P.includes('Job role: "')) {
    const role = P.match(/Job role: "(.*?)"/)[1];
    if (/^asdf/i.test(role)) return JSON.stringify({ error: 'not a job role' });
    return JSON.stringify({
      role, summary: `A ${role} builds and maintains software.`,
      skills: [
        { name: 'JavaScript', required_percent: 70, importance: 'critical', why: 'Core language.' },
        { name: 'HTML', required_percent: 60, importance: 'important', why: 'Markup.' },
        { name: 'Node.js', required_percent: 50, importance: 'important', why: 'Server-side JS.' },
        { name: 'Database', required_percent: 55, importance: 'important', why: 'Persist data.' },
        { name: 'Communication', required_percent: 50, importance: 'nice_to_have', why: 'Teamwork.' },
      ],
    });
  }
  if (P.includes('Skill comparison (JSON):')) {
    const rows = JSON.parse(P.match(/Skill comparison \(JSON\): (\[.*\])/)[1]);
    const todo = rows.filter((r) => r.status !== 'strong');
    return JSON.stringify({
      summary: 'You are partly ready; close the highlighted gaps.',
      focus: todo.map((r) => ({ skill: r.skill, priority: 'high', why: `Required ${r.required}%, current ${r.current}%.`, actions: ['Practise daily', 'Build a mini project'], timeframe: '3 weeks' })),
    });
  }
  // ---- jobs analysis
  if (P.includes('decide which job roles and which internship roles')) {
    const role = (title, cat, fit) => ({ title, category: cat, fit, why: 'Evidence from your assessed skills.', matched_skills: ['JavaScript'], missing_skills: ['React'],
      key_skills: [{ name: 'JavaScript', required_percent: 65 }, { name: 'Communication', required_percent: 50 }, { name: 'Kubernetes', required_percent: 40 }], search_keywords: title.toLowerCase() });
    return JSON.stringify({
      profile_summary: 'A developing web profile with communication strengths.',
      job_roles: [role('Front-End Developer', 'Software', 'good'), role('QA Tester', 'Quality', 'strong'), role('Technical Writer', 'Content', 'stretch')],
      internship_roles: [role('Software Development Intern', 'Software', 'strong'), role('Communication Intern', 'Business', 'good')],
    });
  }
  // ---- resume structuring
  if (S.includes('convert resume text into structured JSON')) {
    const text = P.split('RESUME TEXT:')[1] || '';
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && l !== '"""');
    const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [''])[0];
    const skillsLine = lines[lines.findIndex((l) => /^skills$/i.test(l)) + 1] || '';
    const eduLine = lines[lines.findIndex((l) => /^education$/i.test(l)) + 1] || '';
    const projLine = lines[lines.findIndex((l) => /^projects$/i.test(l)) + 1] || '';
    return JSON.stringify({
      name: lines[0], headline: '', contact: { email, phone: '', location: 'Chirala, Andhra Pradesh', links: [] }, summary: '',
      skills: skillsLine.split(',').map((x) => x.trim()).filter(Boolean),
      experience: [], education: eduLine ? [{ degree: eduLine.split(',')[0], institution: (eduLine.split(',')[1] || '').trim(), location: '', start: '2022', end: '2026', details: [] }] : [],
      projects: projLine ? [{ name: projLine.split(' - ')[0], description: projLine.split(' - ')[1] || '', technologies: ['Python', 'SQLite'], bullets: [] }] : [],
      certifications: [], achievements: [], languages: [],
    });
  }
  // ---- resume improvement (deliberately adds an invented skill + number to test the truthfulness guard)
  if (S.includes('professional resume editor')) {
    const parsed = JSON.parse(P.match(/Structured extraction of the same resume \(JSON\):\n(\{.*\})\n/s)[1]);
    parsed.summary = 'Motivated computer science graduate with hands-on Python and web experience.';
    parsed.skills = [...parsed.skills, 'Kubernetes'];
    if (parsed.projects[0]) parsed.projects[0].bullets = ['Built a library system using Python and SQLite, improving lookup speed by 40%.'];
    return JSON.stringify({ resume: parsed, changes: ['Wrote a professional summary', 'Rephrased project bullets'], suggestions: ['Add measurable results for your project', 'Add a GitHub link'] });
  }
  // ---- coach plan
  if (P.includes('one-sentence assessment of where the candidate stands')) {
    return JSON.stringify({
      headline: 'You have a workable base in web basics.',
      focus_skills: [{ skill: 'JavaScript', why: 'Your assessed score is below typical entry requirements.', how: 'Build three small apps.' }],
      improvement_areas: ['Practical debugging'], career_directions: [{ role: 'Front-End Developer', reason: 'Matches your skills.' }],
      profile_tips: ['Add GitHub projects'], preparation: [{ role: 'Front-End Developer', steps: ['Practise DOM tasks'] }], first_steps: ['Take a gap analysis'],
    });
  }
  // ---- plain chat: prove the user context reached the model
  const hasCtx = /assessedSkills/.test(S) && /JavaScript|Python|HTML/.test(S);
  const isCoach = /Career Coach/.test(S);
  return `[${isCoach ? 'coach' : 'assistant'}] context=${hasCtx ? 'yes' : 'no'} :: reply to your message.`;
}

function start(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      // Gemini-style AI endpoint
      if (url.pathname.includes(':generateContent')) {
        const j = JSON.parse(body);
        const system = j.systemInstruction?.parts?.[0]?.text || '';
        const prompt = j.contents[j.contents.length - 1].parts[0].text;
        calls.ai.push({ model: (url.pathname.match(/models\/([^:]+):/) || [])[1], key: req.headers['x-goog-api-key'], system, prompt, json: j.generationConfig?.responseMimeType === 'application/json' });
        if (calls.failNextAi) { calls.failNextAi = false; return send(500, { error: { message: 'boom' } }); }
        if (calls.failPrimary && !/2\.5/.test(url.pathname)) return send(503, { error: { message: 'This model is currently experiencing high demand.' } });
        if (calls.failAll) return send(503, { error: { message: 'This model is currently experiencing high demand.' } });
        return send(200, { candidates: [{ content: { parts: [{ text: aiReply(system, prompt) }] } }] });
      }
      send(404, { error: 'unknown' });
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, calls })));
}

module.exports = { start, calls };
if (require.main === module) start(4010).then((s) => console.log('mock upstream on', s.port));
