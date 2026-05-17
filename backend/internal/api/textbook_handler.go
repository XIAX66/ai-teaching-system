package api

import (
	"ai-teaching-system/internal/service"
	"net/http"
	"os"
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

func (h *TextbookHandler) getUserID(c *gin.Context) uint {
	val, _ := c.Get("userID")
	switch v := val.(type) {
	case uint:
		return v
	case float64:
		return uint(v)
	default:
		return 0
	}
}

func (h *TextbookHandler) getRole(c *gin.Context) string {
	roleVal, _ := c.Get("role")
	role, _ := roleVal.(string)
	return role
}

func (h *TextbookHandler) Upload(c *gin.Context) {
	userID := h.getUserID(c)
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	title := c.PostForm("title")
	author := c.PostForm("author")
	isbn := c.PostForm("isbn")
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return
	}
	if filepath.Ext(file.Filename) != ".pdf" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only PDF files are allowed"})
		return
	}

	newFilename := time.Now().Format("20060102150405") + "_" + filepath.Base(file.Filename)
	uploadPath := filepath.Join("uploads", "textbooks", newFilename)
	if err := c.SaveUploadedFile(file, uploadPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	textbook, err := h.service.UploadTextbook(title, author, isbn, uploadPath, userID)
	if err != nil {
		_ = os.Remove(uploadPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save textbook metadata"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Textbook uploaded successfully", "data": textbook})
}

func (h *TextbookHandler) List(c *gin.Context) {
	userID := h.getUserID(c)
	role := h.getRole(c)
	textbooks, err := h.service.GetAllTextbooks(userID, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": textbooks})
}

func (h *TextbookHandler) Search(c *gin.Context) {
	userID := h.getUserID(c)
	role := h.getRole(c)
	query := c.Query("q")
	textbooks, err := h.service.SearchTextbooks(query, userID, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": textbooks})
}

func (h *TextbookHandler) GetContent(c *gin.Context) {
	content, err := h.service.GetTextbookContent(c.Param("id"), h.getUserID(c), h.getRole(c))
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": content})
}

func (h *TextbookHandler) GetKnowledgeGraph(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	graph, err := h.service.GetKnowledgeGraph(uint(id), h.getUserID(c), h.getRole(c))
	if err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "permission denied" {
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": graph})
}

func (h *TextbookHandler) GetKnowledgePointDetail(c *gin.Context) {
	textbookID, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	knowledgePointID, _ := strconv.ParseUint(c.Param("knowledgePointId"), 10, 32)

	detail, err := h.service.GetKnowledgePointDetail(uint(textbookID), uint(knowledgePointID), h.getUserID(c), h.getRole(c))
	if err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "permission denied" {
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": detail})
}

func (h *TextbookHandler) UpdateACL(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	teacherID := h.getUserID(c)

	var req struct {
		Visibility           int      `json:"visibility"`
		AllowedStudentIDs    []string `json:"allowed_student_ids"`
		AllowedStudentIDsRaw string   `json:"allowed_student_ids_raw"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.service.UpdateTextbookACL(uint(id), teacherID, req.Visibility, req.AllowedStudentIDsRaw, req.AllowedStudentIDs)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ACL updated successfully"})
}

func (h *TextbookHandler) UploadResource(c *gin.Context) {
	textbookID, _ := strconv.Atoi(c.Param("id"))
	title := c.PostForm("title")
	description := c.PostForm("description")
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	resource, err := h.service.AddTextbookResource(uint(textbookID), h.getUserID(c), title, rType, uploadPath, description, ext, file.Size)
	if err != nil {
		_ = os.Remove(uploadPath)
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Resource added successfully", "data": resource})
}

func (h *TextbookHandler) UploadKnowledgePointResource(c *gin.Context) {
	textbookID, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	knowledgePointID, _ := strconv.ParseUint(c.Param("knowledgePointId"), 10, 32)
	title := c.PostForm("title")
	description := c.PostForm("description")
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	resource, err := h.service.AddKnowledgePointResource(uint(textbookID), uint(knowledgePointID), h.getUserID(c), title, rType, uploadPath, description, ext, file.Size)
	if err != nil {
		_ = os.Remove(uploadPath)
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Knowledge point resource added successfully", "data": resource})
}

func (h *TextbookHandler) Delete(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	if err := h.service.DeleteTextbook(uint(id), h.getUserID(c)); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Textbook and associated resources deleted successfully"})
}

func (h *TextbookHandler) DeleteResource(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	if err := h.service.DeleteResource(uint(id), h.getUserID(c)); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Resource deleted successfully"})
}
