#!/usr/bin/env python3
"""Opt-in synthetic fault drill against the private Taco staging worker.

Never loads app env files or candidate data. Credentials stay in memory. The
worker independently rejects other projects, databases and non-fixture input.
"""
import argparse
import concurrent.futures
import datetime
import json
import pathlib
import subprocess
import time
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--gcloud', default='/home/xwingace/google-cloud-sdk/bin/gcloud')
    args = parser.parse_args()
    if args.url != 'https://taco-agentic-spike-1016393231808.us-east1.run.app':
        parser.error('Only the isolated synthetic staging worker is allowed.')
    evidence = pathlib.Path(args.evidence)
    evidence.mkdir(parents=True, exist_ok=True)
    token = subprocess.check_output([args.gcloud, 'auth', 'print-identity-token'], text=True).strip()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
    report = {'startedAt': stamp, 'url': args.url, 'syntheticOnly': True, 'scenarios': []}

    def call(path, body=None, expected=(200,)):
        headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
        request = urllib.request.Request(args.url + path, headers=headers,
                                         data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(request, timeout=50) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        try:
            result = json.loads(raw)
        except ValueError:
            result = {'body': raw.decode()[:500]}
        if status not in expected:
            raise AssertionError(f'{path}: HTTP {status}: {result}')
        return result

    def status(run_id):
        return call('/status?runId=' + run_id)

    def wait(run_id, predicate, seconds=90):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            value = status(run_id)
            if predicate(value):
                return value
            time.sleep(0.5)
        raise AssertionError(f'Timed out waiting for {run_id}: {value}')

    def save():
        (evidence / f'drill-{stamp}.json').write_text(json.dumps(report, indent=2) + '\n')

    def scenario(runtime, name, operation, **fixture):
        run_id = f'spike-{stamp}-{runtime}-{name}'
        record = {'runtime': runtime, 'name': name, 'runId': run_id}
        report['scenarios'].append(record)
        try:
            record['seed'] = call('/seed', {'runId': run_id, 'runtime': runtime,
                                           'version': fixture.pop('version', 'v1'), 'seed': 7, **fixture}, (201,))
            operation(run_id, record)
            record['evidence'] = status(run_id)
            committed = [a for a in record['evidence']['attempts'] if a['disposition'] == 'committed']
            for step in ('A', 'B'):
                assert sum(a['step'] == step for a in committed) <= 1, record
            record['passed'] = True
            print(f'PASS {runtime}: {name}', flush=True)
        except Exception as error:
            record['passed'] = False
            record['error'] = str(error)
            try:
                record['evidence'] = status(run_id)
            except Exception as status_error:
                record['statusError'] = str(status_error)
            print(f'FAIL {runtime}: {name}: {error}', flush=True)
        finally:
            save()

    def complete(run_id, record, version='v1'):
        record['dispatch'] = call('/dispatch', {'runId': run_id})
        final = wait(run_id, lambda s: s['run']['status'] == 'completed')
        assert final['run']['finalValue'] == (15 if version == 'v1' else 16), final
        assert final['run']['stepA']['state'] == 'completed', final
        assert final['run']['stepB']['state'] == 'completed', final

    def dispatch_loss(run_id, record, fault):
        record['lostDispatch'] = call('/dispatch', {'runId': run_id, 'fault': fault}, (503,))
        record['beforeRepair'] = status(run_id)
        record['repair'] = call('/repair', {'runId': run_id})
        final = wait(run_id, lambda s: s['run']['status'] == 'completed')
        assert final['run']['finalValue'] == 15, final

    def takeover(run_id, record):
        workflow = record['runtime'] == 'workflows'
        record['dispatch'] = call('/dispatch', {'runId': run_id, **({'fault': 'after_start'} if workflow else {})},
                                  (503,) if workflow else (200,))
        record['claimed'] = wait(run_id, lambda s: s['run']['stepA']['state'] == 'running')
        record['expireLease'] = call('/control', {'runId': run_id, 'action': 'expire_lease'})
        record['replacement'] = call('/repair', {'runId': run_id}) if workflow else call('/step', {
            'runId': run_id, 'version': 'v1', 'step': 'A', 'deliveryId': 'injected-replacement'})
        final = wait(run_id, lambda s: s['run']['status'] == 'completed'
                     and any(a.get('disposition') == 'stale_completion' for a in s['attempts']))
        assert final['run']['finalValue'] == 15, final
        if not workflow:
            assert record['replacement']['disposition'] == 'committed', record

    def invalidate(run_id, record, action):
        record['dispatch'] = call('/dispatch', {'runId': run_id})
        record['claimed'] = wait(run_id, lambda s: s['run']['stepA']['state'] == 'running')
        record['control'] = call('/control', {'runId': run_id, 'action': action})
        final = wait(run_id, lambda s: any(a.get('disposition') == 'stale_completion'
                                         for a in s['attempts']))
        assert 'finalValue' not in final['run'], final
        assert final['run']['stepA'].get('output') is None, final

    def duplicate(run_id, record):
        record['lostReceipt'] = call('/dispatch', {'runId': run_id, 'fault': 'after_start'}, (503,))
        record['repairedDispatch'] = call('/repair', {'runId': run_id})
        final = wait(run_id, lambda s: s['run']['status'] == 'completed')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            record['injectedDeliveries'] = list(pool.map(lambda i: call('/step', {
                'runId': run_id, 'version': 'v1', 'step': 'A', 'deliveryId': f'injected-duplicate-{i}'
            }), range(2)))
        assert all(r['disposition'] == 'replay' for r in record['injectedDeliveries']), record
        assert final['run']['finalValue'] == 15, final

    def version_mismatch(run_id, record):
        record['mismatch'] = call('/step', {'runId': run_id, 'version': 'v2', 'step': 'A'}, (409,))
        assert record['mismatch']['disposition'] == 'version_mismatch', record
        complete(run_id, record)

    report['health'] = call('/health')
    for runtime in ('tasks', 'workflows'):
        scenario(runtime, 'baseline-v1', complete)
        scenario(runtime, 'baseline-v2', lambda r, e: complete(r, e, 'v2'), version='v2')
        scenario(runtime, 'dispatch-before', lambda r, e: dispatch_loss(r, e, 'before_start'))
        scenario(runtime, 'dispatch-after', lambda r, e: dispatch_loss(r, e, 'after_start'))
        scenario(runtime, 'duplicate', duplicate, firstDelayMs=1200)
        scenario(runtime, 'lease-expiry-retry', complete, firstDelayMs=2500, leaseMs=1500)
        scenario(runtime, 'lease-takeover', takeover, firstDelayMs=5000, leaseMs=8000)
        scenario(runtime, 'cancel-late', lambda r, e: invalidate(r, e, 'cancel'), firstDelayMs=5000, leaseMs=8000)
        scenario(runtime, 'input-late', lambda r, e: invalidate(r, e, 'change_input'), firstDelayMs=5000, leaseMs=8000)
        scenario(runtime, 'version-mismatch', version_mismatch)
    report['passed'] = all(s['passed'] for s in report['scenarios'])
    save()
    print(json.dumps({'passed': report['passed'], 'scenarios': len(report['scenarios']),
                      'evidence': str(evidence / f'drill-{stamp}.json')}), flush=True)
    raise SystemExit(0 if report['passed'] else 1)


if __name__ == '__main__':
    main()
