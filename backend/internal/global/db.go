package global

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"ai-teaching-system/internal/model"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

var DB *gorm.DB
var MongoClient *mongo.Client
var MongoDatabase *mongo.Database
var Neo4jDriver neo4j.DriverWithContext

func InitDB() {
	initMySQL()
	initMongoDB()
	initNeo4j()
}

func initMySQL() {
	dsn := "user:password@tcp(mysql:3306)/ai_teaching_db?charset=utf8mb4&parseTime=True&loc=Local"
	if envDSN := os.Getenv("MYSQL_DSN"); envDSN != "" {
		dsn = envDSN
	}

	var err error
	log.Printf("Connecting to MySQL using DSN: %s", dsn)
	
	for i := 0; i < 10; i++ {
		DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		log.Printf("MySQL not ready, retrying in 2s... (%d/10)", i+1)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		log.Fatal("Failed to connect to MySQL after retries: ", err)
	}

	log.Println("Connected to MySQL successfully.")

	_ = DB.AutoMigrate(&model.User{}, &model.Textbook{}, &model.Video{}, &model.Resource{})
	fmt.Println("Database migration completed.")
}

func initMongoDB() {
	uri := "mongodb://root:root_password@mongo:27017"
	if envURI := os.Getenv("MONGO_URI"); envURI != "" {
		uri = envURI
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	log.Printf("Connecting to MongoDB using URI: %s", uri)
	
	MongoClient, err = mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatal("Failed to connect to MongoDB: ", err)
	}

	err = MongoClient.Ping(ctx, nil)
	if err != nil {
		log.Fatal("Failed to ping MongoDB: ", err)
	}

	MongoDatabase = MongoClient.Database("ai_teaching_db")
	log.Println("Connected to MongoDB successfully.")
}

func initNeo4j() {
	uri := "bolt://neo4j:7687"
	if envURI := os.Getenv("NEO4J_URI"); envURI != "" {
		uri = envURI
	}
	user := os.Getenv("NEO4J_USER")
	pass := os.Getenv("NEO4J_PASSWORD")

	var err error
	log.Printf("Connecting to Neo4j using URI: %s", uri)

	for i := 0; i < 10; i++ {
		Neo4jDriver, err = neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, pass, ""))
		if err == nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err = Neo4jDriver.VerifyConnectivity(ctx)
			cancel()
			if err == nil {
				break
			}
		}
		log.Printf("Neo4j not ready, retrying in 5s... (%d/10)", i+1)
		time.Sleep(5 * time.Second) // wait a bit more for neo4j
	}

	if err != nil {
		log.Printf("Warning: Failed to connect to Neo4j after retries: %v. Graph features will be disabled.", err)
		return
	}

	log.Println("Connected to Neo4j successfully.")
}
