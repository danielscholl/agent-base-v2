#!/usr/bin/env bash
# Simple greeting script for hello-world skill

NAME="${1:-World}"
HOUR=$(date +%H)

if [ "$HOUR" -lt 12 ]; then
    GREETING="Good morning"
elif [ "$HOUR" -lt 18 ]; then
    GREETING="Good afternoon"
else
    GREETING="Good evening"
fi

echo "{ \"success\": true, \"result\": { \"greeting\": \"$GREETING, $NAME!\" }, \"message\": \"Greeted $NAME\" }"
