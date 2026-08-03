# Storage retention runbook — abandoned resume uploads

**Status: UNCOMPLETED OWNER ACTION.** Nothing in this repo configures object
lifecycle. `firebase.json`'s `storage` key is `{"rules": "storage.rules"}` and
nothing else. Until the rule below has been applied to the bucket, the *only*
things that remove an abandoned resume are the two application paths in §2 —
and both of them can fail without anyone noticing.

Owner action, not an engineering task: it needs the production service account
and the `roles/storage.admin` permission on the bucket.

---

## 1. What is at risk

`resume_uploads/{uid}/{timestamp}_{name}` holds the user's real resume: name,
employers, dates, often a phone number and an address. It is written by the
client (`storage.rules` allows `create` for the owning uid, nothing else) and is
supposed to live for the few seconds between the upload finishing and
`/api/gauntlet/parse-resume` reading and deleting it.

Every ordinary exit deletes it. Three do not, reliably:

- the browser is closed or hard-navigated between the bucket write and the parse
  call — mitigated by a `pagehide` beacon (`lib/upload/upload-transport.ts`,
  `guardStorageObjectOnUnload`), which is best-effort by nature;
- the client's abandon call fails and nothing retries — it is logged, not
  retried;
- the parse route's own `cleanupStorageUpload` swallows a delete error. It sets
  `storagePathDeleted: false`, the client chases it once, and that chase can
  fail too.

A lifecycle rule turns all three from "PII stays forever" into "PII stays for at
most a day".

## 2. The command

Age is in days, and 1 is the floor GCS supports — there is no hourly lifecycle.
That is far longer than the seconds an object is legitimately needed for, so it
is a backstop and never the primary path.

```bash
# One-time, from a trusted environment with the production service account.
BUCKET=talent-consulting-acf16.firebasestorage.app

cat > /tmp/resume-uploads-lifecycle.json <<'JSON'
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": {
          "age": 1,
          "matchesPrefix": ["resume_uploads/"]
        }
      }
    ]
  }
}
JSON

gcloud storage buckets update "gs://${BUCKET}" \
  --lifecycle-file=/tmp/resume-uploads-lifecycle.json

# Verify — this must print the rule back.
gcloud storage buckets describe "gs://${BUCKET}" --format="value(lifecycle)"
```

`matchesPrefix` keeps the rule off every other prefix in the bucket. Do not
widen it: the same bucket carries objects that are not disposable.

## 3. After it is applied

1. Re-run the verify command above and paste the output into this file under a
   dated "Applied" heading.
2. Update the comments that currently describe this as uncompleted. They are in:
   - `lib/upload/upload-transport.ts` — `abandonStorageUpload`
   - `app/api/gauntlet/parse-resume/route.ts` — `bindAbandonedStorageObject`
   - `app/api/gauntlet/parse-resume/abandon/route.ts` — the file docstring

   They say plainly that no rule exists. Once one does, that sentence becomes
   the false claim, and the repo has been through that already: five comments
   asserted this rule as fact while it had never been created.

## 4. What this does not fix

A lifecycle rule bounds retention. It does not bound *exposure* — an object that
exists for a day is readable by anything holding Admin SDK credentials for that
day. It also does not make cleanup failures visible; that is
`abandonStorageUpload`'s return value and the `console.warn` beside it, and
nothing aggregates those yet.
