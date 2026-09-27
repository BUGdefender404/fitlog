Add-Type -AssemblyName System.Drawing
$root = $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $root "public\icons") | Out-Null

# U+8F7B = '轻'
$glyph = [string][char]0x8F7B

function NewIcon([int]$size, [string]$path, [string]$glyph) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::Transparent)
  $r = [int]($size * 0.225)
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gp.AddArc(0, 0, $r, $r, 180, 90)
  $gp.AddArc($size - $r, 0, $r, $r, 270, 90)
  $gp.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
  $gp.AddArc(0, $size - $r, $r, $r, 90, 90)
  $gp.CloseFigure()
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
  $g.FillPath($brush, $gp)
  $fs = [float]([math]::Round($size * 0.54))
  $font = New-Object System.Drawing.Font('Microsoft YaHei', $fs, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = 'Center'
  $sf.LineAlignment = 'Center'
  $rect = New-Object System.Drawing.RectangleF(0, (-$size * 0.03), $size, $size)
  $g.DrawString($glyph, $font, [System.Drawing.Brushes]::White, $rect, $sf)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "icon -> $path"
}

NewIcon 512 (Join-Path $root "public\icons\icon-512.png") $glyph
NewIcon 192 (Join-Path $root "public\icons\icon-192.png") $glyph
NewIcon 180 (Join-Path $root "public\icons\icon-180.png") $glyph
Write-Output "icons done"
