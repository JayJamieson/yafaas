package server

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

type Event struct {
	data []byte
	id   uuid.UUID
}

type EventBus struct {
	rx chan Event
}

type Server struct {
	mux      *chi.Mux
	eventBus *EventBus
}

func New() *Server {
	mux := chi.NewRouter()
	mux.Use(middleware.Logger)

	srv := &Server{
		mux: mux,
		eventBus: &EventBus{
			rx: make(chan Event), // unbuffered as we want to block until we get events
		},
	}

	mux.Route("/yafaas", func(r chi.Router) {

		r.Get("/functions/{id}/logs", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("logs\n"))
		})

		r.Get("/events/next", srv.handleNextEvent)

		r.Post("/events", srv.handleEvent)

		r.Post("/events/{id}/error", func(w http.ResponseWriter, r *http.Request) {
			log.Println("Recieved error response from event invocation")
		})
	})

	mux.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("yafaas v0.0.1\n"))
	})

	return &Server{
		mux: mux,
	}
}

func (s *Server) handleNextEvent(w http.ResponseWriter, r *http.Request) {
	log.Println("Waiting for event")
	ctx := r.Context()

	for {
		select {
		case <-ctx.Done():
			log.Printf("%v\n", ctx.Err())
			return
		case event := <-s.eventBus.rx:
			log.Println("Sending event to runtime")
			id := event.id.String()

			w.Header().Add("Event-Id", id)
			w.Write(event.data)
			return
		}
	}
}

func (s *Server) handleEvent(w http.ResponseWriter, r *http.Request) {
	buff, err := io.ReadAll(r.Body)

	if err != nil {
		log.Printf("%v", err)
		w.Write([]byte(err.Error()))
		return
	}
	log.Println("Received event")

	event := Event{
		data: buff,
		id:   uuid.New(),
	}
	log.Println("Sending event to runtime")

	s.eventBus.rx <- event
}

func (s *Server) Start(host, port string) {
	addr := host + ":" + port
	log.Printf("Starting server on %s\n", addr)

	cwd, _ := os.Getwd()
	targetCmd := exec.Command("node", "index.mjs", cwd+"/runtime/functions")

	// targetCmd := exec.Command("node", "index.mjs")

	envs := os.Environ()
	targetCmd.Env = append(envs, fmt.Sprintf("EVENTS_API=%s", addr))
	targetCmd.Stdout = os.Stdout
	targetCmd.Stderr = os.Stderr

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := targetCmd.Run(); err != nil {
			log.Fatalf("Error running target command: %v\n", err)
		}
	}()

	http.ListenAndServe(addr, s.mux)
	wg.Wait()
}
