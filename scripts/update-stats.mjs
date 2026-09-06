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

// ── animated monthly contribution chart (trailing 18 months) ──
const monthKeys = Object.keys(months).sort().slice(-18);
const series = monthKeys.map(k => ({ k, v: months[k] }));
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CW = 1100, CH = 300, PAD = 60, GAP = 10;
const BW = (CW - PAD * 2 - GAP * (series.length - 1)) / series.length;
const maxV = Math.max(...series.map(s => s.v), 1);
const peak = series.reduce((a, b) => (b.v > a.v ? b : a), series[0]);

let chart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}" role="img" aria-label="Monthly contributions">
<defs>
<linearGradient id="bar" x1="0" y1="1" x2="0" y2="0">
<stop offset="0%" stop-color="#0F2027"/><stop offset="45%" stop-color="#00A344"/><stop offset="100%" stop-color="#00C853"/></linearGradient>
<linearGradient id="hot" x1="0" y1="1" x2="0" y2="0">
<stop offset="0%" stop-color="#0F2027"/><stop offset="45%" stop-color="#00C853"/><stop offset="100%" stop-color="#B9F6CA"/></linearGradient>
</defs>
<rect width="${CW}" height="${CH}" fill="#0d1117"/>
<text x="${PAD}" y="32" fill="#ffffff" font-family="'Segoe UI',Arial,sans-serif" font-size="15" font-weight="700" letter-spacing="2">MONTHLY CONTRIBUTION VOLUME</text>
<text x="${CW - PAD}" y="32" fill="#00C853" font-family="'Fira Code',monospace" font-size="14" text-anchor="end">${last12.toLocaleString('en-US')} in the last 12 months</text>`;

for (let g = 1; g <= 3; g++) {
  const gy = 62 + ((CH - 118) / 3) * g;
  chart += `<line x1="${PAD}" y1="${gy.toFixed(0)}" x2="${CW - PAD}" y2="${gy.toFixed(0)}" stroke="#2E7D32" stroke-width=".6" opacity=".25"/>`;
}
series.forEach((m, i) => {
  const x = PAD + i * (BW + GAP);
  const h = Math.max(2, Math.round((m.v / maxV) * (CH - 130)));
  const y = CH - 56 - h;
  const isPeak = m.k === peak.k;
  chart += `<rect x="${x.toFixed(1)}" y="${CH - 56}" width="${BW.toFixed(1)}" height="0" rx="4" fill="url(#${isPeak ? 'hot' : 'bar'})">
<animate attributeName="height" values="0;${h}" dur="1s" begin="${(i * 0.07).toFixed(2)}s" fill="freeze" calcMode="spline" keySplines=".2 .85 .2 1" keyTimes="0;1"/>
<animate attributeName="y" values="${CH - 56};${y}" dur="1s" begin="${(i * 0.07).toFixed(2)}s" fill="freeze" calcMode="spline" keySplines=".2 .85 .2 1" keyTimes="0;1"/></rect>
<text x="${(x + BW / 2).toFixed(1)}" y="${y - 8}" fill="${isPeak ? '#B9F6CA' : '#00C853'}" font-family="'Fira Code',monospace" font-size="11" font-weight="700" text-anchor="middle" opacity="0">
<animate attributeName="opacity" values="0;1" dur=".45s" begin="${(i * 0.07 + 0.7).toFixed(2)}s" fill="freeze"/>${m.v}</text>
<text x="${(x + BW / 2).toFixed(1)}" y="${CH - 34}" fill="#8b949e" font-family="'Fira Code',monospace" font-size="10" text-anchor="middle">${MON[Number(m.k.slice(5, 7)) - 1]}</text>`;
});
chart += `<line x1="${PAD}" y1="${CH - 56}" x2="${CW - PAD}" y2="${CH - 56}" stroke="#00C853" stroke-width="1.2" opacity=".55"/>
<text x="${PAD}" y="${CH - 12}" fill="#8b949e" font-family="'Fira Code',monospace" font-size="11">peak ${peak.v} contributions in a single month</text>
<text x="${CW - PAD}" y="${CH - 12}" fill="#8b949e" font-family="'Fira Code',monospace" font-size="11" text-anchor="end">avg ${Math.round(series.reduce((a,b)=>a+b.v,0)/series.length)} / month</text></svg>`;
writeFileSync('assets/contributions.svg', chart);

const readme = readFileSync('README.md', 'utf8');
const out = readme.replace(
  /<!--STATS:START-->[\s\S]*?<!--STATS:END-->/,
  `<!--STATS:START-->\n${block}\n<!--STATS:END-->`);
writeFileSync('README.md', out);
console.log({ total, last12, longest, current, bestMonth, bestDay, activeDays, activeWeeks, commits, prs, issues, reviews, repos, byYear });
