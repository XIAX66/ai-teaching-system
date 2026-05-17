package service

import (
	aiservice "ai-teaching-system/internal/ai/service"
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model"
	"ai-teaching-system/internal/model/mongo"
	"ai-teaching-system/internal/repository"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
)

var numericIDPattern = regexp.MustCompile(`\d+`)

type TextbookService struct {
	repo          *repository.TextbookRepository
	vectorService *aiservice.VectorService
	graphService  *GraphService
}

func NewTextbookService() *TextbookService {
	vs, _ := aiservice.NewVectorService()
	return &TextbookService{
		repo:          repository.NewTextbookRepository(),
		vectorService: vs,
		graphService:  NewGraphService(),
	}
}

type TextbookDetail struct {
	Metadata  *model.Textbook        `json:"metadata"`
	Resources []model.Resource       `json:"resources"`
	Content   *mongo.TextbookContent `json:"content"`
}

type KnowledgePointRelation struct {
	ID      uint   `json:"id"`
	Name    string `json:"name"`
	Summary string `json:"summary"`
}

type KnowledgePointDetail struct {
	ID             uint                     `json:"id"`
	TextbookID     uint                     `json:"textbook_id"`
	TextbookTitle  string                   `json:"textbook_title"`
	Name           string                   `json:"name"`
	Summary        string                   `json:"summary"`
	SourceSnippets []string                 `json:"source_snippets"`
	Prerequisites  []KnowledgePointRelation `json:"prerequisites"`
	Successors     []KnowledgePointRelation `json:"successors"`
	Resources      []model.Resource         `json:"resources"`
}

func ParseAllowedStudentIDs(raw string, explicit []string) []string {
	seen := make(map[string]struct{})

	addMatches := func(input string) {
		for _, match := range numericIDPattern.FindAllString(input, -1) {
			n, err := strconv.Atoi(match)
			if err != nil || n <= 0 {
				continue
			}
			seen[strconv.Itoa(n)] = struct{}{}
		}
	}

	addMatches(raw)
	for _, item := range explicit {
		addMatches(item)
	}

	ids := make([]string, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}

	sort.Slice(ids, func(i, j int) bool {
		ii, _ := strconv.Atoi(ids[i])
		jj, _ := strconv.Atoi(ids[j])
		return ii < jj
	})

	return ids
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
		Visibility: 0,
	}
	if err := s.repo.CreateTextbook(textbook); err != nil {
		return nil, err
	}
	go s.ParseAndStoreTextbook(textbook.ID, title, filePath)
	return textbook, nil
}

