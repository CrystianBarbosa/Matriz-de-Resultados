param([Parameter(Mandatory)][string]$Matriz, [Parameter(Mandatory)][string]$Dados, [int]$Ano = 2026, [string]$Sem = '2H')
# Insere as linhas do JSON na Tabela1 (aba Resumo) usando o Excel, numa cópia local; só substitui o original se tudo der certo.
$ErrorActionPreference = 'Stop'
$linhas = Get-Content -Raw -Encoding UTF8 $Dados | ConvertFrom-Json
$trab = Join-Path $env:TEMP ("matriz_" + [guid]::NewGuid().ToString('N') + '.xlsx')
Copy-Item $Matriz $trab -Force
$hashOrig = (Get-FileHash $Matriz).Hash
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
$wb = $null; $ok = $false
try {
    $wb = $xl.Workbooks.Open($trab)
    for ($t = 0; $t -lt 20 -and $null -eq $wb; $t++) { Start-Sleep 2; try { $wb = $xl.Workbooks.Item(1) } catch {} }
    if ($null -eq $wb) { throw 'Excel não abriu a planilha' }
    $lo = $wb.Worksheets.Item('Resumo').ListObjects.Item('Tabela1')
    $xl.Calculation = -4135
    foreach ($d in $linhas) {
        $n = $lo.ListRows.Count
        $vals = $lo.ListColumns.Item(2).DataBodyRange.Value2
        $pos = 0
        for ($i = 1; $i -le $n; $i++) { if (([string]$vals[$i,1]).Trim() -eq ([string]$d.unidade).Trim()) { $pos = $i } }
        if ($pos -eq 0 -or $pos -ge $n) { $nova = $lo.ListRows.Add() } else { $nova = $lo.ListRows.Add($pos + 1) }
        $r = $nova.Range
        $r.Cells.Item(1,1).Formula2 = '=XLOOKUP(Tabela1[[#This Row],[Unidade]],Planilha3!B:B,Planilha3!A:A)'
        $r.Cells.Item(1,2).Value2 = [string]$d.unidade
        $r.Cells.Item(1,3).Value2 = $Ano
        $r.Cells.Item(1,4).Value2 = $Sem
        $r.Cells.Item(1,5).Value2 = [double]$d.dist
        $map = @{6 = $d.arm; 7 = $d.mte; 8 = $d.man; 9 = $d.amb}
        foreach ($c in 6..9) { if ($null -ne $map[$c]) { $r.Cells.Item(1,$c).Value2 = [double]$map[$c] } else { [void]$r.Cells.Item(1,$c).ClearContents() } }
        $r.Cells.Item(1,7).NumberFormat = '0%'; $r.Cells.Item(1,8).NumberFormat = '0.00%'; $r.Cells.Item(1,9).NumberFormat = '0.0%'
        Write-Output "  + linha $($r.Row): $($d.unidade)"
    }
    $xl.Calculation = -4105; $xl.CalculateFull(); $wb.Save(); $ok = $true
} catch { Write-Output "ERRO: $($_.Exception.Message)" }
finally {
    if ($wb) { try { $wb.Close($false) } catch {} }
    try { $xl.Quit() } catch {}
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
}
if ($ok) {
    if ((Get-FileHash $Matriz).Hash -ne $hashOrig) { Write-Output 'ERRO: a Matriz original mudou durante a gravação (alguém editou?). Nada foi substituído.'; $ok = $false }
    else { Copy-Item $trab $Matriz -Force }
}
Remove-Item $trab -ErrorAction SilentlyContinue
Write-Output "SALVO: $ok"
if (-not $ok) { exit 1 }
