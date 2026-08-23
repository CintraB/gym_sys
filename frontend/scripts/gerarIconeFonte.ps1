# Prepara as imagens-fonte do icone do aplicativo a partir de public/logoapp.png.
#
# Existe porque o logo tem muita margem branca: o conteudo ocupa cerca de 40% do
# canvas. O icone adaptativo do Android ainda corta um terco para a mascara, e o
# resultado final ficava com ~26% de conteudo — visivelmente menor que os outros
# icones da gaveta.
#
# Recorta a margem e redesenha em tres arquivos que o capacitor-assets consome:
#   icon.png            — o icone legado, sem mascara: o logo pode ocupar mais
#   icon-foreground.png — a camada de frente do adaptativo, dentro da safe zone
#   icon-background.png — a camada de fundo, na cor do logo
#
# Rodar de novo depois de trocar o logo:
#   powershell -File scripts/gerarIconeFonte.ps1
#   npx capacitor-assets generate --android

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$origem = Join-Path $raiz "public\logoapp.png"
$destino = Join-Path $raiz "assets"

if (-not (Test-Path $origem)) { Write-Error "nao achei $origem"; exit 1 }
if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino | Out-Null }

$logo = New-Object System.Drawing.Bitmap($origem)

# Acha o retangulo que tem conteudo de verdade, ignorando o branco em volta.
$minX = $logo.Width; $minY = $logo.Height; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $logo.Height; $y += 2) {
  for ($x = 0; $x -lt $logo.Width; $x += 2) {
    $p = $logo.GetPixel($x, $y)
    if (($p.A -gt 20) -and -not ($p.R -gt 235 -and $p.G -gt 235 -and $p.B -gt 235)) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}

$corte = New-Object System.Drawing.Rectangle($minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1))
Write-Output "conteudo do logo: $($corte.Width)x$($corte.Height) px, a partir de ($minX,$minY)"

$LADO = 1024
$fundo = $logo.GetPixel(2, 2)

# Desenha o recorte centralizado num canvas quadrado, ocupando a fracao pedida.
function Escrever($arquivo, $fracao, $corDeFundo) {
  $tela = New-Object System.Drawing.Bitmap($LADO, $LADO)
  $g = [System.Drawing.Graphics]::FromImage($tela)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

  if ($corDeFundo) { $g.Clear($corDeFundo) } else { $g.Clear([System.Drawing.Color]::Transparent) }

  # A escala sai do lado maior, para o logo caber inteiro sem distorcer.
  $alvo = $LADO * $fracao
  $escala = [Math]::Min($alvo / $corte.Width, $alvo / $corte.Height)
  $largura = [int]($corte.Width * $escala)
  $altura = [int]($corte.Height * $escala)
  $x = [int](($LADO - $largura) / 2)
  $y = [int](($LADO - $altura) / 2)

  $g.DrawImage($logo, (New-Object System.Drawing.Rectangle($x, $y, $largura, $altura)), $corte, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  $caminho = Join-Path $destino $arquivo
  $tela.Save($caminho, [System.Drawing.Imaging.ImageFormat]::Png)
  $tela.Dispose()
  Write-Output "gerado: $arquivo (logo em $([int]($fracao*100))% do canvas)"
}

# 0.80 no legado: nao ha mascara cortando, so a borda arredondada do launcher.
Escrever "icon.png" 0.80 $fundo
# 0.60 no foreground: a area visivel do adaptativo e ~66% do canvas, e o resto
# some sob a mascara. Passar disso corta o logo nas pontas.
Escrever "icon-foreground.png" 0.60 $null
Escrever "icon-background.png" 0.0 $fundo

$logo.Dispose()
Write-Output "pronto. agora: npx capacitor-assets generate --android"
