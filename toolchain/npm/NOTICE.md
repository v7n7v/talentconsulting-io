# Modified npm distribution notice

`taco-npm-12.1.0-registry-patches.20261009.r1` is a modified, locally assembled distribution based on the published `npm@12.1.0` package. It is not an official npm release and is not endorsed by npm, Inc. The upstream npm version and upstream registry integrity authenticate the base input only, not this assembled output.

The distribution replaces complete bundled dependency directories with the following published packages, preserving their package names and licenses:

| Package | Version | License |
| --- | --- | --- |
| `brace-expansion` | 5.0.12 | MIT |
| `http-cache-semantics` | 4.3.0 | BSD-2-Clause |
| `undici` | 6.28.1 | MIT |
| `ip-address` | 10.7.3 | MIT |
| `postcss-selector-parser` | 7.1.6 | MIT |

The output archive retains the original license files for npm and each replacement. npm is distributed under Artistic-2.0; each replacement's license file remains alongside its package. Consult those files for applicable terms. The source archive SRI values, source repository commits, output digest and tree digest are pinned in `distribution-profile.json` and `toolchain-inputs.lock.json`.

The current project owner accepted ongoing maintenance responsibility on October 9, 2026 and the recommended npm-specific private-cache disposition on October 10, 2026. That acceptance applies only to the independently verified npm `make-fetch-happen` consumer using `shared:false`, with regression checks and continued upstream dispute tracking.

This exact candidate is selected for installation and runtime qualification. Qualification is still pending; it is not a certified release. The cache-semantics advisory behavior remains disputed and unresolved; zero current registry findings are not a claim that all semantics are repaired. Maintenance owner and cache disposition are recorded separately in the project plan. No shared-cache deployment, broad advisory waiver or baseline relaxation is covered by this decision.

Materialization currently requires Linux with `/proc/self/fd` directory anchors and an existing parent owned by the invoking user, without group/other write permissions. It exclusively reserves a new private destination and atomically publishes the completely verified `distribution` child inside that reservation. Parent or destination namespace changes fail; writes stay anchored to the opened directories. No path-only fallback or qualification of another platform is provided. The invoking user and kernel remain trusted; this does not isolate against malicious processes with the same user identity.
