package repository

import (
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model"
	"fmt"
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

// ListTextbooksForStudent 根据权限过滤学生可见的教材
func (r *TextbookRepository) ListTextbooksForStudent(studentID uint) ([]model.Textbook, error) {
	var textbooks []model.Textbook
	// 逻辑：可见性为公开 (0) OR 学生 ID 在允许列表中
	// 使用 FIND_IN_SET 处理逗号分隔的字符串
	studentIDStr := fmt.Sprintf("%d", studentID)
	result := global.DB.Where("visibility = 0 OR FIND_IN_SET(?, allowed_student_ids)", studentIDStr).Find(&textbooks)
	return textbooks, result.Error
}

func (r *TextbookRepository) ListAll() ([]model.Textbook, error) {
	var textbooks []model.Textbook
	result := global.DB.Find(&textbooks)
	return textbooks, result.Error
}

func (r *TextbookRepository) SearchTextbooks(query string) ([]model.Textbook, error) {
	var textbooks []model.Textbook
	q := "%" + query + "%"
	result := global.DB.Where("title LIKE ? OR isbn LIKE ?", q, q).Find(&textbooks)
	return textbooks, result.Error
}

func (r *TextbookRepository) GetAllTextbooks() ([]model.Textbook, error) {
	var textbooks []model.Textbook
	result := global.DB.Find(&textbooks)
	return textbooks, result.Error
}
