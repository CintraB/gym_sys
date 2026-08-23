# Extrai o símbolo do logo — só o halter, sem o texto "GYM SYS" — em
# public/logo-simbolo.png, com fundo transparente.
#
# Existe pelo mesmo motivo do gerarIconeFonte.ps1, mas para o outro lado: o
# logoapp.png é a arte inteira, com muita margem branca e o nome embaixo. Nos
# quadradinhos de 32-36px do cabeçalho isso aparecia minúsculo, e o nome
# repetido logo ao lado ficava ilegível.
#
# A separação é geométrica, não manual: o halter e o texto são dois blocos de
# linhas com conteúdo, separados por uma faixa branca. O script acha essa faixa
# e fica com o bloco de cima.
#
# O fundo vira transparente por unpremultiply — a conta que desfaz a composição
# sobre branco. Sem ela, tornar "branco = transparente" no limiar deixaria as
# bordas serrilhadas e o laranja meio apagado.
#
# Rodar de novo depois de trocar o logo:
#   powershell -File scripts/gerarSimboloDoLogo.ps1

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$origem = Join-Path $raiz "public\logoapp.png"
$destino = Join-Path $raiz "public\logo-simbolo.png"

if (-not (Test-Path $origem)) { Write-Error "nao achei $origem"; exit 1 }

$logo = New-Object System.Drawing.Bitmap($origem)
$largura = $logo.Width
$altura = $logo.Height

# Quanto uma cor se afasta do branco. Serve de "tem tinta aqui?" e, mais adiante,
# de alfa: 0 = branco puro, 255 = tinta cheia.
function Get-Tinta($p) {
  if ($p.A -lt 20) { return 0 }
  return 255 - [math]::Min($p.R, [math]::Min($p.G, $p.B))
}

# 1. Quais linhas têm conteúdo. Amostra de 2 em 2 para não custar 1M de GetPixel.
$temConteudo = New-Object bool[] $altura
for ($y = 0; $y -lt $altura; $y += 2) {
  for ($x = 0; $x -lt $largura; $x += 2) {
    if ((Get-Tinta $logo.GetPixel($x, $y)) -gt 20) { $temConteudo[$y] = $true; break }
  }
}

# 2. Agrupa as linhas em blocos, separados por faixas brancas de alguma altura.
#    O limite de 20px evita quebrar o bloco no vão entre o halter e as anilhas.
$blocos = @()
$inicio = -1
$brancasSeguidas = 0
for ($y = 0; $y -lt $altura; $y += 2) {
  if ($temConteudo[$y]) {
    if ($inicio -lt 0) { $inicio = $y }
    $brancasSeguidas = 0
  } elseif ($inicio -ge 0) {
    $brancasSeguidas += 2
    if ($brancasSeguidas -ge 20) {
      $blocos += , @($inicio, ($y - $brancasSeguidas))
      $inicio = -1
      $brancasSeguidas = 0
    }
  }
}
if ($inicio -ge 0) { $blocos += , @($inicio, ($altura - 1)) }

if ($blocos.Count -eq 0) { Write-Error "logo sem conteudo: so branco"; exit 1 }
Write-Host "blocos horizontais achados: $($blocos.Count)"

# O símbolo é o primeiro bloco de cima. Se só houver um, é a arte inteira — o
# recorte lateral abaixo ainda vale a pena.
$topo = $blocos[0][0]
$base = $blocos[0][1]

# 3. Limites laterais, só dentro da faixa do símbolo.
$minX = $largura; $maxX = 0
for ($y = $topo; $y -le $base; $y += 2) {
  for ($x = 0; $x -lt $largura; $x += 2) {
    if ((Get-Tinta $logo.GetPixel($x, $y)) -gt 20) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
    }
  }
}

$larguraCorte = $maxX - $minX + 1
$alturaCorte = $base - $topo + 1
Write-Host "simbolo recortado: ${larguraCorte}x${alturaCorte} a partir de ($minX, $topo)"

# 4. Canvas quadrado com uma folga de 6% — o logo colado na borda fica apertado
#    dentro do contêiner arredondado da interface.
$lado = [math]::Max($larguraCorte, $alturaCorte)
$folga = [int]($lado * 0.06)
$saida = $lado + 2 * $folga

$destinoBmp = New-Object System.Drawing.Bitmap($saida, $saida, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$deslocX = $folga + [int](($lado - $larguraCorte) / 2)
$deslocY = $folga + [int](($lado - $alturaCorte) / 2)

for ($y = 0; $y -lt $alturaCorte; $y++) {
  for ($x = 0; $x -lt $larguraCorte; $x++) {
    $p = $logo.GetPixel($minX + $x, $topo + $y)
    $alfa = Get-Tinta $p

    if ($alfa -le 0) { continue }

    # Unpremultiply: recupera a cor pura a partir do que foi composto sobre
    # branco. Sem isto o laranja sairia lavado sobre fundo escuro.
    $fator = $alfa / 255.0
    $r = [math]::Max(0, [math]::Min(255, [int](($p.R - 255 * (1 - $fator)) / $fator)))
    $g = [math]::Max(0, [math]::Min(255, [int](($p.G - 255 * (1 - $fator)) / $fator)))
    $b = [math]::Max(0, [math]::Min(255, [int](($p.B - 255 * (1 - $fator)) / $fator)))

    $cor = [System.Drawing.Color]::FromArgb($alfa, $r, $g, $b)
    $destinoBmp.SetPixel($deslocX + $x, $deslocY + $y, $cor)
  }
}

$destinoBmp.Save($destino, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "gerado: $destino (${saida}x${saida}, fundo transparente)"

# 5. A variante para o tema escuro.
#
# O halter é preto: sobre o fundo escuro da interface ele simplesmente sumiria,
# e é por isso que o logo vivia dentro de um quadrado branco. Aqui o que é
# neutro (preto, cinza) vira claro e o que tem cor — o detalhe laranja — fica
# como está. A marca continua reconhecível, só troca de polaridade.
$claroBmp = New-Object System.Drawing.Bitmap($saida, $saida, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$CLARO = 232

for ($y = 0; $y -lt $saida; $y++) {
  for ($x = 0; $x -lt $saida; $x++) {
    $p = $destinoBmp.GetPixel($x, $y)
    if ($p.A -eq 0) { continue }

    $maior = [math]::Max($p.R, [math]::Max($p.G, $p.B))
    $menor = [math]::Min($p.R, [math]::Min($p.G, $p.B))

    if (($maior - $menor) -gt 40) {
      # Tem cor própria: preservar.
      $claroBmp.SetPixel($x, $y, $p)
    } else {
      $claroBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, $CLARO, $CLARO, $CLARO))
    }
  }
}

$destinoClaro = Join-Path $raiz "public\logo-simbolo-claro.png"
$claroBmp.Save($destinoClaro, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "gerado: $destinoClaro (versao do tema escuro)"

$logo.Dispose()
$destinoBmp.Dispose()
$claroBmp.Dispose()
