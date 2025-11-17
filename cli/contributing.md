# Contributing

# Dev Environment Setup
## Setting Claude Desktop
This depends the OS you are using. Here I provide 2 OS setups:

### Windows (using WSL)
Claude Desktop is installed as a regular Windows Desktop app, so it should be configured a bit differently. 

#### Installation
- The location of the MCP installation is here: `C:\Users\{username}\AppData\Roaming\Claude\claude_desktop_config.json`
- The setup will be highly dependent on your Shell, where you cloned the repo, and how and where you installed the node.js binary. Unfortunately because the Claude Desktop is a Windows app, you would need to explicitly send the commands to use your shell, the location of the dist of the CLI and the node binary location. Below is an example using zsh, and node installed using fnm.
> Claude Desktop was unable to pick up the pnpm global --link destination unfortunately. So I had to give the full path of my actual repo, instead of using the name of the CLI app. 
> Claude Desktop heavily caches stuff, so you need to kill Claude using the Windows Task Manager by searching for all the Claude processes and killing them and then restart it. Then it will pick the new configuration up.

```json
{
  "mcpServers": {
    "tutopanda-dev": {
      "command": "wsl",
      "args": [
        "zsh",
        "-c",
        "cd /home/keremk/developer/tutopanda/cli && ~/.local/share/fnm/node-versions/v22.18.0/installation/bin/node dist/cli.js mcp --defaultBlueprint=image-audio.yaml"
      ]
    }
  }
}
```

#### Watching Logs
- The location of the logs are: `C:\Users\{username}\AppData\Roaming\Claude\logs\` and depending on your exact setup it will create a log file as such `mcp-server-tutopanda-dev.log`. You can tail these logs using PowerShell in Windows only, as Claude will not write them to a WSL filesystem. Here is an example on how to tail using PowerShell commands:

```power 
Get-Content "C:\Users\keremk\AppData\Roaming\Claude\logs\mcp-server-tutopanda-dev.log" -Wait
```
