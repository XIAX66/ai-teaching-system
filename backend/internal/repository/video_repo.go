package repository

import (
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model"
)

type VideoRepository struct{}

func NewVideoRepository() *VideoRepository {
	return &VideoRepository{}
}

func (r *VideoRepository) CreateVideo(video *model.Video) error {
	return global.DB.Create(video).Error
}

func (r *VideoRepository) ListVideosByTeacherID(teacherID uint) ([]model.Video, error) {
	var videos []model.Video
	result := global.DB.Where("teacher_id = ?", teacherID).Find(&videos)
	return videos, result.Error
}

func (r *VideoRepository) GetVideoByID(id string) (*model.Video, error) {
	var video model.Video
	if err := global.DB.First(&video, id).Error; err != nil {
		return nil, err
	}
	return &video, nil
}
