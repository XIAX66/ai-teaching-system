package mongo

import (
	"time"
)

type ChatMessage struct {
	Role      string    `json:"role" bson:"role"`           // "user", "assistant" (豆包角色名), "system"
	Content   string    `json:"content" bson:"content"`
	Timestamp time.Time `json:"timestamp" bson:"timestamp"`
}

type ChatSession struct {
	UserID     uint          `json:"user_id" bson:"user_id"`
	TextbookID uint          `json:"textbook_id" bson:"textbook_id"`
	Messages   []ChatMessage `json:"messages" bson:"messages"`
	UpdatedAt  time.Time     `json:"updated_at" bson:"updated_at"`
}