func (s *TextbookService) UpdateTextbookACL(textbookID uint, teacherID uint, visibility int, rawIDs string, studentIDs []string) error {
	textbook, err := s.getTextbookByID(textbookID)
	if err != nil {
		return err
	}
	if textbook.UploadedBy != teacherID {
		return errors.New("permission denied: only the owner can update ACL")
	}

	textbook.Visibility = visibility
	if visibility == 0 {
		textbook.AllowedStudentIDs = ""
	} else {
		textbook.AllowedStudentIDs = strings.Join(ParseAllowedStudentIDs(rawIDs, studentIDs), ",")
	}
	return global.DB.Save(textbook).Error
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
	if metadata.FilePath != "" {
		_ = os.Remove(metadata.FilePath)
	}
	for _, res := range resources {
		if res.FilePath != "" {
			_ = os.Remove(res.FilePath)
		}
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
	if resource.FilePath != "" {
		_ = os.Remove(resource.FilePath)
	}
	return nil
}

func (s *TextbookService) AddTextbookResource(textbookID uint, operatorID uint, title, rType, filePath, description, ext string, size int64) (*model.Resource, error) {
	textbook, err := s.getTextbookByID(textbookID)
	if err != nil {
		return nil, err
	}
	if textbook.UploadedBy != operatorID {
		return nil, errors.New("permission denied: only the owner can upload resources")
	}

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

func (s *TextbookService) AddKnowledgePointResource(textbookID uint, knowledgePointID uint, operatorID uint, title, rType, filePath, description, ext string, size int64) (*model.Resource, error) {
	textbook, err := s.getTextbookByID(textbookID)
	if err != nil {
		return nil, err
	}
	if textbook.UploadedBy != operatorID {
		return nil, errors.New("permission denied: only the owner can upload resources")
	}

	var knowledgePoint model.KnowledgePoint
	if err := global.DB.Where("id = ? AND textbook_id = ?", knowledgePointID, textbookID).First(&knowledgePoint).Error; err != nil {
		return nil, err
	}

	resource := &model.Resource{
		TextbookID:       textbookID,
		KnowledgePointID: &knowledgePointID,
		Title:            title,
		Type:             rType,
		FilePath:         filePath,
		Description:      description,
		Ext:              ext,
		Size:             size,
	}
	if err := global.DB.Create(resource).Error; err != nil {
		return nil, err
	}
	return resource, nil
}

func (s *TextbookService) ParseAndStoreTextbook(textbookID uint, title, filePath string) {
	log.Printf("Starting PDF parsing for Textbook ID %d", textbookID)
	s.updateStatus(textbookID, "processing_content")
	pythonPath := "./venv/bin/python3"
	scriptPath := "./scripts/parse_pdf.py"
	cmd := exec.Command(pythonPath, scriptPath, filePath)
	output, err := cmd.Output()
	if err != nil {
		log.Printf("PDF Parse Error: %v", err)
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

	if s.graphService != nil {
		s.updateStatus(textbookID, "building_graph")
		err := s.graphService.ExtractAndStoreKG(textbookID, title, contentStr)
		if err != nil {
			log.Printf("[TextbookService] KG Extraction Error: %v", err)
			s.updateStatus(textbookID, "failed_to_graph")
			return
		}
	}

	s.updateStatus(textbookID, "processed")
}

func (s *TextbookService) updateStatus(textbookID uint, status string) {
	global.DB.Model(&model.Textbook{}).Where("id = ?", textbookID).Update("status", status)
}

func (s *TextbookService) GetTextbooksByTeacher(teacherID uint) ([]model.Textbook, error) {
	return s.repo.ListTextbooksByTeacherID(teacherID)
}

func (s *TextbookService) GetAllTextbooks(userID uint, role string) ([]model.Textbook, error) {
	if role == "teacher" {
		return s.repo.ListAll()
	}
	return s.repo.ListTextbooksForStudent(userID)
}

func (s *TextbookService) SearchTextbooks(query string, userID uint, role string) ([]model.Textbook, error) {
	textbooks, err := s.repo.SearchTextbooks(query)
	if err != nil {
		return nil, err
	}
	if role == "teacher" {
		return textbooks, nil
	}

	filtered := make([]model.Textbook, 0, len(textbooks))
	for _, textbook := range textbooks {
		if s.canAccessTextbook(&textbook, userID, role) {
			filtered = append(filtered, textbook)
		}
	}
	return filtered, nil
}

func (s *TextbookService) GetTextbookContent(textbookID string, userID uint, role string) (*TextbookDetail, error) {
	var tid uint
	fmt.Sscanf(textbookID, "%d", &tid)

	metadata, err := s.getTextbookByID(tid)
	if err != nil {
		return nil, err
	}
	if !s.canAccessTextbook(metadata, userID, role) {
		return nil, errors.New("permission denied")
	}

	var resources []model.Resource
	global.DB.Where("textbook_id = ? AND knowledge_point_id IS NULL", tid).Find(&resources)
	content, _ := s.fetchFromMongo(tid)
	return &TextbookDetail{Metadata: metadata, Resources: resources, Content: content}, nil
}

func (s *TextbookService) GetKnowledgeGraph(textbookID uint, userID uint, role string) (*GraphData, error) {
	metadata, err := s.getTextbookByID(textbookID)
	if err != nil {
		return nil, err
	}
	if !s.canAccessTextbook(metadata, userID, role) {
		return nil, errors.New("permission denied")
	}
	if s.graphService == nil {
		return nil, errors.New("graph service not initialized")
	}
	return s.graphService.GetGraph(textbookID)
}

func (s *TextbookService) GetKnowledgePointDetail(textbookID uint, knowledgePointID uint, userID uint, role string) (*KnowledgePointDetail, error) {
	metadata, err := s.getTextbookByID(textbookID)
	if err != nil {
		return nil, err
	}
	if !s.canAccessTextbook(metadata, userID, role) {
		return nil, errors.New("permission denied")
	}

	var kp model.KnowledgePoint
	if err := global.DB.Where("id = ? AND textbook_id = ?", knowledgePointID, textbookID).First(&kp).Error; err != nil {
		return nil, err
	}

	var resources []model.Resource
	global.DB.Where("textbook_id = ? AND knowledge_point_id = ?", textbookID, knowledgePointID).Order("created_at desc").Find(&resources)

	var allPoints []model.KnowledgePoint
	global.DB.Where("textbook_id = ?", textbookID).Order("sort_order asc, id asc").Find(&allPoints)

	nameMap := make(map[string]model.KnowledgePoint, len(allPoints))
	for _, item := range allPoints {
		nameMap[normalizeKnowledgePointName(item.Name)] = item
	}

	prerequisiteNames := unmarshalStringArray(kp.PrerequisiteNames)
	prerequisites := make([]KnowledgePointRelation, 0, len(prerequisiteNames))
	for _, name := range prerequisiteNames {
		if related, ok := nameMap[normalizeKnowledgePointName(name)]; ok {
			prerequisites = append(prerequisites, KnowledgePointRelation{
				ID:      related.ID,
				Name:    related.Name,
				Summary: related.Summary,
			})
		}
	}

	successors := make([]KnowledgePointRelation, 0)
	currentName := normalizeKnowledgePointName(kp.Name)
	for _, item := range allPoints {
		if item.ID == kp.ID {
			continue
		}
		for _, prerequisite := range unmarshalStringArray(item.PrerequisiteNames) {
			if normalizeKnowledgePointName(prerequisite) == currentName {
				successors = append(successors, KnowledgePointRelation{
					ID:      item.ID,
					Name:    item.Name,
					Summary: item.Summary,
				})
				break
			}
		}
	}

	return &KnowledgePointDetail{
		ID:             kp.ID,
		TextbookID:     textbookID,
		TextbookTitle:  metadata.Title,
		Name:           kp.Name,
		Summary:        kp.Summary,
		SourceSnippets: unmarshalStringArray(kp.SourceSnippets),
		Prerequisites:  prerequisites,
		Successors:     successors,
		Resources:      resources,
	}, nil
}

func (s *TextbookService) fetchFromMongo(tid uint) (*mongo.TextbookContent, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	collection := global.MongoDatabase.Collection("textbook_contents")
	var result mongo.TextbookContent
	err := collection.FindOne(ctx, map[string]interface{}{"textbook_id": tid}).Decode(&result)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *TextbookService) getTextbookByID(id uint) (*model.Textbook, error) {
	var textbook model.Textbook
	if err := global.DB.First(&textbook, id).Error; err != nil {
		return nil, err
	}
	return &textbook, nil
}

func (s *TextbookService) canAccessTextbook(textbook *model.Textbook, userID uint, role string) bool {
	if role != "student" {
		return true
	}
	if textbook.Visibility == 0 {
		return true
	}
	uIDStr := strconv.FormatUint(uint64(userID), 10)
	for _, id := range strings.Split(textbook.AllowedStudentIDs, ",") {
		if strings.TrimSpace(id) == uIDStr {
			return true
		}
	}
	return false
}

func normalizeKnowledgePointName(name string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(name)), " "))
}

func unmarshalStringArray(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	var items []string
	if err := json.Unmarshal([]byte(raw), &items); err == nil {
		return items
	}
	return []string{}
}
