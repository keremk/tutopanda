#!/bin/bash

# Load environment variables from .env file in client folder
ENV_FILE="./client/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

# Source the .env file
export $(cat "$ENV_FILE" | grep -v '^#' | xargs)

# Validate required variables
if [ -z "$NEON_API_KEY" ] || [ -z "$NEON_PROJECT_ID" ]; then
  echo "Error: NEON_API_KEY and NEON_PROJECT_ID must be set in .env file"
  exit 1
fi

# Map NEON_* variables to docker variable names
BRANCH_ID="$NEON_BRANCH_ID"
PARENT_BRANCH_ID="$NEON_PARENT_BRANCH_ID"

# Use PARENT_BRANCH_ID if set, otherwise use BRANCH_ID
if [ -z "$PARENT_BRANCH_ID" ] && [ -z "$BRANCH_ID" ]; then
  echo "Warning: Neither NEON_PARENT_BRANCH_ID nor NEON_BRANCH_ID set. Using project's default branch."
fi

# Build the docker run command
docker run \
  --name db \
  -p 5432:5432 \
  -e NEON_API_KEY="$NEON_API_KEY" \
  -e NEON_PROJECT_ID="$NEON_PROJECT_ID" \
  ${BRANCH_ID:+-e BRANCH_ID="$BRANCH_ID"} \
  ${PARENT_BRANCH_ID:+-e PARENT_BRANCH_ID="$PARENT_BRANCH_ID"} \
  neondatabase/neon_local:latest

# Check if container started successfully
if [ $? -eq 0 ]; then
  echo "Neon Local container started successfully"
else
  echo "Error: Failed to start Neon Local container"
  exit 1
fi
