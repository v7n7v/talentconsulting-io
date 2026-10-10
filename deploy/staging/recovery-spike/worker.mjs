import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'talent-consulting-stg';
const DATABASE_ID = 'taco-agentic-spike';
const REGION = 'us-east1';
const QUEUE_ID = 'taco-agentic-spike';
const EXECUTOR_SA = 'taco-spike-executor@talent-consulting-stg.iam.gserviceaccount.com';
const WORKFLOW_PREFIX = 'taco-agentic-spike-';
const MAX_BODY_BYTES = 4096;
const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function validateEnvironment(env) {
  const required = {
    SPIKE_PROJECT: PROJECT_ID,
    SPIKE_DATABASE: DATABASE_ID,
    SPIKE_REGION: REGION,
    SPIKE_QUEUE: QUEUE_ID,
    SPIKE_EXECUTOR_SA: EXECUTOR_SA,
  };
  for (const [key, expected] of Object.entries(required)) {
    if (env[key] !== expected) throw new Error(`${key} must equal the isolated spike value`);
  }
  let base;
  try { base = new URL(env.SPIKE_BASE_URL); } catch { throw new Error('SPIKE_BASE_URL must be a URL'); }
  if (base.protocol !== 'https:' || !base.hostname.startsWith(`${WORKFLOW_PREFIX}`) || !base.hostname.endsWith(`.${REGION}.run.app`) || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('SPIKE_BASE_URL must be the private us-east1 taco-agentic-spike Cloud Run URL');
  }
  return { project: PROJECT_ID, database: DATABASE_ID, region: REGION, queue: QUEUE_ID, executor: EXECUTOR_SA, baseUrl: base.origin };
}

function validRunId(value) {
  return typeof value === 'string' && /^spike-[A-Za-z0-9-]{1,94}$/.test(value) && value.length <= 100;
}
function validVersion(value) { return value === 'v1' || value === 'v2'; }
function integerIn(value, low, high) { return Number.isInteger(value) && value >= low && value <= high; }
function onlyKeys(value, allowed) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key)); }
function response(status, body) { return { status, body: { ok: status < 400, ...body } }; }
function safeAttempt(attempt) {
  return {
    id: attempt.id, step: attempt.step, number: attempt.number, fence: attempt.fence,
    inputRevision: attempt.inputRevision, cancellationEpoch: attempt.cancellationEpoch,
    version: attempt.version, deliveryId: attempt.deliveryId, claimedAt: attempt.claimedAt,
    leaseUntil: attempt.leaseUntil, finishedAt: attempt.finishedAt, disposition: attempt.disposition,
  };
}
function safeRun(run) {
  const safeStep = (step) => ({
    state: step.state,
    leaseUntil: step.leaseUntil,
    fence: step.fence,
    attemptNumber: step.attemptNumber,
    attemptId: step.attemptId,
    output: step.output,
    completedAt: step.completedAt,
  });
  return {
    runId: run.runId, runtime: run.runtime, version: run.version, status: run.status,
    inputRevision: run.inputRevision, cancellationEpoch: run.cancellationEpoch,
    seed: run.seed, stepA: safeStep(run.stepA), stepB: safeStep(run.stepB), finalValue: run.finalValue,
    startIntent: run.startIntent,
  };
}

export function createFirebaseStore(firestore) {
  return {
    transact: (runId, callback) => firestore.runTransaction(async (native) => {
      const ref = firestore.collection('spikeRuns').doc(runId);
      const snapshot = await native.get(ref);
      const current = snapshot.exists ? snapshot.data() : null;
      return callback({
        get: () => current,
        set: (value) => native.set(ref, value),
      });
    }),
    read: async (runId) => {
      const snapshot = await firestore.collection('spikeRuns').doc(runId).get();
      return snapshot.exists ? snapshot.data() : null;
    },
  };
}

