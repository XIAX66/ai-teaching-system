package main

import (
	"ai-teaching-system/internal/ai"
	"ai-teaching-system/internal/api"
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/middleware"
	"log"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Database
	global.InitDB()

	// Initialize Router
	r := gin.Default()

	// Middleware
	r.Use(middleware.CORS())

	// Handlers
	userHandler := api.NewUserHandler()
	textbookHandler := api.NewTextbookHandler()
	videoHandler := api.NewVideoHandler()
	aiHandler := ai.NewAIHandler()

	// Routes
	apiGroup := r.Group("/api")
	{
		// Static Files
		r.Static("/uploads", "./uploads")

		// Public routes
		apiGroup.POST("/register", userHandler.Register)
		apiGroup.POST("/login", userHandler.Login)

		// Protected routes
		userGroup := apiGroup.Group("")
		userGroup.Use(middleware.JWTAuth())
		{
			userGroup.GET("/user/profile", func(c *gin.Context) {
				userID, _ := c.Get("userID")
				role, _ := c.Get("role")
				c.JSON(200, gin.H{"user_id": userID, "role": role})
			})

			// Textbook Routes
			userGroup.POST("/textbook/upload", textbookHandler.Upload)
			userGroup.GET("/textbook/list", textbookHandler.List)
			userGroup.GET("/textbook/search", textbookHandler.Search)
			userGroup.GET("/textbook/content/:id", textbookHandler.GetContent)
			userGroup.POST("/textbook/content/:id/resource", textbookHandler.UploadResource)

			// AI Routes
			userGroup.POST("/ai/ask", aiHandler.Ask)

			// Legacy Video Routes (Optional to keep for now)
			userGroup.POST("/video/upload", videoHandler.Upload)
			userGroup.GET("/video/list", videoHandler.List)
			userGroup.GET("/video/detail/:id", videoHandler.GetDetail)
		}
	}

	log.Println("Server starting on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Server failed to start: ", err)
	}
}