package api

import (
	"ai-teaching-system/internal/service"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type VideoHandler struct {
	service *service.VideoService
}

func NewVideoHandler() *VideoHandler {
	return &VideoHandler{
		service: service.NewVideoService(),
	}
}

func (h *VideoHandler) Upload(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	title := c.PostForm("title")
	description := c.PostForm("description")
	textbookIDStr := c.PostForm("textbook_id")
	
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video file is required"})
		return
	}

	// Validate title
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required"})
		return
	}

	// Validate extension (basic check)
	ext := filepath.Ext(file.Filename)
	if ext != ".mp4" && ext != ".mov" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only MP4 and MOV files are allowed"})
		return
	}

	var textbookID uint
	if textbookIDStr != "" {
		id, err := strconv.Atoi(textbookIDStr)
		if err == nil {
			textbookID = uint(id)
		}
	}

	// Save File
	newFilename := time.Now().Format("20060102150405") + "_" + filepath.Base(file.Filename)
	uploadPath := filepath.Join("uploads", "videos", newFilename)

	if err := c.SaveUploadedFile(file, uploadPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save video file"})
		return
	}

	// Save Metadata
	video, err := h.service.UploadVideo(title, description, uploadPath, userID.(uint), textbookID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save video metadata"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Video uploaded successfully",
		"data":    video,
	})
}

func (h *VideoHandler) List(c *gin.Context) {
	userID, _ := c.Get("userID")
	videos, err := h.service.GetVideosByTeacher(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": videos})
}

func (h *VideoHandler) GetDetail(c *gin.Context) {
	id := c.Param("id")
	video, err := h.service.GetVideoByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": video})
}
