package service

import (
	"ai-teaching-system/internal/ai/provider"
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model"
	"ai-teaching-system/internal/model/mongo"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type AgentService struct {
	vectorService *VectorService
	doubao        *provider.DoubaoProvider
}

func NewAgentService() (*AgentService, error) {
	vs, err := NewVectorService()
	if err != nil {
		return nil, err
	}
	return &AgentService{
		vectorService: vs,
		doubao:        provider.NewDoubaoProvider(),
	}, nil
}

func (s *AgentService) GetChatHistory(userID uint, textbookID uint) ([]mongo.ChatMessage, error) {
	collection := global.MongoDatabase.Collection("chat_sessions")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var session mongo.ChatSession
	filter := bson.M{"user_id": userID, "textbook_id": textbookID}
	err := collection.FindOne(ctx, filter).Decode(&session)
	if err != nil {
		return []mongo.ChatMessage{}, nil
	}
	return session.Messages, nil
}

func (s *AgentService) SaveChatMessage(userID uint, textbookID uint, msg mongo.ChatMessage) error {
	collection := global.MongoDatabase.Collection("chat_sessions")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"user_id": userID, "textbook_id": textbookID}
	update := bson.M{"$push": bson.M{"messages": msg}, "$set": bson.M{"updated_at": time.Now()}}
	opts := options.Update().SetUpsert(true)
	_, err := collection.UpdateOne(ctx, filter, update, opts)
	return err
}

func (s *AgentService) TruncateChatHistory(userID uint, textbookID uint, index int) error {
	collection := global.MongoDatabase.Collection("chat_sessions")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"user_id": userID, "textbook_id": textbookID}

	var session mongo.ChatSession
	err := collection.FindOne(ctx, filter).Decode(&session)
	if err != nil {
		return err
	}

	if index < 0 || index >= len(session.Messages) {
		return fmt.Errorf("index out of range")
	}

	newMessages := session.Messages[:index]
	update := bson.M{
		"$set": bson.M{
			"messages":   newMessages,
			"updated_at": time.Now(),
		},
	}

	_, err = collection.UpdateOne(ctx, filter, update)
	return err
}

func (s *AgentService) AskStream(userID uint, textbookID uint, knowledgePointID *uint, question string, imageBase64 string, onChunk func(string)) error {
	history, _ := s.GetChatHistory(userID, textbookID)

	var contextParts []string
	contexts, err := s.vectorService.Search(textbookID, question, imageBase64, 3)
	if err != nil {
		log.Printf("[AgentService] Search Error: %v", err)
	}

	if len(contexts) > 0 {
		contextParts = append(contextParts, strings.Join(contexts, "\n---\n"))
	} else {
		log.Printf("[AgentService] RAG returned no results, falling back to MongoDB summary")
		if fallback := s.loadTextbookFallbackContext(textbookID); fallback != "" {
			contextParts = append(contextParts, fallback)
		}
	}

	if knowledgePointID != nil {
		if kpContext := s.buildKnowledgePointContext(textbookID, *knowledgePointID); kpContext != "" {
			contextParts = append([]string{kpContext}, contextParts...)
		}
	}

	systemText := "你是一个专业的教学助手。请根据提供的教材背景知识回答问题。必须使用详细的 Markdown 格式。"
	if knowledgePointID != nil {
		systemText = strings.Join([]string{
			"你是一个知识点学习助手，正在帮助学生围绕当前知识点深入理解教材。",
			"回答时优先围绕当前知识点本身，必要时再联系整本教材。",
			"请主动指出常见误区，最后给出下一步学习建议。",
			"如果用户的问题明显偏离当前知识点，请先说明，再尽量联系教材背景做引导。",
			systemText,
		}, "\n")
	}
	if len(contextParts) > 0 {
		systemText += fmt.Sprintf("\n\n教材背景知识：\n%s", strings.Join(contextParts, "\n\n====\n\n"))
	}

	inputs := []provider.DoubaoMessage{{
		Role:    "system",
		Content: []map[string]interface{}{{"type": "input_text", "text": systemText}},
	}}

	start := 0
	if len(history) > 10 {
		start = len(history) - 10
	}
	for _, h := range history[start:] {
		role := h.Role
		if role == "ai" || role == "assistant" {
			role = "assistant"
		}
		inputs = append(inputs, provider.DoubaoMessage{
			Role:    role,
			Content: []map[string]interface{}{{"type": "input_text", "text": h.Content}},
		})
	}

	currentContents := make([]map[string]interface{}, 0, 2)
	if imageBase64 != "" {
		currentContents = append(currentContents, map[string]interface{}{"type": "input_image", "image_url": imageBase64})
	}
	currentContents = append(currentContents, map[string]interface{}{"type": "input_text", "text": question})
	inputs = append(inputs, provider.DoubaoMessage{Role: "user", Content: currentContents})

	var fullAnswer strings.Builder
	err = s.doubao.ChatStream(inputs, func(chunk string) {
		fullAnswer.WriteString(chunk)
		onChunk(chunk)
	})

	if err == nil {
		_ = s.SaveChatMessage(userID, textbookID, mongo.ChatMessage{Role: "user", Content: question, Timestamp: time.Now()})
		_ = s.SaveChatMessage(userID, textbookID, mongo.ChatMessage{Role: "assistant", Content: fullAnswer.String(), Timestamp: time.Now()})
	}

	return err
}

