package service

import (
	"ai-teaching-system/internal/model"
	"ai-teaching-system/internal/repository"
	"ai-teaching-system/pkg/utils"
	"errors"
)

type UserService struct {
	repo *repository.UserRepository
}

func NewUserService() *UserService {
	return &UserService{
		repo: repository.NewUserRepository(),
	}
}

func (s *UserService) Register(username, password, role string) error {
	// Check if user exists
	existingUser, err := s.repo.GetUserByUsername(username)
	if err != nil {
		return err
	}
	if existingUser != nil {
		return errors.New("username already exists")
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return err
	}

	// Create user
	newUser := &model.User{
		Username: username,
		Password: hashedPassword,
		Role:     role,
	}

	return s.repo.CreateUser(newUser)
}

func (s *UserService) Login(username, password string) (string, error) {
	user, err := s.repo.GetUserByUsername(username)
	if err != nil {
		return "", err
	}
	if user == nil {
		return "", errors.New("invalid credentials")
	}

	// Verify password
	if !utils.CheckPasswordHash(password, user.Password) {
		return "", errors.New("invalid credentials")
	}

	// Generate JWT
	token, err := utils.GenerateToken(user.ID, user.Role)
	if err != nil {
		return "", err
	}

	return token, nil
}
