#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec node scripts/serve.mjs --open