func (s *AgentService) loadTextbookFallbackContext(textbookID uint) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := global.MongoDatabase.Collection("textbook_contents")
	var result mongo.TextbookContent
	_ = collection.FindOne(ctx, bson.M{"textbook_id": textbookID}).Decode(&result)
	if len(result.Chapters) == 0 {
		return ""
	}

	var fallbackTexts []string
	for i := 0; i < len(result.Chapters[0].Sections) && i < 2; i++ {
		fallbackTexts = append(fallbackTexts, result.Chapters[0].Sections[i].Content)
	}
	contextStr := strings.Join(fallbackTexts, "\n")
	if len(contextStr) > 4000 {
		contextStr = contextStr[:4000]
	}
	return contextStr
}

func (s *AgentService) buildKnowledgePointContext(textbookID uint, knowledgePointID uint) string {
	var current model.KnowledgePoint
	if err := global.DB.Where("id = ? AND textbook_id = ?", knowledgePointID, textbookID).First(&current).Error; err != nil {
		return ""
	}

	var allPoints []model.KnowledgePoint
	global.DB.Where("textbook_id = ?", textbookID).Find(&allPoints)

	prerequisites := parseJSONStringArray(current.PrerequisiteNames)
	sourceSnippets := parseJSONStringArray(current.SourceSnippets)
	successors := make([]string, 0)
	currentName := normalizePointName(current.Name)
	for _, point := range allPoints {
		if point.ID == current.ID {
			continue
		}
		for _, prerequisite := range parseJSONStringArray(point.PrerequisiteNames) {
			if normalizePointName(prerequisite) == currentName {
				successors = append(successors, point.Name)
				break
			}
		}
	}

	var builder strings.Builder
	builder.WriteString("当前知识点上下文：\n")
	builder.WriteString(fmt.Sprintf("知识点名称：%s\n", current.Name))
	if strings.TrimSpace(current.Summary) != "" {
		builder.WriteString(fmt.Sprintf("知识点总结：%s\n", current.Summary))
	}
	if len(sourceSnippets) > 0 {
		builder.WriteString(fmt.Sprintf("来源片段：%s\n", strings.Join(sourceSnippets, "\n---\n")))
	}
	if len(prerequisites) > 0 {
		builder.WriteString(fmt.Sprintf("前置知识点：%s\n", strings.Join(prerequisites, "、")))
	}
	if len(successors) > 0 {
		builder.WriteString(fmt.Sprintf("后续知识点：%s\n", strings.Join(uniqueStrings(successors), "、")))
	}
	return builder.String()
}

func parseJSONStringArray(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	var items []string
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return []string{}
	}
	return items
}

func normalizePointName(name string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(name)), " "))
}

func uniqueStrings(items []string) []string {
	seen := make(map[string]struct{})
	result := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		key := normalizePointName(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func (s *AgentService) Ask(textbookID uint, question string, imageBase64 string) (string, error) {
	return "", nil
}
