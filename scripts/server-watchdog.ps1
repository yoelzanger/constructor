# server-watchdog.ps1
$workingDir = "C:\Users\yoel\constructor"
$logFile = "$workingDir\watchdog.log"
$port = 3000
$url = "http://localhost:$port"

function Log-Message {
    param([string]$message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $message" | Out-File -FilePath $logFile -Append
}

Log-Message "Watchdog check started."

try {
    Log-Message "Checking port $port..."
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    try {
        $msg = $tcpClient.ConnectAsync("localhost", $port).Wait(500) # 500ms timeout
        if ($tcpClient.Connected) {
            Log-Message "Server is running (Port $port is open)."
            $tcpClient.Close()
            exit
        }
        else {
            Log-Message "Port check returned false/timeout."
        }
    }
    finally {
        if ($tcpClient) { $tcpClient.Dispose() }
    }
}
catch {
    Log-Message "Error checking port: $($_.Exception.Message)"
}

Log-Message "Starting server..."

try {
    Set-Location $workingDir
    # Start the server in a new invisible process
    # Using 'npm run start' for production build as it's more stable for background tasks
    # Ensure 'npm run build' has been run at least once!
    Start-Process -FilePath "npm.cmd" -ArgumentList "run", "start" -WindowStyle Hidden -RedirectStandardOutput "$workingDir\server_out.log" -RedirectStandardError "$workingDir\server_err.log"
    Log-Message "Server start command issued."
}
catch {
    Log-Message "Failed to start server: $($_.Exception.Message)"
}
