import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const portText = process.argv[2] ?? '8000';
if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  console.error('Укажите целый номер порта от 1 до 65535: node tools/serve.mjs 8000');
  process.exit(1);
}
const port = Number(portText);
const host = '127.0.0.1';
const gameRoot = await realpath(fileURLToPath(new URL('../game/', import.meta.url)));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png'
};

function insideGame(file) {
  const relative = path.relative(gameRoot, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function reply(request, response, status, message, headers = {}) {
  const body = Buffer.from(message + '\n');
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...headers
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async function (request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    reply(request, response, 405, 'Разрешены только GET и HEAD.', { Allow: 'GET, HEAD' });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://' + host).pathname);
    if (pathname.includes('\0')) throw new Error('Invalid path');
  } catch (_) {
    reply(request, response, 400, 'Некорректный адрес.');
    return;
  }
  const requested = path.resolve(gameRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!insideGame(requested)) {
    reply(request, response, 404, 'Файл не найден.');
    return;
  }

  try {
    // Check the resolved target too: a symlink must not expose files outside game.
    const resolved = await realpath(requested);
    if (!insideGame(resolved)) {
      reply(request, response, 404, 'Файл не найден.');
      return;
    }
    const info = await stat(resolved);
    if (!info.isFile()) {
      reply(request, response, 404, 'Файл не найден.');
      return;
    }
    const body = request.method === 'HEAD' ? null : await readFile(resolved);
    response.writeHead(200, {
      'Content-Type': types[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body ? body.length : info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      reply(request, response, 404, 'Файл не найден.');
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      reply(request, response, 403, 'Нет доступа к файлу.');
    } else {
      console.error('Не удалось прочитать файл:', error.message);
      reply(request, response, 500, 'Не удалось прочитать файл.');
    }
  }
});

server.on('error', function (error) {
  if (error.code === 'EADDRINUSE') {
    console.error('Порт ' + port + ' уже занят. Выберите другой: node tools/serve.mjs ' + (port < 65535 ? port + 1 : 8000));
  } else {
    console.error('Не удалось запустить сервер:', error.message);
  }
  process.exitCode = 1;
});

server.listen(port, host, function () {
  console.log('Игра запущена: http://' + host + ':' + port + '/');
  console.log('Откройте этот адрес в браузере. Для остановки нажмите Ctrl+C.');
});
