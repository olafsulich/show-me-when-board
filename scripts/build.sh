#!/usr/bin/env sh
# Copies app/ to _site/ and stamps the build sha (R6) into the meta tag and the footer.
set -eu
SHA="${1:-$(git rev-parse HEAD)}"
rm -rf _site && cp -R app _site
sed -i.bak "s/__BUILD_SHA__/${SHA}/g" _site/index.html && rm _site/index.html.bak
echo "built _site at ${SHA}"
