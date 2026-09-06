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
const byYear = [];
let total = 0, commits = 0, prs = 0, issues = 0, reviews = 0, repos = 0;

for (let y = start; y <= now.getUTCFullYear(); y++) {
  const from = `${y}-01-01T00:00:00Z`;
  const to   = y === now.getUTCFullYear() ? now.toISOString() : `${y}-12-31T23:59:59Z`;
  const d = await gql(`
    query($login:String!,$from:DateTime!,$to:DateTime!){
      user(login:$login){ contributionsCollection(from:$from,to:$to){
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        totalRepositoryContributions
        contributionCalendar{ totalContributions
          weeks{ contributionDays{ date contributionCount } } } } } }`,
    { login: USER, from, to });
  const cc  = d.user.contributionsCollection;
  const cal = cc.contributionCalendar;
  total += cal.totalContributions;
  byYear.push({ year: y, count: cal.totalContributions });
  commits += cc.totalCommitContributions;
  prs     += cc.totalPullRequestContributions;
  issues  += cc.totalIssueContributions;
  reviews += cc.totalPullRequestReviewContributions;
  repos   += cc.totalRepositoryContributions;
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
const thisYear = past.filter(d => d.date >= `${now.getUTCFullYear()}-01-01`).reduce((s,d)=>s+d.contributionCount,0);
const avgActive = activeDays ? (total/activeDays).toFixed(1) : '0';
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
  B('Best%20Single%20Day', `${n(bestDay)}%20commits`, '1DBF73', 'git'),
  B('Active%20Weeks', n(activeWeeks), '00C853', 'githubsponsors'),
  B('Avg%20per%20Active%20Day', avgActive, '00A344', 'starship'),
  B('This%20Year', n(thisYear), '2E7D32', 'githubactions'),
].join('\n');

// ── animated per-year contribution bar chart ──
const CW = 1000, CH = 260, PAD = 56, BW = Math.min(96, (CW - PAD*2) / byYear.length - 22);
const maxY = Math.max(...byYear.map(v => v.count), 1);
let chart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}" role="img" aria-label="Contributions by year">
<defs><linearGradient id="bar" x1="0" y1="1" x2="0" y2="0">
<stop offset="0%" stop-color="#0F2027"/><stop offset="55%" stop-color="#00A344"/><stop offset="100%" stop-color="#00C853"/></linearGradient></defs>
<rect width="${CW}" height="${CH}" fill="#0d1117"/>
<text x="${PAD}" y="30" fill="#c9d1d9" font-family="'Segoe UI',Arial,sans-serif" font-size="16" font-weight="700">CONTRIBUTIONS BY YEAR</text>
<text x="${CW-PAD}" y="30" fill="#00C853" font-family="'Fira Code',monospace" font-size="15" text-anchor="end">${total.toLocaleString('en-US')} total</text>
<line x1="${PAD}" y1="${CH-42}" x2="${CW-PAD}" y2="${CH-42}" stroke="#2E7D32" stroke-width="1" opacity=".5"/>`;
byYear.forEach((v, i) => {
  const step = (CW - PAD*2) / byYear.length;
  const x = PAD + i*step + (step - BW)/2;
  const h = Math.round((v.count / maxY) * (CH - 110));
  const y = CH - 42 - h;
  chart += `<rect x="${x}" y="${CH-42}" width="${BW}" height="0" rx="5" fill="url(#bar)">
<animate attributeName="height" values="0;${h}" dur="1.1s" begin="${(i*0.14).toFixed(2)}s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/>
<animate attributeName="y" values="${CH-42};${y}" dur="1.1s" begin="${(i*0.14).toFixed(2)}s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/></rect>
<text x="${x+BW/2}" y="${y-9}" fill="#00C853" font-family="'Fira Code',monospace" font-size="14" font-weight="700" text-anchor="middle" opacity="0">
<animate attributeName="opacity" values="0;1" dur=".5s" begin="${(i*0.14+0.8).toFixed(2)}s" fill="freeze"/>${v.count.toLocaleString('en-US')}</text>
<text x="${x+BW/2}" y="${CH-20}" fill="#8b949e" font-family="'Fira Code',monospace" font-size="13" text-anchor="middle">${v.year}</text>`;
});
chart += '</svg>';
writeFileSync('assets/contributions.svg', chart);

const readme = readFileSync('README.md', 'utf8');
const out = readme.replace(
  /<!--STATS:START-->[\s\S]*?<!--STATS:END-->/,
  `<!--STATS:START-->\n${block}\n<!--STATS:END-->`);
writeFileSync('README.md', out);
console.log({ total, last12, longest, current, bestMonth, bestDay, activeDays, activeWeeks, commits, prs, issues, reviews, repos, byYear });
