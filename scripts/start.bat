@echo off
echo 🚀 Starting AI Teaching System Containerization...

docker-compose down
echo 🏗️ Building and starting services...
docker-compose up --build -d

echo -------------------------------------------------------
echo ✅ System started successfully!
echo 🌐 Frontend Access: http://localhost:3000
echo 📡 Backend API:    http://localhost:8080
echo -------------------------------------------------------
echo 💡 To view logs, run: docker-compose logs -f
pause
