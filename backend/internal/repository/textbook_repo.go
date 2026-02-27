package repository

import (
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model"
)

type TextbookRepository struct{}

func NewTextbookRepository() *TextbookRepository {
	return &TextbookRepository{}
}

func (r *TextbookRepository) CreateTextbook(textbook *model.Textbook) error {
	result := global.DB.Create(textbook)
	return result.Error
}

func (r *TextbookRepository) GetTextbookByID(id uint) (*model.Textbook, error) {
	var textbook model.Textbook
	result := global.DB.First(&textbook, id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &textbook, nil
}

func (r *TextbookRepository) ListTextbooksByTeacherID(teacherID uint) ([]model.Textbook, error) {
	var textbooks []model.Textbook
	result := global.DB.Where("uploaded_by = ?", teacherID).Find(&textbooks)
	return textbooks, result.Error
}

func (r *TextbookRepository) ListAll() ([]model.Textbook, error) {
	var textbooks []model.Textbook
	result := global.DB.Find(&textbooks)
	return textbooks, result.Error
}

func (r *TextbookRepository) SearchTextbooks(query string) ([]model.Textbook, error) {
	var textbooks []model.Textbook
	// Fuzzy search on title OR isbn
	q := "%" + query + "%"
	result := global.DB.Where("title LIKE ? OR isbn LIKE ?", q, q).Find(&textbooks)
	return textbooks, result.Error
}

func (r *TextbookRepository) GetAllTextbooks() ([]model.Textbook, error) {
	var textbooks []model.Textbook
	// Students see all textbooks that are at least uploaded (ideally processed)
	result := global.DB.Find(&textbooks)
	return textbooks, result.Error
}
