// Fetches live GitHub contribution data and rewrites the stat badges in README.md.
// Runs daily via .github/workflows/stats.yml — the badges are never hand-edited.
import { readFileSync, writeFileSync } from 'node:fs';

const USER  = process.env.GH_USER || 'muhammadsohaibkhann';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error('GITHUB_TOKEN is required');

const gql = async (query, variables) => {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
};

const { user } = await gql(`
  query($login:String!){ user(login:$login){ createdAt } }`, { login: USER });

const start = new Date(user.createdAt).getUTCFullYear();
const now   = new Date();
const days  = [];
let total = 0;

for (let y = start; y <= now.getUTCFullYear(); y++) {
  const from = `${y}-01-01T00:00:00Z`;
  const to   = y === now.getUTCFullYear() ? now.toISOString() : `${y}-12-31T23:59:59Z`;
  const d = await gql(`
    query($login:String!,$from:DateTime!,$to:DateTime!){
      user(login:$login){ contributionsCollection(from:$from,to:$to){
        contributionCalendar{ totalContributions
          weeks{ contributionDays{ date contributionCount } } } } } }`,
    { login: USER, from, to });
  const cal = d.user.contributionsCollection.contributionCalendar;
  total += cal.totalContributions;
  cal.weeks.forEach(w => w.contributionDays.forEach(x => days.push(x)));
}

days.sort((a, b) => a.date.localeCompare(b.date));
const today = now.toISOString().slice(0, 10);
const past  = days.filter(d => d.date <= today);

// streaks
let longest = 0, run = 0, current = 0;
for (const d of past) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
for (let i = past.length - 1; i >= 0; i--) {
  if (past[i].contributionCount > 0) current++;
  else if (!(i === past.length - 1)) break;       // today still open — don't break the streak
  else continue;
}

// last 12 months + best single day + best month + active days
const yearAgo = new Date(now.getTime() - 365 * 864e5).toISOString().slice(0, 10);
const last12  = past.filter(d => d.date >= yearAgo).reduce((s, d) => s + d.contributionCount, 0);
const bestDay = past.reduce((m, d) => Math.max(m, d.contributionCount), 0);
const months  = {};
past.forEach(d => { const k = d.date.slice(0, 7); months[k] = (months[k] || 0) + d.contributionCount; });
const bestMonth  = Math.max(...Object.values(months));
const activeDays = past.filter(d => d.contributionCount > 0).length;
const activeWeeks = new Set(past.filter(d => d.contributionCount > 0)
  .map(d => { const t = new Date(d.date); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t.toISOString().slice(0,10); })).size;

const n = v => v.toLocaleString('en-US').replace(/,/g, '%2C');
const B = (label, value, color, logo) =>
  `<img src="https://img.shields.io/badge/${label}-${value}-${color}?style=for-the-badge&labelColor=0F2027${logo ? `&logo=${logo}&logoColor=white` : ''}" alt="${label.replace(/%20/g, ' ')}" />`;

const block = [
  B('Total%20Contributions', `${n(total)}%2B`, '00C853', 'github'),
  B('Last%2012%20Months', n(last12), '00A344', 'githubactions'),
  B('Longest%20Streak', `${longest}%20days`, '1B7F3B', 'fireship'),
  B('Active%20Days', n(activeDays), '2E7D32', 'gitbook'),
  '<br/>',
  B('Peak%20Month', `${n(bestMonth)}%2B`, '43A047', 'graphql'),
  B('Best%20Day', `${n(bestDay)}%20commits`, '1DBF73', 'git'),
  B('Active%20Weeks', n(activeWeeks), '00C853', 'githubsponsors'),
  B('Current%20Streak', `${current}%20days`, '00A344', 'starship'),
].join('\n');

const readme = readFileSync('README.md', 'utf8');
const out = readme.replace(
  /<!--STATS:START-->[\s\S]*?<!--STATS:END-->/,
  `<!--STATS:START-->\n${block}\n<!--STATS:END-->`);
writeFileSync('README.md', out);
console.log({ total, last12, longest, current, bestMonth, bestDay, activeDays, activeWeeks });
