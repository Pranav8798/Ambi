#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Installing NPM dependencies..."
npm install

echo "Building frontend (optional for backend, but good to have if serving static files)..."
npm run build

echo "Installing Puppeteer Chrome Browser (Required for WhatsApp Bot on Render)..."
npx puppeteer browsers install chrome
