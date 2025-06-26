package server

import (
	"bufio"
	"io"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
)

type NodeRunner struct {
	Process     string   // Process to run as yprocess
	ProcessArgs []string // ProcessArgs to pass to command
	Env         []string // Environment variables to set for the process
	Command     *exec.Cmd
	StdinPipe   io.WriteCloser
	StdoutPipe  io.ReadCloser

	LogPrefix     bool
	LogBufferSize int
}

func (nr *NodeRunner) Start() error {
	cmd := exec.Command(nr.Process, nr.ProcessArgs...)
	cmd.Env = nr.Env

	var stdinErr error
	var stdoutErr error

	nr.Command = cmd

	nr.StdinPipe, stdinErr = cmd.StdinPipe()

	if stdinErr != nil {
		return stdinErr
	}

	nr.StdoutPipe, stdoutErr = cmd.StdoutPipe()
	if stdoutErr != nil {
		return stdoutErr
	}

	errPipe, _ := cmd.StderrPipe()

	// Logs lines from stderr and stdout to the stderr and stdout of this process
	bindLoggingPipe(nr.Process, errPipe, os.Stderr, nr.LogPrefix, nr.LogBufferSize)
	bindLoggingPipe(nr.Process, nr.StdoutPipe, os.Stdout, nr.LogPrefix, nr.LogBufferSize)

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

		<-sig
		log.Println("Received SIGTERM, terminating forked function...")
		cmd.Process.Signal(syscall.SIGINT)
	}()

	err := cmd.Start()
	go func() {
		err := cmd.Wait()
		if err != nil {
			log.Fatalf("Forked function has terminated: %s", err.Error())
		}
	}()

	return err
}

// bindLoggingPipe spawns a goroutine for passing through logging of the given output pipe.
func bindLoggingPipe(name string, pipe io.Reader, output io.Writer, logPrefix bool, maxBufferSize int) {
	log.Printf("Started logging: %s from function.", name)

	logFlags := log.Flags()
	prefix := log.Prefix()
	if !logPrefix {
		logFlags = 0
		prefix = "" // Unnecessary, but set explicitly for completeness.
	}

	logger := log.New(output, prefix, logFlags)

	if maxBufferSize >= 0 {
		go pipeBuffered(name, pipe, logger, logPrefix, maxBufferSize)
	} else {
		go pipeUnbuffered(name, pipe, logger, logPrefix)
	}
}

func pipeBuffered(name string, pipe io.Reader, logger *log.Logger, logPrefix bool, maxBufferSize int) {
	buf := make([]byte, maxBufferSize)
	scanner := bufio.NewScanner(pipe)
	scanner.Buffer(buf, maxBufferSize)

	for scanner.Scan() {
		if logPrefix {
			logger.Printf("%s: %s", name, scanner.Text())
		} else {
			logger.Print(scanner.Text())
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("Error reading %s: %s", name, err)
	}
	log.Println("Finished logging:", name)
}

func pipeUnbuffered(name string, pipe io.Reader, logger *log.Logger, logPrefix bool) {

	r := bufio.NewReader(pipe)

	for {
		line, err := r.ReadString('\n')
		if err != nil {
			if err != io.EOF {
				log.Printf("Error reading %s: %s", name, err)
			}
			break
		}
		if logPrefix {
			logger.Printf("%s: %s", name, line)
		} else {
			logger.Print(line)
		}
	}
	log.Println("Finished logging:", name)
}
