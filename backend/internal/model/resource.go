package model

import (
	"time"

	"gorm.io/gorm"
)

// Resource represents an attachment to a textbook (video or file)
type Resource struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	TextbookID  uint           `gorm:"not null;index" json:"textbook_id"`
	Title       string         `gorm:"size:255;not null" json:"title"`
	Type        string         `gorm:"size:20;not null" json:"type"` // "video" or "file"
	FilePath    string         `gorm:"not null" json:"file_path"`
	Description string         `gorm:"type:text" json:"description"`
	Ext         string         `gorm:"size:10" json:"ext"` // e.g., .mp4, .zip, .pdf
	Size        int64          `json:"size"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Resource) TableName() string {
	return "resources"
}
