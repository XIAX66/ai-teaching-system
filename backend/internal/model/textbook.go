package model

import (
	"time"

	"gorm.io/gorm"
)

// Textbook represents the metadata of a textbook
type Textbook struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Title       string         `gorm:"index;not null;size:255" json:"title"`
	Author      string         `gorm:"size:255" json:"author"`
	Version     string         `gorm:"size:50" json:"version"`
	ISBN        string         `gorm:"size:20" json:"isbn"`
	Description string         `gorm:"type:text" json:"description"`
	CoverImage  string         `gorm:"size:255" json:"cover_image"`
	FilePath    string         `gorm:"not null" json:"file_path"` // Local path to PDF file
	UploadedBy  uint           `gorm:"not null;index" json:"uploaded_by"` // User ID of the uploader
	Status      string         `gorm:"size:20;default:'pending'" json:"status"` // pending, processing, completed, failed
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName overrides the table name
func (Textbook) TableName() string {
	return "textbooks"
}
