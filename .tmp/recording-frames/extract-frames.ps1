Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$videoPath = 'C:\Users\Chandravel Natarajan\Downloads\Recording 2026-06-07 135038.mp4'
$outDir = 'D:\Products\athyper\.tmp\recording-frames'

$player = New-Object System.Windows.Media.MediaPlayer
$opened = $false
$failed = $null
$player.add_MediaOpened({ $script:opened = $true })
$player.add_MediaFailed({ $script:failed = $_.ErrorException.Message })
$player.Open([Uri]::new($videoPath))
$deadline = (Get-Date).AddSeconds(10)
while (-not $opened -and -not $failed -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 100
}
if ($failed) { throw "Media failed: $failed" }
if (-not $opened) { throw "Media open timed out" }

$duration = $player.NaturalDuration.TimeSpan.TotalSeconds
$width = [int]$player.NaturalVideoWidth
$height = [int]$player.NaturalVideoHeight
"duration=$duration width=$width height=$height"

$times = @(0.5, [Math]::Max(0.5, $duration / 2), [Math]::Max(0.5, $duration - 0.5))
for ($i = 0; $i -lt $times.Count; $i++) {
  $player.Position = [TimeSpan]::FromSeconds($times[$i])
  $player.Play()
  Start-Sleep -Milliseconds 700
  $player.Pause()
  Start-Sleep -Milliseconds 300

  $dv = New-Object System.Windows.Media.DrawingVisual
  $dc = $dv.RenderOpen()
  $rect = New-Object System.Windows.Rect(0, 0, $width, $height)
  $dc.DrawVideo($player, $rect)
  $dc.Close()

  $bmp = New-Object System.Windows.Media.Imaging.RenderTargetBitmap($width, $height, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
  $bmp.Render($dv)
  $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bmp))
  $file = Join-Path $outDir ("frame-{0}.png" -f $i)
  $stream = [System.IO.File]::Create($file)
  $encoder.Save($stream)
  $stream.Close()
  "wrote=$file time=$($times[$i])"
}
$player.Close()
