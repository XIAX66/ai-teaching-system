package api

import (
	"ai-teaching-system/internal/model"
	"ai-teaching-system/internal/service"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type TextbookHandler struct {
	service *service.TextbookService
}

func NewTextbookHandler() *TextbookHandler {
	return &TextbookHandler{
		service: service.NewTextbookService(),
	}
}

func (h *TextbookHandler) Upload(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	title := c.PostForm("title")
	author := c.PostForm("author")
	isbn := c.PostForm("isbn")
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File is required"})
		return
	}

	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required"})
		return
	}
	if filepath.Ext(file.Filename) != ".pdf" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only PDF files are allowed"})
		return
	}

	newFilename := time.Now().Format("20060102150405") + "_" + filepath.Base(file.Filename)
	uploadPath := filepath.Join("uploads", "textbooks", newFilename)
	
	if err := c.SaveUploadedFile(file, uploadPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	textbook, err := h.service.UploadTextbook(title, author, isbn, uploadPath, userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save textbook metadata"})
		return
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"message": "Textbook uploaded successfully",
		"data":    textbook,
	})
}

func (h *TextbookHandler) List(c *gin.Context) {
	userID, _ := c.Get("userID")
	roleVal, _ := c.Get("role")
	role, ok := roleVal.(string)
	
	var textbooks []model.Textbook
	var err error

	if ok && role == "teacher" {
		// Teachers see their own uploads
		textbooks, err = h.service.GetTextbooksByTeacher(userID.(uint))
	} else {
		// Students (or anyone else) see all textbooks
		textbooks, err = h.service.GetAllTextbooks()
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": textbooks})
}

func (h *TextbookHandler) Search(c *gin.Context) {
	query := c.Query("q")
	textbooks, err := h.service.SearchTextbooks(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": textbooks})
}

func (h *TextbookHandler) GetContent(c *gin.Context) {
	id := c.Param("id")
	content, err := h.service.GetTextbookContent(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Content not found or not yet processed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": content})
}

func (h *TextbookHandler) UploadResource(c *gin.Context) {
	textbookIDStr := c.Param("id")
	tid, _ := strconv.Atoi(textbookIDStr)

	title := c.PostForm("title")
	description := c.PostForm("description")
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File is required"})
		return
	}

	ext := filepath.Ext(file.Filename)
	rType := "file"
	if ext == ".mp4" || ext == ".mov" || ext == ".webm" {
		rType = "video"
	}

	newFilename := time.Now().Format("20060102150405") + "_" + filepath.Base(file.Filename)
	uploadPath := filepath.Join("uploads", "resources", newFilename)

	if err := c.SaveUploadedFile(file, uploadPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	resource, err := h.service.AddResource(uint(tid), title, rType, uploadPath, description, ext, file.Size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save metadata"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Resource added successfully", "data": resource})
}
