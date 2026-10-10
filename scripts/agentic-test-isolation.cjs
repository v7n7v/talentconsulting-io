'use strict';

// Node-process network guard for the local P0 baseline. This is defense in
// depth for trusted test suites, not an OS sandbox: native addons, child
// processes, or code that bypasses Node's built-ins are outside its boundary.
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const dns = require('node:dns');
const dgram = require('node:dgram');
const { syncBuiltinESMExports } = require('node:module');

const marker = 'AGENTIC_NETWORK_DENIED';
function denied(api) {
  const error = new Error(`Network access blocked by local baseline guard (${api})`);
  error.code = marker;
  return error;
}
function block(object, name) {
  if (object && typeof object[name] === 'function') {
    object[name] = function blockedNetworkCall() { throw denied(name); };
  }
}

// Socket APIs cover direct TCP/TLS connections and the transports used by
// HTTP clients. Patch both the entry points and Socket methods.
block(net, 'connect');
block(net, 'createConnection');
block(net.Socket && net.Socket.prototype, 'connect');
block(http, 'request');
block(http, 'get');
block(https, 'request');
block(https, 'get');
block(tls, 'connect');

for (const name of [
  'lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny',
  'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs',
  'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse',
]) block(dns, name);
for (const name of Object.keys(dns.promises || {})) block(dns.promises, name);

block(dgram, 'createSocket');
block(dgram.Socket && dgram.Socket.prototype, 'bind');
block(dgram.Socket && dgram.Socket.prototype, 'connect');
block(dgram.Socket && dgram.Socket.prototype, 'send');

// Global fetch rejects with a recognizable error; synchronous Node APIs throw.
globalThis.fetch = function blockedFetch() {
  return Promise.reject(denied('fetch'));
};
if (typeof globalThis.WebSocket === 'function') {
  globalThis.WebSocket = class BlockedWebSocket {
    constructor() { throw denied('WebSocket'); }
  };
}

// ESM named imports from built-ins have copies of CommonJS exports until this
// synchronization call. This makes `import { connect } from 'node:net'` guarded.
syncBuiltinESMExports();

module.exports = { marker };
