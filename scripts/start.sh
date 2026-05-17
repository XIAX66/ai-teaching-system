#!/usr/bin/env bash
set -euo pipefail

# AI Teaching System Startup Script for Mac/Linux

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Starting AI Teaching System Containerization..."

# Check if docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

if [ ! -f .env ]; then
    echo "⚠️  .env not found. Creating one from .env.local.example for local startup."
    cp .env.local.example .env
    echo "💡 AI features need DOUBAO_API_KEY in .env."
fi

# Clean up existing containers (optional, safe for data due to volumes)
echo "🧹 Cleaning up old containers..."
docker compose down

# Build and Start
echo "🏗️ Building and starting services (this might take a few minutes for the first time)..."
docker compose up --build -d

echo "-------------------------------------------------------"
echo "✅ System started successfully!"
echo "🌐 Frontend Access: http://localhost:3000"
echo "📡 Backend API:    http://localhost:8080 (local only by default)"
echo "🗄️ MySQL Port:     3307"
echo "-------------------------------------------------------"
echo "💡 To view logs, run: docker compose logs -f"
