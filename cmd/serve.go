package cmd

import (
	"github.com/JayJamieson/yafaas/server"
	"github.com/spf13/cobra"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "run yafaas server",
	Long:  "run yafaas server to handle function invocations and events",
	Run: func(cmd *cobra.Command, args []string) {
		host, _ := cmd.Flags().GetString("host")
		port, _ := cmd.Flags().GetString("port")
		funcModule, _ := cmd.Flags().GetString("func")
		funcDir, _ := cmd.Flags().GetString("fdir")

		app := server.New(host, port, []string{funcDir, funcModule})

		app.Start()
	},
}

func init() {
	rootCmd.AddCommand(serveCmd)

	serveCmd.Flags().StringP("host", "H", "localhost", "Host to bind the server to")
	serveCmd.Flags().StringP("port", "p", "9000", "Port to bind the server to")
	serveCmd.Flags().StringP("func", "f", "index.js", "Function module to invoke")
	serveCmd.Flags().StringP("fdir", "d", "/tmp/yafaas", "Current working directory for the function")
}
