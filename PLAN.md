# Graceful Queue Handling for Busy Server

## Summary
Change the processing flow from "reject when busy" to "accept into an in-memory priority queue."
When all workers are occupied, the frontend tells the user the server is busy, confirms their PDF
has been queued, asks for browser notification permission, and keeps checking job status until
processing finishes.

**Priority strategy (Shortest Job First with starvation protection):** Jobs are sorted by file
size (ascending) so that smaller, faster-to-process PDFs overtake larger ones in the queue. To
prevent large files from waiting indefinitely, any job that has waited longer than
`STARVATION_TIMEOUT_MS` is treated as priority `0` and promoted ahead of normal size ordering.
Large-file users receive a clear message that the server is busy and that they will be notified
when their job finishes.

---

## Key Changes

### Backend

#### 1. Two-Phase Upload Flow

**Phase 1: pre-stream queue check.** Before triggering Multer, read only the request
`Content-Length` header:
```js
const approximateRequestBytes = parseInt(req.headers['content-length'] || '0', 10);
```
Use this approximate size only for early queue-full rejection and coarse request-size context. If
the queue is already full, return `429` immediately to avoid streaming and saving a large file to
disk only to reject it.

```js
app.post('/api/process', rateLimitUploads, (req, res, next) => {
  // Reject BEFORE accepting the upload stream
  if (jobQueue.length >= maxQueueJobs) {
    return res.status(429).json({ error: 'The server queue is full. Please try again in a few minutes.' });
  }
  upload.single('pdf')(req, res, (err) => { ... });
});
```

`Content-Length` includes multipart overhead, so it is approximate rather than the final PDF size,
but it is accurate enough for kilobyte-level prioritisation or messaging before the stream is read.

**Phase 2: post-stream authoritative fields.** After Multer processes the multipart request,
`req.file` and `req.body` are available. Use `req.file.size` as the authoritative `fileSizeBytes`
for priority ordering when enqueuing. Parse `req.body.excludeRegion`, `req.body.ignoreColors`, and
`req.body.colorTolerance` only after Multer has run.

Important multipart note: `express.json()` and `express.urlencoded()` do not parse multipart form
data. Fields such as `excludeRegion`, `ignoreColors`, and `colorTolerance` are populated by Multer,
so the plan must not read or validate those fields before `upload.single('pdf')` completes.

#### 2. Priority Queue (Shortest Job First by File Size)
Replace the simple FIFO array with a **min-heap / sorted insertion** priority queue ordered by
effective priority. Normal jobs use `fileSizeBytes` ascending. Starved jobs use priority `0` after
waiting longer than `STARVATION_TIMEOUT_MS`.

Job object stored in queue:
```json
{
  "jobId": "uuid",
  "filePath": "/uploads/tmp-file",
  "fileSizeBytes": 204800,
  "originalName": "report.pdf",
  "excludedRegion": null,
  "ignoreColors": [],
  "colorTolerance": 40,
  "status": "queued",
  "queuedAt": 1700000000000,
  "result": null,
  "error": null
}
```

Priority insertion helper (no external dependency needed):
```js
function effectivePriority(job, now = Date.now()) {
  return now - job.queuedAt > starvationTimeoutMs ? 0 : job.fileSizeBytes;
}

function enqueue(job) {
  jobQueue.push(job);
  // Sort by effective priority so starved jobs are promoted ahead of normal size ordering.
  const now = Date.now();
  jobQueue.sort((a, b) => effectivePriority(a, now) - effectivePriority(b, now));
}

function dequeue() {
  const now = Date.now();
  jobQueue.sort((a, b) => effectivePriority(a, now) - effectivePriority(b, now));
  return jobQueue.shift(); // Smallest pending job, unless an older job has starvation priority
}

function drainQueue() {
  while (activeJobs < maxConcurrentJobs && jobQueue.length > 0) {
    const job = dequeue();
    runJob(job);
  }
}
```

Call `drainQueue()` inside every job's `finally` block, whether the job ends as `done` or `failed`,
so a finished job always releases capacity and starts the next queued job.

#### 3. API Changes

**POST `/api/process`** - Returns `202 Accepted` for all queued/started jobs:
```json
{
  "jobId": "uuid",
  "status": "queued",
  "position": 2,
  "fileSizeBytes": 204800,
  "message": "Server is very busy. Your PDF has been added to the queue and will be processed shortly."
}
```
For large files (above a configurable `LARGE_FILE_THRESHOLD_MB`, default `10`), include an
extra hint:
```json
{
  "message": "The server is currently very busy. Your large file is queued and you will be notified when it is ready. You may close this tab - just keep the link."
}
```

**GET `/api/jobs/:jobId`** - Status polling endpoint:
```json
{
  "jobId": "uuid",
  "status": "queued|processing|done|failed|expired",
  "position": 1,
  "fileSizeBytes": 204800,
  "result": null
}
```
- `position` is computed dynamically:
  ```js
  const idx = jobQueue.findIndex(j => j.jobId === jobId);
  const position = idx === -1 ? null : idx + 1;
  ```
  Returns `null` when job is no longer waiting (i.e., it is `processing` or `done`).
