#!/usr/bin/env bash
set -euo pipefail

# AI Teaching System Deployment Script for Linux servers

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Deploying AI Teaching System..."

if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running or the current user cannot access Docker."
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "❌ Docker Compose v2 is required. Please install the docker compose plugin."
    exit 1
fi

if [ ! -f .env ]; then
    echo "❌ .env not found."
    echo "   Run: cp .env.example .env"
    echo "   Then edit .env and replace passwords plus DOUBAO_API_KEY."
    exit 1
fi

if grep -q "change_me" .env; then
    echo "❌ .env still contains change_me placeholder values. Please replace them before deployment."
    exit 1
fi

if grep -Eq "^(MYSQL_ROOT_PASSWORD=root_password|MYSQL_USER=user|MYSQL_PASSWORD=password|MONGO_ROOT_PASSWORD=root_password|NEO4J_PASSWORD=neo4j_password)$" .env; then
    echo "❌ .env contains local development credentials. Please replace them before deployment."
    exit 1
fi

if ! grep -q "^DOUBAO_API_KEY=." .env; then
    echo "⚠️  DOUBAO_API_KEY is empty. Core pages can start, but AI features will fail."
fi

echo "🔎 Validating Docker Compose configuration..."
docker compose config >/dev/null

echo "🏗️ Building and starting services..."
docker compose up --build -d

echo "-------------------------------------------------------"
echo "✅ Deployment finished."
echo "🌐 Frontend: http://SERVER_IP_OR_DOMAIN:${FRONTEND_PORT:-3000}"
echo "📡 Backend is proxied through /api and /uploads by the frontend Nginx container."
echo "💡 Logs: docker compose logs -f"
echo "-------------------------------------------------------"
