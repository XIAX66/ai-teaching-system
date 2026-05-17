@echo off
echo 🚀 Starting AI Teaching System Containerization...

if not exist .env (
  echo ⚠️  .env not found. Creating one from .env.local.example for local startup.
  copy .env.local.example .env >nul
  echo 💡 AI features need DOUBAO_API_KEY in .env.
)

docker compose down
echo 🏗️ Building and starting services...
docker compose up --build -d

echo -------------------------------------------------------
echo ✅ System started successfully!
echo 🌐 Frontend Access: http://localhost:3000
echo 📡 Backend API:    http://localhost:8080 ^(local only by default^)
echo -------------------------------------------------------
echo 💡 To view logs, run: docker compose logs -f
pause
