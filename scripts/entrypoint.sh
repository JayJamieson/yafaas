#!/bin/bash

if [ $# -ne 1 ]; then
  echo "entrypoint requires the handler name to be the first argument" 1>&2
  exit 142
fi

export _HANDLER="$1"
# export FUNCTION_DIR="/var/task"

RUNTIME_ENTRYPOINT=/var/runtime/bootstrap

exec $RUNTIME_ENTRYPOINT
