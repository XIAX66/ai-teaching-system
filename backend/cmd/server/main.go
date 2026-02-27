package main

import (
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

	// Routes
	apiGroup := r.Group("/api")
	{
		// Static Files - allow reading uploaded PDFs/Videos
		r.Static("/uploads", "./uploads")

		// Public routes
		apiGroup.POST("/register", userHandler.Register)
		apiGroup.POST("/login", userHandler.Login)

		// Protected routes example
		userGroup := apiGroup.Group("")
		userGroup.Use(middleware.JWTAuth())
		{
			userGroup.GET("/user/profile", func(c *gin.Context) {
				userID, _ := c.Get("userID")
				role, _ := c.Get("role")
				c.JSON(200, gin.H{
					"user_id": userID,
					"role":    role,
					"message": "You are accessing a protected route",
				})
			})

			// Textbook Routes
			userGroup.POST("/textbook/upload", textbookHandler.Upload)
			userGroup.GET("/textbook/list", textbookHandler.List)
			userGroup.GET("/textbook/search", textbookHandler.Search)
			userGroup.GET("/textbook/content/:id", textbookHandler.GetContent)
			userGroup.POST("/textbook/content/:id/resource", textbookHandler.UploadResource)

			// Video Routes
			userGroup.POST("/video/upload", videoHandler.Upload)
			userGroup.GET("/video/list", videoHandler.List)
			userGroup.GET("/video/detail/:id", videoHandler.GetDetail)
		}
	}

	// Start Server
	log.Println("Server starting on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Server failed to start: ", err)
	}
}
