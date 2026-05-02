#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting Flower Delivery App Setup...${NC}"


# Check for local Node
if [ -d "./bin/bin" ]; then
    export PATH="$PWD/bin/bin:$PATH"
    echo -e "${GREEN}Using local Node.js runtime.${NC}"
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed and local runtime not found.${NC}"
    echo "Please install Node.js (https://nodejs.org/)."
    exit 1
fi

# Check for installation
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start app
echo -e "${GREEN}Launching App...${NC}"
# Use a specific port to ensure we know where it is, though Vite usually does 5173
npm run dev -- --host
