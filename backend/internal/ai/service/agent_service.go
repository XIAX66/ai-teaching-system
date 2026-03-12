package service

import (
	"ai-teaching-system/internal/ai/provider"
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model/mongo"
	"context"
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
	if err != nil { return nil, err }
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
	if err != nil { return []mongo.ChatMessage{}, nil }
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

// TruncateChatHistory removes all messages after a certain index (inclusive)
func (s *AgentService) TruncateChatHistory(userID uint, textbookID uint, index int) error {
	collection := global.MongoDatabase.Collection("chat_sessions")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"user_id": userID, "textbook_id": textbookID}
	
	// Fetch existing session
	var session mongo.ChatSession
	err := collection.FindOne(ctx, filter).Decode(&session)
	if err != nil {
		return err
	}

	if index < 0 || index >= len(session.Messages) {
		return fmt.Errorf("index out of range")
	}

	// Keep only messages up to the index
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

func (s *AgentService) AskStream(userID uint, textbookID uint, question string, imageBase64 string, onChunk func(string)) error {
	history, _ := s.GetChatHistory(userID, textbookID)
	
	var contextStr string
	contexts, err := s.vectorService.Search(textbookID, question, imageBase64, 3)
	if err != nil {
		log.Printf("[AgentService] Search Error: %v", err)
	}
	
	if len(contexts) > 0 {
		contextStr = strings.Join(contexts, "\n---\n")
	} else {
		log.Printf("[AgentService] RAG returned no results, falling back to MongoDB summary")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		collection := global.MongoDatabase.Collection("textbook_contents")
		var result mongo.TextbookContent
		_ = collection.FindOne(ctx, bson.M{"textbook_id": textbookID}).Decode(&result)
		if len(result.Chapters) > 0 {
			var fallbackTexts []string
			for i := 0; i < len(result.Chapters[0].Sections) && i < 2; i++ {
				fallbackTexts = append(fallbackTexts, result.Chapters[0].Sections[i].Content)
			}
			contextStr = strings.Join(fallbackTexts, "\n")
			if len(contextStr) > 4000 { contextStr = contextStr[:4000] }
		}
	}

	var inputs []provider.DoubaoMessage
	systemText := "你是一个专业的教学助手。请根据提供的教材背景知识回答问题。必须使用详细的 Markdown 格式。"
	if contextStr != "" {
		systemText += fmt.Sprintf("\n\n教材背景知识：\n%s", contextStr)
	}
	
	inputs = append(inputs, provider.DoubaoMessage{
		Role: "system",
		Content: []map[string]interface{}{{"type": "input_text", "text": systemText}},
	})

	start := 0
	if len(history) > 10 { start = len(history) - 10 }
	for _, h := range history[start:] {
		role := h.Role
		if role == "ai" || role == "assistant" { role = "assistant" }
		inputs = append(inputs, provider.DoubaoMessage{
			Role: role,
			Content: []map[string]interface{}{{"type": "input_text", "text": h.Content}},
		})
	}

	var currentContents []map[string]interface{}
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

func (s *AgentService) Ask(textbookID uint, question string, imageBase64 string) (string, error) { return "", nil }
