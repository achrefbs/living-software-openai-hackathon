# `@living-software/collector`

Local, same-origin evidence ingestion for the supported Next.js observer.

The package has two surfaces:

- `createEvidenceCollector` is the testable Node implementation.
- `generateNextCollectorFiles` emits a self-contained App Router `POST`
  route and server module. Generated host code has no Living package/runtime
  dependency and exports no evidence-reading `GET` endpoint.

Accepted batches are schema- and policy-checked, restricted to declared
product nodes and privacy-safe technical metadata, ordered per browser
session, deduplicated, and appended to
`.living/data/releases/<manifest-hash>/events.ndjson`. Each record hashes its
batch and the previous record so offline analysis can detect mutation,
reordering, truncation from the front, and duplicate insertion. A valid legacy
`.living/data/events.ndjson` remains a read-only fallback when it belongs to
the current definition; it is never appended to or combined with another
manifest's release segment.

`analyzeEvidenceRecords` verifies the complete chain before projecting
workflow cases and variants, producing a contract-validated Metric Report,
and optionally detecting the existing deterministic backtracking opportunity.

The first automatic metric slice is strictly technical. Control and geometry
metrics are scoped by product node, owner route, and responsive viewport when
all three are present. A target is "small" when either rendered CSS dimension
is below 44 pixels. Scroll burden is the absolute `scrollY` delta, in CSS
pixels, between consecutive observed controls in the same session, owner
route, and viewport class. Target distance is the Euclidean center-to-center
distance in document coordinates for those same consecutive pairs. Route
transition time pairs a start with the next unmatched completion for the same
session and route. Missing scope or geometry omits the affected metric; it is
never converted into a zero. These calculations do not infer content or
business success.

This slice is intentionally local Node-runtime storage. It does not claim
multi-process locking, serverless durability, authentication, remote upload,
or production retention enforcement.
