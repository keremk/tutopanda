import { Buffer } from 'node:buffer';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

export interface HttpResponse {
  statusCode: number;
  body: string;
}

export async function simpleGet(url: string, timeoutMs = 3000): Promise<HttpResponse> {
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;

  return await new Promise<HttpResponse>((resolve, reject) => {
    const request = client.request(
      {
        method: 'GET',
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('Request timed out'));
    });
    request.on('error', (error) => {
      reject(error);
    });
    request.end();
  });
}
