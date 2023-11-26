package cmd

import (
	"bytes"
	"context"
	"io"
	"log"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/archive"
	"github.com/mholt/archiver/v4"
	"github.com/spf13/cobra"
)

// buildCmd represents the build command
var buildCmd = &cobra.Command{
	Use:   "build",
	Short: "build docker image",
	Long:  `build docker image`,
	Run: func(cmd *cobra.Command, args []string) {
		bg := context.Background()

		files, err := archiver.FilesFromDisk(nil, map[string]string{
			"Dockerfile":            "Dockerfile",
			"dist/index.mjs":        "dist/index.mjs",
			"functions/index.mjs":   "functions/index.mjs",
			"scripts/entrypoint.sh": "scripts/entrypoint.sh",
			"scripts/bootstrap":     "scripts/bootstrap",
		})

		if err != nil {
			log.Fatal(err)
		}
		buf := &bytes.Buffer{}

		format := archiver.Tar{}

		err = format.Archive(bg, buf, files)
		if err != nil {
			log.Fatal(err)
		}

		cli, err := client.NewClientWithOpts(client.FromEnv)
		if err != nil {
			panic(err)
		}

		// Create a tar archive of the current directory
		buildCtx, err := archive.TarWithOptions(".", &archive.TarOptions{})
		if err != nil {
			log.Fatal(err)
		}

		defer buildCtx.Close()

		resp, err := cli.ImageBuild(bg, buf, types.ImageBuildOptions{
			Tags:       []string{"yafaasl"},
			Dockerfile: "Dockerfile",
			NoCache:    true,
			Remove:     true,
		})

		if err != nil {
			log.Fatal(err)
		}

		defer resp.Body.Close()

		// Read build output
		buildOutput, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Fatal(err)
		}

		log.Print(string(buildOutput))
	},
}

func init() {
	rootCmd.AddCommand(buildCmd)

	// Here you will define your flags and configuration settings.

	// Cobra supports Persistent Flags which will work for this command
	// and all subcommands, e.g.:
	// buildCmd.PersistentFlags().String("foo", "", "A help for foo")

	// Cobra supports local flags which will only run when this command
	// is called directly, e.g.:
	// buildCmd.Flags().BoolP("toggle", "t", false, "Help message for toggle")
}
