package service

import (
	"ai-teaching-system/internal/ai/service"
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model"
	"ai-teaching-system/internal/model/mongo"
	"ai-teaching-system/internal/repository"
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
)

type TextbookService struct {
	repo          *repository.TextbookRepository
	vectorService *service.VectorService
}

func NewTextbookService() *TextbookService {
	vs, _ := service.NewVectorService()
	return &TextbookService{
		repo:          repository.NewTextbookRepository(),
		vectorService: vs,
	}
}

type TextbookDetail struct {
	Metadata  *model.Textbook        `json:"metadata"`
	Resources []model.Resource       `json:"resources"`
	Content   *mongo.TextbookContent `json:"content"`
}

func (s *TextbookService) UploadTextbook(title, author, isbn, filePath string, uploaderID uint) (*model.Textbook, error) {
	textbook := &model.Textbook{
		Title:      title,
		Author:     author,
		ISBN:       isbn,
		FilePath:   filePath,
		UploadedBy: uploaderID,
		Status:     "uploaded",
		Version:    "1.0",
		Visibility: 0, // 默认公开
	}
	if err := s.repo.CreateTextbook(textbook); err != nil {
		return nil, err
	}
	go s.ParseAndStoreTextbook(textbook.ID, filePath)
	return textbook, nil
}

// UpdateTextbookACL 更新教材访问权限
func (s *TextbookService) UpdateTextbookACL(textbookID uint, teacherID uint, visibility int, studentIDs []string) error {
	var textbook model.Textbook
	if err := global.DB.First(&textbook, textbookID).Error; err != nil {
		return err
	}
	if textbook.UploadedBy != teacherID {
		return errors.New("permission denied: only the owner can update ACL")
	}

	textbook.Visibility = visibility
	textbook.AllowedStudentIDs = strings.Join(studentIDs, ",")
	
	return global.DB.Save(&textbook).Error
}

func (s *TextbookService) DeleteTextbook(textbookID uint, operatorID uint) error {
	var metadata model.Textbook
	if err := global.DB.First(&metadata, textbookID).Error; err != nil {
		return err
	}
	if metadata.UploadedBy != operatorID {
		return errors.New("permission denied: you are not the owner of this textbook")
	}
	var resources []model.Resource
	global.DB.Where("textbook_id = ?", textbookID).Find(&resources)
	if err := global.DB.Delete(&metadata).Error; err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	collection := global.MongoDatabase.Collection("textbook_contents")
	_, _ = collection.DeleteOne(ctx, bson.M{"textbook_id": textbookID})
	if s.vectorService != nil {
		_ = s.vectorService.DeleteTextbookPoints(textbookID)
	}
	if metadata.FilePath != "" { _ = os.Remove(metadata.FilePath) }
	for _, res := range resources {
		if res.FilePath != "" { _ = os.Remove(res.FilePath) }
	}
	return nil
}

func (s *TextbookService) DeleteResource(resourceID uint, operatorID uint) error {
	var resource model.Resource
	if err := global.DB.First(&resource, resourceID).Error; err != nil {
		return err
	}
	var metadata model.Textbook
	if err := global.DB.First(&metadata, resource.TextbookID).Error; err != nil {
		return err
	}
	if metadata.UploadedBy != operatorID {
		return errors.New("permission denied: you are not the owner of the parent textbook")
	}
	if err := global.DB.Delete(&resource).Error; err != nil {
		return err
	}
	if resource.FilePath != "" { _ = os.Remove(resource.FilePath) }
	return nil
}

func (s *TextbookService) AddResource(textbookID uint, title, rType, filePath, description, ext string, size int64) (*model.Resource, error) {
	resource := &model.Resource{
		TextbookID:  textbookID,
		Title:       title,
		Type:        rType,
		FilePath:    filePath,
		Description: description,
		Ext:         ext,
		Size:        size,
	}
	if err := global.DB.Create(resource).Error; err != nil {
		return nil, err
	}
	return resource, nil
}

func (s *TextbookService) ParseAndStoreTextbook(textbookID uint, filePath string) {
	log.Printf("Starting PDF parsing for Textbook ID %d", textbookID)
	pythonPath := "./venv/bin/python3"
	scriptPath := "./scripts/parse_pdf.py"
	cmd := exec.Command(pythonPath, scriptPath, filePath)
	output, err := cmd.Output()
	if err != nil {
		s.updateStatus(textbookID, "failed_to_parse")
		return
	}
	contentStr := string(output)
	textbookContent := mongo.TextbookContent{
		TextbookID: textbookID,
		Chapters: []mongo.Chapter{{
			ChapterID: "1", Title: "全文解析",
			Sections: []mongo.Section{{SectionID: "1.1", Title: "内容", Content: contentStr}},
		}},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	collection := global.MongoDatabase.Collection("textbook_contents")
	_, _ = collection.DeleteMany(ctx, map[string]interface{}{"textbook_id": textbookID})
	_, _ = collection.InsertOne(ctx, textbookContent)
	if s.vectorService != nil {
		_ = s.vectorService.IndexTextbook(textbookID, contentStr)
	}
	s.updateStatus(textbookID, "processed")
}

func (s *TextbookService) updateStatus(textbookID uint, status string) {
	global.DB.Model(&model.Textbook{}).Where("id = ?", textbookID).Update("status", status)
}

func (s *TextbookService) GetTextbooksByTeacher(teacherID uint) ([]model.Textbook, error) {
	return s.repo.ListTextbooksByTeacherID(teacherID)
}

// GetAllTextbooks 适配权限过滤
func (s *TextbookService) GetAllTextbooks(userID uint, role string) ([]model.Textbook, error) {
	if role == "teacher" {
		return s.repo.ListAll()
	}
	return s.repo.ListTextbooksForStudent(userID)
}

func (s *TextbookService) SearchTextbooks(query string) ([]model.Textbook, error) {
	return s.repo.SearchTextbooks(query)
}

// GetTextbookContent 增加权限校验
func (s *TextbookService) GetTextbookContent(textbookID string, userID uint, role string) (*TextbookDetail, error) {
	var tid uint
	fmt.Sscanf(textbookID, "%d", &tid)
	
	var metadata model.Textbook
	if err := global.DB.First(&metadata, tid).Error; err != nil { return nil, err }

	// 权限校验逻辑
	if role == "student" {
		if metadata.Visibility == 1 {
			// 检查学生是否在白名单中
			allowed := false
			ids := strings.Split(metadata.AllowedStudentIDs, ",")
			userIDStr := fmt.Sprintf("%d", userID)
			for _, id := range ids {
				if id == userIDStr {
					allowed = true
					break
				}
			}
			if !allowed {
				return nil, errors.New("permission denied: you are not authorized to view this textbook")
			}
		}
	}

	var resources []model.Resource
	global.DB.Where("textbook_id = ?", tid).Find(&resources)
	content, _ := s.fetchFromMongo(tid)
	return &TextbookDetail{Metadata: &metadata, Resources: resources, Content: content}, nil
}

func (s *TextbookService) fetchFromMongo(tid uint) (*mongo.TextbookContent, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	collection := global.MongoDatabase.Collection("textbook_contents")
	var result mongo.TextbookContent
	err := collection.FindOne(ctx, map[string]interface{}{"textbook_id": tid}).Decode(&result)
	if err != nil { return nil, err }
	return &result, nil
}
