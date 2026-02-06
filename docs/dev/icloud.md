# iCloud Drive (macOS) and this repo

If this repo lives in iCloud Drive and macOS has **Optimize Mac Storage** enabled,
macOS can offload files to the cloud and leave local placeholders marked
`compressed,dataless`.

Those placeholders frequently break:

- `git add` / indexing (errors like "short read while indexing")
- builds/tests (tools time out when reading source files)

## Recommended fix (best)

Keep the repo **out of iCloud Drive** (for example in `~/dev/`) or:

1. Finder: right click the repo folder
2. Click **Download Now**

Also consider disabling Optimize Mac Storage for iCloud Drive.

## Scripted workaround (best-effort)

Run these from the repo root:

- Check for dataless placeholders: `bash scripts/icloud/check.sh`
- Attempt to materialize placeholders: `bash scripts/icloud/materialize.sh`

If `materialize.sh` cannot reduce the count to zero, the Finder "Download Now"
approach is usually faster and more reliable.

