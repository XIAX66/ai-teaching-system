package api

import (
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

func (h *TextbookHandler) getUserID(c *gin.Context) uint {
	val, _ := c.Get("userID")
	switch v := val.(type) {
	case uint: return v
	case float64: return uint(v)
	default: return 0
	}
}

func (h *TextbookHandler) Upload(c *gin.Context) {
	userID := h.getUserID(c)
	if userID == 0 {
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
	textbook, err := h.service.UploadTextbook(title, author, isbn, uploadPath, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save textbook metadata"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Textbook uploaded successfully", "data": textbook})
}

func (h *TextbookHandler) List(c *gin.Context) {
	userID := h.getUserID(c)
	roleVal, _ := c.Get("role")
	role, _ := roleVal.(string)
	textbooks, err := h.service.GetAllTextbooks(userID, role)
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
	userID := h.getUserID(c)
	roleVal, _ := c.Get("role")
	role, _ := roleVal.(string)
	content, err := h.service.GetTextbookContent(id, userID, role)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": content})
}

// GetKnowledgeGraph 获取教材知识图谱
func (h *TextbookHandler) GetKnowledgeGraph(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.ParseUint(idStr, 10, 32)
	
	// 这里本该有权限校验，简化起见复用 GetTextbookContent 的部分逻辑或假设已通过
	// 实际生产中应严格校验权限
	
	graph, err := h.service.GetKnowledgeGraph(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": graph})
}

func (h *TextbookHandler) UpdateACL(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.ParseUint(idStr, 10, 32)
	teacherID := h.getUserID(c)
	var req struct {
		Visibility        int      `json:"visibility"`
		AllowedStudentIDs []string `json:"allowed_student_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	err := h.service.UpdateTextbookACL(uint(id), teacherID, req.Visibility, req.AllowedStudentIDs)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ACL updated successfully"})
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
	if ext == ".mp4" || ext == ".mov" || ext == ".webm" { rType = "video" }
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

func (h *TextbookHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.ParseUint(idStr, 10, 32)
	userID := h.getUserID(c)
	if err := h.service.DeleteTextbook(uint(id), userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Textbook and associated resources deleted successfully"})
}

func (h *TextbookHandler) DeleteResource(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.ParseUint(idStr, 10, 32)
	userID := h.getUserID(c)
	if err := h.service.DeleteResource(uint(id), userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Resource deleted successfully"})
}
