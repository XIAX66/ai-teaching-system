package model

import (
	"time"

	"gorm.io/gorm"
)

// Video represents the metadata of a teaching video
type Video struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Title       string         `gorm:"index;not null;size:255" json:"title"`
	Description string         `gorm:"type:text" json:"description"`
	TextbookID  uint           `gorm:"index" json:"textbook_id"` // Optional: Link to a textbook
	TeacherID   uint           `gorm:"not null;index" json:"teacher_id"`
	FilePath    string         `gorm:"not null" json:"file_path"` // Local path to video file
	Duration    int            `gorm:"default:0" json:"duration"` // Duration in seconds
	Status      string         `gorm:"size:20;default:'pending'" json:"status"` // pending, processing, completed, failed
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName overrides the table name
func (Video) TableName() string {
	return "videos"
}
