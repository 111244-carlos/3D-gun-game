$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5173
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $port)
$listener.Start()

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream)
    $requestLine = $reader.ReadLine()

    while ($reader.Peek() -gt -1) {
      $line = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($line)) { break }
    }

    $path = "/"
    if ($requestLine -match "^\w+\s+([^\s]+)") {
      $path = [Uri]::UnescapeDataString($Matches[1].Split("?")[0])
    }
    if ($path -eq "/") { $path = "/index.html" }

    $relative = $path.TrimStart("/") -replace "/", [System.IO.Path]::DirectorySeparatorChar
    $file = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $relative))
    $rootFull = [System.IO.Path]::GetFullPath($root)

    if (-not $file.StartsWith($rootFull) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
      $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $bytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Write($body, 0, $body.Length)
      continue
    }

    $body = [System.IO.File]::ReadAllBytes($file)
    $extension = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
    $mime = $mimeTypes[$extension]
    if (-not $mime) { $mime = "application/octet-stream" }
    $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Write($body, 0, $body.Length)
  } catch {
    # Keep the local preview alive even if a browser drops a request.
  } finally {
    $client.Close()
  }
}
