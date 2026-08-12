#!/bin/bash
ZIMDIR=${ZIMDIR:-/zims}
LIBRARY_XML=/library.xml

# kiwix-manage creates the library file if it does not exist,
# but rejects an empty file, so do not touch it beforehand.

for f in "$ZIMDIR"/*.zim; do
  if [[ -f "$f" ]]; then
    ( set -x; kiwix-manage "$LIBRARY_XML" add $f )
  fi
done

kiwix-serve --port 8080 --library "$LIBRARY_XML"