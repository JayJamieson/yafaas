package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/mholt/archiver/v4"
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
	docker   *client.Client
}

func New() *Server {
	mux := chi.NewRouter()
	mux.Use(middleware.Logger)

	// TODO cleanup panic silly
	cli, err := client.NewClientWithOpts(client.FromEnv)

	if err != nil {
		panic(err)
	}

	srv := &Server{
		mux:    mux,
		docker: cli,
		eventBus: &EventBus{
			db: make(map[string]any),
			rx: make(chan Event), // unbuffered as we want to block until we get events
		},
	}

	mux.Route("/yafaas", func(r chi.Router) {
		r.Get("/functions", srv.listFunctions)

		r.Post("/functions", srv.createFunction)

		r.Delete("/functions/{id}", srv.deleteFunction)

		r.Get("/functions/{id}/logs", func(w http.ResponseWriter, r *http.Request) {
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

func (s *Server) createFunction(w http.ResponseWriter, r *http.Request) {
	createReq := map[string]any{}
	body, err := io.ReadAll(r.Body)

	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	err = json.Unmarshal(body, &createReq)

	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	fFile, err := os.CreateTemp("", "function")

	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	fString := createReq["function"]

	// TODO fix this silly use of any and string and byte conversion
	fFile.Write([]byte(string(fString.(string))))
	fName := fFile.Name()

	fFile.Close()

	defer os.Remove(fFile.Name())

	cwd, err := os.Getwd()
	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	files, err := archiver.FilesFromDisk(nil, map[string]string{
		path.Join(cwd, "../runtime", "Dockerfile"):     "Dockerfile",
		path.Join(cwd, "../runtime", "dist/index.mjs"): "dist/index.mjs",
		fName: "functions/index.mjs",
		path.Join(cwd, "../runtime", "scripts/entrypoint.sh"): "scripts/entrypoint.sh",
		path.Join(cwd, "../runtime", "scripts/bootstrap"):     "scripts/bootstrap",
	})

	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}
	buf := &bytes.Buffer{}

	format := archiver.Tar{}

	err = format.Archive(r.Context(), buf, files)

	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	// TODO do something with the build output
	resp, err := s.docker.ImageBuild(r.Context(), buf, types.ImageBuildOptions{
		Tags:       []string{"yafaas"},
		Dockerfile: "Dockerfile",
		NoCache:    true,
		Remove:     true,
	})

	// TODO figure out how to get image ID
	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	defer resp.Body.Close()

	// TODO do something useful with this
	buildOutput, err := io.ReadAll(resp.Body)
	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	log.Print(string(buildOutput))

	createResp, err := s.docker.ContainerCreate(r.Context(), &container.Config{
		Image: "yafaas",
	}, nil, nil, nil, "")

	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	err = s.docker.ContainerStart(r.Context(), createResp.ID, types.ContainerStartOptions{})

	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	w.Write([]byte(fmt.Sprintf(`{"id": "%s"}`, createResp.ID)))
}

func (s *Server) deleteFunction(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	err := s.docker.ContainerRemove(r.Context(), id, types.ContainerRemoveOptions{
		RemoveVolumes: true,
		Force:         true,
	})

	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	w.Write([]byte(`{"message": "Ok"}`))
}

func (s *Server) listFunctions(w http.ResponseWriter, r *http.Request) {
	containers, err := s.docker.ContainerList(r.Context(), types.ContainerListOptions{})

	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	resp, err := json.Marshal(containers)

	if err != nil {
		msg := fmt.Sprintf("%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(msg))
		return
	}

	w.Write(resp)
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
		return
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
