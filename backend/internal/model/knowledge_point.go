package model

import (
	"time"

	"gorm.io/gorm"
)

// KnowledgePoint stores the stable knowledge point detail record for a textbook.
type KnowledgePoint struct {
	ID                uint           `gorm:"primaryKey" json:"id"`
	TextbookID        uint           `gorm:"not null;index;uniqueIndex:idx_textbook_name" json:"textbook_id"`
	Name              string         `gorm:"size:255;not null;uniqueIndex:idx_textbook_name" json:"name"`
	Summary           string         `gorm:"type:longtext" json:"summary"`
	SourceSnippets    string         `gorm:"type:longtext" json:"source_snippets"`
	PrerequisiteNames string         `gorm:"type:longtext" json:"prerequisite_names"`
	SortOrder         int            `gorm:"default:0" json:"sort_order"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
}

func (KnowledgePoint) TableName() string {
	return "knowledge_points"
}
