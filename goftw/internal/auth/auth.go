package auth

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

var db *sql.DB

type User struct {
	ID           int
	Username     string
	PasswordHash string
	Token        string
}

// InitDB initializes SQLite and creates a default admin user if none exists
func InitDB(dbPath string) error {
	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}

	query := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE,
		password_hash TEXT,
		token TEXT
	);` // Corrected: password_hash instead of password

	_, err = db.Exec(query)
	if err != nil {
		return err
	}

	// Seed default admin:admin if table is empty
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if count == 0 {
		password := "admin"

		if envPassword, ok := os.LookupEnv("GOFTWADMINPASSWORD"); ok && envPassword != "" {
			password = envPassword
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			log.Fatal(err)
		}

		_, err = db.Exec(
			"INSERT INTO users (username, password_hash) VALUES (?, ?)",
			"admin",
			string(hash),
		)
		if err != nil {
			log.Fatal(err)
		}

		log.Println("[AUTH] Default admin user created")
	}

	return nil
}

// LoginHandler handles Basic Auth and returns a token
func LoginHandler(w http.ResponseWriter, r *http.Request) {
	username, password, ok := r.BasicAuth()
	if !ok {
		w.Header().Set("WWW-Authenticate", `Basic realm="Restricted"`)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var user User
	err := db.QueryRow("SELECT id, password_hash FROM users WHERE username = ?", username).Scan(&user.ID, &user.PasswordHash)
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Generate token
	newToken := uuid.New().String()
	_, err = db.Exec("UPDATE users SET token = ? WHERE id = ?", newToken, user.ID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": newToken})
}

// TokenMiddleware verifies the Bearer token
func TokenMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, "Missing or invalid token", http.StatusUnauthorized)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		var username string
		err := db.QueryRow("SELECT username FROM users WHERE token = ?", token).Scan(&username)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
