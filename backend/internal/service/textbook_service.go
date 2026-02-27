package service

import (
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model"
	"ai-teaching-system/internal/model/mongo"
	"ai-teaching-system/internal/repository"
	"context"
	"fmt"
	"log"
	"os/exec"
	"time"
)

type TextbookService struct {
	repo *repository.TextbookRepository
}

func NewTextbookService() *TextbookService {
	return &TextbookService{
		repo: repository.NewTextbookRepository(),
	}
}

// TextbookDetail is a combined structure for frontend
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
	}

	if err := s.repo.CreateTextbook(textbook); err != nil {
		return nil, err
	}

	// Trigger async PDF parsing via Python
	go s.ParseAndStoreTextbook(textbook.ID, filePath)

	return textbook, nil
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
	log.Printf("Starting Python-based PDF parsing for Textbook ID %d", textbookID)

	pythonPath := "./venv/bin/python3"
	scriptPath := "./scripts/parse_pdf.py"

	cmd := exec.Command(pythonPath, scriptPath, filePath)
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			log.Printf("Python script error: %s", string(exitErr.Stderr))
		}
		log.Printf("Failed to run parsing script: %v", err)
		s.updateStatus(textbookID, "failed_to_parse")
		return
	}

	contentStr := string(output)

	textbookContent := mongo.TextbookContent{
		TextbookID: textbookID,
		Chapters: []mongo.Chapter{
			{
				ChapterID: "1",
				Title:     "教材解析文本 (全文)",
				Sections: []mongo.Section{
					{
						SectionID: "1.1",
						Title:     "内容概要",
						Content:   contentStr,
					},
				},
			},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	collection := global.MongoDatabase.Collection("textbook_contents")
	filter := map[string]interface{}{"textbook_id": textbookID}
	collection.DeleteMany(ctx, filter)

	_, err = collection.InsertOne(ctx, textbookContent)
	if err != nil {
		log.Printf("Failed to store in Mongo: %v", err)
		s.updateStatus(textbookID, "failed_to_store")
		return
	}

	s.updateStatus(textbookID, "processed")
	log.Printf("Finished Python-based PDF parsing for Textbook ID %d", textbookID)
}

func (s *TextbookService) updateStatus(textbookID uint, status string) {
	global.DB.Model(&model.Textbook{}).Where("id = ?", textbookID).Update("status", status)
}

func (s *TextbookService) GetTextbooksByTeacher(teacherID uint) ([]model.Textbook, error) {
	return s.repo.ListTextbooksByTeacherID(teacherID)
}

func (s *TextbookService) SearchTextbooks(query string) ([]model.Textbook, error) {
	return s.repo.SearchTextbooks(query)
}

func (s *TextbookService) GetAllTextbooks() ([]model.Textbook, error) {
	return s.repo.GetAllTextbooks()
}

func (s *TextbookService) GetTextbookContent(textbookID string) (*TextbookDetail, error) {
	var tid uint
	fmt.Sscanf(textbookID, "%d", &tid)

	var metadata model.Textbook
	if err := global.DB.First(&metadata, tid).Error; err != nil {
		return nil, err
	}

	var resources []model.Resource
	global.DB.Where("textbook_id = ?", tid).Find(&resources)

	content, err := s.fetchFromMongo(tid)
	if err != nil {
		return &TextbookDetail{Metadata: &metadata, Resources: resources, Content: nil}, nil
	}

	return &TextbookDetail{Metadata: &metadata, Resources: resources, Content: content}, nil
}

func (s *TextbookService) fetchFromMongo(tid uint) (*mongo.TextbookContent, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	collection := global.MongoDatabase.Collection("textbook_contents")
	var result mongo.TextbookContent
	filter := map[string]interface{}{"textbook_id": tid}
	err := collection.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		return nil, err
	}
	return &result, nil
}