- For `done`, include the full result shape (same as the current `/api/process` synchronous response).

**Queue-full response** (returned before upload is streamed):
```json
{
  "error": "The server queue is full. Please try again in a few minutes."
}
```

#### 4. Memory & Storage Leak Prevention

- **Job Map expiry**: When a job's result files are deleted after `RESULT_TTL_MS`, also remove
  the job entry from the in-memory `jobs` Map to prevent unbounded memory growth:
  ```js
  function scheduleResultCleanup(jobId, jobDir) {
    setTimeout(async () => {
      await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
      jobs.delete(jobId); // Prevent memory leak
    }, resultTtlMs).unref();
  }
  ```
- **Startup orphan cleanup**: On server start, delete all files directly inside `uploads/`
  (excluding the `uploads/results/` subdirectory) to remove any temp upload files left by a
  previous crash or restart.

#### 5. Environment Variables (additions to `.env.example`)
```
MAX_QUEUE_JOBS=10            # Max jobs waiting in priority queue
LARGE_FILE_THRESHOLD_MB=10   # Files above this get the "very busy" UX message
STARVATION_TIMEOUT_MS=120000 # Jobs waiting longer than this are promoted
```
`.env.droplet-1gb.example` overrides:
```
MAX_QUEUE_JOBS=3
LARGE_FILE_THRESHOLD_MB=5
STARVATION_TIMEOUT_MS=120000
```

---

### Frontend

#### 1. Submit & Queue Handling
After submitting, handle `202` job responses instead of expecting synchronous results.

Show the file size in the UI to set expectations:
- **Small file queued**: "Server is busy. Your PDF has been added to the queue. Position: 2"
- **Large file queued**: "The server is currently very busy. Your large file is queued - you will be notified when it is ready."

#### 2. Browser Notification Permission (with Safety Checks)
Wrap all notification logic in a feature detection guard to prevent crashes on HTTP or older browsers:
```js
if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
  // Show in-page banner asking for permission
}
```
Notification is fired only after `done` status is received and permission was previously granted.
The page must work **fully** even if the user denies permission or the browser does not support it.

#### 3. Polling with Resilience
Poll `GET /api/jobs/:jobId` every `2` seconds while status is `queued` or `processing`.
Allow up to **3 consecutive network failures** before showing a permanent connection-error message.
Do not stop polling for transient failures:
```js
let failCount = 0;
async function poll() {
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    const data = await res.json();
    failCount = 0; // Reset on success
    handleStatus(data);
    if (data.status === 'queued' || data.status === 'processing') {
      setTimeout(poll, 2000);
    }
  } catch {
    failCount++;
    if (failCount >= 3) showConnectionError();
    else setTimeout(poll, 2000);
  }
}
```

#### 4. Processing Screen State Machine
Update the processing screen as status changes:

| Status       | UI                                                              |
|--------------|-----------------------------------------------------------------|
| `queued`     | Spinner + "Queued - Position: N" + optional large-file message |
| `processing` | Spinner + "Your PDF is now being processed..."                 |
| `done`       | Stop polling -> fire browser notification -> render results UI |
| `failed`     | Show error message -> allow user to retry                      |
| `expired`    | "Result expired. Please upload your file again."               |

---

## Test Plan

- Start server with `MAX_CONCURRENT_JOBS=1` and submit multiple PDFs of varying sizes.
- Verify the smallest queued file is promoted ahead of larger queued files (SJF order).
- Verify jobs waiting longer than `STARVATION_TIMEOUT_MS` are promoted ahead of normal size ordering.
- Verify large files receive the "very busy" extended message.
- Verify a queue-full `429` depends only on `jobQueue.length >= maxQueueJobs` and is returned before the file is uploaded.
- Verify the plan does not imply `req.file` or multipart `req.body` are available before Multer.
- Verify queue positions are reported correctly via `GET /api/jobs/:jobId`, including `null` after a job leaves the queue.
- Verify `drainQueue()` is called after every job completion so the next queued job starts.
- Verify the `jobs` Map is cleared when result files are deleted (no memory leak).
- Verify orphan uploads are cleaned up at server startup.
- Verify the processing screen transitions through all states correctly.
- Verify browser notification fires after `done` when permission was granted.
- Verify no crash or error when notification permission is denied or `Notification` is undefined.
- Verify polling continues after successful `queued` and `processing` responses, then stops for `done`, `failed`, or `expired`.
- Verify 3-retry polling resilience: simulate network failure and confirm polling continues.
- Verify existing direct download links still work after queued completion.

---

## Assumptions
- In-memory priority queue is appropriate for a single small VPS.
- Jobs lost on server restart are acceptable; no persistence in this version.
- Priority is determined by file size in bytes with an age-based starvation boost.
- "Notification" means browser Web Notification + in-page status; not email or SMS.
- Users do not need to keep the tab open - the browser notification covers the case where
  they navigate away (as long as the tab is not closed entirely).
