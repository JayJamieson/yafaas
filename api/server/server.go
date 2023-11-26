package server

import (
	"io"
	"log"
	"net/http"

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
	db map[string]any
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
			db: make(map[string]any),
			rx: make(chan Event), // unbuffered as we want to block until we get events
		},
	}

	mux.Route("/yafaas", func(r chi.Router) {
		r.Get("/functions", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("functions\n"))
		})

		r.Get("/create", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("create\n"))
		})

		r.Get("/delete", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("delete\n"))
		})

		r.Get("/{id}/logs", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("logs\n"))
		})

		r.Get("/events/next", srv.handleNextEvent)
		r.Post("/events", srv.handleEvent)

		r.Post("/events/{id}/response", func(w http.ResponseWriter, r *http.Request) {
			log.Println("Recieved response from event invocation")
			w.Write([]byte(`{"message": "Ok"}`))
		})

		r.Post("/events/error", func(w http.ResponseWriter, r *http.Request) {
			log.Println("Recieved error response from runtime")
			w.Write([]byte(`{"message": "Ok"}`))
		})

		r.Post("/events/{id}/error", func(w http.ResponseWriter, r *http.Request) {
			log.Println("Recieved error response from event invocation")
		})
	})

	mux.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("yafaas\n"))
	})

	return &Server{
		mux: mux,
	}
}

func (s *Server) handleNextEvent(w http.ResponseWriter, r *http.Request) {
	// TODO support multiple runtimes with isolated event busses.
	// map[string]chan Events
	// eventbus := map[testFunc]
	// event <-eventbus
	log.Println("Waiting for event")
	ctx := r.Context()

	for {
		select {
		case <-ctx.Done():
			log.Printf("%v\n", ctx.Err())
			return
		case event := <-s.eventBus.rx:
			log.Println("Got event")
			id := event.id.String()

			// set to nil as it will be filled with data from response endpoint
			s.eventBus.db[id] = make([]byte, 0)

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
	}

	event := Event{
		data: buff,
		id:   uuid.New(),
	}

	s.eventBus.rx <- event
}

func (s *Server) Start() {
	http.ListenAndServe("localhost:9000", s.mux)
}
