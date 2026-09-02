// Local dev server for the GitHub activity dashboard.
// Serves the static files and a /api/github proxy from one plain Node
// process - no npm install, no bundler, no external platform. The GitHub
// token is read straight out of .env.local (GITHUB_TOKEN=...) at request
// time; it is never exported into process.env or configured through a
// hosting dashboard.
//
// Usage: node server.js [port]  (defaults to 8000, matching the old
// `python -m http.server 8000` workflow)

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8000;
const ENV_LOCAL_PATH = path.join(ROOT, '.env.local');

const ALLOWED_USERS = ['havebleu', 'oppenheimmer'];

const PROFILE_QUERY = `
    query($user: String!) {
      user(login: $user) {
        login
        name
        avatarUrl
        bio
        followers {
          totalCount
        }
        following {
          totalCount
        }
        repositories(isFork: false, privacy: PUBLIC) {
          totalCount
        }
        starredRepositories {
          totalCount
        }
      }
    }
`;

const CONTRIBUTIONS_QUERY = `
    query($user: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $user) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
`;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

function readGithubToken() {
    let contents;
    try {
        contents = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
    } catch {
        return null;
    }
    const match = contents.match(/^\s*GITHUB_TOKEN\s*=\s*(.*)\s*$/m);
    if (!match) return null;
    return match[1].trim().replace(/^['"]|['"]$/g, '') || null;
}

function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

async function handleApiGithub(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const type = requestUrl.searchParams.get('type');
    const user = requestUrl.searchParams.get('user');
    const year = requestUrl.searchParams.get('year');

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    if (!ALLOWED_USERS.includes(user)) {
        return sendJson(res, 400, { error: 'Unknown user' });
    }

    let query;
    let variables;

    if (type === 'profile') {
        query = PROFILE_QUERY;
        variables = { user };
    } else if (type === 'contributions') {
        const y = Number(year);
        const currentYear = new Date().getUTCFullYear();
        // +1 tolerates client clocks ahead of UTC around New Year
        if (!Number.isInteger(y) || y < currentYear - 1 || y > currentYear + 1) {
            return sendJson(res, 400, { error: 'Year out of range' });
        }
        query = CONTRIBUTIONS_QUERY;
        variables = {
            user,
            from: `${y}-01-01T00:00:00Z`,
            to: `${y}-12-31T23:59:59Z`
        };
    } else {
        return sendJson(res, 400, { error: 'Unknown request type' });
    }

    const token = readGithubToken();
    if (!token) {
        return sendJson(res, 503, { error: 'GITHUB_TOKEN is not set in .env.local' });
    }

    let result;
    try {
        const upstream = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'github-dashboard-local-server'
            },
            body: JSON.stringify({ query, variables })
        });

        if (!upstream.ok) {
            console.error(`GitHub GraphQL HTTP ${upstream.status} ${upstream.statusText}`);
            return sendJson(res, 502, { error: 'GitHub API request failed' });
        }

        result = await upstream.json();
    } catch (error) {
        console.error('GitHub GraphQL fetch error:', error);
        return sendJson(res, 502, { error: 'GitHub API request failed' });
    }

    if (result.errors) {
        console.error('GitHub GraphQL errors:', result.errors);
        return sendJson(res, 502, { error: 'GitHub GraphQL error' });
    }

    return sendJson(res, 200, result.data);
}

function serveStatic(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const relativePath = requestUrl.pathname === '/' ? 'index.html' : decodeURIComponent(requestUrl.pathname.slice(1));
    const filePath = path.normalize(path.join(ROOT, relativePath));

    // Prevent path traversal outside the project root
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end('Not found');
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    if (requestUrl.pathname === '/api/github') {
        handleApiGithub(req, res).catch(error => {
            console.error('Unhandled proxy error:', error);
            sendJson(res, 500, { error: 'Internal error' });
        });
        return;
    }
    serveStatic(req, res);
});

server.listen(PORT, () => {
    const tokenStatus = readGithubToken() ? 'found' : 'MISSING - add GITHUB_TOKEN to .env.local';
    console.log(`Dashboard running at http://localhost:${PORT}`);
    console.log(`.env.local GITHUB_TOKEN: ${tokenStatus}`);
});
