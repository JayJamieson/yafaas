package server

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

type Event struct {
	data []byte
	id   uuid.UUID
}

type EventBus struct {
	sendCh    chan Event
	receiveCh chan Event
}

type Server struct {
	mux        *chi.Mux
	eventBus   *EventBus
	nodeRunner *NodeRunner
	addr       string
	server     *http.Server
}

func New(host, port string, args []string) *Server {
	mux := chi.NewRouter()

	mux.Use(middleware.RequestID)
	mux.Use(middleware.RealIP)
	mux.Use(middleware.Recoverer)

	addr := host + ":" + port

	nodeRunner := &NodeRunner{
		Process:       "node",
		ProcessArgs:   args,
		Env:           append(os.Environ(), fmt.Sprintf("EVENT_ENDPOINT=%s", addr)),
		LogPrefix:     true,
		LogBufferSize: 64 * 1024, // 64 KiB buffer for logs
	}

	srv := &Server{
		mux: mux,
		eventBus: &EventBus{
			sendCh:    make(chan Event), // unbuffered as we want to block until we get events
			receiveCh: make(chan Event), // unbuffered as we want to block until we get events
		},
		addr:       addr,
		nodeRunner: nodeRunner,
		server:     &http.Server{Addr: addr, Handler: mux},
	}

	mux.Route("/yafaas", func(r chi.Router) {
		r.Get("/events/next", srv.handleNextEvent)

		r.Post("/events", srv.handleEvent)

		r.Post("/events/{id}/error", func(w http.ResponseWriter, r *http.Request) {
			log.Println("Recieved error response from event invocation")
		})

		r.Post("/events/{id}/response", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			log.Printf("Event response for id: %s", id)
			buff, err := io.ReadAll(r.Body)

			if err != nil {
				log.Printf("Error reading response body: %v", err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}

			srv.eventBus.receiveCh <- Event{
				data: buff,
				id:   uuid.MustParse(id),
			}
			w.WriteHeader(http.StatusOK)
		})
	})

	mux.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("yafaas v0.0.1\n"))
	})

	return srv
}

func (s *Server) handleNextEvent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	for {
		select {
		case <-ctx.Done():
			log.Printf("%v\n", ctx.Err())
			return
		case event := <-s.eventBus.sendCh:
			log.Println("Runtime receiving event")
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

	event := Event{
		data: buff,
		id:   uuid.New(),
	}

	ctx := r.Context()
	select {
	case <-ctx.Done():
		log.Printf("%v\n", ctx.Err())
		return
	case s.eventBus.sendCh <- event:
		break
	}

	log.Println("Waiting on response from runtime")
	result := <-s.eventBus.receiveCh
	log.Printf("Event received: data=%s eventId=%s", result.data, result.id.String())

	w.WriteHeader(http.StatusOK)
	w.Write(result.data)
}

func (s *Server) Start() {
	idleConnsClosed := make(chan struct{})

	log.Printf("Starting node runner with process %s and args %v\n", s.nodeRunner.Process, s.nodeRunner.ProcessArgs)
	s.nodeRunner.Start()

	log.Printf("Starting server on %s\n", s.addr)

	go func() {
		if err := s.server.ListenAndServe(); err != http.ErrServerClosed {
			log.Printf("Error ListenAndServe: %v", err)
		}
	}()

	go func() {

		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
		<-sig

		// The maximum time to wait for active connections whilst shutting down is
		// equivalent to the maximum execution time i.e. writeTimeout.
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := s.server.Shutdown(ctx); err != nil {
			log.Printf("Error in Shutdown: %v", err)
		}

		close(idleConnsClosed)
	}()

	<-idleConnsClosed
	log.Println("Server stopped")
}
