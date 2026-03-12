package ai

import (
	"ai-teaching-system/internal/ai/service"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type AIHandler struct {
	agentService *service.AgentService
}

func NewAIHandler() *AIHandler {
	as, err := service.NewAgentService()
	if err != nil {
		log.Printf("ERROR: AI Agent Service initialization failed: %v", err)
		return &AIHandler{agentService: nil}
	}
	return &AIHandler{agentService: as}
}

type AskRequest struct {
	TextbookID  uint   `json:"textbook_id" binding:"required"`
	Question    string `json:"question" binding:"required"`
	ImageBase64 string `json:"image_base64"`
}

func (h *AIHandler) Ask(c *gin.Context) {
	if h.agentService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI Agent service is not ready"})
		return
	}

	var req AskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: User info missing"})
		return
	}
	
	var userID uint
	switch v := userIDVal.(type) {
	case uint: userID = v
	case float64: userID = uint(v)
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID type"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Transfer-Encoding", "chunked")
	c.Header("X-Accel-Buffering", "no")

	err := h.agentService.AskStream(userID, req.TextbookID, req.Question, req.ImageBase64, func(chunk string) {
		fmt.Fprintf(c.Writer, "data: %s\n\n", chunk)
		c.Writer.Flush()
	})

	if err != nil {
		log.Printf("AI Stream Error: %v", err)
		fmt.Fprintf(c.Writer, "data: [ERROR]: %v\n\n", err)
		c.Writer.Flush()
	} else {
		fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
		c.Writer.Flush()
	}
}

func (h *AIHandler) GetHistory(c *gin.Context) {
	textbookIDStr := c.Param("id")
	tid, _ := strconv.ParseUint(textbookIDStr, 10, 32)

	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var userID uint
	switch v := userIDVal.(type) {
	case uint: userID = v
	case float64: userID = uint(v)
	}

	history, err := h.agentService.GetChatHistory(userID, uint(tid))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": history})
}

// TruncateHistory handles the request to delete/edit message history
func (h *AIHandler) TruncateHistory(c *gin.Context) {
	textbookIDStr := c.Param("id")
	tid, _ := strconv.ParseUint(textbookIDStr, 10, 32)

	indexStr := c.Query("index")
	index, err := strconv.Atoi(indexStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid index"})
		return
	}

	userIDVal, _ := c.Get("userID")
	var userID uint
	switch v := userIDVal.(type) {
	case uint: userID = v
	case float64: userID = uint(v)
	}

	if err := h.agentService.TruncateChatHistory(userID, uint(tid), index); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "History truncated successfully"})
}