async function metadataAccessToken(fetchImpl) {
  const result = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!result.ok) throw new Error(`metadata token request failed (${result.status})`);
  const token = await result.json();
  if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('metadata token response missing access token');
  return token.access_token;
}

export function createWorker({ store, config, fetchImpl = fetch, wait = sleepDefault, now = () => Date.now(), id = () => crypto.randomUUID() }) {
  async function persistStart(runId, disposition, providerName) {
    return store.transact(runId, async (tx) => {
      const run = tx.get();
      if (!run) return response(404, { error: 'run_not_found' });
      if (run.startIntent.state === 'dispatched') return response(200, { disposition: 'already_dispatched', providerName: run.startIntent.providerName });
      if (disposition === 'dispatched') {
        tx.set({ ...run, startIntent: { state: 'dispatched', providerName, dispatchedAt: now() } });
      }
      return response(200, { disposition, providerName });
    });
  }

  async function createTask(runId, step, version) {
    const token = await metadataAccessToken(fetchImpl);
    const taskName = `projects/${config.project}/locations/${config.region}/queues/${config.queue}/tasks/${runId}-${step}-${version}`;
    const url = `https://cloudtasks.googleapis.com/v2/projects/${config.project}/locations/${config.region}/queues/${config.queue}/tasks`;
    const result = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        task: {
          name: taskName,
          httpRequest: {
            httpMethod: 'POST', url: `${config.baseUrl}/step`,
            headers: { 'content-type': 'application/json' },
            body: Buffer.from(JSON.stringify({ runId, version, step, deliveryId: `${runId}-${step}-${version}` })).toString('base64'),
            oidcToken: { serviceAccountEmail: config.executor, audience: config.baseUrl },
          },
        },
      }),
    });
    if (result.status === 409) return { name: taskName, alreadyExists: true };
    if (!result.ok) throw new Error(`Cloud Tasks create failed (${result.status})`);
    return { name: taskName, alreadyExists: false };
  }

  async function startWorkflow(runId, version) {
    const token = await metadataAccessToken(fetchImpl);
    const workflow = `${WORKFLOW_PREFIX}${version}`;
    const url = `https://workflowexecutions.googleapis.com/v1/projects/${config.project}/locations/${config.region}/workflows/${workflow}/executions`;
    const result = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ argument: JSON.stringify({ runId, version, baseUrl: config.baseUrl }) }),
    });
    if (!result.ok) throw new Error(`Workflows execution create failed (${result.status})`);
    const data = await result.json();
    return { name: data.name || `workflow:${workflow}:unknown` };
  }

  async function ensureTask(runId, step, version) {
    return createTask(runId, step, version);
  }

  async function dispatch(runId, fault) {
    const run = await store.read(runId);
    if (!run) return response(404, { error: 'run_not_found' });
    if (run.status === 'completed') return response(200, { disposition: 'completed', status: run.status });
    if (run.status === 'cancelled') return response(200, { disposition: 'cancelled', status: run.status });
    if (run.status === 'invalidated') return response(409, { error: 'run_invalidated' });
    if (run.startIntent.state === 'dispatched') return response(200, { disposition: 'already_dispatched', providerName: run.startIntent.providerName });
    if (fault === 'before_start') return response(503, { disposition: 'dispatch_interrupted_before_provider' });
    try {
      const provider = run.runtime === 'tasks'
        ? await ensureTask(runId, 'A', run.version)
        : await startWorkflow(runId, run.version);
      if (fault === 'after_start') return response(503, { disposition: 'dispatch_interrupted_after_provider', providerName: provider.name });
      return await persistStart(runId, 'dispatched', provider.name);
    } catch (error) {
      return response(503, { error: 'dispatch_failed', detail: String(error.message).slice(0, 160) });
    }
  }

  async function claim(runId, version, step, deliveryId) {
    return store.transact(runId, async (tx) => {
      const run = tx.get();
      if (!run) return response(404, { error: 'run_not_found' });
      if (!validVersion(version) || version !== run.version) return response(409, { disposition: 'version_mismatch', expectedVersion: run.version });
      if (run.status === 'cancelled' || run.status === 'invalidated') return response(200, { disposition: run.status, status: run.status });
      const currentStep = step === 'A' ? run.stepA : run.stepB;
      if (currentStep.state === 'completed') return response(200, { disposition: 'replay', output: currentStep.output });
      if (run.status === 'completed') return response(200, { disposition: 'completed', status: run.status });
      if (step === 'B' && run.stepA.state !== 'completed') return response(409, { disposition: 'predecessor_pending' });
      const claimTime = now();
      if (currentStep.state === 'running' && currentStep.leaseUntil > claimTime) return response(409, { disposition: 'busy', leaseUntil: currentStep.leaseUntil });

      const fence = run.nextFence + 1;
      const attemptNumber = run.attempts.filter((entry) => entry.step === step).length + 1;
      const attemptId = `${step}-${attemptNumber}-${fence}`;
      const leaseUntil = claimTime + run.leaseMs;
      const attempt = {
        id: attemptId, step, number: attemptNumber, fence, inputRevision: run.inputRevision,
        cancellationEpoch: run.cancellationEpoch, version, deliveryId: deliveryId || attemptId,
        claimedAt: claimTime, leaseUntil, disposition: 'claimed',
      };
      const claimedStep = { state: 'running', leaseOwner: id(), leaseUntil, fence, attemptId, attemptNumber };
      tx.set({
        ...run, status: 'running', nextFence: fence,
        [step === 'A' ? 'stepA' : 'stepB']: claimedStep,
        attempts: [...run.attempts, attempt],
      });
      return response(200, {
        disposition: 'claimed', leaseOwner: claimedStep.leaseOwner, fence, attemptId,
        attemptNumber, leaseUntil, inputRevision: run.inputRevision,
        cancellationEpoch: run.cancellationEpoch, seed: run.seed, aOutput: run.stepA.output,
        runtime: run.runtime, firstDelayMs: step === 'A' && attemptNumber === 1 ? run.firstDelayMs : 0,
      });
    });
  }

  async function finish(runId, version, step, claimed, output) {
    return store.transact(runId, async (tx) => {
      const run = tx.get();
      if (!run) return response(404, { error: 'run_not_found' });
      const finishedAt = now();
      const currentStep = step === 'A' ? run.stepA : run.stepB;
      const attemptIndex = run.attempts.findIndex((entry) => entry.id === claimed.attemptId);
      const attempts = run.attempts.map((entry, index) => index === attemptIndex
        ? { ...entry, finishedAt, disposition: 'stale_completion' }
        : entry);
      const valid = run.status !== 'cancelled' && run.status !== 'invalidated'
        && run.version === version
        && run.inputRevision === claimed.inputRevision
        && run.cancellationEpoch === claimed.cancellationEpoch
        && currentStep.state === 'running'
        && currentStep.leaseOwner === claimed.leaseOwner
        && currentStep.fence === claimed.fence
        && currentStep.leaseUntil > finishedAt;
      if (!valid) {
        tx.set({ ...run, attempts });
        const staleBody = { disposition: 'stale_completion', status: run.status, fence: claimed.fence };
        if (run.status === 'cancelled' || run.status === 'invalidated' || currentStep.state === 'completed') {
          return response(200, staleBody);
        }
        return response(409, { ...staleBody, retryable: true });
      }
      const completedStep = { state: 'completed', output, fence: claimed.fence, attemptId: claimed.attemptId, completedAt: finishedAt };
      const updated = {
        ...run,
        status: step === 'B' ? 'completed' : 'running',
        attempts: run.attempts.map((entry, index) => index === attemptIndex
          ? { ...entry, finishedAt, disposition: 'committed' }
          : entry),
        [step === 'A' ? 'stepA' : 'stepB']: completedStep,
      };
      if (step === 'B') updated.finalValue = output;
      tx.set(updated);
      return response(200, { disposition: 'committed', output, status: updated.status, fence: claimed.fence });
    });
  }

  async function handleStep(body) {
    if (!onlyKeys(body, ['runId', 'version', 'step', 'deliveryId'])
      || !validRunId(body.runId) || !validVersion(body.version) || !['A', 'B'].includes(body.step)
      || (body.deliveryId !== undefined && (typeof body.deliveryId !== 'string' || !/^[A-Za-z0-9._:-]{1,180}$/.test(body.deliveryId)))) {
      return response(400, { error: 'invalid_step_request' });
    }
    const claimedResult = await claim(body.runId, body.version, body.step, typeof body.deliveryId === 'string' ? body.deliveryId.slice(0, 180) : undefined);
    if (claimedResult.body.disposition !== 'claimed') {
      if (claimedResult.body.disposition === 'replay' && body.step === 'A') {
        const run = await store.read(body.runId);
        if (run?.runtime === 'tasks' && run.stepB.state !== 'completed' && run.status !== 'cancelled') {
          try { await ensureTask(body.runId, 'B', run.version); }
          catch (error) { return response(503, { error: 'next_step_dispatch_failed', detail: String(error.message).slice(0, 160) }); }
        }
      }
      return claimedResult;
    }
    const claimed = claimedResult.body;
    if (claimed.firstDelayMs > 0) await wait(claimed.firstDelayMs);
    const output = body.step === 'A'
      ? claimed.seed * 2
      : claimed.aOutput + (body.version === 'v2' ? 2 : 1);
    const result = await finish(body.runId, body.version, body.step, claimed, output);
    if (body.step === 'A' && result.body.disposition === 'committed' && claimed.runtime === 'tasks') {
      try { await ensureTask(body.runId, 'B', body.version); }
      catch (error) { return response(503, { error: 'next_step_dispatch_failed', detail: String(error.message).slice(0, 160), committed: true }); }
    }
    return result;
  }

  async function seed(body) {
    if (!onlyKeys(body, ['runId', 'runtime', 'version', 'seed', 'firstDelayMs', 'leaseMs'])
      || !validRunId(body.runId) || !['tasks', 'workflows'].includes(body.runtime) || !validVersion(body.version)
      || !integerIn(body.seed, 0, 1_000_000)
      || (body.firstDelayMs !== undefined && !integerIn(body.firstDelayMs, 0, 10_000))
      || (body.leaseMs !== undefined && !integerIn(body.leaseMs, 50, 10_000))) {
      return response(400, { error: 'invalid_synthetic_seed' });
    }
    const run = {
      runId: body.runId, runtime: body.runtime, version: body.version,
      status: 'pending', inputRevision: 1, cancellationEpoch: 0, seed: body.seed,
      firstDelayMs: body.firstDelayMs ?? 0, leaseMs: body.leaseMs ?? 2_000,
      nextFence: 0, attempts: [],
      stepA: { state: 'pending' }, stepB: { state: 'pending' },
      startIntent: { state: 'pending', createdAt: now() },
    };
    const result = await store.transact(body.runId, async (tx) => {
      if (tx.get()) return response(409, { error: 'run_already_exists' });
      tx.set(run);
      return response(201, { disposition: 'seeded', runId: body.runId, runtime: body.runtime, version: body.version, status: run.status, inputRevision: 1, cancellationEpoch: 0 });
    });
    return result;
  }

  async function control(body) {
    if (!onlyKeys(body, ['runId', 'action']) || !validRunId(body.runId) || !['cancel', 'change_input', 'expire_lease'].includes(body.action)) return response(400, { error: 'invalid_control' });
    return store.transact(body.runId, async (tx) => {
      const run = tx.get();
      if (!run) return response(404, { error: 'run_not_found' });
      if (body.action === 'cancel') {
        const cancelStep = (step) => step.state === 'running' ? { state: 'cancelled', fence: step.fence, attemptId: step.attemptId, cancelledAt: now() } : step;
        const next = {
          ...run, status: 'cancelled', cancellationEpoch: run.cancellationEpoch + 1, cancelledAt: now(),
          stepA: cancelStep(run.stepA), stepB: cancelStep(run.stepB),
        };
        tx.set(next);
        return response(200, { disposition: 'cancelled', cancellationEpoch: next.cancellationEpoch });
      }
      if (body.action === 'change_input') {
        const next = { ...run, status: 'invalidated', inputRevision: run.inputRevision + 1, invalidatedAt: now() };
        tx.set(next);
        return response(200, { disposition: 'invalidated', status: next.status, inputRevision: next.inputRevision });
      }
      const current = run.stepA.state === 'running' ? 'stepA' : run.stepB.state === 'running' ? 'stepB' : null;
      if (!current) return response(409, { error: 'no_active_lease' });
      const next = { ...run, [current]: { ...run[current], leaseUntil: now() - 1 } };
      tx.set(next);
      return response(200, { disposition: 'lease_expired', step: current === 'stepA' ? 'A' : 'B' });
    });
  }

  async function handle(method, urlString, body = {}) {
    const url = new URL(urlString, 'http://localhost');
    if (method === 'GET' && url.pathname === '/health') return response(200, { service: 'synthetic-recovery-spike', project: config.project, database: config.database });
    if (method === 'POST' && url.pathname === '/seed') return seed(body);
    if (method === 'POST' && url.pathname === '/step') return handleStep(body);
    if (method === 'POST' && url.pathname === '/control') return control(body);
    if (method === 'POST' && url.pathname === '/dispatch') {
      if (!onlyKeys(body, ['runId', 'fault']) || !validRunId(body.runId) || (body.fault !== undefined && !['before_start', 'after_start'].includes(body.fault))) return response(400, { error: 'invalid_dispatch' });
      return dispatch(body.runId, body.fault);
    }
    if (method === 'POST' && url.pathname === '/repair') {
      if (!onlyKeys(body, ['runId']) || !validRunId(body.runId)) return response(400, { error: 'invalid_repair' });
      return dispatch(body.runId);
    }
    if (method === 'GET' && url.pathname === '/status') {
      const runId = url.searchParams.get('runId');
      if (!validRunId(runId)) return response(400, { error: 'invalid_run_id' });
      const run = await store.read(runId);
      if (!run) return response(404, { error: 'run_not_found' });
      return response(200, { run: safeRun(run), attempts: run.attempts.map(safeAttempt) });
    }
    return response(404, { error: 'not_found' });
  }

  return { handle, createTask, startWorkflow };
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function startServer(env = process.env) {
  const config = validateEnvironment(env);
  if (env.GOOGLE_CLOUD_PROJECT && env.GOOGLE_CLOUD_PROJECT !== PROJECT_ID) throw new Error('runtime project identity mismatch');
  const app = initializeApp({ projectId: config.project, credential: applicationDefault() });
  const firestore = getFirestore(app, config.database);
  const worker = createWorker({ store: createFirebaseStore(firestore), config });
  const server = createServer(async (request, reply) => {
    try {
      const body = request.method === 'POST' ? await readBody(request) : {};
      const result = await worker.handle(request.method || 'GET', request.url || '/', body);
      reply.writeHead(result.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      reply.end(JSON.stringify(result.body));
    } catch (error) {
      const status = error.message === 'body_too_large' ? 413 : error instanceof SyntaxError ? 400 : 500;
      reply.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      reply.end(JSON.stringify({ ok: false, error: status === 500 ? 'internal_error' : error.message }));
    }
  });
  const port = Number(env.PORT || 8080);
  server.listen(port, '0.0.0.0');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => { console.error(`Recovery spike refused to start: ${error.message}`); process.exitCode = 1; });
}
