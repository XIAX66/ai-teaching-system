package model

import (
	"time"

	"gorm.io/gorm"
)

// User represents the user entity in the database
type User struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Username  string         `gorm:"uniqueIndex;not null;size:100" json:"username"`
	Password  string         `gorm:"not null" json:"-"` // Password is not exported in JSON
	Role      string         `gorm:"size:20;default:'student'" json:"role"`
	Email     string         `gorm:"size:255" json:"email"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName overrides the table name
func (User) TableName() string {
	return "users"
}
