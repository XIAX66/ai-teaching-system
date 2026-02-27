package service

import (
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model"
	"ai-teaching-system/internal/repository"
	"log"
)

type VideoService struct {
	repo *repository.VideoRepository
}

func NewVideoService() *VideoService {
	return &VideoService{
		repo: repository.NewVideoRepository(),
	}
}

func (s *VideoService) UploadVideo(title, description, filePath string, teacherID, textbookID uint) (*model.Video, error) {
	video := &model.Video{
		Title:       title,
		Description: description,
		FilePath:    filePath,
		TeacherID:   teacherID,
		TextbookID:  textbookID,
		Status:      "uploaded",
	}

	if err := s.repo.CreateVideo(video); err != nil {
		return nil, err
	}

	// Trigger async video processing
	go s.ProcessVideo(video.ID)

	return video, nil
}

func (s *VideoService) ProcessVideo(videoID uint) {
	log.Printf("Starting video processing for Video ID %d", videoID)
	
	// Phase 2 MVP: Simply update status to processed to enable playback
	// Phase 3: Add ASR (Speech to Text) and Frame Extraction here
	
	err := global.DB.Model(&model.Video{}).Where("id = ?", videoID).Update("status", "processed").Error
	if err != nil {
		log.Printf("Failed to update video status: %v", err)
	}
	
	log.Printf("Finished video processing for Video ID %d", videoID)
}

func (s *VideoService) GetVideosByTeacher(teacherID uint) ([]model.Video, error) {
	return s.repo.ListVideosByTeacherID(teacherID)
}

func (s *VideoService) GetVideoByID(id string) (*model.Video, error) {
	return s.repo.GetVideoByID(id)
}