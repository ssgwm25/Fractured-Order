import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const rootDir = resolve(process.cwd(), process.argv[2] || 'dist');
const port = Number.parseInt(process.argv[3] || '4174', 10);

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8'
};

function resolveFilePath(requestUrl = '/') {
    const requestPath = new URL(requestUrl, 'http://127.0.0.1').pathname;
    const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
    const candidatePath = resolve(rootDir, `.${normalizedPath}`);

    if (!candidatePath.startsWith(rootDir)) {
        return null;
    }

    return candidatePath;
}

async function readResponseBody(requestUrl) {
    const directPath = resolveFilePath(requestUrl);
    if (!directPath) {
        return {
            statusCode: 403,
            body: 'Forbidden',
            filePath: null
        };
    }

    const candidates = [directPath];
    if (!extname(directPath)) {
        candidates.push(`${directPath}.html`);
        candidates.push(join(directPath, 'index.html'));
    }

    for (const filePath of candidates) {
        try {
            const fileStat = await stat(filePath);
            if (fileStat.isDirectory()) {
                continue;
            }

            return {
                statusCode: 200,
                body: await readFile(filePath),
                filePath
            };
        } catch (_error) {
            // Try the next candidate path.
        }
    }

    return {
        statusCode: 404,
        body: 'Not Found',
        filePath: candidates[0] || null
    };
}

const server = createServer(async (request, response) => {
    const { statusCode, body, filePath } = await readResponseBody(request.url);

    response.statusCode = statusCode;
    response.setHeader('Cache-Control', 'no-store');

    if (statusCode === 200 && filePath) {
        response.setHeader('Content-Type', MIME_TYPES[extname(filePath)] || 'application/octet-stream');
    } else {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }

    response.end(body);
});

server.listen(port, '127.0.0.1', () => {
    console.log(`Static test server listening on http://127.0.0.1:${port} from ${rootDir}`);
});

function shutdown(signal) {
    server.close(() => {
        process.exit(signal === 'SIGINT' ? 130 : 0);
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
